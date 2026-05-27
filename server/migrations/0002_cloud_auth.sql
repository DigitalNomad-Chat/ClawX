-- ClawX Cloud Auth & Membership Schema
-- Cloudflare D1 (SQLite at Edge)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_url TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  year_month TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, feature, year_month)
);
CREATE INDEX IF NOT EXISTS idx_usage_user_feature ON usage(user_id, feature, year_month);

CREATE TABLE IF NOT EXISTS tier_config (
  tier TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL DEFAULT 3,
  features TEXT NOT NULL DEFAULT '[]',
  max_devices INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO tier_config VALUES ('free', 'Free', 3, '[]', 1, 0);
INSERT OR IGNORE INTO tier_config VALUES ('pro', 'Pro', 0, '["collaboration","marketplace"]', 2, 0);
INSERT OR IGNORE INTO tier_config VALUES ('enterprise', 'Enterprise', 0, '["collaboration","marketplace"]', 5, 0);
