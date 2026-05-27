# ClawX 独立会员体系实现计划

> **For agentic workers:** REQUIRED: Use @superpowers:subagent-driven-development (if subagents available) or @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ClawX 从依赖 guada_ai 远程后端的会员体系，改造为完全独立运营的本地优先会员体系（方案B：本地优先 + 定期在线校验）。

**Architecture:** 在 Electron 主进程中嵌入 SQLite 数据库（better-sqlite3）管理用户、会员、使用量数据。本地完成注册/登录/JWT签发。仅激活 License Key 和定期令牌刷新时连接轻量在线验证服务。前端零改动，IPC 通道接口不变。

**Tech Stack:** better-sqlite3, bcryptjs, jsonwebtoken, Node.js crypto, electron-store（保留用于配置）。

---

## 文件结构总览

### 新增文件

| 文件 | 职责 |
|------|------|
| `electron/services/member/database.ts` | SQLite 数据库连接、Schema 初始化、Migration |
| `electron/services/member/local-auth.ts` | 本地密码哈希（bcryptjs）、JWT 签发与验证（HS256） |
| `electron/services/member/subscription.ts` | 会员等级配置、功能配额计算、到期检测 |
| `electron/services/member/verification.ts` | 在线 License Key 验证、令牌刷新、签名验证 |
| `electron/services/member/activation.ts` | 激活码输入处理、在线验证调用、本地会员状态激活 |

### 重写文件

| 文件 | 变动 |
|------|------|
| `electron/services/member/member-manager.ts` | 远程 API 调用 → 本地 SQLite 读写 |
| `electron/services/member/token-manager.ts` | 远程 Feature Token 获取 → 本地 JWT 签发（含tier/usage） |
| `electron/services/member/usage-counter.ts` | electron-store JSON → SQLite 表读写 |
| `electron/services/member/index.ts` | 初始化顺序调整（先 database，后 auth） |
| `electron/services/member/types.ts` | 新增 `LicenseKey`、`VerificationResult` 等类型 |

### 修改文件（小改）

| 文件 | 变动 |
|------|------|
| `package.json` | 新增 `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `@types/bcryptjs`, `@types/jsonwebtoken` |
| `electron/main/index.ts` | 启动时初始化数据库 |
| `electron/main/ipc/auth-handlers.ts` | 新增 `auth:activate` 通道 |
| `electron/preload/index.ts` | IPC 白名单新增 `auth:activate` |

### 零改动文件（前端完全复用）

- `src/stores/auth.ts`
- `src/types/auth.ts`
- `src/hooks/useFeatureGuard.ts`
- `src/components/auth/*.tsx`

---

## Chunk 1: 依赖安装 + 数据库服务 + 加密基础

### Task 1.1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加依赖到 package.json**

在 `dependencies` 中添加以下 3 项：

```json
    "better-sqlite3": "^12.1.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
```

在 `devDependencies` 中添加以下 2 项：

```json
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.9",
```

- [ ] **Step 2: 安装依赖**

Run: `pnpm install`
Expected: 安装成功，无报错

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
pnpm commit -m "deps: add better-sqlite3, bcryptjs, jsonwebtoken for local membership system"
```

---

### Task 1.2: 数据库 Schema 与 Migration

**Files:**
- Create: `electron/services/member/database.ts`

- [ ] **Step 1: 创建数据库服务**

```typescript
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
const CURRENT_SCHEMA_VERSION = 1;

let dbInstance: Database.Database | null = null;

/**
 * Get the database file path in the user's app data directory.
 */
function getDbPath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, DB_FILENAME);
}

/**
 * Initialize the database connection and schema.
 * Safe to call multiple times (idempotent).
 */
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

/**
 * Get the existing database instance. Throws if not initialized.
 */
export function getMemberDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('[MemberDatabase] Database not initialized. Call initMemberDatabase() first.');
  }
  return dbInstance;
}

/**
 * Close the database connection. Called on app quit.
 */
export function closeMemberDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('[MemberDatabase] Closed');
  }
}

// ==================== Migrations ====================

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
      -- Users table (local accounts)
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

      -- Subscriptions table (membership state)
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

      -- Feature usage tracking (monthly quotas)
      CREATE TABLE IF NOT EXISTS feature_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature TEXT NOT NULL,
        year_month TEXT NOT NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(user_id, feature, year_month)
      );

      CREATE INDEX IF NOT EXISTS idx_feature_usage_lookup ON feature_usage(user_id, feature, year_month);

      -- Activations table (license key records)
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

      -- Schema version tracking
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `,
  },
];

function runMigrations(db: Database.Database): void {
  // Create schema_version table first (not in migrations since it tracks migrations)
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
```

- [ ] **Step 2: 验证数据库文件可编译**

检查 `tsconfig.json` 中的 `include` 是否包含 `electron/**/*.ts`。如果不确定，先检查：

Run: `npx tsc --noEmit electron/services/member/database.ts`
Expected: 无类型错误（如果 `better-sqlite3` 类型未安装，可能会报错，但安装步骤 1.1 已完成）

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/database.ts
git commit -m "feat(member): add SQLite database service with schema and migrations"
```

---

### Task 1.3: 本地认证基础（密码哈希 + JWT Secret）

**Files:**
- Create: `electron/services/member/local-auth.ts`

- [ ] **Step 1: 创建本地认证服务**

```typescript
/**
 * Local Authentication Utilities
 * Password hashing with bcryptjs, JWT signing/verification with jsonwebtoken.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger';

const SALT_ROUNDS = 12;
const JWT_SECRET_FILENAME = 'member-jwt-secret.key';
const JWT_EXPIRES_IN = '7d';

let jwtSecret: string | null = null;

/**
 * Get or create the JWT signing secret.
 * Stored in userData directory. Generated once per installation.
 */
function getJwtSecret(): string {
  if (jwtSecret) return jwtSecret;

  const secretPath = path.join(app.getPath('userData'), JWT_SECRET_FILENAME);

  try {
    if (fs.existsSync(secretPath)) {
      jwtSecret = fs.readFileSync(secretPath, 'utf8');
      return jwtSecret;
    }
  } catch {
    // fall through to generation
  }

  // Generate a new 256-bit secret
  jwtSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(secretPath, jwtSecret, { mode: 0o600 });
  } catch (err) {
    logger.warn('[LocalAuth] Failed to persist JWT secret to disk:', err);
  }

  return jwtSecret;
}

// ==================== Password Hashing ====================

/**
 * Hash a plaintext password.
 */
export function hashPassword(plaintext: string): string {
  return bcrypt.hashSync(plaintext, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored hash.
 */
export function verifyPassword(plaintext: string, hash: string): boolean {
  return bcrypt.compareSync(plaintext, hash);
}

// ==================== JWT ====================

export interface LocalJwtPayload {
  sub: string;        // user id
  username: string;
  email: string;
  tier: string;
  iat: number;
  exp: number;
}

/**
 * Sign a JWT for the given user.
 */
export function signJwt(userId: string, username: string, email: string, tier: string): string {
  return jwt.sign(
    { sub: userId, username, email, tier },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN },
  );
}

/**
 * Verify a JWT and return the payload.
 * Returns null if invalid or expired.
 */
export function verifyJwt(token: string): LocalJwtPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as LocalJwtPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Decode a JWT without verification (for inspecting payload).
 */
export function decodeJwt(token: string): LocalJwtPayload | null {
  try {
    const payload = jwt.decode(token) as LocalJwtPayload | null;
    return payload;
  } catch {
    return null;
  }
}

// ==================== ID Generation ====================

/**
 * Generate a unique user/subscription/activation ID.
 */
export function generateId(): string {
  return `clw_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Generate a License Key.
 * Format: CLWX-XXXX-XXXX-XXXX (alphanumeric, case-insensitive)
 */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  const segments = [];
  for (let s = 0; s < 3; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  return `CLWX-${segments.join('-')}`;
}
```

- [ ] **Step 2: 验证无类型错误**

Run: `npx tsc --noEmit electron/services/member/local-auth.ts`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/local-auth.ts
git commit -m "feat(member): add local auth utilities - bcrypt hashing, JWT signing, ID generation"
```

---

### Task 1.4: 会员等级配置

**Files:**
- Create: `electron/services/member/subscription.ts`
- Modify: `electron/services/member/types.ts`

- [ ] **Step 1: 更新 types.ts 添加新类型**

Modify `electron/services/member/types.ts`，在现有内容之后追加（不要删除原有内容）：

```typescript
// ===== 新增类型（独立会员体系）=====

export type LicenseKey = string;

export interface TierConfig {
  name: string;
  displayName: string;
  monthlyQuota: number;      // 0 = unlimited
  features: Feature[];
  maxDevices: number;
}

export interface VerificationResult {
  success: boolean;
  tier?: Tier;
  expiresAt?: number;        // timestamp ms
  signature?: string;        // RSA signature from verification server
  reason?: string;
}

export interface ActivationResult {
  success: boolean;
  tier?: Tier;
  expiresAt?: number;
  reason?: string;
}

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbSubscription {
  id: string;
  user_id: string;
  tier: Tier;
  status: 'active' | 'expired' | 'cancelled';
  started_at: number | null;
  expires_at: number | null;
  activated_by: string | null;
  last_verified_at: number | null;
  verification_signature: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbFeatureUsage {
  id: number;
  user_id: string;
  feature: Feature;
  year_month: string;
  used_count: number;
}

export interface DbActivation {
  id: string;
  user_id: string | null;
  license_key: string;
  device_fingerprint: string | null;
  tier: Tier;
  activated_at: number;
  expires_at: number | null;
  last_verified_at: number | null;
  verification_data: string | null;
  revoked: number;
}
```

- [ ] **Step 2: 创建会员等级配置**

```typescript
/**
 * Subscription Tier Configuration
 * Defines feature access, quotas, and limits per tier.
 */
import { Tier, Feature, TierConfig } from './types';

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  free: {
    name: 'free',
    displayName: 'Free',
    monthlyQuota: 3,
    features: [],               // No premium features
    maxDevices: 1,
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    monthlyQuota: 0,            // 0 = unlimited
    features: ['collaboration', 'marketplace'],
    maxDevices: 2,
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    monthlyQuota: 0,            // 0 = unlimited
    features: ['collaboration', 'marketplace'],
    maxDevices: 5,
  },
};

/**
 * Get tier configuration.
 */
export function getTierConfig(tier: Tier): TierConfig {
  return TIER_CONFIG[tier] ?? TIER_CONFIG.free;
}

/**
 * Check if a tier has access to a feature.
 */
export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  const config = getTierConfig(tier);
  return config.features.includes(feature);
}

/**
 * Get the monthly usage limit for a tier and feature.
 * Returns 0 for unlimited, >0 for capped, undefined for no access.
 */
export function getFeatureLimit(tier: Tier, _feature: Feature): number | undefined {
  const config = getTierConfig(tier);
  if (!config.features.includes(_feature) && tier !== 'free') {
    return undefined; // Feature not available at this tier
  }
  return config.monthlyQuota;
}

/**
 * Check if a subscription record is currently active (not expired).
 */
export function isSubscriptionActive(sub: { status: string; expires_at: number | null }): boolean {
  if (sub.status !== 'active') return false;
  if (sub.expires_at && sub.expires_at <= Date.now()) return false;
  return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/types.ts electron/services/member/subscription.ts
git commit -m "feat(member): add tier config, feature gating rules, and DB type definitions"
```

---

## Chunk 2: 核心本地服务实现

### Task 2.1: MemberManager 重写（本地注册/登录/用户管理）

**Files:**
- Modify: `electron/services/member/member-manager.ts`（完整重写）

- [ ] **Step 1: 重写 MemberManager**

将 `electron/services/member/member-manager.ts` 完整替换为：

```typescript
/**
 * MemberManager (Local)
 * Handles local user registration, login, logout, and profile management.
 * All data stored in SQLite (via database.ts).
 */
import type { LoginCredentials, RegisterCredentials, UserInfo, MemberState } from './types';
import { MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { getMemberDatabase } from './database';
import { hashPassword, verifyPassword, signJwt, verifyJwt, generateId } from './local-auth';
import { getTierConfig, isSubscriptionActive } from './subscription';
import { logger } from '../../utils/logger';
import type { DbUser, DbSubscription } from './types';

export class MemberManager {
  private jwtToken: string | null = null;
  private userInfo: UserInfo | null = null;
  private _initialized = false;

  async init(): Promise<void> {
    if (this._initialized) return;

    // Restore session from persisted JWT in electron-store
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });
    const cachedToken = store.get('jwtToken', null) as string | null;

    if (cachedToken) {
      const payload = verifyJwt(cachedToken);
      if (payload) {
        this.jwtToken = cachedToken;
        // Fetch full user info from DB
        const db = getMemberDatabase();
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as DbUser | undefined;
        if (row) {
          this.userInfo = this.mapDbUserToUserInfo(row);
        }
      } else {
        // Token expired or invalid — clear it
        store.delete('jwtToken');
      }
    }

    this._initialized = true;
  }

  get state(): MemberState {
    return {
      isLoggedIn: !!this.jwtToken && !!this.userInfo,
      isGuest: !this.jwtToken,
      userInfo: this.userInfo ?? null,
      tier: this.userInfo?.subscriptionTier ?? null,
      isOnline: false, // filled by NetworkDetector
      featureToken: null, // filled by TokenManager
    };
  }

  // ==================== Registration ====================

  async register(credentials: RegisterCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const db = getMemberDatabase();

      // Check uniqueness
      const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(
        credentials.username,
        credentials.email,
      ) as { id: string } | undefined;

      if (existingUser) {
        return { success: false, reason: 'Username or email already exists' };
      }

      const now = Date.now();
      const userId = generateId();
      const passwordHash = hashPassword(credentials.password);

      // Insert user
      db.prepare(
        `INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(userId, credentials.username, credentials.email, passwordHash, now, now);

      // Create default free subscription
      const subId = generateId();
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, tier, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(subId, userId, 'free', 'active', now, now);

      // Build user info
      const userInfo: UserInfo = {
        id: userId,
        username: credentials.username,
        email: credentials.email,
        subscriptionTier: 'free',
        balance: 0,
      };

      this.userInfo = userInfo;
      this.jwtToken = signJwt(userId, credentials.username, credentials.email, 'free');
      this.persist();

      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: userInfo };
    } catch (err: any) {
      logger.error('[MemberManager] Registration error:', err);
      return { success: false, reason: err.message || 'Registration failed' };
    }
  }

  // ==================== Login ====================

  async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const db = getMemberDatabase();

      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(credentials.username) as
        | DbUser
        | undefined;

      if (!row) {
        return { success: false, reason: 'Invalid username or password' };
      }

      const valid = verifyPassword(credentials.password, row.password_hash);
      if (!valid) {
        return { success: false, reason: 'Invalid username or password' };
      }

      // Get active subscription tier
      const tier = this.resolveUserTier(row.id);

      const userInfo: UserInfo = {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUrl: row.avatar_url ?? undefined,
        subscriptionTier: tier,
        balance: 0,
      };

      this.userInfo = userInfo;
      this.jwtToken = signJwt(row.id, row.username, row.email, tier);
      this.persist();

      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: userInfo };
    } catch (err: any) {
      logger.error('[MemberManager] Login error:', err);
      return { success: false, reason: err.message || 'Login failed' };
    }
  }

  // ==================== Logout ====================

  async logout(): Promise<void> {
    this.jwtToken = null;
    this.userInfo = null;

    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });
    store.delete('jwtToken');
    store.delete('userInfo');

    memberEventBus.emit(MemberEvent.LOGOUT);
  }

  // ==================== Refresh User ====================

  async refreshUser(): Promise<UserInfo | null> {
    if (!this.jwtToken) return null;

    const payload = verifyJwt(this.jwtToken);
    if (!payload) {
      await this.logout();
      return null;
    }

    try {
      const db = getMemberDatabase();
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as DbUser | undefined;

      if (!row) {
        await this.logout();
        return null;
      }

      const tier = this.resolveUserTier(row.id);
      this.userInfo = {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUrl: row.avatar_url ?? undefined,
        subscriptionTier: tier,
        balance: 0,
      };

      // Re-sign JWT with updated tier
      this.jwtToken = signJwt(row.id, row.username, row.email, tier);
      this.persist();

      return this.userInfo;
    } catch (err: any) {
      logger.error('[MemberManager] refreshUser error:', err);
      return null;
    }
  }

  // ==================== Getters ====================

  getJwtToken(): string | null {
    return this.jwtToken;
  }

  getUserId(): string | null {
    return this.userInfo?.id ?? null;
  }

  // ==================== Helpers ====================

  /**
   * Resolve the effective tier for a user.
   * Checks subscriptions table and falls back to 'free'.
   */
  private resolveUserTier(userId: string): import('./types').Tier {
    const db = getMemberDatabase();
    const sub = db
      .prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY expires_at DESC LIMIT 1")
      .get(userId) as DbSubscription | undefined;

    if (sub && isSubscriptionActive(sub)) {
      return sub.tier;
    }

    return 'free';
  }

  private mapDbUserToUserInfo(row: DbUser): UserInfo {
    const tier = this.resolveUserTier(row.id);
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url ?? undefined,
      subscriptionTier: tier,
      balance: 0,
    };
  }

  private async persist(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });
    store.set('jwtToken', this.jwtToken);
    store.set('userInfo', this.userInfo);
  }
}
```

- [ ] **Step 2: 运行现有测试验证结构**

Run: `npx vitest run tests/unit/member/member-manager.test.ts`
Expected: 全部 FAIL（因为 fetch 不再被调用，需要重写测试 — 见 Task 4.1）

这是预期的。我们稍后重写测试。

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/member-manager.ts
git commit -m "feat(member): rewrite MemberManager for local SQLite auth"
```

---

### Task 2.2: UsageCounter 重写（SQLite 本地计数）

**Files:**
- Modify: `electron/services/member/usage-counter.ts`（完整重写）

- [ ] **Step 1: 重写 UsageCounter**

```typescript
/**
 * UsageCounter (Local SQLite)
 * Tracks per-feature monthly usage in SQLite.
 * No remote sync — all counting is local.
 */
import { Feature } from './types';
import { memberEventBus } from './event-bus';
import { getMemberDatabase } from './database';
import { logger } from '../../utils/logger';

export class UsageCounter {
  private _currentMonth = '';
  private _initialized = false;

  async init(): Promise<void> {
    if (this._initialized) return;
    this._currentMonth = this.getCurrentYearMonth();
    this._initialized = true;
  }

  /** Get local count for a feature in the current month */
  getCount(userId: string, feature: Feature): number {
    const db = getMemberDatabase();
    const row = db
      .prepare('SELECT used_count FROM feature_usage WHERE user_id = ? AND feature = ? AND year_month = ?')
      .get(userId, feature, this._currentMonth) as { used_count: number } | undefined;
    return row?.used_count ?? 0;
  }

  /** Increment local count for a feature. Returns new count. */
  increment(userId: string, feature: Feature): number {
    const db = getMemberDatabase();
    const now = Date.now();
    const month = this.getCurrentYearMonth();

    // Insert or update with conflict resolution
    const result = db
      .prepare(
        `INSERT INTO feature_usage (user_id, feature, year_month, used_count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(user_id, feature, year_month)
         DO UPDATE SET used_count = used_count + 1`,
      )
      .run(userId, feature, month);

    logger.debug(`[UsageCounter] Incremented ${feature} for ${userId}, changes: ${result.changes}`);
    return this.getCount(userId, feature);
  }

  /** Reset all counts for a user — intended for testing only */
  resetForTesting(userId: string): void {
    const db = getMemberDatabase();
    db.prepare('DELETE FROM feature_usage WHERE user_id = ?').run(userId);
  }

  /** Return "YYYY-MM" for the current date */
  private getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}

/** Singleton instance */
export const usageCounter = new UsageCounter();
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/member/usage-counter.ts
git commit -m "feat(member): rewrite UsageCounter to use SQLite instead of electron-store"
```

---

### Task 2.3: TokenManager 重写（本地 JWT 签发）

**Files:**
- Modify: `electron/services/member/token-manager.ts`（完整重写）

- [ ] **Step 1: 重写 TokenManager**

```typescript
/**
 * TokenManager (Local JWT)
 * Issues local JWTs containing user tier and usage snapshot.
 * No remote API calls — all tokens are self-signed locally.
 */
import { Feature, MemberEvent } from './types';
import { memberEventBus } from './event-bus';
import { verifyJwt, decodeJwt, signJwt } from './local-auth';
import { getTierConfig } from './subscription';
import { logger } from '../../utils/logger';
import type { LocalJwtPayload } from './local-auth';

/** Store key for persisting the raw token string */
const FEATURE_TOKEN_KEY = 'featureToken';

/** Auto-renewal interval: 24 hours in ms */
const AUTO_RENEWAL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface FeatureTokenPayload {
  sub: string;
  tier: import('./types').Tier;
  deviceId: string;
  clientType: string;
  features: string[];
  keyId: string;
  usage: Record<Feature, { used: number; limit: number }>;
  offlineBudget: number;
  iat: number;
  exp: number;
}

export class TokenManager {
  private _token: string | null = null;
  private _payload: FeatureTokenPayload | null = null;
  private _renewalTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current raw JWT token */
  getToken(): string | null {
    return this._token;
  }

  /** Decoded payload (null if no valid token) */
  getPayload(): FeatureTokenPayload | null {
    return this._payload;
  }

  /** Initialise from persisted store. */
  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'member' });
    const cached = store.get(FEATURE_TOKEN_KEY) as string | undefined;

    if (cached) {
      const payload = this.decodeTokenPayload(cached);
      if (payload && payload.exp * 1000 > Date.now()) {
        this._token = cached;
        this._payload = payload;
      } else {
        store.delete(FEATURE_TOKEN_KEY);
        this._token = null;
        this._payload = null;
      }
    }
  }

  /**
   * Issue a new Feature Token locally.
   * @param userId    User ID
   * @param username  Username
   * @param email     Email
   * @param tier      Subscription tier
   * @param deviceId  Device identifier
   * @param getUsage  Callback to get current usage counts
   */
  async issueToken(
    userId: string,
    username: string,
    email: string,
    tier: import('./types').Tier,
    deviceId: string,
    getUsage: (feature: Feature) => number,
  ): Promise<string> {
    const config = getTierConfig(tier);
    const features = config.features;
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 7 * 24 * 60 * 60; // 7 days

    const usage: Record<Feature, { used: number; limit: number }> = {
      collaboration: { used: getUsage('collaboration'), limit: config.monthlyQuota },
      marketplace: { used: getUsage('marketplace'), limit: config.monthlyQuota },
    };

    const payload: FeatureTokenPayload = {
      sub: userId,
      tier,
      deviceId,
      clientType: 'clawx',
      features,
      keyId: 'local',
      usage,
      offlineBudget: 999999, // Local system: generous offline budget
      iat: nowSec,
      exp: expSec,
    };

    // Sign as a local JWT
    const token = signJwt(userId, username, email, tier);
    this._token = token;
    this._payload = payload;
    await this.persist();

    return token;
  }

  /** Check whether the current token is expired */
  isExpired(): boolean {
    if (!this._payload) return true;
    return this._payload.exp * 1000 <= Date.now();
  }

  /** Return the offline budget from the current token */
  getOfflineBudget(): number {
    return this._payload?.offlineBudget ?? 0;
  }

  /** Return usage snapshot for a specific feature */
  getUsageSnapshot(feature: Feature): { used: number; limit: number } | null {
    if (!this._payload) return null;
    const entry = this._payload.usage[feature];
    if (!entry) return null;
    return { used: entry.used, limit: entry.limit };
  }

  /**
   * Start a 24-hour auto-renewal timer.
   * @param getUserInfo  Callback that returns current user info
   * @param getDeviceId  Callback that returns current device id
   * @param getUsage     Callback that returns usage counts
   */
  startAutoRenewal(
    getUserInfo: () => { id: string; username: string; email: string; tier: import('./types').Tier } | null,
    getDeviceId: () => string | null,
    getUsage: (feature: Feature) => number,
  ): void {
    this.stopAutoRenewal();

    const tick = async () => {
      try {
        const user = getUserInfo();
        const deviceId = getDeviceId();
        if (user && deviceId) {
          await this.issueToken(user.id, user.username, user.email, user.tier, deviceId, getUsage);
        }
      } catch (err) {
        memberEventBus.emit(MemberEvent.TOKEN_EXPIRED, err);
      }
      this._renewalTimer = setTimeout(tick, AUTO_RENEWAL_INTERVAL_MS);
      if (this._renewalTimer && typeof this._renewalTimer === 'object' && 'unref' in this._renewalTimer) {
        (this._renewalTimer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
      }
    };

    this._renewalTimer = setTimeout(tick, AUTO_RENEWAL_INTERVAL_MS);
    if (this._renewalTimer && typeof this._renewalTimer === 'object' && 'unref' in this._renewalTimer) {
      (this._renewalTimer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }
  }

  /** Stop the auto-renewal timer */
  stopAutoRenewal(): void {
    if (this._renewalTimer !== null) {
      clearTimeout(this._renewalTimer);
      this._renewalTimer = null;
    }
  }

  /**
   * Decode a locally-issued token and reconstruct the FeatureTokenPayload.
   * This bridges our LocalJwtPayload to the FeatureTokenPayload expected by the UI.
   */
  decodeTokenPayload(token: string): FeatureTokenPayload | null {
    const payload = decodeJwt(token);
    if (!payload) return null;

    const config = getTierConfig(payload.tier as import('./types').Tier);
    return {
      sub: payload.sub,
      tier: payload.tier as import('./types').Tier,
      deviceId: 'local',
      clientType: 'clawx',
      features: config.features,
      keyId: 'local',
      usage: {
        collaboration: { used: 0, limit: config.monthlyQuota },
        marketplace: { used: 0, limit: config.monthlyQuota },
      },
      offlineBudget: 999999,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  /** Persist the current token to electron-store */
  private async persist(): Promise<void> {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'member' });
    if (this._token) {
      store.set(FEATURE_TOKEN_KEY, this._token);
    } else {
      store.delete(FEATURE_TOKEN_KEY);
    }
  }
}

/** Singleton instance */
export const tokenManager = new TokenManager();
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/member/token-manager.ts
git commit -m "feat(member): rewrite TokenManager for local JWT issuance"
```

---

### Task 2.4: MemberModule Facade 更新

**Files:**
- Modify: `electron/services/member/index.ts`

- [ ] **Step 1: 重写 MemberModule**

```typescript
/**
 * MemberModule Facade (Local-First)
 * Wires together local authentication, subscription, and usage tracking.
 */
import { machineId } from 'node-machine-id';
import { createHash } from 'node:crypto';
import { platform } from 'node:os';
import { MemberManager } from './member-manager';
import { TokenManager, tokenManager } from './token-manager';
import { UsageCounter, usageCounter } from './usage-counter';
import { NetworkDetector, networkDetector } from './network-detector';
import { memberEventBus } from './event-bus';
import { MemberEvent, type MemberState, type Feature, type UsageInfo, type Tier } from './types';
import { logger } from '../../utils/logger';
import { initMemberDatabase } from './database';
import { getTierConfig } from './subscription';

/** Generate a stable device id from machine-id + platform + sha256 */
async function generateDeviceId(): Promise<string> {
  const raw = await machineId();
  const plat = platform();
  return createHash('sha256').update(`${raw}:${plat}`).digest('hex');
}

export class MemberModule {
  readonly manager: MemberManager;
  readonly token: TokenManager;
  readonly usage: UsageCounter;
  readonly network: NetworkDetector;

  private _deviceId: string | null = null;
  private _initialized = false;

  constructor() {
    this.manager = new MemberManager();
    this.token = tokenManager;
    this.usage = usageCounter;
    this.network = networkDetector;
  }

  /** Initialize all sub-services */
  async init(): Promise<void> {
    if (this._initialized) return;

    // 1. Initialize database first (all services depend on it)
    initMemberDatabase();

    // 2. Generate device id
    this._deviceId = await generateDeviceId();

    // 3. Initialize sub-services
    await this.manager.init();
    await this.token.init();
    await this.usage.init();

    // 4. Wire event listeners
    memberEventBus.on(MemberEvent.LOGIN_SUCCESS, () => {
      this._onLoginSuccess();
    });
    memberEventBus.on(MemberEvent.LOGOUT, () => {
      this.token.stopAutoRenewal();
    });

    // 5. Start network probing (simplified — only for optional online features)
    this.network.start();

    this._initialized = true;
    logger.info('[MemberModule] Initialized (local-first mode)');
  }

  /** Aggregated member state for the renderer */
  get state(): MemberState {
    return {
      ...this.manager.state,
      isOnline: this.network.isOnline,
      featureToken: this.token.getPayload(),
    };
  }

  get deviceId(): string | null {
    return this._deviceId;
  }

  /** Check whether a feature is available (always local) */
  async checkFeature(feature: Feature): Promise<UsageInfo | null> {
    const userId = this.manager.getUserId();
    if (!userId) {
      return null;
    }

    const userInfo = this.manager.state.userInfo;
    if (!userInfo) {
      return null;
    }

    const tier = userInfo.subscriptionTier ?? 'free';
    const config = getTierConfig(tier);
    const used = this.usage.getCount(userId, feature);
    const limit = config.monthlyQuota;

    // Free tier: check monthly quota
    // Pro/Enterprise: unlimited (limit = 0)
    const allowed = limit === 0 || used < limit;

    return {
      feature,
      used,
      limit,
      remaining: limit === 0 ? 999999 : Math.max(0, limit - used),
      tier,
      allowed,
    };
  }

  /** Record a local usage increment for a feature */
  recordUsage(feature: Feature): void {
    const userId = this.manager.getUserId();
    if (!userId) return;
    this.usage.increment(userId, feature);
  }

  /** Graceful shutdown */
  async shutdown(): Promise<void> {
    this.network.stop();
    this.token.stopAutoRenewal();
    this._initialized = false;
    logger.info('[MemberModule] Shutdown complete');
  }

  // ==================== Private ====================

  private _onLoginSuccess(): void {
    const userInfo = this.manager.state.userInfo;
    const jwt = this.manager.getJwtToken();
    if (!userInfo || !jwt || !this._deviceId) return;

    try {
      this.token.issueToken(
        userInfo.id,
        userInfo.username,
        userInfo.email,
        userInfo.subscriptionTier,
        this._deviceId,
        (feature) => this.usage.getCount(userInfo.id, feature),
      );
      this.token.startAutoRenewal(
        () => this.manager.state.userInfo,
        () => this._deviceId,
        (feature) => this.usage.getCount(userInfo.id, feature),
      );
    } catch (err) {
      logger.warn('[MemberModule] Failed to issue token after login:', err);
    }
  }
}

/** Singleton instance */
export const memberModule = new MemberModule();
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/member/index.ts
git commit -m "feat(member): update MemberModule facade for local-first architecture"
```

---

## Chunk 3: 在线验证服务 + 激活流程 + IPC 适配

### Task 3.1: 在线验证服务（License Key 验证）

**Files:**
- Create: `electron/services/member/verification.ts`

- [ ] **Step 1: 创建验证服务**

```typescript
/**
 * Verification Service
 * Handles online License Key activation and periodic token refresh.
 * This is the ONLY component that makes network requests in the membership system.
 */
import { logger } from '../../utils/logger';
import type { Tier, VerificationResult, ActivationResult } from './types';

/** Verification server endpoint */
const VERIFICATION_BASE_URL = 'https://api.clawx.app/v1'; // TODO: update to actual endpoint

/** Grace period for offline use after last successful verification (72 hours in ms) */
export const OFFLINE_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;

/** How often to verify online (8 hours in ms) */
export const VERIFY_INTERVAL_MS = 8 * 60 * 60 * 1000;

export class VerificationService {
  private _lastVerifiedAt: number | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _running = false;

  /**
   * Activate a License Key online.
   * @param licenseKey   The license key to activate
   * @param deviceId     Current device fingerprint
   * @param userId       Optional user ID to bind to
   */
  async activateLicense(
    licenseKey: string,
    deviceId: string,
    userId?: string,
  ): Promise<ActivationResult> {
    try {
      const res = await fetch(`${VERIFICATION_BASE_URL}/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          deviceId,
          userId,
          clientType: 'clawx',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          reason: data.message || `Activation failed (${res.status})`,
        };
      }

      const data = await res.json();
      this._lastVerifiedAt = Date.now();

      return {
        success: true,
        tier: data.tier as Tier,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : undefined,
      };
    } catch (err: any) {
      logger.error('[Verification] Activation error:', err);
      return { success: false, reason: 'Network error. Please check your connection.' };
    }
  }

  /**
   * Verify the current activation state online.
   * Returns the server-authoritative tier and expiry.
   */
  async verifyOnline(licenseKey: string, deviceId: string): Promise<VerificationResult> {
    try {
      const res = await fetch(`${VERIFICATION_BASE_URL}/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          deviceId,
          clientType: 'clawx',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          reason: data.message || `Verification failed (${res.status})`,
        };
      }

      const data = await res.json();
      this._lastVerifiedAt = Date.now();

      return {
        success: true,
        tier: data.tier as Tier,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : undefined,
        signature: data.signature as string,
      };
    } catch (err: any) {
      logger.error('[Verification] Online verify error:', err);
      return { success: false, reason: 'Network error' };
    }
  }

  /** Check if we are within the offline grace period */
  isWithinGracePeriod(): boolean {
    if (!this._lastVerifiedAt) return false;
    return Date.now() - this._lastVerifiedAt < OFFLINE_GRACE_PERIOD_MS;
  }

  /** Get timestamp of last successful verification */
  getLastVerifiedAt(): number | null {
    return this._lastVerifiedAt;
  }

  /** Start periodic online verification */
  startPeriodicVerify(
    getLicenseKey: () => string | null,
    getDeviceId: () => string | null,
    onResult: (result: VerificationResult) => void,
  ): void {
    if (this._running) return;
    this._running = true;

    const tick = async () => {
      const key = getLicenseKey();
      const device = getDeviceId();
      if (key && device) {
        const result = await this.verifyOnline(key, device);
        onResult(result);
      }
      this._timer = setTimeout(tick, VERIFY_INTERVAL_MS);
      if (this._timer && typeof this._timer === 'object' && 'unref' in this._timer) {
        (this._timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
      }
    };

    this._timer = setTimeout(tick, VERIFY_INTERVAL_MS);
    if (this._timer && typeof this._timer === 'object' && 'unref' in this._timer) {
      (this._timer as ReturnType<typeof setTimeout> & { unref(): void }).unref();
    }
  }

  /** Stop periodic verification */
  stopPeriodicVerify(): void {
    this._running = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

/** Singleton instance */
export const verificationService = new VerificationService();
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/member/verification.ts
git commit -m "feat(member): add online verification service for license activation"
```

---

### Task 3.2: 激活服务（License Key → 本地会员状态）

**Files:**
- Create: `electron/services/member/activation.ts`

- [ ] **Step 1: 创建激活服务**

```typescript
/**
 * Activation Service
 * Bridges License Key input → online verification → local subscription activation.
 */
import { getMemberDatabase } from './database';
import { verificationService } from './verification';
import { generateId } from './local-auth';
import type { ActivationResult, Tier } from './types';
import { logger } from '../../utils/logger';

export class ActivationService {
  /**
   * Activate a License Key for a user.
   * 1. Verify online with verification server
   * 2. Create/update subscription record in local DB
   * 3. Return result
   */
  async activate(
    userId: string,
    licenseKey: string,
    deviceId: string,
  ): Promise<ActivationResult> {
    try {
      const db = getMemberDatabase();

      // 1. Online verification
      const result = await verificationService.activateLicense(licenseKey, deviceId, userId);
      if (!result.success) {
        return result;
      }

      const tier = result.tier ?? 'free';
      const now = Date.now();
      const expiresAt = result.expiresAt ?? null;

      // 2. Check for existing active subscription — update or create
      const existing = db
        .prepare("SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' LIMIT 1")
        .get(userId) as { id: string } | undefined;

      if (existing) {
        db.prepare(
          `UPDATE subscriptions
           SET tier = ?, status = 'active', expires_at = ?, activated_by = ?,
               last_verified_at = ?, updated_at = ?
           WHERE id = ?`,
        ).run(tier, expiresAt, licenseKey, now, now, existing.id);
      } else {
        const subId = generateId();
        db.prepare(
          `INSERT INTO subscriptions
             (id, user_id, tier, status, started_at, expires_at, activated_by,
              last_verified_at, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
        ).run(subId, userId, tier, now, expiresAt, licenseKey, now, now, now);
      }

      // 3. Record activation
      const activationId = generateId();
      db.prepare(
        `INSERT INTO activations
           (id, user_id, license_key, device_fingerprint, tier, activated_at,
            expires_at, last_verified_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(license_key)
         DO UPDATE SET
           user_id = excluded.user_id,
           device_fingerprint = excluded.device_fingerprint,
           tier = excluded.tier,
           activated_at = excluded.activated_at,
           expires_at = excluded.expires_at,
           last_verified_at = excluded.last_verified_at,
           revoked = 0`,
      ).run(activationId, userId, licenseKey, deviceId, tier, now, expiresAt, now);

      logger.info(`[Activation] License activated for user ${userId}, tier: ${tier}`);
      return { success: true, tier, expiresAt: expiresAt ?? undefined };
    } catch (err: any) {
      logger.error('[Activation] Error:', err);
      return { success: false, reason: err.message || 'Activation failed' };
    }
  }

  /**
   * Get the latest activation record for a user.
   */
  getActivationForUser(userId: string): {
    licenseKey: string;
    tier: Tier;
    expiresAt: number | null;
    lastVerifiedAt: number | null;
  } | null {
    const db = getMemberDatabase();
    const row = db
      .prepare(
        'SELECT license_key, tier, expires_at, last_verified_at FROM activations WHERE user_id = ? AND revoked = 0 ORDER BY activated_at DESC LIMIT 1',
      )
      .get(userId) as
      | {
          license_key: string;
          tier: Tier;
          expires_at: number | null;
          last_verified_at: number | null;
        }
      | undefined;

    if (!row) return null;
    return {
      licenseKey: row.license_key,
      tier: row.tier,
      expiresAt: row.expires_at,
      lastVerifiedAt: row.last_verified_at,
    };
  }
}

/** Singleton instance */
export const activationService = new ActivationService();
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/member/activation.ts
git commit -m "feat(member): add activation service linking license key to local subscription"
```

---

### Task 3.3: IPC 适配（新增 auth:activate 通道）

**Files:**
- Modify: `electron/main/ipc/auth-handlers.ts`
- Modify: `electron/preload/index.ts`

- [ ] **Step 1: 修改 IPC handlers**

在 `electron/main/ipc/auth-handlers.ts` 末尾、`registerAuthIpcHandlers` 函数的 `auth:getUsageStats` handler 之后，添加新的 handler（在 `logger.info('[IPC] Auth handlers registered');` 之前）：

```typescript
  ipcMain.handle('auth:activate', async (_, { licenseKey, userId }: { licenseKey: string; userId: string }) => {
    try {
      const { activationService } = await import('../../services/member/activation');
      const result = await activationService.activate(userId, licenseKey, memberModule.deviceId ?? 'unknown');
      if (result.success) {
        // Refresh user state so the new tier is reflected immediately
        await memberModule.manager.refreshUser();
      }
      return result;
    } catch (err: any) {
      logger.error('[IPC auth:activate] error:', err);
      return { success: false, reason: err.message || 'Activation failed' };
    }
  });
```

- [ ] **Step 2: 更新 preload IPC 白名单**

在 `electron/preload/index.ts` 的 `validChannels` 数组中，找到 `'auth:getUsageStats'` 行，在其后添加：

```typescript
        'auth:activate',
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/ipc/auth-handlers.ts electron/preload/index.ts
git commit -m "feat(ipc): add auth:activate channel for license key activation"
```

---

### Task 3.4: Electron 主进程启动顺序调整

**Files:**
- Modify: `electron/main/index.ts`

- [ ] **Step 1: 在启动时初始化数据库**

在 `electron/main/index.ts` 中找到 `startMainApp` 函数，找到现有的 member module init 代码块：

```typescript
  // Initialize member module (non-blocking)
  await memberModule.init().catch((err) => {
    logger.warn('Member module init failed:', err);
  });
```

替换为（确保数据库在 member module 之前初始化）：

```typescript
  // Initialize member database first, then member module
  try {
    const { initMemberDatabase } = await import('../services/member/database');
    initMemberDatabase();
  } catch (err) {
    logger.error('Failed to initialize member database:', err);
  }

  await memberModule.init().catch((err) => {
    logger.warn('Member module init failed:', err);
  });
```

- [ ] **Step 2: 在应用退出时关闭数据库**

在 `electron/main/index.ts` 中找到 `app.on('before-quit', ...)` 或 `app.on('will-quit', ...)` 处理器，在其回调中添加数据库关闭：

```typescript
app.on('will-quit', async (event) => {
  // ... existing code ...

  try {
    const { closeMemberDatabase } = await import('./services/member/database');
    closeMemberDatabase();
  } catch {
    // ignore
  }
});
```

如果不存在 `will-quit` 处理器，在 `startMainApp` 的末尾添加：

```typescript
  app.on('will-quit', () => {
    try {
      const { closeMemberDatabase } = require('../services/member/database');
      closeMemberDatabase();
    } catch {
      // ignore
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat(main): initialize member database on startup, close on quit"
```

---

## Chunk 4: 测试 + 迁移脚本

### Task 4.1: 重写 MemberManager 测试

**Files:**
- Modify: `tests/unit/member/member-manager.test.ts`（完整重写）

- [ ] **Step 1: 重写测试**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron-store
const mockStore = new Map<string, any>();
vi.mock('electron-store', () => {
  function MockStore(opts?: { name?: string }) {
    const prefix = opts?.name ? `${opts.name}:` : '';
    return {
      get: (key: string, defaultValue?: any) => {
        const fullKey = prefix + key;
        if (mockStore.has(fullKey)) return mockStore.get(fullKey);
        return defaultValue;
      },
      set: (key: string, value: any) => mockStore.set(prefix + key, value),
      delete: (key: string) => mockStore.delete(prefix + key),
      clear: () => {
        for (const k of mockStore.keys()) {
          if (k.startsWith(prefix)) mockStore.delete(k);
        }
      },
    };
  }
  return { default: MockStore };
});

// Mock event-bus
vi.mock('@electron/services/member/event-bus', () => ({
  memberEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock database
let mockDb: { [table: string]: any[] } = {};
const mockStatements = new Map<string, any>();

vi.mock('@electron/services/member/database', () => ({
  initMemberDatabase: vi.fn(),
  getMemberDatabase: vi.fn(() => ({
    prepare: vi.fn((sql: string) => {
      if (!mockStatements.has(sql)) {
        mockStatements.set(sql, {
          get: vi.fn((...params: any[]) => {
            // Simple mock: for "SELECT * FROM users WHERE username = ?"
            if (sql.includes('users') && sql.includes('username')) {
              const username = params[0];
              const table = mockDb['users'] ?? [];
              return table.find((r: any) => r.username === username) ?? undefined;
            }
            if (sql.includes('users') && sql.includes('id = ?')) {
              const id = params[0];
              const table = mockDb['users'] ?? [];
              return table.find((r: any) => r.id === id) ?? undefined;
            }
            if (sql.includes('subscriptions')) {
              const userId = params[0];
              const table = mockDb['subscriptions'] ?? [];
              return table.find((r: any) => r.user_id === userId && r.status === 'active') ?? undefined;
            }
            return undefined;
          }),
          run: vi.fn((...params: any[]) => {
            // Simple insert tracking
            if (sql.includes('INSERT INTO users')) {
              if (!mockDb['users']) mockDb['users'] = [];
              mockDb['users'].push({
                id: params[0],
                username: params[1],
                email: params[2],
                password_hash: params[3],
                created_at: params[4],
                updated_at: params[5],
              });
            }
            if (sql.includes('INSERT INTO subscriptions')) {
              if (!mockDb['subscriptions']) mockDb['subscriptions'] = [];
              mockDb['subscriptions'].push({
                id: params[0],
                user_id: params[1],
                tier: params[2],
                status: 'active',
                created_at: params[5],
              });
            }
            return { changes: 1 };
          }),
        });
      }
      return mockStatements.get(sql);
    }),
  })),
}));

describe('MemberManager (Local)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    mockDb = {};
    mockStatements.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start as guest when no stored session', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    expect(manager.state.isGuest).toBe(true);
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.userInfo).toBeNull();
    expect(manager.getJwtToken()).toBeFalsy();
  });

  it('should register a new user and auto-login', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    const result = await manager.register({
      username: 'newuser',
      email: 'new@example.com',
      password: 'password123',
    });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('newuser');
    expect(result.user?.subscriptionTier).toBe('free');
    expect(manager.state.isLoggedIn).toBe(true);
    expect(manager.state.isGuest).toBe(false);
    expect(manager.getJwtToken()).toBeTruthy();
  });

  it('should login with correct credentials', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    // First register
    await manager.register({
      username: 'testlogin',
      email: 'login@example.com',
      password: 'secret123',
    });
    await manager.logout();

    // Then login
    const result = await manager.login({
      username: 'testlogin',
      password: 'secret123',
    });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('testlogin');
    expect(manager.state.isLoggedIn).toBe(true);
  });

  it('should fail login with wrong password', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    await manager.register({
      username: 'wrongpw',
      email: 'wrong@example.com',
      password: 'correct123',
    });
    await manager.logout();

    const result = await manager.login({
      username: 'wrongpw',
      password: 'wrongpassword',
    });

    expect(result.success).toBe(false);
    expect(manager.state.isLoggedIn).toBe(false);
  });

  it('should logout and clear state', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager();
    await manager.init();

    await manager.register({
      username: 'logoutme',
      email: 'logout@example.com',
      password: 'pw123',
    });
    expect(manager.state.isLoggedIn).toBe(true);

    await manager.logout();
    expect(manager.state.isLoggedIn).toBe(false);
    expect(manager.state.isGuest).toBe(true);
    expect(manager.getJwtToken()).toBeNull();
  });

  it('should restore session from valid JWT on init', async () => {
    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager1 = new MemberManager();
    await manager1.init();

    await manager1.register({
      username: 'persist',
      email: 'persist@example.com',
      password: 'pw123',
    });

    const token = manager1.getJwtToken();
    expect(token).toBeTruthy();

    // Simulate fresh init with stored token
    const { MemberManager: MM2 } = await import('@electron/services/member/member-manager');
    const manager2 = new MM2();
    await manager2.init();

    expect(manager2.state.isLoggedIn).toBe(true);
    expect(manager2.state.userInfo?.username).toBe('persist');
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/unit/member/member-manager.test.ts`
Expected: 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/member/member-manager.test.ts
git commit -m "test(member): rewrite MemberManager tests for local SQLite auth"
```

---

### Task 4.2: 迁移脚本（electron-store 历史数据 → SQLite）

**Files:**
- Create: `electron/services/member/migrate.ts`

- [ ] **Step 1: 创建迁移脚本**

```typescript
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

/**
 * Migrate legacy electron-store member data to SQLite.
 * Called once on first startup after upgrade.
 */
export async function migrateLegacyMemberData(): Promise<void> {
  try {
    const Store = (await import('electron-store')).default;
    const store = new Store({ name: 'clawdock-member' });

    const jwtToken = store.get('jwtToken') as string | undefined;
    const userInfo = store.get('userInfo') as LegacyMemberStore['userInfo'] | undefined;

    if (!userInfo) {
      logger.info('[Migration] No legacy member data to migrate');
      return;
    }

    const db = getMemberDatabase();

    // Check if user already exists in SQLite
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userInfo.id) as
      | { id: string }
      | undefined;

    if (existing) {
      logger.info('[Migration] User already migrated:', userInfo.id);
      return;
    }

    const now = Date.now();

    // Insert user with a placeholder password (user must reset/login via new system)
    db.prepare(
      `INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      userInfo.id,
      userInfo.username,
      userInfo.email,
      hashPassword('migrated_legacy_user'), // Placeholder — user must use "forgot password" or re-register
      now,
      now,
    );

    // Insert subscription
    const subId = generateId();
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, tier, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    ).run(subId, userInfo.id, userInfo.subscriptionTier ?? 'free', now, now);

    logger.info('[Migration] Migrated legacy user:', userInfo.username);

    // Mark migration as done
    store.set('migratedToSQLite', true);
  } catch (err) {
    logger.error('[Migration] Failed to migrate legacy data:', err);
  }
}
```

- [ ] **Step 2: 在 MemberModule.init 中调用迁移**

在 `electron/services/member/index.ts` 的 `init` 方法中，在 `initMemberDatabase()` 之后、其他初始化之前，添加：

```typescript
    // Migrate legacy data (one-time)
    try {
      const { migrateLegacyMemberData } = await import('./migrate');
      await migrateLegacyMemberData();
    } catch {
      // Ignore migration errors
    }
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/migrate.ts electron/services/member/index.ts
git commit -m "feat(member): add legacy data migration from electron-store to SQLite"
```

---

## 附录 A: 前端集成（可选增强）

以下前端改动是**可选的**，用于支持 License Key 激活 UI。如果仅使用现有 `ActivationPage.tsx`，则不需要。

### 在 UserBadge 中添加"激活 License"入口

Modify `src/components/auth/UserBadge.tsx`:

找到下拉菜单区域，在"退出登录"按钮之前添加：

```tsx
<button
  onClick={() => { setMenuOpen(false); /* TODO: open activation modal */ }}
  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md"
>
  <Crown className="h-4 w-4" />
  激活 License
</button>
```

### 在 auth store 中添加 activate 方法

Modify `src/stores/auth.ts`，在 `recordUsage` 之后添加：

```typescript
  activateLicense: async (licenseKey: string) => {
    const user = useAuthStore.getState().userInfo;
    if (!user) return { success: false, reason: 'Not logged in' };
    const result = await invokeIpc<{ success: boolean; tier?: string; reason?: string }>('auth:activate', {
      licenseKey,
      userId: user.id,
    });
    if (result?.success) {
      await useAuthStore.getState().refreshUser();
    }
    return result ?? { success: false, reason: 'Unknown error' };
  },
```

---

## 附录 B: 验证服务部署指南

验证服务是极轻量的，只需 2 个 API 端点：

```
POST /v1/license/activate
Body: { licenseKey, deviceId, userId?, clientType }
Response: { success: true, tier: "pro", expiresAt: 1750000000 }

POST /v1/license/verify
Body: { licenseKey, deviceId, clientType }
Response: { success: true, tier: "pro", expiresAt: 1750000000, signature: "rsa-sig" }
```

推荐部署方式：
1. **Cloudflare Workers** — 免费额度充足，全球 CDN
2. **Vercel Serverless** — 与现有前端同平台
3. **自建轻量 Node.js 服务** — 如已有服务器

数据库表（服务端）：
```sql
CREATE TABLE license_keys (
  key TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active/used/revoked
  max_devices INTEGER DEFAULT 1,
  expires_at INTEGER,
  created_at INTEGER
);

CREATE TABLE license_activations (
  id INTEGER PRIMARY KEY,
  license_key TEXT REFERENCES license_keys(key),
  device_id TEXT,
  activated_at INTEGER,
  last_verified_at INTEGER
);
```

---

## 附录 C: 实施检查清单

- [ ] package.json 依赖已安装
- [ ] database.ts 已创建且 schema 正确
- [ ] local-auth.ts 已创建（bcrypt + JWT）
- [ ] subscription.ts 已创建（tier config）
- [ ] types.ts 已更新（新类型）
- [ ] member-manager.ts 已重写（本地注册/登录）
- [ ] usage-counter.ts 已重写（SQLite 计数）
- [ ] token-manager.ts 已重写（本地 JWT）
- [ ] index.ts 已更新（facade 初始化顺序）
- [ ] verification.ts 已创建（在线验证）
- [ ] activation.ts 已创建（License Key → 本地状态）
- [ ] auth-handlers.ts 已更新（auth:activate 通道）
- [ ] preload/index.ts 已更新（IPC 白名单）
- [ ] main/index.ts 已更新（启动初始化数据库）
- [ ] 测试通过：`npx vitest run tests/unit/member/member-manager.test.ts`
- [ ] 手动测试：注册 → 登录 → 查看会员状态 → 功能门控检查
