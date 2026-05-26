/**
 * Migration: electron-store member data → SQLite
 * One-time migration for users upgrading from the remote-dependent version.
 */
import { getMemberDatabase } from './database';
import { hashPassword, generateId } from './local-auth';
import { logger } from '../../utils/logger';

interface LegacyMemberStore {
  jwtToken?: string;
  userInfo?: {
    id: string;
    username: string;
    email: string;
    avatarUrl?: string;
    subscriptionTier: string;
    balance?: number;
  };
}

export async function migrateLegacyMemberData(): Promise<void> {
  try {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });

    const userInfo = store.get('userInfo') as LegacyMemberStore['userInfo'] | undefined;

    if (!userInfo) {
      logger.info('[Migration] No legacy member data to migrate');
      return;
    }

    const db = getMemberDatabase();

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userInfo.id) as
      | { id: string }
      | undefined;

    if (existing) {
      logger.info('[Migration] User already migrated:', userInfo.id);
      return;
    }

    const now = Date.now();

    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      userInfo.id,
      userInfo.username,
      userInfo.email,
      hashPassword('migrated_legacy_user'),
      now,
      now,
    );

    const subId = generateId();
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, tier, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    ).run(subId, userInfo.id, userInfo.subscriptionTier ?? 'free', now, now);

    logger.info('[Migration] Migrated legacy user:', userInfo.username);

    store.set('migratedToSQLite', true);
  } catch (err) {
    logger.error('[Migration] Failed to migrate legacy data:', err);
  }
}
