# 方案 C：完全云端后端改造 执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ClawX 会员体系从本地优先架构迁移为完全云端后端（Cloudflare Workers + D1），实现云端注册/登录/用量管理/Web 管理后台，同时保持前端零改动。

**Architecture:** Electron 主进程 IPC handler 层从"调用本地 SQLite"改为"HTTP 代理到 Cloudflare Workers 云端 API"。云端 D1 数据库管理 users/sessions/usage/tier_config/licenses/activations 全表。前端通过不变的 8 个 `auth:*` IPC 通道与主进程通信，天然隔离后端变更。

**Tech Stack:** Cloudflare Workers (TypeScript), D1 (SQLite), itty-router, Web Crypto API (PBKDF2 + HMAC-JWT), Electron HTTP Client

---

## File Structure Map

### Server (Cloudflare Workers)

| File | Action | Responsibility |
|------|--------|---------------|
| `server/wrangler.toml` | Modify | Add `JWT_SECRET` var |
| `server/src/types.ts` | Modify | Extend `Tier`, `Env`, add user/session/usage types |
| `server/migrations/0002_cloud_auth.sql` | Create | users, sessions, usage, tier_config tables |
| `server/src/utils/password.ts` | Create | PBKDF2 password hashing |
| `server/src/utils/jwt.ts` | Create | Web Crypto JWT sign/verify |
| `server/src/middleware/auth.ts` | Create | Bearer token extraction + user lookup |
| `server/src/handlers/auth.ts` | Create | POST register/login/logout, GET me |
| `server/src/handlers/usage.ts` | Create | GET check, POST record, GET stats |
| `server/src/handlers/admin-users.ts` | Create | GET / PATCH admin user management |
| `server/src/handlers/admin-tiers.ts` | Create | GET / PUT tier config |
| `server/src/handlers/admin-stats.ts` | Create | GET dashboard stats |
| `server/src/handlers/activate.ts` | Modify | Add Bearer token auth support |
| `server/src/index.ts` | Modify | Wire all new routes |

### Client (Electron Main Process)

| File | Action | Responsibility |
|------|--------|---------------|
| `electron/utils/store.ts` | Modify | Add `cloudApiBaseUrl`, `cloudApiEnabled` |
| `electron/services/member/api-client.ts` | Create | HTTP client with auth header + offline detection |
| `electron/services/member/token-cache.ts` | Create | Store/retrieve cloud JWT from electron-store |
| `electron/services/member/offline-fallback.ts` | Create | Offline mode: cached user info, cached usage |
| `electron/services/member/usage-queue.ts` | Create | Offline usage buffer, sync on reconnect |
| `electron/services/member/cloud-migrate.ts` | Create | One-time local SQLite -> cloud sync |
| `electron/services/member/index.ts` | Modify | Replace local-first with cloud-first orchestration |
| `electron/main/ipc/auth-handlers.ts` | Modify | Rewrite handlers to call cloud API via api-client |
| `electron/services/member/member-manager.ts` | Delete | Logic已上云 |
| `electron/services/member/token-manager.ts` | Delete | 替换为 token-cache.ts |
| `electron/services/member/usage-counter.ts` | Delete | 替换为 usage-queue.ts |
| `electron/services/member/database.ts` | Delete | 本地 SQLite 不再需要 |
| `electron/services/member/subscription.ts` | Delete | Tier 从云端获取 |
| `electron/services/member/local-auth.ts` | Delete | 密码哈希和 JWT 签发已上云 |
| `electron/services/member/migrate.ts` | Delete | 替换为 cloud-migrate.ts |

### Client (Renderer / Frontend) — **零改动**

| File | Action | Reason |
|------|--------|--------|
| `src/stores/auth.ts` | **No change** | IPC 接口不变 |
| `src/pages/ActivationPage.tsx` | **No change** | 调用 auth store |
| `src/components/auth/*` | **No change** | 调用 auth store |
| `src/hooks/useFeatureGuard.ts` | **No change** | 调用 auth store |

---

## Phase A: 云端 API 扩展（Server-side）

### Task A1: D1 Schema 扩展 + Types 更新

**Files:**
- Create: `server/migrations/0002_cloud_auth.sql`
- Modify: `server/src/types.ts`

- [ ] **Step 1: Create migration file**

```sql
-- server/migrations/0002_cloud_auth.sql
-- D1 Schema Extension for Cloud Backend

-- 用户表
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

-- 会话表 (JWT token 管理)
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

-- 功能用量表 (按月统计)
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  year_month TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, feature, year_month)
);
CREATE INDEX IF NOT EXISTS idx_usage_user_feature ON usage(user_id, feature, year_month);

-- 会员等级配置表 (动态可调)
CREATE TABLE IF NOT EXISTS tier_config (
  tier TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL DEFAULT 3,
  features TEXT NOT NULL DEFAULT '[]',
  max_devices INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- 初始化等级配置
INSERT OR IGNORE INTO tier_config VALUES ('free', 'Free', 3, '[]', 1, 0);
INSERT OR IGNORE INTO tier_config VALUES ('pro', 'Pro', 0, '["collaboration","marketplace"]', 2, 0);
INSERT OR IGNORE INTO tier_config VALUES ('enterprise', 'Enterprise', 0, '["collaboration","marketplace"]', 5, 0);
```

- [ ] **Step 2: Update server/src/types.ts**

```typescript
// server/src/types.ts
/**
 * Shared types for ClawX Cloud Backend
 */

export type Tier = 'free' | 'pro' | 'enterprise';
export type LicenseStatus = 'active' | 'revoked' | 'expired';
export type UserStatus = 'active' | 'suspended';

export interface Env {
  DB: D1Database;
  ADMIN_API_KEY: string;
  JWT_SECRET: string;
}

// ========== Database Row Types ==========

export interface DbLicense {
  id: string;
  license_key: string;
  tier: Tier;
  status: LicenseStatus;
  max_devices: number;
  duration_days: number;
  activated_count: number;
  created_at: number;
  updated_at: number;
  notes: string | null;
}

export interface DbActivation {
  id: string;
  license_key: string;
  device_fingerprint: string;
  user_id: string | null;
  tier: Tier;
  activated_at: number;
  expires_at: number | null;
  last_verified_at: number | null;
  revoked: number;
}

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  password_salt: string;
  avatar_url: string | null;
  tier: Tier;
  balance: number;
  status: UserStatus;
  created_at: number;
  updated_at: number;
}

export interface DbSession {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  created_at: number;
  expires_at: number;
}

export interface DbUsage {
  id: number;
  user_id: string;
  feature: string;
  year_month: string;
  used_count: number;
}

export interface DbTierConfig {
  tier: Tier;
  display_name: string;
  monthly_quota: number;
  features: string;
  max_devices: number;
  updated_at: number;
}

// ========== API Request Types ==========

export interface ActivateRequest {
  licenseKey: string;
  deviceId: string;
  userId?: string;
  clientType: string;
}

export interface VerifyRequest {
  licenseKey: string;
  deviceId: string;
  clientType: string;
}

export interface CreateLicenseRequest {
  tier: Tier;
  durationDays?: number;
  maxDevices?: number;
  notes?: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  deviceId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  deviceId?: string;
}

export interface RecordUsageRequest {
  feature: string;
}

export interface UpdateTierRequest {
  displayName?: string;
  monthlyQuota?: number;
  features?: string[];
  maxDevices?: number;
}

export interface UpdateUserRequest {
  tier?: Tier;
  balance?: number;
  status?: UserStatus;
}

// ========== Auth Context ==========

export interface AuthContext {
  user: DbUser;
  sessionId: string;
}
```

- [ ] **Step 3: Apply migration locally**

Run: `cd server && npx wrangler d1 migrations apply clawx-license --local`

Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add server/migrations/0002_cloud_auth.sql server/src/types.ts
git commit -m "feat(server): extend D1 schema with users, sessions, usage, tier_config tables"
```

---

### Task A2: 密码哈希工具（PBKDF2 via Web Crypto）

**Files:**
- Create: `server/src/utils/password.ts`

- [ ] **Step 1: Create password utility**

```typescript
// server/src/utils/password.ts
/**
 * Password hashing using PBKDF2 via Web Crypto API.
 * Cloudflare Workers cannot run bcryptjs efficiently (no native bindings).
 * PBKDF2 with 100k iterations + SHA-256 is hardware-accelerated in Workers.
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 64; // bytes = 512 bits
const SALT_LENGTH = 16; // bytes

function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64Decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  return {
    hash: base64Encode(new Uint8Array(derivedBits)),
    salt: base64Encode(salt),
  };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const salt = base64Decode(storedSalt);
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  const computedHash = base64Encode(new Uint8Array(derivedBits));
  return computedHash === storedHash;
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/utils/password.ts
git commit -m "feat(server): add PBKDF2 password hashing utility"
```

---

### Task A3: JWT 工具（Web Crypto HMAC-SHA256）

**Files:**
- Create: `server/src/utils/jwt.ts`

- [ ] **Step 1: Create JWT utility**

```typescript
// server/src/utils/jwt.ts
/**
 * JWT sign/verify using Web Crypto API (HMAC-SHA256).
 * No external dependencies - works natively in Cloudflare Workers.
 */

import type { DbUser } from '../types';

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

export interface JwtPayload {
  sub: string;      // user id
  username: string;
  email: string;
  tier: string;
  deviceId?: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

export async function signJwt(
  user: DbUser,
  deviceId: string | undefined,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    tier: user.tier,
    deviceId,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const data = `${headerB64}.${payloadB64}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
  if (!valid) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as JwtPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/utils/jwt.ts
git commit -m "feat(server): add Web Crypto JWT sign/verify utility"
```

---

### Task A4: 认证中间件 + Token Hash 工具

**Files:**
- Create: `server/src/middleware/auth.ts`
- Modify: `server/src/utils/key-generator.ts` (add hashToken helper)

- [ ] **Step 1: Add token hash helper to key-generator.ts**

```typescript
// Append to server/src/utils/key-generator.ts

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 2: Create auth middleware**

```typescript
// server/src/middleware/auth.ts
/**
 * Authentication middleware for Cloudflare Workers.
 * Extracts Bearer token, verifies JWT, looks up user in D1.
 * Returns AuthContext or null.
 */

import type { Env, DbUser, AuthContext } from '../types';
import { verifyJwt } from '../utils/jwt';
import { hashToken } from '../utils/key-generator';

export async function authenticate(request: Request, env: Env): Promise<AuthContext | null> {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;

  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;

  // Verify JWT signature and expiry
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return null;

  // Check session exists and not revoked in DB
  const tokenHash = await hashToken(token);
  const session = await env.DB.prepare(
    'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?',
  ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{ user_id: string }>();

  if (!session) return null;

  // Fetch user
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ? AND status = ?',
  ).bind(payload.sub, 'active').first<DbUser>();

  if (!user) return null;

  return { user, sessionId: session.user_id };
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/auth.ts server/src/utils/key-generator.ts
git commit -m "feat(server): add auth middleware with JWT verification and session lookup"
```

---

### Task A5: Auth 端点（register / login / logout / me）

**Files:**
- Create: `server/src/handlers/auth.ts`
- Modify: `server/src/utils/response.ts` (add `successResponse` helper if needed)

- [ ] **Step 1: Create auth handlers**

```typescript
// server/src/handlers/auth.ts
/**
 * Auth endpoints: POST /v1/auth/register, POST /v1/auth/login,
 * POST /v1/auth/logout, GET /v1/auth/me
 */

import type { Env, DbUser, RegisterRequest, LoginRequest } from '../types';
import type { AuthContext } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { hashPassword, verifyPassword } from '../utils/password';
import { signJwt } from '../utils/jwt';
import { generateId } from '../utils/key-generator';
import { hashToken } from '../utils/key-generator';
import { authenticate } from '../middleware/auth';

const TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days
const FREE_TIER = 'free' as const;

// Helper to strip sensitive fields from DbUser
function toUserInfo(user: DbUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatar_url,
    subscriptionTier: user.tier,
    balance: user.balance,
  };
}

/** POST /v1/auth/register */
export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: RegisterRequest;
  try {
    body = await request.json() as RegisterRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.username || !body.email || !body.password) {
    return errorResponse('Missing required fields: username, email, password');
  }

  if (body.password.length < 6) {
    return errorResponse('Password must be at least 6 characters');
  }

  const now = Math.floor(Date.now() / 1000);

  // Check uniqueness
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?',
  ).bind(body.username, body.email).first<{ id: string }>();

  if (existing) {
    return errorResponse('Username or email already exists', 409);
  }

  const { hash, salt } = await hashPassword(body.password);
  const userId = generateId();

  await env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, password_salt, tier, balance, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
  ).bind(userId, body.username, body.email, hash, salt, FREE_TIER, now, now).run();

  // Fetch the created user
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<DbUser>();
  if (!user) return errorResponse('Failed to create user', 500);

  // Create session
  const token = await signJwt(user, body.deviceId, env.JWT_SECRET, TOKEN_EXPIRY);
  const tokenHash = await hashToken(token);
  const sessionId = generateId();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, device_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(sessionId, userId, body.deviceId ?? null, tokenHash, now, now + TOKEN_EXPIRY).run();

  return jsonResponse({ success: true, user: toUserInfo(user), token }, 201);
}

/** POST /v1/auth/login */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: LoginRequest;
  try {
    body = await request.json() as LoginRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.username || !body.password) {
    return errorResponse('Missing required fields: username, password');
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE username = ?',
  ).bind(body.username).first<DbUser>();

  if (!user) {
    return errorResponse('Invalid username or password', 401);
  }

  const valid = await verifyPassword(body.password, user.password_hash, user.password_salt);
  if (!valid) {
    return errorResponse('Invalid username or password', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(user, body.deviceId, env.JWT_SECRET, TOKEN_EXPIRY);
  const tokenHash = await hashToken(token);
  const sessionId = generateId();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, device_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(sessionId, user.id, body.deviceId ?? null, tokenHash, now, now + TOKEN_EXPIRY).run();

  return jsonResponse({ success: true, user: toUserInfo(user), token });
}

/** POST /v1/auth/logout */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (!auth) return jsonResponse({ success: true }); // idempotent

  const token = auth.replace('Bearer ', '').trim();
  if (token) {
    const tokenHash = await hashToken(token);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  return jsonResponse({ success: true });
}

/** GET /v1/auth/me */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  const ctx = await authenticate(request, env);
  if (!ctx) return errorResponse('Unauthorized', 401);

  return jsonResponse(toUserInfo(ctx.user));
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/handlers/auth.ts
git commit -m "feat(server): add auth endpoints (register, login, logout, me)"
```

---

### Task A6: Usage 端点（check / record / stats）

**Files:**
- Create: `server/src/handlers/usage.ts`

- [ ] **Step 1: Create usage handlers**

```typescript
// server/src/handlers/usage.ts
/**
 * Usage endpoints: GET /v1/usage/check, POST /v1/usage/record, GET /v1/usage/stats
 */

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { authenticate } from '../middleware/auth';

export async function handleUsageCheck(request: Request, env: Env): Promise<Response> {
  const ctx = await authenticate(request, env);
  if (!ctx) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const feature = url.searchParams.get('feature');
  if (!feature) return errorResponse('Missing feature parameter');

  const yearMonth = new Date().toISOString().slice(0, 7); // "2026-05"

  // Get tier config
  const tierConfig = await env.DB.prepare(
    'SELECT * FROM tier_config WHERE tier = ?',
  ).bind(ctx.user.tier).first<{ monthly_quota: number; features: string }>();

  const limit = tierConfig?.monthly_quota ?? 3;
  const allowedFeatures = tierConfig?.features ? JSON.parse(tierConfig.features) as string[] : [];

  // Get current usage
  const usage = await env.DB.prepare(
    'SELECT used_count FROM usage WHERE user_id = ? AND feature = ? AND year_month = ?',
  ).bind(ctx.user.id, feature, yearMonth).first<{ used_count: number }>();

  const used = usage?.used_count ?? 0;
  const isUnlimited = limit === 0;
  const allowed = isUnlimited || (used < limit);

  return jsonResponse({
    feature,
    used,
    limit,
    remaining: isUnlimited ? 999999 : Math.max(0, limit - used),
    tier: ctx.user.tier,
    allowed,
  });
}

export async function handleUsageRecord(request: Request, env: Env): Promise<Response> {
  const ctx = await authenticate(request, env);
  if (!ctx) return errorResponse('Unauthorized', 401);

  let body: { feature?: string };
  try {
    body = await request.json() as { feature?: string };
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.feature) return errorResponse('Missing feature field');

  const yearMonth = new Date().toISOString().slice(0, 7);

  await env.DB.prepare(
    `INSERT INTO usage (user_id, feature, year_month, used_count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, feature, year_month) DO UPDATE SET used_count = used_count + 1`,
  ).bind(ctx.user.id, body.feature, yearMonth).run();

  return jsonResponse({ success: true });
}

export async function handleUsageStats(request: Request, env: Env): Promise<Response> {
  const ctx = await authenticate(request, env);
  if (!ctx) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const featureFilter = url.searchParams.get('feature');
  const yearMonth = new Date().toISOString().slice(0, 7);

  // Get tier config for limits
  const tierConfig = await env.DB.prepare(
    'SELECT * FROM tier_config WHERE tier = ?',
  ).bind(ctx.user.tier).first<{ monthly_quota: number; features: string }>();

  const limit = tierConfig?.monthly_quota ?? 3;

  let query = 'SELECT feature, used_count FROM usage WHERE user_id = ? AND year_month = ?';
  const params: (string | number)[] = [ctx.user.id, yearMonth];

  if (featureFilter) {
    query += ' AND feature = ?';
    params.push(featureFilter);
  }

  const { results } = await env.DB.prepare(query).bind(...params).all<{ feature: string; used_count: number }>();

  const stats = results.map((row) => ({
    feature: row.feature,
    used: row.used_count,
    limit,
    remaining: limit === 0 ? 999999 : Math.max(0, limit - row.used_count),
    tier: ctx.user.tier,
  }));

  return jsonResponse(stats);
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/handlers/usage.ts
git commit -m "feat(server): add usage endpoints (check, record, stats)"
```

---

### Task A7: Admin 用户管理端点

**Files:**
- Create: `server/src/handlers/admin-users.ts`

- [ ] **Step 1: Create admin users handlers**

```typescript
// server/src/handlers/admin-users.ts
/**
 * Admin user management endpoints.
 * All require ADMIN_API_KEY Bearer authentication.
 */

import type { Env, DbUser, UpdateUserRequest } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';

function authenticateAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  return token === env.ADMIN_API_KEY;
}

function toUserInfo(user: DbUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatar_url,
    subscriptionTier: user.tier,
    balance: user.balance,
    status: user.status,
    createdAt: user.created_at,
  };
}

/** GET /v1/admin/users */
export async function handleListUsers(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');

  const { results } = await env.DB.prepare(
    'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(limit, offset).all<DbUser>();

  const countResult = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();

  return jsonResponse({
    users: results.map(toUserInfo),
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
}

/** GET /v1/admin/users/:id */
export async function handleGetUser(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop() ?? '';

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
  if (!user) return errorResponse('User not found', 404);

  return jsonResponse(toUserInfo(user));
}

/** PATCH /v1/admin/users/:id */
export async function handleUpdateUser(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop() ?? '';

  let body: UpdateUserRequest;
  try {
    body = await request.json() as UpdateUserRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.tier) {
    updates.push('tier = ?');
    params.push(body.tier);
  }
  if (typeof body.balance === 'number') {
    updates.push('balance = ?');
    params.push(body.balance);
  }
  if (body.status) {
    updates.push('status = ?');
    params.push(body.status);
  }

  if (updates.length === 0) {
    return errorResponse('No fields to update');
  }

  updates.push('updated_at = ?');
  params.push(Math.floor(Date.now() / 1000));
  params.push(id);

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...params).run();

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<DbUser>();
  if (!user) return errorResponse('User not found', 404);

  return jsonResponse({ success: true, user: toUserInfo(user) });
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/handlers/admin-users.ts
git commit -m "feat(server): add admin user management endpoints"
```

---

### Task A8: Admin 等级配置 + 统计端点

**Files:**
- Create: `server/src/handlers/admin-tiers.ts`
- Create: `server/src/handlers/admin-stats.ts`

- [ ] **Step 1: Create admin tiers handler**

```typescript
// server/src/handlers/admin-tiers.ts
/**
 * Admin tier config endpoints: GET /v1/admin/tiers, PUT /v1/admin/tiers/:tier
 */

import type { Env, DbTierConfig, UpdateTierRequest } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';

function authenticateAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  return token === env.ADMIN_API_KEY;
}

/** GET /v1/admin/tiers */
export async function handleListTiers(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) return errorResponse('Unauthorized', 401);

  const { results } = await env.DB.prepare(
    'SELECT * FROM tier_config ORDER BY tier',
  ).all<DbTierConfig>();

  return jsonResponse(results.map((t) => ({
    tier: t.tier,
    displayName: t.display_name,
    monthlyQuota: t.monthly_quota,
    features: JSON.parse(t.features) as string[],
    maxDevices: t.max_devices,
    updatedAt: t.updated_at,
  })));
}

/** PUT /v1/admin/tiers/:tier */
export async function handleUpdateTier(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const tier = url.pathname.split('/').pop() ?? '';
  if (!['free', 'pro', 'enterprise'].includes(tier)) {
    return errorResponse('Invalid tier');
  }

  let body: UpdateTierRequest;
  try {
    body = await request.json() as UpdateTierRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.displayName) { updates.push('display_name = ?'); params.push(body.displayName); }
  if (typeof body.monthlyQuota === 'number') { updates.push('monthly_quota = ?'); params.push(body.monthlyQuota); }
  if (body.features) { updates.push('features = ?'); params.push(JSON.stringify(body.features)); }
  if (typeof body.maxDevices === 'number') { updates.push('max_devices = ?'); params.push(body.maxDevices); }

  if (updates.length === 0) return errorResponse('No fields to update');

  updates.push('updated_at = ?');
  params.push(Math.floor(Date.now() / 1000));
  params.push(tier);

  await env.DB.prepare(
    `UPDATE tier_config SET ${updates.join(', ')} WHERE tier = ?`,
  ).bind(...params).run();

  return jsonResponse({ success: true });
}
```

- [ ] **Step 2: Create admin stats handler**

```typescript
// server/src/handlers/admin-stats.ts
/**
 * Admin dashboard stats: GET /v1/admin/stats
 */

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';

function authenticateAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  return token === env.ADMIN_API_KEY;
}

/** GET /v1/admin/stats */
export async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  if (!authenticateAdmin(request, env)) return errorResponse('Unauthorized', 401);

  const totalUsers = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first<{ c: number }>();
  const activeUsers = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'active'").first<{ c: number }>();
  const totalLicenses = await env.DB.prepare('SELECT COUNT(*) as c FROM licenses').first<{ c: number }>();
  const activeLicenses = await env.DB.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'active'").first<{ c: number }>();

  // Tier distribution
  const { results: tierDist } = await env.DB.prepare(
    'SELECT tier, COUNT(*) as count FROM users GROUP BY tier',
  ).all<{ tier: string; count: number }>();

  // Recent registrations (last 7 days)
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const { results: recentRegs } = await env.DB.prepare(
    'SELECT DATE(created_at, \'unixepoch\') as date, COUNT(*) as count FROM users WHERE created_at > ? GROUP BY date',
  ).bind(sevenDaysAgo).all<{ date: string; count: number }>();

  return jsonResponse({
    totalUsers: totalUsers?.c ?? 0,
    activeUsers: activeUsers?.c ?? 0,
    totalLicenses: totalLicenses?.c ?? 0,
    activeLicenses: activeLicenses?.c ?? 0,
    tierDistribution: tierDist,
    recentRegistrations: recentRegs,
  });
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/handlers/admin-tiers.ts server/src/handlers/admin-stats.ts
git commit -m "feat(server): add admin tier config and dashboard stats endpoints"
```

---

### Task A9: License 端点适配（增加 Bearer Token 支持）

**Files:**
- Modify: `server/src/handlers/activate.ts`
- Modify: `server/src/handlers/verify.ts`

- [ ] **Step 1: Modify activate.ts to support Bearer token authentication**

The existing `handleActivate` requires no auth. For the new flow, the client sends a Bearer token (from cloud login). We adapt the handler to accept `userId` from the token if present, while still supporting the old unauthenticated flow for backward compatibility.

```typescript
// server/src/handlers/activate.ts
// ADD imports at top:
import { authenticate } from '../middleware/auth';

// In handleActivate, after extracting body, add:
export async function handleActivate(request: Request, env: Env): Promise<Response> {
  let body: ActivateRequest;
  try {
    body = await request.json() as ActivateRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { licenseKey, deviceId } = body;
  if (!licenseKey || !deviceId) {
    return errorResponse('Missing required fields: licenseKey, deviceId');
  }

  // Try to get userId from Bearer token (new flow) or from body (legacy)
  const authCtx = await authenticate(request, env);
  const userId = authCtx?.user.id ?? body.userId ?? null;

  // ... rest of the existing logic stays the same ...
  // When inserting activation, use userId:
  // .bind(activationId, licenseKey, deviceId, userId ?? null, license.tier, ...)
```

The full modified file:

```typescript
/**
 * POST /v1/license/activate
 * Activates a License Key on a specific device.
 * Supports both authenticated (Bearer token) and unauthenticated (legacy) flows.
 */
import type { Env, DbLicense, DbActivation, ActivateRequest } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { generateId } from '../utils/key-generator';
import { authenticate } from '../middleware/auth';

export async function handleActivate(request: Request, env: Env): Promise<Response> {
  let body: ActivateRequest;
  try {
    body = await request.json() as ActivateRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { licenseKey, deviceId } = body;

  if (!licenseKey || !deviceId) {
    return errorResponse('Missing required fields: licenseKey, deviceId');
  }

  // Get userId from Bearer token if available (new cloud flow)
  const authCtx = await authenticate(request, env);
  const userId = authCtx?.user.id ?? body.userId ?? null;

  // Lookup license
  const license = await env.DB.prepare(
    'SELECT * FROM licenses WHERE license_key = ? AND status = ?',
  ).bind(licenseKey, 'active').first<DbLicense>();

  if (!license) {
    return errorResponse('Invalid or inactive license key', 404);
  }

  // Check device limit
  const existingActivations = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM activations WHERE license_key = ? AND revoked = 0',
  ).bind(licenseKey).first<{ cnt: number }>();

  const deviceCount = existingActivations?.cnt ?? 0;

  // Check if this device is already activated
  const existingForDevice = await env.DB.prepare(
    'SELECT * FROM activations WHERE license_key = ? AND device_fingerprint = ? AND revoked = 0',
  ).bind(licenseKey, deviceId).first<DbActivation>();

  if (!existingForDevice && deviceCount >= license.max_devices) {
    return errorResponse(`Device limit reached (${license.max_devices}). Please deactivate a device first.`, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (license.duration_days * 86400);

  if (existingForDevice) {
    await env.DB.prepare(
      `UPDATE activations
       SET last_verified_at = ?, expires_at = ?, user_id = ?
       WHERE id = ?`,
    ).bind(now, expiresAt, userId ?? null, existingForDevice.id).run();
  } else {
    const activationId = generateId();
    await env.DB.prepare(
      `INSERT INTO activations (id, license_key, device_fingerprint, user_id, tier, activated_at, expires_at, last_verified_at, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(activationId, licenseKey, deviceId, userId ?? null, license.tier, now, expiresAt, now).run();

    await env.DB.prepare(
      'UPDATE licenses SET activated_count = activated_count + 1, updated_at = ? WHERE id = ?',
    ).bind(now, license.id).run();
  }

  return jsonResponse({
    tier: license.tier,
    expiresAt,
  });
}
```

- [ ] **Step 2: Verify verify.ts requires no changes**

The `verify.ts` endpoint is device-to-server verification and doesn't need Bearer auth. No changes needed.

- [ ] **Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/handlers/activate.ts
git commit -m "feat(server): adapt license activate endpoint for Bearer token auth"
```

---

### Task A10: 路由注册 + Wrangler 配置更新

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/wrangler.toml`

- [ ] **Step 1: Update wrangler.toml with JWT_SECRET**

```toml
# server/wrangler.toml
name = "clawx-license-server"
main = "src/index.ts"
compatibility_date = "2025-05-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "clawx-license"
database_id = "PLACEHOLDER_REPLACE_AFTER_CREATE"

# Environment variables (secrets should use `wrangler secret put`)
[vars]
ADMIN_API_KEY = "dev-admin-key-change-in-production"
JWT_SECRET = "dev-jwt-secret-change-in-production-use-wrangler-secret-put"
```

> **Note:** In production, set JWT_SECRET via `wrangler secret put JWT_SECRET` instead of hardcoding.

- [ ] **Step 2: Update index.ts with all new routes**

```typescript
/**
 * ClawX Cloud Backend Server
 * Cloudflare Workers entry point
 */
import { Router } from 'itty-router';
import type { Env } from './types';
import { corsPreflightResponse, errorResponse } from './utils/response';
import { handleActivate } from './handlers/activate';
import { handleVerify } from './handlers/verify';
import { handleCreateLicense, handleListLicenses, handleRevokeLicense } from './handlers/admin';
import { handleRegister, handleLogin, handleLogout, handleMe } from './handlers/auth';
import { handleUsageCheck, handleUsageRecord, handleUsageStats } from './handlers/usage';
import { handleListUsers, handleGetUser, handleUpdateUser } from './handlers/admin-users';
import { handleListTiers, handleUpdateTier } from './handlers/admin-tiers';
import { handleAdminStats } from './handlers/admin-stats';

const router = Router<Request, [Env]>();

// CORS preflight
router.options('*', () => corsPreflightResponse());

// Health check
router.get('/v1/health', () => new Response('OK', { status: 200 }));

// ========== Auth (public) ==========
router.post('/v1/auth/register', async (request, env) => handleRegister(request, env));
router.post('/v1/auth/login', async (request, env) => handleLogin(request, env));
router.post('/v1/auth/logout', async (request, env) => handleLogout(request, env));
router.get('/v1/auth/me', async (request, env) => handleMe(request, env));

// ========== License (public / Bearer optional) ==========
router.post('/v1/license/activate', async (request, env) => handleActivate(request, env));
router.post('/v1/license/verify', async (request, env) => handleVerify(request, env));

// ========== Usage (requires Bearer token) ==========
router.get('/v1/usage/check', async (request, env) => handleUsageCheck(request, env));
router.post('/v1/usage/record', async (request, env) => handleUsageRecord(request, env));
router.get('/v1/usage/stats', async (request, env) => handleUsageStats(request, env));

// ========== Admin (requires ADMIN_API_KEY) ==========
router.post('/v1/admin/licenses', async (request, env) => handleCreateLicense(request, env));
router.get('/v1/admin/licenses', async (request, env) => handleListLicenses(request, env));
router.delete('/v1/admin/licenses/:key', async (request, env) => {
  const url = new URL(request.url);
  const key = url.pathname.split('/').pop() ?? '';
  return handleRevokeLicense(request, env, key);
});
router.get('/v1/admin/users', async (request, env) => handleListUsers(request, env));
router.get('/v1/admin/users/:id', async (request, env) => handleGetUser(request, env));
router.patch('/v1/admin/users/:id', async (request, env) => handleUpdateUser(request, env));
router.get('/v1/admin/tiers', async (request, env) => handleListTiers(request, env));
router.put('/v1/admin/tiers/:tier', async (request, env) => handleUpdateTier(request, env));
router.get('/v1/admin/stats', async (request, env) => handleAdminStats(request, env));

// 404 fallback
router.all('*', () => errorResponse('Not Found', 404));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router.handle(request, env);
  },
};
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Local smoke test**

Run: `cd server && npx wrangler dev`

In another terminal, run:
```bash
curl http://localhost:8787/v1/health
# Expected: OK

curl -X POST http://localhost:8787/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@test.com","password":"123456","deviceId":"test-device"}'
# Expected: {"success":true,"user":{...},"token":"..."}
```

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/wrangler.toml
git commit -m "feat(server): wire all new routes (auth, usage, admin) and update wrangler config"
```

---

## Phase B: 客户端改造（Electron Main Process）

### Task B1: API 客户端 + 云端配置

**Files:**
- Create: `electron/services/member/api-client.ts`
- Modify: `electron/utils/store.ts`

- [ ] **Step 1: Add cloud config to electron/utils/store.ts**

Find the `AppSettings` interface in `electron/utils/store.ts` and add:

```typescript
// In electron/utils/store.ts, add to AppSettings interface:
  cloudApiBaseUrl: string;
  cloudApiEnabled: boolean;
```

And add defaults in the store initialization:

```typescript
// In the store defaults object:
  cloudApiBaseUrl: 'https://api.clawx.app/v1',
  cloudApiEnabled: true,
```

- [ ] **Step 2: Create API client**

```typescript
// electron/services/member/api-client.ts
/**
 * HTTP client for Cloud API calls from Electron main process.
 * Handles auth header injection, JSON serialization, and offline detection.
 */

import { logger } from '../../utils/logger';

const DEFAULT_BASE_URL = 'https://api.clawx.app/v1';

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
}

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken = options.getToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return { ok: false, status: response.status, message: data.message || `HTTP ${response.status}` };
      }

      return { ok: true, data: data as T };
    } catch (err: any) {
      logger.error('[ApiClient] request failed:', err);
      return { ok: false, status: 0, message: err.message || 'Network error' };
    }
  }

  async get<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
    return this.request<T>('DELETE', path);
  }
}
```

- [ ] **Step 3: Run TypeScript check on Electron code**

Run: `cd /Volumes/KINGSTON/CodeVault/GitHub/ClawX && npx tsc --noEmit -p electron/tsconfig.json` (or equivalent tsconfig for electron)

> If the electron code is part of the main tsconfig, just run `npx tsc --noEmit`.

Expected: No errors (if there are pre-existing errors unrelated to your change, note them)

- [ ] **Step 4: Commit**

```bash
git add electron/services/member/api-client.ts electron/utils/store.ts
git commit -m "feat(member): add cloud API client and cloudApiBaseUrl config"
```

---

### Task B2: Token 缓存管理器

**Files:**
- Create: `electron/services/member/token-cache.ts`

- [ ] **Step 1: Create token cache**

```typescript
// electron/services/member/token-cache.ts
/**
 * Token Cache: stores cloud JWT in electron-store.
 * Replaces local JWT self-issuance with cloud-issued token caching.
 */

import type { UserInfo } from './types';

let _storeInstance: any = null;
async function getStore() {
  if (!_storeInstance) {
    const Store = (await import('electron-store')).default;
    _storeInstance = new Store({ name: 'clawdock-member-cloud' });
  }
  return _storeInstance;
}

export class TokenCache {
  private token: string | null = null;
  private userInfo: UserInfo | null = null;

  async init(): Promise<void> {
    const store = await getStore();
    this.token = store.get('cloudToken', null) as string | null;
    this.userInfo = store.get('cloudUserInfo', null) as UserInfo | null;
  }

  getToken(): string | null {
    return this.token;
  }

  getUserInfo(): UserInfo | null {
    return this.userInfo;
  }

  isLoggedIn(): boolean {
    return !!this.token && !!this.userInfo;
  }

  async setSession(token: string, userInfo: UserInfo): Promise<void> {
    this.token = token;
    this.userInfo = userInfo;
    const store = await getStore();
    store.set('cloudToken', token);
    store.set('cloudUserInfo', userInfo);
  }

  async clear(): Promise<void> {
    this.token = null;
    this.userInfo = null;
    const store = await getStore();
    store.delete('cloudToken');
    store.delete('cloudUserInfo');
  }
}

export const tokenCache = new TokenCache();
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/services/member/token-cache.ts
git commit -m "feat(member): add cloud JWT token cache manager"
```

---

### Task B3: Auth Handlers 重写（IPC → HTTP 代理）

**Files:**
- Modify: `electron/main/ipc/auth-handlers.ts`

- [ ] **Step 1: Rewrite auth-handlers.ts**

```typescript
// electron/main/ipc/auth-handlers.ts
/**
 * Auth IPC handlers — Cloud Backend Proxy Version.
 * All handlers route to cloud API via ApiClient.
 * Frontend is completely insulated from the backend change.
 */

import { ipcMain } from 'electron';
import { ApiClient } from '../../services/member/api-client';
import { tokenCache } from '../../services/member/token-cache';
import { memberEventBus } from '../../services/member/event-bus';
import { MemberEvent, type Feature, type UserInfo } from '../../services/member/types';
import { logger } from '../../utils/logger';

// Lazy-init API client
let _apiClient: ApiClient | null = null;
function getApiClient(): ApiClient {
  if (!_apiClient) {
    _apiClient = new ApiClient({
      baseUrl: 'https://api.clawx.app/v1',
      getToken: () => tokenCache.getToken(),
    });
  }
  return _apiClient;
}

// Helper to refresh API client when base URL changes
export function setApiClientBaseUrl(baseUrl: string): void {
  _apiClient = new ApiClient({
    baseUrl,
    getToken: () => tokenCache.getToken(),
  });
}

export function registerAuthIpcHandlers(): void {
  const api = getApiClient();

  ipcMain.handle('auth:login', async (_, credentials: { username: string; password: string }) => {
    try {
      const result = await api.post<{ success: boolean; user?: UserInfo; token?: string; reason?: string }>(
        '/auth/login',
        { ...credentials },
      );

      if (result.ok && result.data.success && result.data.token && result.data.user) {
        await tokenCache.setSession(result.data.token, result.data.user);
        memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, result.data.user);
      }

      return result.ok ? result.data : { success: false, reason: result.message };
    } catch (err: any) {
      logger.error('[IPC auth:login] error:', err);
      return { success: false, reason: err.message || 'Login failed' };
    }
  });

  ipcMain.handle('auth:register', async (_, credentials: { username: string; email: string; password: string }) => {
    try {
      const result = await api.post<{ success: boolean; user?: UserInfo; token?: string; reason?: string }>(
        '/auth/register',
        { ...credentials },
      );

      if (result.ok && result.data.success && result.data.token && result.data.user) {
        await tokenCache.setSession(result.data.token, result.data.user);
        memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, result.data.user);
      }

      return result.ok ? result.data : { success: false, reason: result.message };
    } catch (err: any) {
      logger.error('[IPC auth:register] error:', err);
      return { success: false, reason: err.message || 'Registration failed' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      // Tell server to revoke session (best effort)
      const token = tokenCache.getToken();
      if (token) {
        await api.post('/auth/logout', {});
      }
      await tokenCache.clear();
      memberEventBus.emit(MemberEvent.LOGOUT);
      return { success: true };
    } catch (err: any) {
      logger.error('[IPC auth:logout] error:', err);
      return { success: false, reason: err.message || 'Logout failed' };
    }
  });

  ipcMain.handle('auth:getUser', async () => {
    try {
      // Try to fetch fresh user from cloud
      const result = await api.get<UserInfo>('/auth/me');
      if (result.ok) {
        // Update cached user info
        const token = tokenCache.getToken();
        if (token) {
          await tokenCache.setSession(token, result.data);
        }
        return result.data;
      }
      // Fallback to cached user
      return tokenCache.getUserInfo();
    } catch (err: any) {
      logger.error('[IPC auth:getUser] error:', err);
      return tokenCache.getUserInfo();
    }
  });

  ipcMain.handle('auth:checkFeature', async (_, feature: Feature) => {
    try {
      const result = await api.get<{ feature: string; used: number; limit: number; remaining: number; tier: string; allowed: boolean }>(
        `/usage/check?feature=${encodeURIComponent(feature)}`,
      );
      return result.ok ? result.data : null;
    } catch (err: any) {
      logger.error('[IPC auth:checkFeature] error:', err);
      return null;
    }
  });

  ipcMain.handle('auth:recordUsage', async (_, feature: Feature) => {
    try {
      const result = await api.post<{ success: boolean }>('/usage/record', { feature });
      return result.ok ? result.data : { success: false, reason: result.message };
    } catch (err: any) {
      logger.error('[IPC auth:recordUsage] error:', err);
      return { success: false, reason: err.message || 'Record failed' };
    }
  });

  ipcMain.handle('auth:getUsageStats', async (_, feature?: Feature) => {
    try {
      const path = feature ? `/usage/stats?feature=${encodeURIComponent(feature)}` : '/usage/stats';
      const result = await api.get<Array<{ feature: string; used: number; limit: number; remaining: number; tier: string }>>(path);
      return result.ok ? result.data : [];
    } catch (err: any) {
      logger.error('[IPC auth:getUsageStats] error:', err);
      return [];
    }
  });

  ipcMain.handle('auth:activate', async (_, { licenseKey }: { licenseKey: string }) => {
    try {
      const userInfo = tokenCache.getUserInfo();
      const result = await api.post<{ tier?: string; expiresAt?: number }>(
        '/license/activate',
        { licenseKey, deviceId: 'unknown', userId: userInfo?.id },
      );

      if (result.ok) {
        // Refresh user to get updated tier
        const meResult = await api.get<UserInfo>('/auth/me');
        if (meResult.ok) {
          const token = tokenCache.getToken();
          if (token) await tokenCache.setSession(token, meResult.data);
        }
        return { success: true, tier: result.data.tier, expiresAt: result.data.expiresAt };
      }

      return { success: false, reason: result.message };
    } catch (err: any) {
      logger.error('[IPC auth:activate] error:', err);
      return { success: false, reason: err.message || 'Activation failed' };
    }
  });

  logger.info('[IPC] Auth handlers registered (cloud backend)');
}
```

- [ ] **Step 2: Update IPC handler registration call**

In `electron/main/ipc-handlers.ts` (or wherever `registerAuthIpcHandlers` is called), change:

```typescript
// BEFORE:
registerAuthIpcHandlers(memberModule);

// AFTER:
import { registerAuthIpcHandlers } from './auth-handlers';
registerAuthIpcHandlers();
```

Remove the `memberModule` parameter from the call site.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/main/ipc/auth-handlers.ts electron/main/ipc-handlers.ts
git commit -m "feat(ipc): rewrite auth handlers to proxy cloud API"
```

---

### Task B4: 离线降级 + 用量队列

**Files:**
- Create: `electron/services/member/offline-fallback.ts`
- Create: `electron/services/member/usage-queue.ts`

- [ ] **Step 1: Create offline fallback module**

```typescript
// electron/services/member/offline-fallback.ts
/**
 * Offline Fallback: provides cached responses when cloud API is unreachable.
 * Stores user info and usage stats in electron-store for offline access.
 */

import type { UserInfo, UsageInfo } from './types';

let _storeInstance: any = null;
async function getStore() {
  if (!_storeInstance) {
    const Store = (await import('electron-store')).default;
    _storeInstance = new Store({ name: 'clawdock-member-offline' });
  }
  return _storeInstance;
}

export class OfflineFallback {
  async cacheUserInfo(userInfo: UserInfo): Promise<void> {
    const store = await getStore();
    store.set('cachedUser', userInfo);
    store.set('cachedAt', Date.now());
  }

  async getCachedUserInfo(): Promise<UserInfo | null> {
    const store = await getStore();
    const cached = store.get('cachedUser', null) as UserInfo | null;
    const cachedAt = store.get('cachedAt', 0) as number;
    // Cache valid for 24 hours
    if (cached && Date.now() - cachedAt < 24 * 60 * 60 * 1000) {
      return cached;
    }
    return null;
  }

  async cacheUsageStats(stats: UsageInfo[]): Promise<void> {
    const store = await getStore();
    store.set('cachedUsage', stats);
  }

  async getCachedUsageStats(): Promise<UsageInfo[] | null> {
    const store = await getStore();
    return store.get('cachedUsage', null) as UsageInfo[] | null;
  }

  async clear(): Promise<void> {
    const store = await getStore();
    store.delete('cachedUser');
    store.delete('cachedUsage');
    store.delete('cachedAt');
  }
}

export const offlineFallback = new OfflineFallback();
```

- [ ] **Step 2: Create usage queue module**

```typescript
// electron/services/member/usage-queue.ts
/**
 * Usage Queue: buffers usage records when offline, syncs to cloud when reconnected.
 */

import type { Feature } from './types';

interface QueuedUsage {
  feature: Feature;
  timestamp: number;
}

let _storeInstance: any = null;
async function getStore() {
  if (!_storeInstance) {
    const Store = (await import('electron-store')).default;
    _storeInstance = new Store({ name: 'clawdock-member-usage-queue' });
  }
  return _storeInstance;
}

export class UsageQueue {
  async enqueue(feature: Feature): Promise<void> {
    const store = await getStore();
    const queue = store.get('queue', []) as QueuedUsage[];
    queue.push({ feature, timestamp: Date.now() });
    store.set('queue', queue);
  }

  async getQueue(): Promise<QueuedUsage[]> {
    const store = await getStore();
    return store.get('queue', []) as QueuedUsage[];
  }

  async clearQueue(): Promise<void> {
    const store = await getStore();
    store.delete('queue');
  }

  async sync(apiPost: (feature: Feature) => Promise<boolean>): Promise<void> {
    const queue = await this.getQueue();
    if (queue.length === 0) return;

    const succeeded: number[] = [];
    for (let i = 0; i < queue.length; i++) {
      const ok = await apiPost(queue[i].feature);
      if (ok) succeeded.push(i);
    }

    // Remove succeeded items
    const remaining = queue.filter((_, i) => !succeeded.includes(i));
    const store = await getStore();
    store.set('queue', remaining);
  }
}

export const usageQueue = new UsageQueue();
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/services/member/offline-fallback.ts electron/services/member/usage-queue.ts
git commit -m "feat(member): add offline fallback and usage queue modules"
```

---

### Task B5: Member Module 重写 + 旧模块清理

**Files:**
- Modify: `electron/services/member/index.ts`
- Delete: `electron/services/member/member-manager.ts`
- Delete: `electron/services/member/token-manager.ts`
- Delete: `electron/services/member/usage-counter.ts`
- Delete: `electron/services/member/database.ts`
- Delete: `electron/services/member/subscription.ts`
- Delete: `electron/services/member/local-auth.ts`
- Delete: `electron/services/member/migrate.ts`

- [ ] **Step 1: Rewrite index.ts as cloud-first orchestrator**

```typescript
// electron/services/member/index.ts
/**
 * MemberModule Facade (Cloud-First)
 * Lightweight orchestrator: delegates all logic to cloud API.
 * Keeps local cache for offline resilience.
 */

import { machineId } from 'node-machine-id';
import { createHash } from 'node:crypto';
import { platform } from 'node:os';
import { tokenCache } from './token-cache';
import { offlineFallback } from './offline-fallback';
import { usageQueue } from './usage-queue';
import { ApiClient } from './api-client';
import { memberEventBus } from './event-bus';
import { MemberEvent, type MemberState, type Feature, type UsageInfo, type UserInfo } from './types';
import { logger } from '../../utils/logger';

async function generateDeviceId(): Promise<string> {
  const raw = await machineId();
  const plat = platform();
  return createHash('sha256').update(`${raw}:${plat}`).digest('hex');
}

export class MemberModule {
  private api: ApiClient;
  private _deviceId: string | null = null;
  private _initialized = false;

  constructor() {
    this.api = new ApiClient({
      baseUrl: 'https://api.clawx.app/v1',
      getToken: () => tokenCache.getToken(),
    });
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    this._deviceId = await generateDeviceId();
    await tokenCache.init();

    memberEventBus.on(MemberEvent.LOGIN_SUCCESS, (user: UserInfo) => {
      offlineFallback.cacheUserInfo(user);
    });

    memberEventBus.on(MemberEvent.LOGOUT, () => {
      offlineFallback.clear();
    });

    this._initialized = true;
    logger.info('[MemberModule] Initialized (cloud-first mode)');
  }

  get state(): MemberState {
    return {
      isLoggedIn: tokenCache.isLoggedIn(),
      isGuest: !tokenCache.isLoggedIn(),
      userInfo: tokenCache.getUserInfo(),
      tier: tokenCache.getUserInfo()?.subscriptionTier ?? null,
      isOnline: true, // TODO: integrate with network-detector
      featureToken: null, // No longer used; cloud token is the source of truth
    };
  }

  get deviceId(): string | null {
    return this._deviceId;
  }

  async checkFeature(feature: Feature): Promise<UsageInfo | null> {
    // Try cloud first
    const result = await this.api.get<UsageInfo>(`/usage/check?feature=${encodeURIComponent(feature)}`);
    if (result.ok) {
      offlineFallback.cacheUsageStats([result.data]);
      return result.data;
    }

    // Offline fallback
    const cached = await offlineFallback.getCachedUsageStats();
    if (cached) {
      const match = cached.find((u) => u.feature === feature);
      if (match) return match;
    }

    return null;
  }

  async recordUsage(feature: Feature): Promise<void> {
    const result = await this.api.post<{ success: boolean }>('/usage/record', { feature });
    if (!result.ok) {
      // Queue for later sync
      await usageQueue.enqueue(feature);
      logger.warn('[MemberModule] Usage recorded locally (queued for sync)');
    }
  }

  async syncUsageQueue(): Promise<void> {
    await usageQueue.sync(async (feature) => {
      const result = await this.api.post<{ success: boolean }>('/usage/record', { feature });
      return result.ok && result.data.success;
    });
  }

  async shutdown(): Promise<void> {
    this._initialized = false;
    logger.info('[MemberModule] Shutdown complete');
  }
}

export const memberModule = new MemberModule();
```

- [ ] **Step 2: Delete obsolete files**

```bash
# Delete old local-first modules that are no longer needed
git rm electron/services/member/member-manager.ts
git rm electron/services/member/token-manager.ts
git rm electron/services/member/usage-counter.ts
git rm electron/services/member/database.ts
git rm electron/services/member/subscription.ts
git rm electron/services/member/local-auth.ts
git rm electron/services/member/migrate.ts
```

> Note: Some files might still be imported by tests. If tests break, update or delete the test files too.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: No errors (resolve any import errors from deleted files)

- [ ] **Step 4: Commit**

```bash
git add electron/services/member/index.ts
git commit -m "feat(member): rewrite MemberModule for cloud-first architecture, remove local SQLite modules"
```

---

## Phase C: 管理后台（Admin Dashboard SPA）

> **Decision point:** This phase is optional and can be deferred. The admin REST API endpoints (Phase A) already provide full CRUD capabilities. The SPA is a convenience layer on top.

**Files:**
- Create: `server/admin/index.html`
- Create: `server/admin/app.js`
- Create: `server/admin/styles.css`
- Modify: `server/src/index.ts` (add static asset route for `/admin/*`)

If deferred, skip this phase and use curl / API client for admin operations.

---

## Phase D: 数据迁移工具

### Task D1: 本地 SQLite → 云端迁移脚本

**Files:**
- Create: `electron/services/member/cloud-migrate.ts`

- [ ] **Step 1: Create migration helper**

```typescript
// electron/services/member/cloud-migrate.ts
/**
 * One-time migration: local SQLite users -> cloud backend.
 * Prompts user to re-enter password (since we can't reverse bcrypt hashes).
 */

import { logger } from '../../utils/logger';
import { ApiClient } from './api-client';

export interface LocalUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  subscriptionTier: string;
}

export async function migrateLocalUsersToCloud(
  localUsers: LocalUser[],
  api: ApiClient,
  getPassword: (username: string) => Promise<string | null>,
): Promise<{ migrated: number; failed: number }> {
  let migrated = 0;
  let failed = 0;

  for (const user of localUsers) {
    const password = await getPassword(user.username);
    if (!password) {
      failed++;
      continue;
    }

    const result = await api.post('/auth/register', {
      username: user.username,
      email: user.email,
      password,
    });

    if (result.ok) {
      migrated++;
      logger.info(`[CloudMigrate] Migrated user: ${user.username}`);
    } else {
      // Maybe user already exists, try login
      const loginResult = await api.post('/auth/login', {
        username: user.username,
        password,
      });
      if (loginResult.ok) {
        migrated++;
      } else {
        failed++;
        logger.warn(`[CloudMigrate] Failed to migrate user: ${user.username}`);
      }
    }
  }

  return { migrated, failed };
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/member/cloud-migrate.ts
git commit -m "feat(member): add cloud migration helper for local users"
```

---

## Phase E: 集成测试

### Task E1: 服务端 API E2E 测试

- [ ] **Step 1: Test auth flow**

```bash
# Start local dev server
cd server && npx wrangler dev

# Register
curl -X POST http://localhost:8787/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","email":"test1@test.com","password":"123456","deviceId":"d1"}'

# Login
curl -X POST http://localhost:8787/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"123456","deviceId":"d1"}'

# Get me (use token from login)
curl http://localhost:8787/v1/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

- [ ] **Step 2: Test usage flow**

```bash
# Check feature (should show free tier, 0/3 used)
curl "http://localhost:8787/v1/usage/check?feature=collaboration" \
  -H "Authorization: Bearer <TOKEN>"

# Record usage
curl -X POST http://localhost:8787/v1/usage/record \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"feature":"collaboration"}'

# Check again (should show 1/3 used)
curl "http://localhost:8787/v1/usage/check?feature=collaboration" \
  -H "Authorization: Bearer <TOKEN>"
```

- [ ] **Step 3: Test admin endpoints**

```bash
# List users
curl http://localhost:8787/v1/admin/users \
  -H "Authorization: Bearer dev-admin-key-change-in-production"

# Get stats
curl http://localhost:8787/v1/admin/stats \
  -H "Authorization: Bearer dev-admin-key-change-in-production"
```

- [ ] **Step 4: Test license flow**

```bash
# Create license
curl -X POST http://localhost:8787/v1/admin/licenses \
  -H "Authorization: Bearer dev-admin-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{"tier":"pro","durationDays":365}'

# Activate (with Bearer token)
curl -X POST http://localhost:8787/v1/license/activate \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"CLWX-XXXX-XXXX-XXXX","deviceId":"d1"}'
```

### Task E2: 客户端集成验证

- [ ] **Step 1: Verify frontend compiles**

Run: `npm run build` (or `vite build`)

Expected: No TypeScript errors

- [ ] **Step 2: Verify Electron compiles**

Run: `npx tsc --noEmit -p electron/tsconfig.json` (or main tsconfig)

Expected: No TypeScript errors

- [ ] **Step 3: Run existing tests**

Run: `npm test` (or `vitest run`)

> Note: Old tests for `member-manager`, `token-manager`, `usage-counter` will fail because those files were deleted. Delete or update those test files.

- [ ] **Step 4: Manual E2E test in Electron**

1. Launch ClawX app
2. Open login modal → Register new account
3. Verify user appears in top-right UserBadge
4. Logout → Verify state clears
5. Login again → Verify session restores
6. Open ActivationPage → Activate a license key
7. Verify tier changes in UserBadge
8. Check feature usage bar updates

---

## 待决策事项（执行前确认）

1. **云端 API 域名**：`https://api.clawx.app/v1` 是否确认？
2. **JWT_SECRET**：执行 Task A10 前需设置 `wrangler secret put JWT_SECRET`
3. **ADMIN_API_KEY**：生产环境是否已设置强密码？
4. **密码策略**：当前最小 6 位，是否需要复杂度要求？
5. **管理后台**：是否立即开发 SPA，还是先使用 API 直接操作？
6. **旧数据迁移**：是否有现有本地用户需要迁移到云端？

---

## 执行顺序建议

```
Phase A (服务端，可独立执行)
  A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10
         ↓
Phase B (客户端，依赖 Phase A API 就绪)
  B1 → B2 → B3 → B4 → B5
         ↓
Phase D (迁移工具，依赖 Phase A+B)
  D1
         ↓
Phase E (测试验证)
  E1 → E2
```

Phase C（管理后台）可与 Phase B 并行，或延后执行。
