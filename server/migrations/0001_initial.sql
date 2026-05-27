-- ClawX License Server Schema
-- Cloudflare D1 (SQLite at Edge)

-- licenses 表：License Key 主表
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  license_key TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL DEFAULT 'active',
  max_devices INTEGER NOT NULL DEFAULT 2,
  duration_days INTEGER NOT NULL DEFAULT 365,
  activated_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- activations 表：设备绑定记录
CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  user_id TEXT,
  tier TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_verified_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  UNIQUE(license_key, device_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_activations_key ON activations(license_key);
CREATE INDEX IF NOT EXISTS idx_activations_device ON activations(device_fingerprint);
