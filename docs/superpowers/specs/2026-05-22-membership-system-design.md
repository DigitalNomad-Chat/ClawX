# ClawX 会员系统设计方案

> **日期:** 2026-05-22
> **状态:** 已确认
> **作者:** AI Assistant
> **关联后端:** guada_ai (NestJS + Prisma)

---

## 1. 目标

为 ClawX 桌面应用引入会员注册登录功能，对"协作大厅"和"应用广场"两个高级功能进行使用次数限制：
- **未登录用户 (guest)**：不能使用任何高级功能，浏览应用广场时看到登录引导
- **普通用户 (free)**：每月各限制 3 次
- **会员用户 (pro/enterprise)**：无次数限制

---

## 2. 总体架构

采用**混合验证模式**（在线实时 + 离线 Feature Token 兜底）：

- **在线时**：调用 guada_ai 后端 API 实时验证会员状态和使用次数
- **离线时**：通过本地 Feature Token（RSA 验签）+ 本地计数器进行兜底验证
- **恢复联网后**：本地计数同步到服务端进行校准

```
┌─────────────────────────────────────────────────────────────────┐
│                        ClawX (Electron)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Member     │  │   Token      │  │   Usage      │          │
│  │  Manager     │  │  Manager     │  │  Counter     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              NetworkDetector (在线/离线切换)              │    │
│  └────────────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────┐
│                    guada_ai (NestJS)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  AuthModule  │  │ LicenseModule│  │ UsageModule  │          │
│  │ (JWT/OAuth)  │  │(FeatureToken)│  │ (新建)       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │            PostgreSQL (User + Subscription + UsageLog)   │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 功能限制映射

| 等级 | 协作大厅 | 应用广场 | 设备绑定 |
|------|----------|----------|----------|
| **free** | 3次/月 | 3次/月 | 1台 |
| **pro** | 无限 | 无限 | 2台 |
| **enterprise** | 无限 | 无限 | 5台 |

---

## 4. guada_ai 后端扩展

### 4.1 新增数据库模型

**FeatureUsageLog**（功能使用日志）：
```prisma
enum Feature {
  collaboration
  marketplace
}

enum TriggerAction {
  create_task
  hire_agent
}

model FeatureUsageLog {
  id            String   @id @default(uuid())
  userId        String
  feature       Feature
  action        String   // "check" | "record"
  triggerAction TriggerAction? // 触发的具体动作
  allowed       Boolean
  tier          String   // "free" | "pro" | "enterprise"
  deviceId      String?
  ip            String?
  createdAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  @@index([userId, feature, createdAt])
}
```

**MonthlyQuota**（月度配额）：
```prisma
model MonthlyQuota {
  id          String @id @default(uuid())
  userId      String
  feature     Feature
  yearMonth   String // "2026-05" 格式
  usedCount   Int    @default(0)
  // limitCount 不存储在数据库中，由服务端根据当前 tier 动态计算
  resetAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  @@unique([userId, feature, yearMonth])
  @@index([userId, yearMonth])
}
```

### 4.2 新增 API

**UsageModule** 路由前缀：`/api/v1/usage`

| 方法 | 路由 | 认证 | 说明 |
|------|------|------|------|
| GET | `/check?feature=collaboration` | JWT | 使用前检查，返回 `{ allowed, remaining, tier }` |
| POST | `/record` | JWT | 使用后记录，`{ feature, deviceId }` |
| GET | `/stats` | JWT | 获取本月用量统计 |
| POST | `/sync` | JWT | 客户端请求用量校准，返回服务端权威计数 `{ feature, serverCount, yearMonth }` |

### 4.3 LicenseModule 改造

Feature Token payload 增加 `usage` 字段：
```typescript
interface FeatureTokenPayload {
  sub: string;      // userId
  tier: string;     // "free" | "pro" | "enterprise"
  deviceId: string;
  clientType: string; // "clawx" | "guada"
  features: string[]; // ["chat", "knowledge_base", "collaboration", "marketplace"]
  keyId: string;    // RSA 公钥标识，支持密钥轮换
  usage: {
    collaboration: { used: number; limit: number };
    marketplace: { used: number; limit: number };
  };
  offlineBudget: number; // 离线期间可用次数（free=3, pro/enterprise=999999）
  iat: number;
  exp: number;      // 24h
}
```

POST `/api/v1/license/issue` 新增参数：
- `clientType: "clawx"` — 标识请求来源
- 返回的 Feature Token 包含 `usage` 数据

---

## 5. ClawX 前端设计

### 5.1 新增 UI 组件

| 组件 | 文件路径 | 功能 |
|------|----------|------|
| `LoginModal` | `src/components/auth/LoginModal.tsx` | 登录/注册弹窗 |
| `UserBadge` | `src/components/auth/UserBadge.tsx` | 顶部栏显示用户头像和会员等级 |
| `UsageLimitModal` | `src/components/auth/UsageLimitModal.tsx` | 次数用完后引导升级/登录 |
| `UsageBar` | `src/components/auth/UsageBar.tsx` | 显示本月剩余次数进度条 |

### 5.2 统一数据类型

贯穿前后端的 `UsageInfo` 类型：
```typescript
interface UsageInfo {
  feature: "collaboration" | "marketplace";
  used: number;
  limit: number;
  remaining: number;  // = limit - used
  tier: "free" | "pro" | "enterprise";
}
```

所有 API、IPC 通道、Store 统一使用该类型，避免数据格式不一致。

### 5.3 新增 Zustand Store

`src/stores/auth.ts`：
```typescript
interface AuthState {
  isLoggedIn: boolean;
  isGuest: boolean;   // 未登录访客状态
  userInfo: UserInfo | null;
  tier: "free" | "pro" | "enterprise" | null;
  usageStats: {
    collaboration: UsageInfo;
    marketplace: UsageInfo;
  };
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```

### 5.3 新增 IPC 通道

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `auth:login` | R → M | `{ email, password }` | `{ success, token, user }` |
| `auth:register` | R → M | `{ email, password, username }` | `{ success, token, user }` |
| `auth:logout` | R → M | — | `{ success }` |
| `auth:getUser` | R → M | — | `{ user, tier }` |
| `auth:checkFeature` | R → M | `{ feature }` | `UsageInfo` |
| `auth:getUsageStats` | R → M | — | `{ collaboration: UsageInfo, marketplace: UsageInfo }` |
| `auth:githubLogin` | R → M | — | 打开浏览器 OAuth 窗口 |

---

## 6. Electron 主进程服务

### 6.1 MemberManager
`electron/services/member-manager.ts`

- **登录**：调用 guada_ai `POST /api/v1/auth/login`，存储 JWT token
- **注册**：调用 guada_ai `POST /api/v1/auth/register`
- **Token 刷新**：每 6 小时刷新一次 JWT
- **用户信息缓存**：缓存到 `electron-store`，减少 API 调用
- **登出**：清除所有本地 token 和计数数据
- **访客模式**：未登录时 `tier=null`，所有高级功能不可用

**设备 ID 生成**：
```typescript
const deviceId = crypto.createHash('sha256')
  .update(machineId + os.platform() + os.hostname())
  .digest('hex');
```
使用 `node-machine-id` 获取硬件指纹，结合平台信息生成不可伪造的 deviceId。

### 6.2 TokenManager
`electron/services/token-manager.ts`

- **Feature Token 续签**：每 24 小时向 guada_ai 请求新 token
- **本地验签**：使用嵌入的 RSA 公钥（.env 或编译时注入）本地验证 token
- **加密存储**：使用 `safeStorage.encryptString` 加密后存入 `electron-store`
- **Token 解析**：提供 `getTier()`、`getUsage()`、`isExpired()` 等方法

### 6.3 UsageCounter
`electron/services/usage-counter.ts`

- **本地计数**：按 feature + yearMonth 维度计数
- **月度重置**：每月 1 日 00:00 自动重置
- **联网同步**：恢复网络后请求服务端权威计数，客户端以服务端为准
- **离线校验**：
  1. Feature Token RSA 验签通过
  2. 检查 `localCount < token.offlineBudget`，超限时拒绝
  3. `localCount` 不超过 `token.usage.used + token.offlineBudget`（防篡改）
- **存储格式**：
  ```json
  {
    "usage": {
      "2026-05": {
        "collaboration": 2,
        "marketplace": 1
      }
    }
  }
  ```

**防篡改机制**：离线期间，本地计数不得超过 Feature Token 中 `usage.used + offlineBudget`。如果本地计数异常（> 服务端已用 + 离线预算），强制在线验证。

### 6.4 NetworkDetector
`electron/services/network-detector.ts`

- **网络探测**：结合 Electron `net` 模块的 `online`/`offline` 事件 + 定时 ping guada_ai API（`GET /api/v1/health`）
- **状态切换**：在线↔离线状态变更时通过 EventEmitter 触发事件
- **指数退避**：离线后探测间隔 5s → 10s → 30s → 60s → 5min
- **事件通知**：通过 IPC 通知渲染进程网络状态变化

**服务间事件总线**：
```typescript
// 事件定义
enum MemberEvent {
  NETWORK_ONLINE = 'network:online',
  NETWORK_OFFLINE = 'network:offline',
  TOKEN_EXPIRED = 'token:expired',
  TIER_CHANGED = 'tier:changed',
  USAGE_SYNC_REQUIRED = 'usage:sync_required',
}
```

**依赖关系**：`NetworkDetector` → `MemberManager` → `TokenManager` → `UsageCounter`
- `NetworkDetector` 触发 `network:online` → `MemberManager` 刷新用户信息
- `MemberManager` 触发 `tier:changed` → `TokenManager` 立即续签 Feature Token
- `TokenManager` 触发 `token:expired` → `MemberManager` 静默续签
- `NetworkDetector` 触发 `network:online` → `UsageCounter` 同步用量到服务端

---

## 7. 功能限制集成点

### 7.1 协作大厅拦截

**入口守卫**（`src/modules/collaboration/CollaborationPage.tsx`）：
```typescript
useEffect(() => {
  checkFeature('collaboration').then(({ allowed, remaining }) => {
    if (!allowed) {
      setShowLimitModal(true);
    }
  });
}, []);
```

**新建任务**（`CollaborationPage` 内"新建任务"按钮）：
- **计数时机**：点击"新建任务"并确认创建后计 1 次
- 通过后放行，主进程自动 `POST /api/v1/usage/record`
- `triggerAction = "create_task"`

### 7.2 应用广场拦截

**浏览**（`/marketplace` 页面）：
- **不限制**，允许浏览所有 Agent 列表

**雇佣 Agent**（点击"雇佣"按钮）：
- **计数时机**：点击"雇佣"并跳转至 `AgentChat` 页面时计 1 次
- 调用 `auth:checkFeature('marketplace')`
- 失败则显示 UsageLimitModal
- `triggerAction = "hire_agent"`

> **注意**："雇佣即消耗"而非"首条消息消耗"。雇佣后用户可以自由聊天，不额外计数。

### 7.3 离线兜底

```
在线时:
  ├─ 调用 API /usage/check 实时验证
  ├─ 通过后本地计数 +1
  └─ 服务端自动记录

离线时:
  ├─ Feature Token RSA 验签（必须通过，否则拒绝）
  ├─ 检查 token.offlineBudget（free=3, pro=999999）
  ├─ 检查 localCount <= token.usage.used + token.offlineBudget
  ├─ tier=pro/enterprise → 验签通过后直接放行，不检查计数上限
  ├─ tier=free 且 count < offlineBudget → 放行，count++
  └─ tier=free 且 count >= offlineBudget → 拒绝，提示"请联网以继续使用"

恢复联网:
  ├─ UsageCounter 请求服务端权威计数（GET /usage/stats）
  └─ 客户端以服务端数据为准，更新本地计数

---

## 8.5 访客模式

**未登录用户 (guest)** 的行为：
- 不能使用协作大厅（点击时显示登录引导弹窗）
- 可以浏览应用广场（查看 Agent 列表）
- 不能雇佣 Agent（点击"雇佣"时显示登录引导弹窗）
- 顶部栏显示"登录/注册"按钮，不显示用户头像

### 8.6 会员到期处理

**订阅到期/降级场景**：
- 每次 `GET /usage/check` 实时查询当前有效 tier，不使用缓存
- pro 用户降级为 free 后，已使用的次数计入 free 配额（不重置）
- 使用中（如协作大厅任务进行中）会员到期，本次使用不受影响（会话级锁定）
- 下次使用时按新 tier 重新计算配额
- `MonthlyQuota` 的 limitCount 在每次 check 时根据当前 tier 动态计算
```

---

## 8. 安全设计

### 8.1 本地计数防篡改

- 计数文件使用 `electron-store` 存储（已加密）
- Token 使用 `safeStorage.encryptString` 加密
- 离线期间本地计数不得超过 `token.usage.used + token.offlineBudget`
- 本地计数异常时强制在线验证
- 恢复联网时服务端拥有最终权威，客户端以服务端数据为准

### 8.2 Feature Token 安全

- RSA 私钥仅存于 guada_ai 服务端
- RSA 公钥嵌入 ClawX 构建产物（可通过环境变量注入）
- Token 包含 `keyId` 字段，支持服务端密钥轮换（同时支持新旧密钥签发）
- Token 有效期 24 小时，过期必须重新联网续签

### 8.3 API 安全

- 所有 API 使用 HTTPS
- JWT Token 存储在主进程，不暴露给渲染进程
- 设备绑定限制防止账号共享
- `/sync` 接口返回服务端权威计数，不接受客户端上报数字

---

## 9. 错误处理

| 场景 | 处理策略 |
|------|----------|
| 网络超时 | 重试 3 次后转为离线验证 |
| Token 过期 | 在线时静默续签，离线时提示"请联网以继续使用"（区分在线/离机场景） |
| 服务端 401 | 清除本地 token，提示重新登录 |
| 本地计数损坏 | 强制在线验证，重置本地计数（UsageCounter 中 try-catch JSON parse + schema 校验检测损坏） |
| 设备数超限 | 提示解绑其他设备 |

---

## 10. 时序图

### 10.1 登录流程

```
用户 → LoginModal → IPC auth:login → MemberManager
  → POST guada_ai/auth/login → 返回 JWT
  → 存储 JWT + 请求 Feature Token
  → 存储 Feature Token (加密)
  → 返回用户信息 → 更新 UI
```

### 10.2 使用功能流程（在线）

```
用户点击"协作大厅" → CollaborationPage
  → IPC auth:checkFeature("collaboration")
  → MemberManager → GET guada_ai/usage/check
  → 返回 { allowed: true, remaining: 2 }
  → 允许进入
  → 新建任务时 → POST guada_ai/usage/record
  → 服务端计数 +1
```

### 10.3 使用功能流程（离线）

```
用户点击"协作大厅" → CollaborationPage
  → IPC auth:checkFeature("collaboration")
  → NetworkDetector 检测到离线
  → TokenManager 本地 RSA 验签 Feature Token
  → UsageCounter 检查本地计数 (1 < 3)
  → 允许进入，本地计数 +1
  → 恢复联网后 → UsageCounter.sync() → 服务端校准
```

---

## 11. 文件清单

### 11.1 新建文件

| 文件 | 说明 |
|------|------|
| `src/components/auth/LoginModal.tsx` | 登录/注册弹窗 |
| `src/components/auth/UserBadge.tsx` | 用户信息展示 |
| `src/components/auth/UsageLimitModal.tsx` | 次数限制弹窗 |
| `src/components/auth/UsageBar.tsx` | 用量进度条 |
| `src/stores/auth.ts` | 认证状态管理 |
| `src/hooks/useFeatureGuard.ts` | 功能权限检查 Hook |
| `electron/services/member-manager.ts` | 会员管理服务 |
| `electron/services/token-manager.ts` | Token 管理服务 |
| `electron/services/usage-counter.ts` | 用量计数服务 |
| `electron/services/network-detector.ts` | 网络检测服务 |

### 11.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 添加 AuthProvider 包裹 |
| `src/components/layout/Sidebar.tsx` | 添加用户头像和登录入口 |
| `src/components/layout/MainLayout.tsx` | 集成 UserBadge |
| `src/modules/collaboration/CollaborationPage.tsx` | 添加 useFeatureGuard |
| `src/pages/Marketplace/index.tsx` | 添加雇佣按钮拦截 |
| `src/pages/AgentChat/index.tsx` | 添加首条消息拦截 |
| `electron/main/ipc-handlers.ts` | 注册 auth IPC 处理器 |
| `electron/api/routes/` | 新增 usage 路由转发 |

---

## 12. 验收标准

- [ ] free 用户每月协作大厅限制 3 次，第 4 次弹出限制提示
- [ ] free 用户每月应用广场限制 3 次，第 4 次弹出限制提示
- [ ] pro/enterprise 用户无次数限制
- [ ] 离线时通过 Feature Token 正常验证和计数
- [ ] 恢复联网后本地计数与服务端同步
- [ ] 登录后用户信息正确显示在顶部栏
- [ ] 登出后清除所有本地数据，功能回到未登录限制状态
- [ ] 同一账号超过设备绑定上限时提示解绑
