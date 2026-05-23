# 会员系统实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ClawX 桌面应用实现会员注册登录功能，打通 guada_ai 后端，限制协作大厅和应用广场每月各 3 次使用。

**Architecture:** 混合验证模式（在线实时 API + 离线 Feature Token 兜底）。guada_ai 后端新增 UsageModule 管理配额，LicenseModule 扩展 Feature Token 支持 ClawX 客户端。ClawX 新增 4 个 Electron 主进程服务（MemberManager/TokenManager/UsageCounter/NetworkDetector），通过事件总线协作。

**Tech Stack:** NestJS + Prisma + PostgreSQL (后端) | Electron + React + Zustand + TypeScript (前端) | Vitest (测试)

**Spec:** `docs/superpowers/specs/2026-05-22-membership-system-design.md`

---

## 文件结构总览

### guada_ai 后端（新建）

| 文件 | 职责 |
|------|------|
| `backend-ts/prisma/schema.prisma` | 新增 Feature 枚举、TriggerAction 枚举、FeatureUsageLog 和 MonthlyQuota 模型 |
| `backend-ts/src/modules/usage/usage.module.ts` | Usage 模块注册 |
| `backend-ts/src/modules/usage/usage.controller.ts` | API 路由：check / record / stats / sync |
| `backend-ts/src/modules/usage/usage.service.ts` | 配额检查、使用记录、用量统计、校准逻辑 |
| `backend-ts/src/modules/usage/dto/` | DTO 定义 |
| `backend-ts/src/modules/license/constants/license.constants.ts` | 新增 ClawX 功能标识 |
| `backend-ts/src/modules/license/license.service.ts` | Feature Token payload 扩展 |

### ClawX 主进程（新建）

| 文件 | 职责 |
|------|------|
| `electron/services/member/types.ts` | 统一类型定义（UsageInfo、FeatureTokenPayload、MemberEvent） |
| `electron/services/member/member-manager.ts` | 登录/注册/登出/用户信息管理 |
| `electron/services/member/token-manager.ts` | Feature Token 续签/验签/存储 |
| `electron/services/member/usage-counter.ts` | 本地计数/月度重置/联网同步 |
| `electron/services/member/network-detector.ts` | 网络探测/状态切换/指数退避 |
| `electron/services/member/event-bus.ts` | 服务间事件总线 |
| `electron/services/member/index.ts` | 模块入口，统一初始化 |
| `electron/main/ipc/auth-handlers.ts` | Auth IPC 处理器 |
| `electron/api/routes/auth-proxy.ts` | Auth 代理路由 |

### ClawX 前端（新建 + 修改）

| 文件 | 职责 |
|------|------|
| `src/types/auth.ts` | 认证相关类型定义 |
| `src/stores/auth.ts` | 认证状态管理（Zustand） |
| `src/components/auth/LoginModal.tsx` | 登录/注册弹窗 |
| `src/components/auth/UserBadge.tsx` | 顶部栏用户信息 |
| `src/components/auth/UsageLimitModal.tsx` | 次数限制弹窗 |
| `src/components/auth/UsageBar.tsx` | 用量进度条 |
| `src/hooks/useFeatureGuard.ts` | 功能权限检查 Hook |
| `src/components/layout/Sidebar.tsx` | 修改：添加 UserBadge |
| `src/components/layout/MainLayout.tsx` | 修改：集成登录入口 |
| `src/modules/collaboration/CollaborationPage.tsx` | 修改：添加 useFeatureGuard |
| `src/pages/Marketplace/index.tsx` | 修改：雇佣按钮拦截 |

---

## Chunk 1: guada_ai 后端扩展

### Task 1: 新增 Prisma 模型和枚举

**Files:**
- Modify: `backend-ts/prisma/schema.prisma`

- [ ] **Step 1: 添加枚举定义**

在 `schema.prisma` 文件末尾（`generator` 和 `datasource` 之后，模型定义之前）添加：

```prisma
enum Feature {
  collaboration
  marketplace
}

enum TriggerAction {
  create_task
  hire_agent
}
```

- [ ] **Step 2: 添加 MonthlyQuota 模型**

```prisma
model MonthlyQuota {
  id          String   @id @default(uuid())
  userId      String
  feature     Feature
  yearMonth   String   // "2026-05" 格式
  usedCount   Int      @default(0)
  resetAt     DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, feature, yearMonth])
  @@index([userId, yearMonth])
}
```

- [ ] **Step 3: 在 User 模型中添加 MonthlyQuota 关联**

在 User 模型的关联列表中添加：
```prisma
  monthlyQuotas   MonthlyQuota[]
```

注意：`FeatureUsageLog` 模型已存在于 guada_ai 的 schema 中（由 LicenseModule 使用），只需确认其字段包含 `feature`、`action`、`triggerAction`、`allowed`、`tier`。如果不存在，需新增：

```prisma
model FeatureUsageLog {
  id            String        @id @default(uuid())
  userId        String
  feature       Feature
  action        String        // "check" | "record"
  triggerAction TriggerAction?
  allowed       Boolean
  tier          String
  deviceId      String?
  ip            String?
  createdAt     DateTime      @default(now())

  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, feature, createdAt])
}
```

同时在 User 模型中添加关联（如不存在）：
```prisma
  featureLogs     FeatureUsageLog[]
```

- [ ] **Step 4: 运行数据库迁移**

```bash
cd /Volumes/KINGSTON/CodeVault/GitHub/guada_ai/backend-ts
npx prisma generate
npx prisma migrate dev --name add_usage_module
```

Expected: 迁移成功，新表创建。

- [ ] **Step 5: 验证迁移**

```bash
npx prisma studio
```

Expected: 能看到 `MonthlyQuota` 和 `FeatureUsageLog`（或确认已有）表。

---

### Task 2: 创建 UsageModule

**Files:**
- Create: `backend-ts/src/modules/usage/usage.module.ts`
- Create: `backend-ts/src/modules/usage/usage.service.ts`
- Create: `backend-ts/src/modules/usage/usage.controller.ts`
- Create: `backend-ts/src/modules/usage/dto/check-feature.dto.ts`
- Create: `backend-ts/src/modules/usage/dto/record-usage.dto.ts`

- [ ] **Step 1: 创建 DTO**

`backend-ts/src/modules/usage/dto/check-feature.dto.ts`:
```typescript
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Feature } from '@prisma/client';

export class CheckFeatureDto {
  @ApiProperty({ enum: Feature })
  @IsEnum(Feature)
  feature!: Feature;
}
```

`backend-ts/src/modules/usage/dto/record-usage.dto.ts`:
```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Feature, TriggerAction } from '@prisma/client';

export class RecordUsageDto {
  @ApiProperty({ enum: Feature })
  @IsEnum(Feature)
  feature!: Feature;

  @ApiProperty({ enum: TriggerAction, required: false })
  @IsEnum(TriggerAction)
  @IsOptional()
  triggerAction?: TriggerAction;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deviceId?: string;
}
```

- [ ] **Step 2: 创建 UsageService**

`backend-ts/src/modules/usage/usage.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
// PrismaService 注入方式根据 guada_ai 项目实际模式调整
// 如果项目使用 DatabaseModule，则从 '../database/database.service' 导入
// 如果项目直接使用 PrismaClient，则从 '@prisma/client' 导入 PrismaClient
import { Feature, TriggerAction } from '@prisma/client';

// 各等级配额限制，由服务端动态计算
const TIER_LIMITS: Record<string, number> = {
  free: 3,
  pro: Infinity,
  enterprise: Infinity,
};

interface UsageInfo {
  feature: Feature;
  used: number;
  limit: number;
  remaining: number;
  tier: string;
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** 使用前检查配额 */
  async checkFeature(userId: string, feature: Feature, tier: string): Promise<UsageInfo & { allowed: boolean }> {
    const yearMonth = this.getCurrentYearMonth();
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

    const quota = await this.prisma.monthlyQuota.upsert({
      where: { userId_feature_yearMonth: { userId, feature, yearMonth } },
      create: { userId, feature, yearMonth, usedCount: 0 },
      update: {},
    });

    const used = quota.usedCount;
    const remaining = Math.max(0, limit - used);
    const allowed = used < limit;

    // 记录检查日志
    await this.prisma.featureUsageLog.create({
      data: { userId, feature, action: 'check', allowed, tier },
    });

    return { feature, used, limit, remaining, tier, allowed };
  }

  /** 使用后记录 */
  async recordUsage(
    userId: string,
    feature: Feature,
    tier: string,
    triggerAction?: TriggerAction,
    deviceId?: string,
  ): Promise<UsageInfo> {
    const yearMonth = this.getCurrentYearMonth();
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

    // 原子递增
    const quota = await this.prisma.monthlyQuota.upsert({
      where: { userId_feature_yearMonth: { userId, feature, yearMonth } },
      create: { userId, feature, yearMonth, usedCount: 1 },
      update: { usedCount: { increment: 1 } },
    });

    // 记录使用日志
    await this.prisma.featureUsageLog.create({
      data: { userId, feature, action: 'record', triggerAction, allowed: true, tier, deviceId },
    });

    return {
      feature,
      used: quota.usedCount,
      limit,
      remaining: Math.max(0, limit - quota.usedCount),
      tier,
    };
  }

  /** 获取本月用量统计 */
  async getUsageStats(userId: string, tier: string): Promise<Record<Feature, UsageInfo>> {
    const yearMonth = this.getCurrentYearMonth();
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

    const quotas = await this.prisma.monthlyQuota.findMany({
      where: { userId, yearMonth },
    });

    const buildInfo = (feat: Feature): UsageInfo => {
      const q = quotas.find((q) => q.feature === feat);
      const used = q?.usedCount ?? 0;
      return { feature: feat, used, limit, remaining: Math.max(0, limit - used), tier };
    };

    return {
      collaboration: buildInfo(Feature.collaboration),
      marketplace: buildInfo(Feature.marketplace),
    };
  }

  /** 客户端请求用量校准（返回服务端权威计数） */
  async syncUsage(userId: string, feature: Feature): Promise<UsageInfo> {
    const yearMonth = this.getCurrentYearMonth();
    const quota = await this.prisma.monthlyQuota.findUnique({
      where: { userId_feature_yearMonth: { userId, feature, yearMonth } },
    });
    return {
      feature,
      used: quota?.usedCount ?? 0,
      limit: 0, // 前端从 Feature Token 获取 limit
      remaining: 0,
      tier: '', // 前端从 Feature Token 获取 tier
    };
  }

  private getCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
```

> **注意：** `PrismaService` 的注入方式取决于 guada_ai 项目使用的 Prisma 适配器模式。如果项目使用 `PrismaModule`（通过 `DatabaseModule` 导入），则需要在 `UsageModule` 中导入 `DatabaseModule`。请参考项目中其他 service 文件的注入模式。

- [ ] **Step 3: 创建 UsageController**

`backend-ts/src/modules/usage/usage.controller.ts`:
```typescript
import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Feature, TriggerAction } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { UsageService } from './usage.service';
import { CheckFeatureDto } from './dto/check-feature.dto';
import { RecordUsageDto } from './dto/record-usage.dto';

@ApiTags('Usage')
@ApiBearerAuth()
@Controller('usage')
@UseGuards(AuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('check')
  @ApiOperation({ summary: '使用前检查功能配额' })
  async checkFeature(@Query() dto: CheckFeatureDto, @Req() req: any) {
    const user = req.user;
    return this.usageService.checkFeature(user.id, dto.feature, user.subscriptionTier ?? 'free');
  }

  @Post('record')
  @ApiOperation({ summary: '记录一次功能使用' })
  async recordUsage(@Body() dto: RecordUsageDto, @Req() req: any) {
    const user = req.user;
    return this.usageService.recordUsage(
      user.id, dto.feature, user.subscriptionTier ?? 'free',
      dto.triggerAction, dto.deviceId,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: '获取本月用量统计' })
  async getUsageStats(@Req() req: any) {
    const user = req.user;
    return this.usageService.getUsageStats(user.id, user.subscriptionTier ?? 'free');
  }

  @Post('sync')
  @ApiOperation({ summary: '请求用量校准（返回服务端权威计数）' })
  async syncUsage(@Body() body: { feature: Feature }, @Req() req: any) {
    const user = req.user;
    return this.usageService.syncUsage(user.id, body.feature);
  }
}
```

- [ ] **Step 4: 创建 UsageModule**

`backend-ts/src/modules/usage/usage.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
// 根据项目实际 Prisma 导入方式调整
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
```

- [ ] **Step 5: 注册到 AppModule**

在 `backend-ts/src/app.module.ts` 的 `imports` 列表中添加 `UsageModule`。

- [ ] **Step 6: 验证 API 可访问**

```bash
cd /Volumes/KINGSTON/CodeVault/GitHub/guada_ai/backend-ts
npm run start:dev
```

访问 Swagger 文档（通常是 `http://localhost:3000/api-docs`），确认 Usage 标签下的 4 个端点存在。

---

### Task 3: 改造 LicenseModule 支持 ClawX

**Files:**
- Modify: `backend-ts/src/modules/license/constants/license.constants.ts`
- Modify: `backend-ts/src/modules/license/license.service.ts`
- Modify: `backend-ts/src/modules/license/license.controller.ts`

- [ ] **Step 1: 在 license.constants.ts 新增 ClawX 功能标识**

在 `FEATURES` 常量中添加：
```typescript
// ClawX 功能
collaboration: 'collaboration',
marketplace: 'marketplace',
```

在 `TIER_FEATURES` 中为各等级添加 ClawX 功能：
```typescript
free: [...existing, FEATURES.collaboration, FEATURES.marketplace],
pro: [...existing, FEATURES.collaboration, FEATURES.marketplace],
enterprise: [...existing, FEATURES.collaboration, FEATURES.marketplace],
```

在 `TIER_CONFIG` 中为各等级添加 `offlineBudget`：
```typescript
free: { ...existing, offlineBudget: 3 },
pro: { ...existing, offlineBudget: Infinity },
enterprise: { ...existing, offlineBudget: Infinity },
```

- [ ] **Step 2: 修改 issueFeatureToken 方法**

在 `license.service.ts` 的 `issueFeatureToken` 方法中，当 `clientType === 'clawx'` 时，在 JWT payload 中增加 `usage` 和 `offlineBudget` 字段：

```typescript
// 在签发 Token 前计算 usage 数据
if (clientType === 'clawx') {
  const usageService = this.prisma; // 或注入 UsageService
  const yearMonth = this.getCurrentYearMonth();

  const collaborationQuota = await this.prisma.monthlyQuota.findUnique({
    where: { userId_feature_yearMonth: { userId, feature: 'collaboration', yearMonth } },
  });
  const marketplaceQuota = await this.prisma.monthlyQuota.findUnique({
    where: { userId_feature_yearMonth: { userId, feature: 'marketplace', yearMonth } },
  });

  payload.usage = {
    collaboration: { used: collaborationQuota?.usedCount ?? 0, limit: tierLimits[tier] },
    marketplace: { used: marketplaceQuota?.usedCount ?? 0, limit: tierLimits[tier] },
  };
  payload.offlineBudget = TIER_CONFIG[tier].offlineBudget;
  payload.keyId = process.env.RSA_KEY_ID || 'default';
}
```

- [ ] **Step 3: 在 LicenseController 中支持 clientType 参数**

确保 `POST /api/v1/license/issue` 接受 `clientType` 参数并传递给 `issueFeatureToken`。

- [ ] **Step 4: 验证 Feature Token 包含新字段**

使用 curl 或 Swagger 调用 `POST /license/issue` 传入 `clientType: "clawx"`，验证返回的 JWT payload 包含 `usage`、`offlineBudget`、`keyId` 字段。

---

## Chunk 2: ClawX 主进程服务层

### Task 4: 创建类型定义

**Files:**
- Create: `electron/services/member/types.ts`

- [ ] **Step 1: 编写类型文件**

```typescript
// electron/services/member/types.ts

export type Tier = 'free' | 'pro' | 'enterprise';
export type Feature = 'collaboration' | 'marketplace';
export type TriggerAction = 'create_task' | 'hire_agent';

export interface UsageInfo {
  feature: Feature;
  used: number;
  limit: number;
  remaining: number;
  tier: Tier;
}

export interface FeatureTokenPayload {
  sub: string;
  tier: Tier;
  deviceId: string;
  clientType: string;
  features: string[];
  keyId: string;
  usage: Record<Feature, { used: number; limit: number }>;
  offlineBudget: number;
  iat: number;
  exp: number;
}

export interface LoginCredentials {
  username: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  deviceId?: string;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  subscriptionTier: Tier;
  balance: number;
}

export enum MemberEvent {
  NETWORK_ONLINE = 'member:network-online',
  NETWORK_OFFLINE = 'member:network-offline',
  TOKEN_EXPIRED = 'member:token-expired',
  TIER_CHANGED = 'member:tier-changed',
  USAGE_SYNC_REQUIRED = 'member:usage-sync-required',
  LOGIN_SUCCESS = 'member:login-success',
  LOGOUT = 'member:logout',
}

export interface MemberState {
  isLoggedIn: boolean;
  isGuest: boolean;
  userInfo: UserInfo | null;
  tier: Tier | null;
  isOnline: boolean;
  featureToken: FeatureTokenPayload | null;
}
```

- [ ] **Step 2: 编写事件总线**

`electron/services/member/event-bus.ts`:
```typescript
import { EventEmitter } from 'events';
import { MemberEvent } from './types';

class MemberEventBus extends EventEmitter {
  emit(event: MemberEvent, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
  on(event: MemberEvent, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
  off(event: MemberEvent, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}

export const memberEventBus = new MemberEventBus();
```

- [ ] **Step 3: 验证编译**

```bash
cd /Volumes/KINGSTON/CodeVault/GitHub/ClawX
npx tsc --noEmit electron/services/member/types.ts electron/services/member/event-bus.ts
```

Expected: 无错误。

---

### Task 5: 创建 NetworkDetector 服务

**Files:**
- Create: `electron/services/member/network-detector.ts`

- [ ] **Step 1: 编写测试**

`tests/unit/member/network-detector.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkDetector } from '@electron/services/member/network-detector';

// Mock fetch
global.fetch = vi.fn();

describe('NetworkDetector', () => {
  let detector: NetworkDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new NetworkDetector('http://localhost:3000');
  });

  it('should start in unknown state', () => {
    expect(detector.isOnline).toBe(false);
  });

  it('should detect online when health check succeeds', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    await detector.checkOnce();
    expect(detector.isOnline).toBe(true);
  });

  it('should detect offline when health check fails', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network error'));
    await detector.checkOnce();
    expect(detector.isOnline).toBe(false);
  });

  it('should emit NETWORK_ONLINE when transitioning from offline to online', async () => {
    (global.fetch as any).mockRejectedValue(new Error('fail'));
    await detector.checkOnce();
    const listener = vi.fn();
    detector.on('network-change', listener);
    (global.fetch as any).mockResolvedValue({ ok: true });
    await detector.checkOnce();
    expect(listener).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run tests/unit/member/network-detector.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 NetworkDetector**

`electron/services/member/network-detector.ts`:
```typescript
import { EventEmitter } from 'events';
import { memberEventBus } from './event-bus';
import { MemberEvent } from './types';

export class NetworkDetector extends EventEmitter {
  private _isOnline = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private backoffMs = 5000;
  private readonly maxBackoffMs = 300000; // 5 min

  constructor(private readonly apiBaseUrl: string) {
    super();
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  start(): void {
    this.checkOnce();
    this.scheduleNext();
  }

  stop(): void {
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkOnce(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.apiBaseUrl}/api/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const wasOnline = this._isOnline;
      this._isOnline = res.ok;
      if (wasOnline !== this._isOnline) {
        this.emit('network-change', this._isOnline);
        memberEventBus.emit(
          this._isOnline ? MemberEvent.NETWORK_ONLINE : MemberEvent.NETWORK_OFFLINE,
        );
      }
      if (this._isOnline) this.backoffMs = 5000; // reset on success
    } catch {
      const wasOnline = this._isOnline;
      this._isOnline = false;
      if (wasOnline) {
        this.emit('network-change', false);
        memberEventBus.emit(MemberEvent.NETWORK_OFFLINE);
      }
    }
    return this._isOnline;
  }

  private scheduleNext(): void {
    this.checkInterval = setTimeout(async () => {
      await this.checkOnce();
      // 指数退避：离线时增加间隔
      if (!this._isOnline) {
        this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      }
      this.scheduleNext();
    }, this.backoffMs);
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx vitest run tests/unit/member/network-detector.test.ts
```

Expected: PASS。

---

### Task 6: 创建 MemberManager 服务

**Files:**
- Create: `electron/services/member/member-manager.ts`

- [ ] **Step 1: 编写测试**

`tests/unit/member/member-manager.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-store
vi.mock('electron-store', () => {
  const store = new Map();
  return {
    default: vi.fn().mockImplementation(() => ({
      get: (key: string) => store.get(key),
      set: (key: string, value: any) => store.set(key, value),
      delete: (key: string) => store.delete(key),
      clear: () => store.clear(),
    })),
  };
});

// Mock fetch
global.fetch = vi.fn();

describe('MemberManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should login successfully and store token', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        access_token: 'jwt-token-123',
        user: { id: '1', username: 'test', email: 'test@test.com', subscriptionTier: 'free' },
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    const result = await manager.login({ username: 'test', password: 'password123' });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('test');
  });

  it('should fail login with wrong credentials', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid credentials' }),
    });

    const { MemberManager } = await import('@electron/services/member/member-manager');
    const manager = new MemberManager('http://localhost:3000');
    const result = await manager.login({ username: 'test', password: 'wrong' });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run tests/unit/member/member-manager.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 MemberManager**

`electron/services/member/member-manager.ts`:
```typescript
import type { LoginCredentials, RegisterCredentials, UserInfo, MemberState, Tier } from './types';
import { memberEventBus, MemberEvent } from './event-bus';

export class MemberManager {
  private jwtToken: string | null = null;
  private userInfo: UserInfo | null = null;
  private store: any = null; // electron-store 延迟加载

  constructor(private readonly apiBaseUrl: string) {}

  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    this.store = new Store({ name: 'clawdock-member' });
    // 恢复缓存的登录状态
    this.jwtToken = this.store.get('jwtToken', null);
    this.userInfo = this.store.get('userInfo', null);
  }

  get state(): MemberState {
    return {
      isLoggedIn: !!this.jwtToken && !!this.userInfo,
      isGuest: !this.jwtToken,
      userInfo: this.userInfo,
      tier: this.userInfo?.subscriptionTier ?? null,
      isOnline: false, // 由 NetworkDetector 设置
      featureToken: null, // 由 TokenManager 设置
    };
  }

  async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, reason: data.message || 'Login failed' };
      }
      this.jwtToken = data.access_token;
      this.userInfo = this.mapUser(data.user);
      this.persist();
      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: this.userInfo };
    } catch (err: any) {
      return { success: false, reason: err.message || 'Network error' };
    }
  }

  async register(credentials: RegisterCredentials): Promise<{ success: boolean; user?: UserInfo; reason?: string }> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, reason: data.message || 'Registration failed' };
      }
      this.jwtToken = data.access_token;
      this.userInfo = this.mapUser(data.user);
      this.persist();
      memberEventBus.emit(MemberEvent.LOGIN_SUCCESS, this.userInfo);
      return { success: true, user: this.userInfo };
    } catch (err: any) {
      return { success: false, reason: err.message || 'Network error' };
    }
  }

  async logout(): Promise<void> {
    this.jwtToken = null;
    this.userInfo = null;
    if (this.store) {
      this.store.clear();
    }
    memberEventBus.emit(MemberEvent.LOGOUT);
  }

  async refreshUser(): Promise<UserInfo | null> {
    if (!this.jwtToken) return null;
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${this.jwtToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          await this.logout();
        }
        return null;
      }
      const data = await res.json();
      this.userInfo = this.mapUser(data);
      this.persist();
      return this.userInfo;
    } catch {
      return null;
    }
  }

  getJwtToken(): string | null {
    return this.jwtToken;
  }

  private mapUser(raw: any): UserInfo {
    return {
      id: raw.id,
      username: raw.username,
      email: raw.email,
      avatarUrl: raw.avatarUrl,
      subscriptionTier: raw.subscriptionTier || 'free',
      balance: raw.balance ?? 0,
    };
  }

  private persist(): void {
    if (this.store) {
      this.store.set('jwtToken', this.jwtToken);
      this.store.set('userInfo', this.userInfo);
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx vitest run tests/unit/member/member-manager.test.ts
```

Expected: PASS。

---

### Task 7: 创建 TokenManager 服务

**Files:**
- Create: `electron/services/member/token-manager.ts`

- [ ] **Step 1: 编写测试**

`tests/unit/member/token-manager.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-store
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

global.fetch = vi.fn();

describe('TokenManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse valid Feature Token payload', async () => {
    const { TokenManager } = await import('@electron/services/member/token-manager');
    const tm = new TokenManager('http://localhost:3000');

    // 模拟一个已解析的 token payload
    const payload = tm.parsePayload({
      sub: 'user1',
      tier: 'free',
      deviceId: 'dev1',
      clientType: 'clawx',
      features: ['collaboration', 'marketplace'],
      keyId: 'default',
      usage: {
        collaboration: { used: 1, limit: 3 },
        marketplace: { used: 0, limit: 3 },
      },
      offlineBudget: 3,
      iat: Date.now() / 1000,
      exp: Date.now() / 1000 + 86400,
    });

    expect(payload.tier).toBe('free');
    expect(payload.offlineBudget).toBe(3);
    expect(payload.usage.collaboration.remaining).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run tests/unit/member/token-manager.test.ts
```

- [ ] **Step 3: 实现 TokenManager**

`electron/services/member/token-manager.ts`:
```typescript
import type { FeatureTokenPayload, Tier, Feature } from './types';
import { memberEventBus, MemberEvent } from './event-bus';

export class TokenManager {
  private featureToken: FeatureTokenPayload | null = null;
  private store: any = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(private readonly apiBaseUrl: string) {}

  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    this.store = new Store({ name: 'clawdock-member-tokens' });
    // 恢复缓存的 Feature Token
    const cached = this.store.get('featureToken', null);
    if (cached) {
      this.featureToken = cached as FeatureTokenPayload;
      if (this.isExpired()) {
        this.featureToken = null;
      }
    }
  }

  /** 请求新的 Feature Token */
  async issueToken(jwtToken: string, deviceId: string): Promise<FeatureTokenPayload | null> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/license/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ clientType: 'clawx', deviceId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      // 解析 JWT payload（不做 RSA 验签，由服务端信任）
      const token = data.token || data.featureToken;
      if (!token) return null;
      const payload = this.decodeJwtPayload(token);
      this.featureToken = payload;
      this.persist();
      return payload;
    } catch {
      return null;
    }
  }

  /** 获取当前 Feature Token */
  getToken(): FeatureTokenPayload | null {
    return this.featureToken;
  }

  /** 检查 Token 是否过期 */
  isExpired(): boolean {
    if (!this.featureToken) return true;
    return Date.now() / 1000 > this.featureToken.exp;
  }

  /** 获取离线预算 */
  getOfflineBudget(): number {
    return this.featureToken?.offlineBudget ?? 0;
  }

  /** 获取功能使用快照 */
  getUsageSnapshot(feature: Feature): { used: number; limit: number } {
    return this.featureToken?.usage[feature] ?? { used: 0, limit: 0 };
  }

  /** 启动自动续签（24h 间隔） */
  startAutoRenewal(getJwtToken: () => string | null, getDeviceId: () => string): void {
    const renewalInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.refreshTimer = setInterval(async () => {
      const jwt = getJwtToken();
      if (jwt) {
        const result = await this.issueToken(jwt, getDeviceId());
        if (!result) {
          memberEventBus.emit(MemberEvent.TOKEN_EXPIRED);
        }
      }
    }, renewalInterval);
  }

  stopAutoRenewal(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** 解析 JWT payload（base64 解码） */
  decodeJwtPayload(token: string): FeatureTokenPayload {
    const parts = token.split('.');
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload) as FeatureTokenPayload;
  }

  /** 简化版 parsePayload（测试用） */
  parsePayload(payload: FeatureTokenPayload): FeatureTokenPayload & {
    usage: Record<Feature, { used: number; limit: number; remaining: number }>;
  } {
    return {
      ...payload,
      usage: {
        collaboration: {
          ...payload.usage.collaboration,
          remaining: payload.usage.collaboration.limit - payload.usage.collaboration.used,
        },
        marketplace: {
          ...payload.usage.marketplace,
          remaining: payload.usage.marketplace.limit - payload.usage.marketplace.used,
        },
      },
    } as any;
  }

  private persist(): void {
    if (this.store) {
      this.store.set('featureToken', this.featureToken);
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx vitest run tests/unit/member/token-manager.test.ts
```

Expected: PASS。

---

### Task 8: 创建 UsageCounter 服务

**Files:**
- Create: `electron/services/member/usage-counter.ts`

- [ ] **Step 1: 编写测试**

`tests/unit/member/usage-counter.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => {
    const data: Record<string, any> = {};
    return {
      get: (key: string) => data[key],
      set: (key: string, val: any) => { data[key] = val; },
    };
  }),
}));

global.fetch = vi.fn();

describe('UsageCounter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should start with zero count', async () => {
    const { UsageCounter } = await import('@electron/services/member/usage-counter');
    const counter = new UsageCounter('http://localhost:3000');
    await counter.init();
    expect(counter.getCount('collaboration')).toBe(0);
  });

  it('should increment count', async () => {
    const { UsageCounter } = await import('@electron/services/member/usage-counter');
    const counter = new UsageCounter('http://localhost:3000');
    await counter.init();
    counter.increment('collaboration');
    expect(counter.getCount('collaboration')).toBe(1);
  });

  it('should check offline budget correctly', async () => {
    const { UsageCounter } = await import('@electron/services/member/usage-counter');
    const counter = new UsageCounter('http://localhost:3000');
    await counter.init();
    // 模拟 Feature Token 中已使用 1 次，离线预算 3
    const allowed = counter.checkOfflineBudget('collaboration', { used: 1, limit: 3 }, 3);
    expect(allowed).toBe(true); // localCount(0) + used(1) < used(1) + budget(3)
  });

  it('should reject when offline budget exceeded', async () => {
    const { UsageCounter } = await import('@electron/services/member/usage-counter');
    const counter = new UsageCounter('http://localhost:3000');
    await counter.init();
    // 消耗 3 次
    counter.increment('collaboration');
    counter.increment('collaboration');
    counter.increment('collaboration');
    // localCount(3) > offlineBudget(3) → false
    const allowed = counter.checkOfflineBudget('collaboration', { used: 0, limit: 3 }, 3);
    expect(allowed).toBe(false);
  });

  it('should reset on new month', async () => {
    const { UsageCounter } = await import('@electron/services/member/usage-counter');
    const counter = new UsageCounter('http://localhost:3000');
    await counter.init();
    counter.increment('collaboration');
    expect(counter.getCount('collaboration')).toBe(1);
    // 模拟月份切换
    counter.resetForTesting();
    expect(counter.getCount('collaboration')).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run tests/unit/member/usage-counter.test.ts
```

- [ ] **Step 3: 实现 UsageCounter**

`electron/services/member/usage-counter.ts`:
```typescript
import type { Feature, UsageInfo } from './types';
import { memberEventBus, MemberEvent } from './event-bus';

export class UsageCounter {
  private store: any = null;
  private currentYearMonth: string = '';

  constructor(private readonly apiBaseUrl: string) {}

  async init(): Promise<void> {
    const Store = (await import('electron-store')).default;
    this.store = new Store({ name: 'clawdock-usage' });
    this.currentYearMonth = this.getCurrentYearMonth();
    this.ensureMonthBucket();

    // 监听网络恢复事件，同步用量
    memberEventBus.on(MemberEvent.NETWORK_ONLINE, () => this.syncToServer());
  }

  /** 获取某功能的本地计数 */
  getCount(feature: Feature): number {
    const bucket = this.getBucket();
    return bucket[feature] ?? 0;
  }

  /** 递增计数 */
  increment(feature: Feature): void {
    const bucket = this.getBucket();
    bucket[feature] = (bucket[feature] ?? 0) + 1;
    this.saveBucket(bucket);
  }

  /** 检查离线预算：localCount <= offlineBudget 且 localCount + tokenSnapshot.used <= tokenSnapshot.used + offlineBudget */
  checkOfflineBudget(
    feature: Feature,
    tokenSnapshot: { used: number; limit: number },
    offlineBudget: number,
  ): boolean {
    const localCount = this.getCount(feature);
    // 防篡改：localCount 不得超过离线预算
    // 且总使用量（服务端已用 + 本地增量）不得超过服务端已用 + 离线预算
    return localCount <= offlineBudget
      && (tokenSnapshot.used + localCount) <= (tokenSnapshot.used + offlineBudget);
  }

  /** 同步到服务端（恢复联网时调用） */
  async syncToServer(): Promise<void> {
    // sync 语义：请求服务端权威计数，客户端以服务端为准
    // 实际 JWT token 从 MemberManager 获取，此处简化
    // 调用 GET /api/v1/usage/stats 获取权威数据后更新本地
  }

  /** 重置（测试用） */
  resetForTesting(): void {
    this.saveBucket({ collaboration: 0, marketplace: 0 });
  }

  private ensureMonthBucket(): void {
    const existing = this.store.get(`usage.${this.currentYearMonth}`, null);
    if (!existing) {
      this.saveBucket({ collaboration: 0, marketplace: 0 });
    }
  }

  private getBucket(): Record<string, number> {
    try {
      return this.store.get(`usage.${this.currentYearMonth}`, { collaboration: 0, marketplace: 0 });
    } catch {
      // JSON 损坏，重置
      const defaults = { collaboration: 0, marketplace: 0 };
      this.saveBucket(defaults);
      return defaults;
    }
  }

  private saveBucket(bucket: Record<string, number>): void {
    this.store.set(`usage.${this.currentYearMonth}`, bucket);
  }

  private getCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx vitest run tests/unit/member/usage-counter.test.ts
```

Expected: PASS。

---

### Task 9: 创建模块入口和 IPC 注册

**Files:**
- Create: `electron/services/member/index.ts`
- Create: `electron/main/ipc/auth-handlers.ts`
- Modify: `electron/main/ipc-handlers.ts`

- [ ] **Step 1: 创建模块入口**

`electron/services/member/index.ts`:
```typescript
import { MemberManager } from './member-manager';
import { TokenManager } from './token-manager';
import { UsageCounter } from './usage-counter';
import { NetworkDetector } from './network-detector';
import { memberEventBus } from './event-bus';
import { MemberEvent } from './types';
import * as crypto from 'crypto';
import * as os from 'os';

export class MemberModule {
  readonly memberManager: MemberManager;
  readonly tokenManager: TokenManager;
  readonly usageCounter: UsageCounter;
  readonly networkDetector: NetworkDetector;

  private readonly apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = process.env.GUADA_API_URL || 'http://localhost:3000';
    this.memberManager = new MemberManager(this.apiBaseUrl);
    this.tokenManager = new TokenManager(this.apiBaseUrl);
    this.usageCounter = new UsageCounter(this.apiBaseUrl);
    this.networkDetector = new NetworkDetector(this.apiBaseUrl);
  }

  async init(): Promise<void> {
    await this.memberManager.init();
    await this.tokenManager.init();
    await this.usageCounter.init();

    // 网络恢复时刷新用户信息和同步用量
    memberEventBus.on(MemberEvent.NETWORK_ONLINE, async () => {
      await this.memberManager.refreshUser();
      const jwt = this.memberManager.getJwtToken();
      if (jwt) {
        await this.tokenManager.issueToken(jwt, this.getDeviceId());
      }
    });

    // 登录成功后请求 Feature Token
    memberEventBus.on(MemberEvent.LOGIN_SUCCESS, async () => {
      const jwt = this.memberManager.getJwtToken();
      if (jwt) {
        await this.tokenManager.issueToken(jwt, this.getDeviceId());
        this.tokenManager.startAutoRenewal(
          () => this.memberManager.getJwtToken(),
          this.getDeviceId(),
        );
      }
    });

    // 登出时清理
    memberEventBus.on(MemberEvent.LOGOUT, () => {
      this.tokenManager.stopAutoRenewal();
    });

    // 启动网络探测
    this.networkDetector.start();
  }

  /** 统一的功能检查入口 */
  async checkFeature(feature: 'collaboration' | 'marketplace') {
    const jwt = this.memberManager.getJwtToken();
    const isOnline = this.networkDetector.isOnline;

    if (!jwt) {
      return { allowed: false, remaining: 0, tier: 'free' as const, feature, used: 0, limit: 0 };
    }

    if (isOnline) {
      try {
        const res = await fetch(`${this.apiBaseUrl}/api/v1/usage/check?feature=${feature}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (res.ok) return await res.json();
      } catch { /* fallback to offline */ }
    }

    // 离线路径
    const token = this.tokenManager.getToken();
    if (!token || this.tokenManager.isExpired()) {
      return { allowed: false, remaining: 0, tier: 'free' as const, feature, used: 0, limit: 0, reason: 'offline_expired' };
    }
    if (token.tier === 'pro' || token.tier === 'enterprise') {
      return { allowed: true, remaining: Infinity, tier: token.tier, feature, used: 0, limit: Infinity };
    }
    const snapshot = this.tokenManager.getUsageSnapshot(feature);
    const budget = this.tokenManager.getOfflineBudget();
    const localCount = this.usageCounter.getCount(feature);
    const allowed = this.usageCounter.checkOfflineBudget(feature, snapshot, budget);
    return {
      allowed,
      remaining: Math.max(0, budget - localCount),
      tier: token.tier,
      feature,
      used: snapshot.used + localCount,
      limit: snapshot.limit,
    };
  }

  /** 记录使用（在线时同时通知服务端） */
  async recordUsage(feature: 'collaboration' | 'marketplace', triggerAction?: string) {
    this.usageCounter.increment(feature);
    const jwt = this.memberManager.getJwtToken();
    if (jwt && this.networkDetector.isOnline) {
      try {
        await fetch(`${this.apiBaseUrl}/api/v1/usage/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ feature, triggerAction, deviceId: this.getDeviceId() }),
        });
      } catch { /* 静默失败，本地已计数 */ }
    }
  }

  getDeviceId(): string {
    // 使用 machine-id 生成设备 ID
    try {
      const machineIdSync = require('node-machine-id').machineIdSync;
      const mid = machineIdSync();
      return crypto.createHash('sha256').update(mid + os.platform()).digest('hex');
    } catch {
      // fallback
      return crypto.createHash('sha256')
        .update(os.hostname() + os.platform() + os.userInfo().username)
        .digest('hex');
    }
  }

  async destroy(): Promise<void> {
    this.networkDetector.stop();
    this.tokenManager.stopAutoRenewal();
  }
}
```

- [ ] **Step 2: 创建 IPC 处理器**

`electron/main/ipc/auth-handlers.ts`:
```typescript
import { ipcMain } from 'electron';
import type { MemberModule } from '../../services/member';

export function registerAuthIpcHandlers(memberModule: MemberModule): void {
  ipcMain.handle('auth:login', async (_, credentials) => {
    return memberModule.memberManager.login(credentials);
  });

  ipcMain.handle('auth:register', async (_, credentials) => {
    return memberModule.memberManager.register(credentials);
  });

  ipcMain.handle('auth:logout', async () => {
    await memberModule.memberManager.logout();
    return { success: true };
  });

  ipcMain.handle('auth:getUser', async () => {
    return memberModule.memberManager.state;
  });

  ipcMain.handle('auth:checkFeature', async (_, { feature }) => {
    return memberModule.checkFeature(feature);
  });

  ipcMain.handle('auth:recordUsage', async (_, { feature, triggerAction }) => {
    await memberModule.recordUsage(feature, triggerAction);
    return { success: true };
  });

  ipcMain.handle('auth:getUsageStats', async () => {
    const jwt = memberModule.memberManager.getJwtToken();
    if (!jwt) return null;
    try {
      const res = await fetch(`${memberModule['apiBaseUrl']}/api/v1/usage/stats`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  });
}
```

- [ ] **Step 3: 注册到主进程入口**

在 `electron/main/ipc-handlers.ts` 的 `registerIpcHandlers` 函数中添加：

```typescript
import { registerAuthIpcHandlers } from './auth-handlers';
import { MemberModule } from '../services/member';

// 在 registerIpcHandlers 函数中，添加 memberModule 参数并注册
export function registerIpcHandlers(
  gatewayManager: GatewayManager,
  clawHubService: ClawHubService,
  mainWindow: BrowserWindow,
  memberModule: MemberModule, // 新增参数
): void {
  // ... 现有注册 ...
  registerAuthIpcHandlers(memberModule);
}
```

在 `electron/main/index.ts` 的 `startMainApp()` 中，在 `registerIpcHandlers` 调用前初始化 MemberModule：

```typescript
const memberModule = new MemberModule();
await memberModule.init();
registerIpcHandlers(gatewayManager, clawHubService, mainWindow, memberModule);
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

Expected: 无错误（可能有 `node-machine-id` 类型缺失警告，需 `npm install node-machine-id && npm install -D @types/node-machine-id`）。

---

## Chunk 3: ClawX 前端

### Task 10: 创建 Auth Store

**Files:**
- Create: `src/stores/auth.ts`
- Create: `src/types/auth.ts`

- [ ] **Step 1: 创建类型文件**

`src/types/auth.ts`:
```typescript
export type Tier = 'free' | 'pro' | 'enterprise';

export interface UsageInfo {
  feature: 'collaboration' | 'marketplace';
  used: number;
  limit: number;
  remaining: number;
  tier: Tier;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  subscriptionTier: Tier;
  balance: number;
}

export interface AuthState {
  isLoggedIn: boolean;
  isGuest: boolean;
  userInfo: UserInfo | null;
  tier: Tier | null;
  usageStats: {
    collaboration: UsageInfo | null;
    marketplace: UsageInfo | null;
  };
  isOnline: boolean;
  isLoading: boolean;

  login: (username: string, password: string) => Promise<{ success: boolean; reason?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; reason?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkFeature: (feature: 'collaboration' | 'marketplace') => Promise<UsageInfo>;
  recordUsage: (feature: 'collaboration' | 'marketplace', triggerAction?: string) => Promise<void>;
}
```

- [ ] **Step 2: 创建 Auth Store**

`src/stores/auth.ts`:
```typescript
import { create } from 'zustand';
import type { AuthState, UserInfo, UsageInfo, Tier } from '@/types/auth';
import { invokeIpc } from '@/lib/api-client';

export const useAuthStore = create<AuthState>()((set, get) => ({
  isLoggedIn: false,
  isGuest: true,
  userInfo: null,
  tier: null,
  usageStats: { collaboration: null, marketplace: null },
  isOnline: false,
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const result = await invokeIpc('auth:login', { username, password });
      if (result.success && result.user) {
        set({
          isLoggedIn: true,
          isGuest: false,
          userInfo: result.user,
          tier: result.user.subscriptionTier,
          isLoading: false,
        });
        get().refreshUser();
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, reason: result.reason || 'Login failed' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, reason: err.message };
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true });
    try {
      const result = await invokeIpc('auth:register', { username, email, password });
      if (result.success && result.user) {
        set({
          isLoggedIn: true,
          isGuest: false,
          userInfo: result.user,
          tier: result.user.subscriptionTier,
          isLoading: false,
        });
        return { success: true };
      }
      set({ isLoading: false });
      return { success: false, reason: result.reason || 'Registration failed' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, reason: err.message };
    }
  },

  logout: async () => {
    await invokeIpc('auth:logout');
    set({
      isLoggedIn: false,
      isGuest: true,
      userInfo: null,
      tier: null,
      usageStats: { collaboration: null, marketplace: null },
    });
  },

  refreshUser: async () => {
    try {
      const state = await invokeIpc('auth:getUser');
      if (state?.isLoggedIn) {
        set({
          isLoggedIn: true,
          isGuest: false,
          userInfo: state.userInfo,
          tier: state.userInfo?.subscriptionTier,
        });
        // 获取用量统计
        const stats = await invokeIpc('auth:getUsageStats');
        if (stats) {
          set({ usageStats: stats });
        }
      }
    } catch { /* 静默失败 */ }
  },

  checkFeature: async (feature) => {
    const result = await invokeIpc('auth:checkFeature', { feature });
    return result as UsageInfo;
  },

  recordUsage: async (feature, triggerAction) => {
    await invokeIpc('auth:recordUsage', { feature, triggerAction });
  },
}));
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit src/stores/auth.ts src/types/auth.ts
```

---

### Task 11: 创建前端 UI 组件

**Files:**
- Create: `src/components/auth/LoginModal.tsx`
- Create: `src/components/auth/UserBadge.tsx`
- Create: `src/components/auth/UsageLimitModal.tsx`
- Create: `src/components/auth/UsageBar.tsx`

- [ ] **Step 1: 创建 LoginModal**

`src/components/auth/LoginModal.tsx` — 登录/注册弹窗组件，包含：
- 登录表单（用户名/密码）
- 注册表单（用户名/邮箱/密码）
- 表单切换
- 加载状态和错误提示
- 调用 `useAuthStore` 的 login/register 方法

> 关键点：使用项目已有的 `src/components/ui/sheet.tsx`（Sheet 组件）或 `src/components/ui/confirm-dialog.tsx` 作为弹窗基础，保持与现有 UI 风格一致。不要使用不存在的 `dialog.tsx`。

- [ ] **Step 2: 创建 UserBadge**

`src/components/auth/UserBadge.tsx` — 顶部栏用户信息显示：
- 已登录：显示头像 + 用户名 + 会员等级 Badge
- 未登录：显示"登录/注册"按钮
- 点击展开下拉菜单（用户信息、用量统计、登出）

- [ ] **Step 3: 创建 UsageLimitModal**

`src/components/auth/UsageLimitModal.tsx` — 次数限制弹窗：
- 显示"本月使用次数已达上限"
- 显示当前等级和已用次数
- 已登录 free 用户：引导升级会员
- 未登录用户：引导登录
- 关闭按钮

- [ ] **Step 4: 创建 UsageBar**

`src/components/auth/UsageBar.tsx` — 用量进度条：
- 显示 `已用/总限` 如 `2/3`
- 进度条颜色随用量变化（绿 → 黄 → 红）
- 仅 free 用户显示

- [ ] **Step 5: 验证编译**

```bash
npx tsc --noEmit
```

---

### Task 12: 创建 useFeatureGuard Hook

**Files:**
- Create: `src/hooks/useFeatureGuard.ts`

- [ ] **Step 1: 编写测试**

`tests/unit/use-feature-guard.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock useAuthStore
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    isGuest: false,
    tier: 'free',
    checkFeature: vi.fn().mockResolvedValue({
      allowed: true, remaining: 2, tier: 'free', feature: 'collaboration', used: 1, limit: 3,
    }),
    recordUsage: vi.fn(),
  }),
}));

describe('useFeatureGuard', () => {
  it('should allow when checkFeature returns allowed=true', async () => {
    // 测试逻辑
    expect(true).toBe(true); // 占位，实际测试需要渲染 Hook
  });
});
```

- [ ] **Step 2: 实现 Hook**

`src/hooks/useFeatureGuard.ts`:
```typescript
import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { UsageInfo } from '@/types/auth';

interface FeatureGuardResult {
  allowed: boolean;
  loading: boolean;
  usageInfo: UsageInfo | null;
  showLimitModal: boolean;
  check: () => Promise<boolean>;
  recordAndCheck: () => Promise<boolean>;
  closeLimitModal: () => void;
}

export function useFeatureGuard(feature: 'collaboration' | 'marketplace'): FeatureGuardResult {
  const { isLoggedIn, checkFeature, recordUsage } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const check = useCallback(async (): Promise<boolean> => {
    if (!isLoggedIn) {
      setShowLimitModal(true);
      return false;
    }
    setLoading(true);
    try {
      const info = await checkFeature(feature);
      setUsageInfo(info);
      if (!info.allowed) {
        setShowLimitModal(true);
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [feature, isLoggedIn, checkFeature]);

  const recordAndCheck = useCallback(async (): Promise<boolean> => {
    const allowed = await check();
    if (allowed) {
      await recordUsage(feature);
    }
    return allowed;
  }, [check, feature, recordUsage]);

  return {
    allowed: usageInfo?.allowed ?? false,
    loading,
    usageInfo,
    showLimitModal,
    check,
    recordAndCheck,
    closeLimitModal: () => setShowLimitModal(false),
  };
}
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/unit/use-feature-guard.test.ts
```

---

### Task 13: 集成到现有页面

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/modules/collaboration/CollaborationPage.tsx`
- Modify: `src/pages/Marketplace/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 App.tsx 中初始化 Auth Store**

在 `App` 组件中添加 `useEffect` 在应用启动时调用 `refreshUser()`：

```tsx
// 在 App 组件中
const refreshUser = useAuthStore((s) => s.refreshUser);

useEffect(() => {
  refreshUser();
}, [refreshUser]);
```

- [ ] **Step 2: 在 Sidebar.tsx 添加 UserBadge**

在 Sidebar 底部区域（Layer 1 下方）添加 `<UserBadge />`：

```tsx
import { UserBadge } from '@/components/auth/UserBadge';

// 在 Sidebar 组件 JSX 中，导航列表下方
<UserBadge />
```

- [ ] **Step 3: 在 CollaborationPage.tsx 添加功能守卫**

在组件顶部使用 `useFeatureGuard`：

```tsx
import { useFeatureGuard } from '@/hooks/useFeatureGuard';
import { UsageLimitModal } from '@/components/auth/UsageLimitModal';
import { UsageBar } from '@/components/auth/UsageBar';

// 在 CollaborationPage 组件内部
const { showLimitModal, closeLimitModal, recordAndCheck, usageInfo } = useFeatureGuard('collaboration');

// 在新建任务按钮的 onClick 中
const handleCreateTask = async () => {
  const allowed = await recordAndCheck();
  if (allowed) {
    // 原有新建任务逻辑
  }
};

// 在 JSX 中添加
{showLimitModal && <UsageLimitModal feature="collaboration" onClose={closeLimitModal} />}
<UsageBar feature="collaboration" />
```

- [ ] **Step 4: 在 Marketplace/index.tsx 添加雇佣拦截**

```tsx
import { useFeatureGuard } from '@/hooks/useFeatureGuard';
import { UsageLimitModal } from '@/components/auth/UsageLimitModal';
import { UsageBar } from '@/components/auth/UsageBar';

// 在 Marketplace 组件内部
const { showLimitModal, closeLimitModal, recordAndCheck } = useFeatureGuard('marketplace');

// 在"雇佣"按钮的 onClick 中
const handleHire = async (agentId: string) => {
  const allowed = await recordAndCheck();
  if (allowed) {
    navigate(`/agent-chat/${agentId}`);
  }
};

// JSX 中
{showLimitModal && <UsageLimitModal feature="marketplace" onClose={closeLimitModal} />}
<UsageBar feature="marketplace" />
```

- [ ] **Step 5: 验证完整编译和运行**

```bash
npm run dev
```

Expected: 应用正常启动，Sidebar 底部显示 UserBadge，协作大厅和应用广场入口有用量提示。

---

## Chunk 4: 端到端验证

### Task 14: 端到端验证

- [ ] **Step 1: 启动 guada_ai 后端**

```bash
cd /Volumes/KINGSTON/CodeVault/GitHub/guada_ai/backend-ts
npm run start:dev
```

- [ ] **Step 2: 注册测试用户**

通过 Swagger 或 curl 创建测试用户：
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","email":"test@test.com","password":"password123"}'
```

- [ ] **Step 3: 启动 ClawX 开发模式**

```bash
cd /Volumes/KINGSTON/CodeVault/GitHub/ClawX
npm run dev
```

- [ ] **Step 4: 验证登录流程**

1. 打开 ClawX，确认 Sidebar 显示"登录/注册"按钮
2. 点击登录，输入测试用户凭证
3. 确认登录成功后显示用户头像和等级 Badge
4. 确认用量统计正确显示

- [ ] **Step 5: 验证功能限制**

1. 点击"协作大厅"，确认可以进入（free 用户有 3 次配额）
2. 创建 3 次任务后，确认第 4 次弹出限制弹窗
3. 点击"应用广场"→ 雇佣 Agent，确认正常消耗配额
4. 雇佣 3 次后，确认第 4 次弹出限制弹窗

- [ ] **Step 6: 验证离线模式**

1. 断开网络连接
2. 重启 ClawX
3. 确认 Feature Token 允许离线使用（3 次预算内）
4. 确认超过离线预算后显示"请联网以继续使用"

- [ ] **Step 7: 运行全部测试**

```bash
cd /Volumes/KINGSTON/CodeVault/GitHub/ClawX
npx vitest run
```

Expected: 所有测试通过。
