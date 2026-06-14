# ClawDock → Hermes 改造执行方案

> 本文档记录将 ClawDock 从 OpenClaw 运行时迁移到 Hermes Agent 框架的完整改造方案与执行状态。
> 改造策略：**方案2（复制项目后清空 OpenClaw 核心代码并重写 Hermes 适配层）**
> 当前分支：`refactor/rename-to-clawdock`

---

## 一、架构差异分析

### 1.1 OpenClaw vs Hermes

| 维度 | OpenClaw | Hermes |
|------|----------|--------|
| **配置格式** | `openclaw.json` (JSON) | `config.yaml` + `.env` + `auth.json` (YAML) |
| **Gateway** | 单一进程，WebSocket :18789 | 每 Profile 独立进程，HTTP :8642+ |
| **通信协议** | WebSocket JSON-RPC | HTTP REST + SSE |
| **组织模型** | agents + channels + bindings | profiles + platforms |
| **Profile** | 单配置文件内嵌 | `profiles/` 目录隔离 |
| **分发方式** | 内嵌 node_modules + 插件包 | 外部 Python 包 (`pip install hermes-agent`) |

### 1.2 决策记录

- **决策1：Hermes 运行时分发策略** → **A. 外部依赖**
  - Hermes 作为 Python 包不内嵌，启动时检测 `hermes` CLI
  - 未安装时引导用户执行 `pip install hermes-agent`
- **决策2：Profile 与 Gateway 的 UI 映射** → **B. 每 Profile 显示 Gateway 状态**
  - 每个 Profile 有自己的 Gateway 进程和端口
  - UI 中 Profile 列表展示各自的 Gateway 运行状态
- **决策3：聊天通信协议** → **A. HTTP SSE Proxy**
  - 保持三层架构：Renderer → Host API (:13210) → Gateway (:8642+)
  - 前端通过 EventSource 消费 SSE，Host API 作为代理转发

---

## 二、改造阶段

### Phase 1: 项目清理与依赖调整 ✅

**已完成：**

1. **package.json**
   - 修改 `description` 为 "Graphical AI Assistant based on Hermes"
   - 移除 build/package scripts 中的 `bundle-openclaw.mjs` 和 `bundle-openclaw-plugins.mjs`
   - 移除 devDependencies: `openclaw`、`@larksuite/openclaw-lark`、`@tencent-weixin/openclaw-weixin`、`@wecom/wecom-openclaw-plugin`
   - 添加 `js-yaml: ^4.1.0`

2. **electron-builder.yml**
   - 移除 `build/openclaw/` extraResources 条目
   - 更新 synopsis/description 中的 OpenClaw 引用为 Hermes
   - 更新 npmRebuild 注释说明 Hermes 为外部 Python 进程

3. **scripts/after-pack.cjs**
   - 彻底移除 OpenClaw node_modules 复制、插件打包逻辑
   - 保留通用功能：不必要文件清理、lru-cache CJS/ESM 补丁、license.node 架构切换、Windows NSIS 优化

### Phase 2: 后端核心重写（进行中）

#### 2.1 新建 Hermes 适配层

**`electron/hermes/cli.ts`** ✅ (~350行)
- 核心 Hermes CLI 封装层
- `resolveHermesPath()`: 探测 hermes 可执行文件（PATH → HERMES_BIN → 常见安装路径）
- `isHermesInstalled()`: 检测安装状态
- Profile CRUD: `listProfiles()`, `createProfile()`, `deleteProfile()`, `renameProfile()`, `useProfile()`
- Gateway 管理: `startGateway()`, `stopGateway()`, `getGatewayStatus()`（CLI + 文件系统 fallback）
- 会话管理: `exportSessions()`, `deleteSession()`, `renameSession()`
- 错误类: `HermesCliError`

**`electron/hermes/config.ts`** ✅ (~300行)
- 安全配置读写层
- `readConfig()` / `writeConfig()`: YAML 读写，支持 Profile 分层
- `readEnv()` / `writeEnv()`: `.env` 文件解析/序列化
- `readAuth()` / `writeAuth()`: `auth.json` 读写
- 平台配置辅助: `getPlatformConfig()`, `setPlatformConfig()`, `deletePlatformConfig()`
- Gateway 地址解析: `getGatewayPort()`, `getGatewayHost()`
- 原子写入: `atomicWriteFile()` 使用临时文件 + rename

**`electron/hermes/gateway/manager.ts`** ✅ (~250行)
- `HermesGatewayManager extends EventEmitter`
- `startProfile(profile)`: 通过 CLI 启动 Gateway，更新状态
- `stopProfile(profile)`: 通过 CLI 停止 Gateway
- `restartProfile(profile)`: stop + start
- `checkHealth(profile)`: HTTP GET `/health` 轮询
- `getGatewayApiUrl(profile)`: 构建 Gateway HTTP API 基础 URL
- 全局健康轮询: `startGlobalHealthPolling()` 每 15 秒扫描所有运行中 Gateway
- 事件: `'status'` (状态变化时触发)

#### 2.2 API 路由重写

**`electron/api/routes/profiles.ts`** ✅ (~200行)
- 替代旧的 `agents.ts`
- 兼容旧路径 `/api/agents` (GET/POST/PUT/DELETE)
- `buildSnapshot()`: 聚合所有 Profile 信息 + Gateway 状态
- 支持操作: 创建/重命名/删除 Profile、更新 Model、分配/移除 Platform
- Profile 概念前端仍显示为 "Agent" 以降低用户认知成本

**`electron/api/routes/platforms.ts`** ✅ (~180行)
- 替代旧的 `channels.ts`
- 兼容旧路径 `/api/channels` (GET/PUT/DELETE/POST)
- Secrets 分离: token/app_secret 等写入 `.env`，非 secrets 写入 `config.yaml`
- 支持平台: telegram, discord, slack, whatsapp, matrix, weixin, wecom, feishu, api_server

**`electron/api/routes/gateway.ts`** ✅ (~220行)
- 适配 Hermes 多 Gateway 架构
- 保留旧路径: `/api/gateway/status`, `/api/gateway/start`, `/api/gateway/stop`, `/api/gateway/restart`, `/api/gateway/health`
- 新增: `/api/gateway/profiles` (列出所有 Profile Gateway 状态)
- 新增: `/api/chat/send` (HTTP SSE 代理到 Hermes Gateway `/v1/responses`)
- 新增: `/api/chat/send-with-media` (带媒体附件的 SSE 代理)
- `profile` query 参数支持指定目标 Profile

#### 2.3 Host API Server 集成

**`electron/api/context.ts`** ✅
- 添加 `hermesGatewayManager: HermesGatewayManager` 字段
- 保留 `gatewayManager` 以保持共存期兼容

**`electron/api/server.ts`** ✅
- 导入 `handleProfileRoutes` 和 `handlePlatformRoutes`
- 替换路由处理器数组中的 `handleAgentRoutes` → `handleProfileRoutes`
- 替换路由处理器数组中的 `handleChannelRoutes` → `handlePlatformRoutes`

**`electron/main/index.ts`** ✅
- 导入 `HermesGatewayManager` 和 `isHermesInstalled`
- 全局变量区添加 `hermesGatewayManager`
- 初始化 `HermesGatewayManager` 实例
- 添加 Hermes 事件桥接 (`status` → `hermes:gateway-status`, `error` → `hermes:gateway-error`)
- 自动启动逻辑：检测 Hermes 安装后自动启动 default Profile Gateway
- 退出清理：调用 `hermesGatewayManager.stopAll()`
- 导出 `hermesGatewayManager`

#### 2.4 App 路由与 IPC 更新 ✅

**`electron/api/routes/app.ts`**
- 移除 `/api/app/openclaw-doctor` 路由
- 新增 `/api/app/hermes-status` (GET)：检测 Hermes 安装状态，返回 `installed`、`path`、`installCommand`

**`electron/main/ipc-handlers.ts`**
- 新增 `registerHermesHandlers()` 函数
- 注册 IPC 通道：`hermes:status`、`hermes:profileList`、`hermes:gatewayStart`、`hermes:gatewayStop`、`hermes:gatewayRestart`
- 保持旧 OpenClaw IPC handler 共存

#### 2.5 待清理

- [ ] 移除或重命名 `electron/utils/openclaw-workspace.ts` 相关引用
- [ ] 移除 `electron/utils/openclaw-cli.ts` 自动安装逻辑（改为 Hermes CLI 检测引导）

### Phase 3: 前端 Store 重写 ✅

**目标：** 将前端数据层从 OpenClaw 模型迁移到 Hermes 模型

#### 3.1 Store 重写完成

**`src/stores/gateway.ts`** ✅
- 状态改为 `profileStatuses: Record<string, ProfileGatewayStatus>`
- 保留 `status` getter 作为 default profile 的兼容别名
- 操作：`startProfileGateway()`, `stopProfileGateway()`, `restartProfileGateway()`
- 订阅 `hermes:gateway-status` 事件自动更新多 Profile 状态

**`src/stores/channels.ts`** ✅（底层已迁移到 Platform 模型）
- 移除所有 `gateway:rpc()` 调用
- 改用 `hostApiFetch()` 调用 Host API：`fetchChannels`, `addChannel`, `deleteChannel`, `connectChannel`, `disconnectChannel`
- API 路径保持 `/api/channels` 兼容（由 `platforms.ts` 后端路由处理）

**`src/stores/chat.ts`** ✅（SSE 适配）
- `loadSessions` → `hostApiFetch('/api/sessions')`
- `loadHistory` → `hostApiFetch('/api/chat/history?sessionKey=...')`
- `abortRun` → `hostApiFetch('/api/chat/abort')`
- `sendMessage`（无附件分支）→ `fetch('/api/chat/send')` + SSE 流消费
- 新增 `consumeChatSse` 辅助函数：解析 `data:` 行 JSON，映射为 `started`/`delta`/`final`/`error` 事件
- 移除已废弃的 `historyTimeoutOverride` 和 `CHAT_SEND_TIMEOUT_MS`

**`src/stores/agents.ts`** ⬜（暂缓重写）
- 当前仍使用旧 `agents.ts`，后端 `profiles.ts` 已返回 `agents` / `defaultAgentId` 等兼容字段
- 前端可继续以 "Agent" 概念操作，底层实际为 Profile

#### 3.2 类型定义更新

- [ ] `src/types/profile.ts` (替代 `src/types/agent.ts`)
- [ ] `src/types/platform.ts` (替代 `src/types/channel.ts`)
- `src/types/agent.ts` ✅ 已扩展：`AgentSummary` 新增 `gatewayState?`、`gatewayPort?` 字段

### Phase 4: 前端页面重写

#### 4.1 概念映射与文案清理

- Agents 页面 / Channels 页面 ✅（保留现有页面，后端已做 API 兼容）
- 导航文案调整 ⬜（可选，i18n 中仍有 OpenClaw 文案）

#### 4.2 OpenClaw 引用清理（进行中）

**已完成：**
- `src/pages/Chat/index.tsx` ✅ 注释更新为 Hermes Gateway / SSE
- `src/pages/Chat/ChatInput.tsx` ✅ 注释更新
- `src/pages/Chat/ChatMessage.tsx` ✅ 技能路径正则同时匹配 `.openclaw/skills` 和 `.clawdock/skills`
- `src/pages/Chat/message-utils.ts` ✅ 注释清理
- `src/pages/Skills/index.tsx` ✅ IPC 从 `openclaw:getSkillsDir` 迁移到 `clawdock:getSkillsDir`，source 解析兼容新旧标记
- `src/pages/Dreams/index.tsx` ✅ 日记标记同时支持 `clawdock:*` 和 `openclaw:*`
- `src/types/skill.ts` ✅ `source` 类型扩展 `'clawdock'`
- `src/lib/api-client.ts` ✅ 客户端 ID 改为 `clawdock-ui`
- `electron/utils/paths.ts` ✅ 新增 `getClawDockSkillsDir()`
- `electron/main/ipc-handlers.ts` ✅ 新增 `clawdock:getSkillsDir` IPC handler

**待处理：**
- `src/pages/Setup/index.tsx` ✅ OpenClaw 安装检测 → Hermes 安装检测（`hermes:status` IPC）
- `src/components/layout/Sidebar.tsx` ✅ `openControlUi` 文案更新为 Gateway Page
- `src/lib/channel-alias.ts` ✅ `normalizeOpenClawAccountId` / `isCanonicalOpenClawAccountId` 重命名为通用名称
- `src/pages/Settings/index.tsx` ✅ OpenClaw CLI/Doctor 功能 → Hermes CLI 引导（移除了 Doctor UI，CLI 区域改为 Hermes 安装提示）
- `src/pages/Marketplace/ImportFromOpenClawDialog.tsx` ✅ 文案更新为 "从旧版导入"
- `src/stores/skills.ts` ⬜ `gateway.rpc('skills.status')` 需适配 Hermes HTTP API（或 Host API 代理）
- i18n 翻译文件 ⬜ 大量 OpenClaw 文案

- [ ] `src/pages/PlatformsPage/` (或保留 `ChannelsPage/`)
  - Platform 列表（telegram, discord, slack 等）
  - Platform 配置表单（Secrets 与非 Secrets 分离显示）
  - 启用/禁用切换

- [ ] `src/pages/ChatPage/` (SSE 适配)
  - 使用 `EventSource` 替代 WebSocket
  - 消息发送调用 `POST /api/chat/send`
  - 支持 `profile` 参数选择目标 Profile

### Phase 5: 构建与打包调整

- `vite.config.ts` ✅ 无 OpenClaw 特定 alias
- `tsconfig.json` / `tsconfig.node.json` ✅ `electron/hermes/` 目录已包含在 `tsconfig.node.json` 的 `include` 中
- `npm run build` ✅ 主进程构建成功（`dist-electron/main/index.js` 492KB, `dist-electron/preload/index.js` 5KB）
  - 注意：`bundle-preinstalled-skills.mjs` 因网络原因（GitHub HTTP2 错误）失败，与迁移无关
- README 更新 ⬜ 待添加 Hermes 安装步骤

### Phase 6: 测试与验证

- [ ] 单元测试：`electron/hermes/config.ts` YAML 读写
- [ ] 集成测试：Host API → Hermes Gateway 代理链路
- [ ] 手动测试：Profile CRUD、Platform 配置、聊天 SSE
- [ ] 多 Profile Gateway 并发启动/停止测试

---

## 三、关键设计决策

### 3.1 Secrets 管理

Hermes 使用 `.env` 文件存储 secrets（token, api_key 等），`config.yaml` 存储非 secret 配置。

**实现方式：**
- `platforms.ts` 路由的 `normalisePlatformConfig()` 函数识别每个 platform 的 secret keys
- Secret keys 列表硬编码在路由文件中（telegram: token/botToken, discord: token 等）
- PUT `/api/channels/:type` 时，secret 写入 `.env`，其余写入 `config.yaml`
- GET `/api/channels/:type` 时，从 `.env` 合并 secret 到响应中供 UI 显示

### 3.2 多 Gateway 管理

每个 Profile 的 Gateway 是独立进程，监听独立端口。

**端口分配：**
- 默认 Profile (`default`): 8642
- 其他 Profile: 从 `config.yaml` 的 `platforms.api_server.extra.port` 读取
- 未配置时 fallback 到 8642（Hermes 默认值）

**生命周期：**
- 通过 `hermes gateway start --profile <name>` 启动
- 通过 `hermes gateway stop --profile <name>` 停止
- 状态持久化：`gateway.pid` 文件 + `gateway_state.json`
- 健康检查：HTTP GET `http://127.0.0.1:<port>/health`

### 3.3 聊天 SSE 代理

```
Renderer          Host API (:13210)          Hermes Gateway (:8642)
  |                    |                            |
  |-- POST /api/chat/send ------------------------->|
  |   (EventSource)    |    POST /v1/responses      |
  |                    |<--- SSE stream -------------|
  |<--- SSE stream ----|                            |
```

**关键点：**
- Host API 代理所有请求头、请求体
- 响应直接透传 SSE 流（`text/event-stream`）
- 超时 120 秒（`AbortSignal.timeout(120_000)`）
- 支持 `profile` query/body 参数路由到不同 Gateway

### 3.4 共存策略

改造期间，旧 GatewayManager 和新 HermesGatewayManager 共存于 `HostApiContext`。

- 旧路由（`/api/agents`, `/api/channels`）由新 handlers 接管，内部调用 Hermes CLI/配置
- 旧 GatewayManager 仍可被 extension system 引用（未完全移除前）
- 完全验证后，可移除 `GatewayManager` 相关代码

---

## 四、文件变更清单

### 新建文件

| 文件 | 说明 | 状态 |
|------|------|------|
| `electron/hermes/cli.ts` | Hermes CLI 封装 | ✅ |
| `electron/hermes/config.ts` | YAML/Env 配置管理 | ✅ |
| `electron/hermes/gateway/manager.ts` | 多 Profile Gateway 管理器 | ✅ |
| `electron/api/routes/profiles.ts` | Profile API 路由 | ✅ |
| `electron/api/routes/platforms.ts` | Platform API 路由 | ✅ |
| `src/stores/profiles.ts` | Profile Store（暂用 agents.ts 兼容） | ⬜ |
| `src/stores/platforms.ts` | Platform Store（暂用 channels.ts 兼容） | ⬜ |
| `src/stores/chat.ts` | SSE Chat Store | ✅ |
| `src/types/profile.ts` | Profile 类型 | ⬜ |
| `src/types/platform.ts` | Platform 类型 | ⬜ |

### 修改文件

| 文件 | 说明 | 状态 |
|------|------|------|
| `package.json` | 移除 OpenClaw 依赖，添加 js-yaml | ✅ |
| `electron-builder.yml` | 移除 OpenClaw extraResources | ✅ |
| `scripts/after-pack.cjs` | 移除 OpenClaw 打包逻辑 | ✅ |
| `electron/api/routes/gateway.ts` | 重写为多 Profile SSE 代理 | ✅ |
| `electron/api/context.ts` | 添加 hermesGatewayManager | ✅ |
| `electron/api/server.ts` | 注册新路由 | ✅ |
| `electron/main/index.ts` | 初始化 HermesGatewayManager | ✅ |
| `electron/main/ipc-handlers.ts` | 注册 Hermes IPC handlers | ✅ |
| `src/stores/gateway.ts` | 改为多 Profile 状态 | ✅ |
| `src/stores/channels.ts` | 迁移到 Host API 调用 | ✅ |
| `src/stores/chat.ts` | SSE 适配 | ✅ |
| `src/types/agent.ts` | 扩展 Gateway 状态字段 | ✅ |
| `src/pages/...` | 前端页面适配 | ⬜ |

### 待删除文件（验证后）

| 文件 | 说明 |
|------|------|
| `electron/gateway/manager.ts` | 旧 GatewayManager |
| `electron/api/routes/agents.ts` | 旧 Agent 路由 |
| `electron/api/routes/channels.ts` | 旧 Channel 路由 |
| `electron/utils/openclaw-cli.ts` | OpenClaw CLI 工具 |
| `electron/utils/openclaw-workspace.ts` | OpenClaw 工作区 |

---

## 五、风险与回滚

### 5.1 已知风险

1. **Hermes CLI 输出格式变化**
   - 缓解：`cli.ts` 设计了多层容错（CLI 优先，fallback 到文件系统读取 pid/state）

2. **YAML 并发写入冲突**
   - 缓解：`config.ts` 使用 `withConfigLock()` 文件锁 + 原子写入（temp + rename）

3. **多 Gateway 端口冲突**
   - 缓解：每个 Profile 独立端口配置，启动前检测端口占用（待实现）

4. **前端 Store 大规模重写引入回归**
   - 缓解：保持旧 API 路径兼容，逐步替换 Store 实现

### 5.2 回滚方案

- 当前分支为 `refactor/rename-to-clawdock`，基于原 `main` 分支
- 所有变更已提交到该分支
- 回滚方式：`git checkout main` 即可恢复 OpenClaw 版本

---

## 六、后续迭代建议

1. **Hermes 安装引导 UI**
   - 首次启动检测到 Hermes 未安装时，弹出引导对话框
   - 提供一键复制安装命令（`pip install hermes-agent`）

2. **Profile 导入/导出**
   - Hermes 天然支持 Profile 目录压缩导出
   - UI 增加导出/导入按钮

3. **Gateway 日志查看**
   - 每个 Profile Gateway 的 stdout/stderr 写入独立日志文件
   - UI 增加日志查看器

4. **多 Profile 并发聊天**
   - 聊天界面支持选择 Profile（已预留 `profile` 参数）
   - 不同 Profile 使用不同 Model/Platform 配置

---

*文档更新时间：2026-05-18*
*当前阶段：Phase 2-5 已完成。TypeScript 编译通过，构建成功。剩余工作：后端旧 OpenClaw 代码文件清理、i18n 文案更新、Skills Gateway RPC 适配、README 更新。*
