/**
 * Member Database Service
 * SQLite wrapper for local membership data storage.
 * Uses better-sqlite3 (synchronous API, ideal for Electron main process).
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { logger } from '../../utils/logger';

const DB_FILENAME = 'member.db';

let dbInstance: Database.Database | null = null;

function getDbPath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, DB_FILENAME);
}

export function initMemberDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDbPath();
  logger.info(`[MemberDatabase] Opening database at ${dbPath}`);

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  runMigrations(dbInstance);

  logger.info('[MemberDatabase] Initialized');
  return dbInstance;
}

export function getMemberDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('[MemberDatabase] Database not initialized. Call initMemberDatabase() first.');
  }
  return dbInstance;
}

export function closeMemberDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('[MemberDatabase] Closed');
  }
}

interface Migration {
  version: number;
  name: string;
  up: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'active',
        started_at INTEGER,
        expires_at INTEGER,
        activated_by TEXT,
        last_verified_at INTEGER,
        verification_signature TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

      CREATE TABLE IF NOT EXISTS feature_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature TEXT NOT NULL,
        year_month TEXT NOT NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(user_id, feature, year_month)
      );
      CREATE INDEX IF NOT EXISTS idx_feature_usage_lookup ON feature_usage(user_id, feature, year_month);

      CREATE TABLE IF NOT EXISTS activations (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        license_key TEXT UNIQUE NOT NULL,
        device_fingerprint TEXT,
        tier TEXT NOT NULL,
        activated_at INTEGER NOT NULL,
        expires_at INTEGER,
        last_verified_at INTEGER,
        verification_data TEXT,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_activations_key ON activations(license_key);

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `,
  },
];

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as
    | { version: number }
    | undefined;
  const currentVersion = row?.version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info(`[MemberDatabase] Running migration ${migration.version}: ${migration.name}`);
      db.exec(migration.up);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        Date.now(),
      );
    }
  }
}
