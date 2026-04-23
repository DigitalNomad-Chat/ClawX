# ClawX 功能增强改造计划

## 背景与目标

### 背景
ClawX 是 OpenClaw 的桌面端界面应用，当前已具备 Chat、Models、Agents、Channels、Skills、Cron、Marketplace 等核心功能。

我们参考了两个项目的优秀功能：
1. **openclaw-control-center**: 具备完善的"协作大厅"、"群聊"、"记忆管理"、"文档中心"、"任务看板"（含今日与下一批排程）功能
2. **OpenClaw Desktop 0.3.0**: 具备"仪表盘"（Activity/Charts）和"智能体看板"（MultiAgentView）功能

### 核心挑战
ClawX 是活跃开源项目，上游（ValueCell-ai/ClawX）持续更新。改造必须满足：
- **独立模块**能与核心代码低耦合共存
- **上游更新时**能快速 merge，独立模块不受影响或少受影响
- **功能完整性**达到生产可用级别

### 目标
将以下 7 大功能模块以增强形式整合到 ClawX：
| 优先级 | 功能模块 | 来源参考 | 核心能力 |
|--------|----------|----------|----------|
| P0 | 仪表盘 (Dashboard) | Desktop 0.3.0 | 系统状态概览、Token 使用图表、活跃会话统计 |
| P0 | 群聊/协作 (Collaboration) | Control Center | 多 Agent 群聊大厅、@提及路由、讨论/执行/评审流程 |
| P0 | 任务看板 (Tasks) | Control Center | 任务管理、今日排程、下一批排程、执行链追踪 |
| P1 | 智能体看板 (Agent Board) | Desktop 0.3.0 | Agent 实时状态网格、能力概览、快速切换 |
| P1 | 文档中心 (Documents) | Control Center | 从会话自动提取结构化文档、分类检索 |
| P1 | 记忆增强 (Memory+) | Control Center + Desktop | Agent 记忆文件管理、记忆状态健康度 |
| P2 | 任务房间 (Task Rooms) | Control Center | 任务级独立聊天室、外部通道桥接(Discord/Telegram) |

---

## 架构设计原则

### 1. 物理隔离原则 (Physical Isolation)
所有新增功能模块统一放在 `src/modules/`（前端）和 `electron/modules/`（后端）目录下，与核心代码完全隔离。

```
ClawX/
├── src/
│   ├── ... (现有核心代码, 尽量不动)
│   └── modules/
│       ├── dashboard/          # 仪表盘
│       ├── collaboration/      # 协作/群聊
│       ├── tasks/              # 任务看板
│       ├── agent-board/        # 智能体看板
│       ├── documents/          # 文档中心
│       ├── memory-plus/        # 记忆增强
│       └── task-rooms/         # 任务房间
├── electron/
│   ├── ... (现有核心代码, 尽量不动)
│   └── modules/
│       ├── dashboard/          # 仪表盘后端
│       ├── collaboration/      # 协作后端
│       ├── tasks/              # 任务后端
│       ├── agent-board/        # 智能体看板后端
│       ├── documents/          # 文档中心后端
│       ├── memory-plus/        # 记忆增强后端
│       └── task-rooms/         # 任务房间后端
```

### 2. 注册表扩展原则 (Registry Extension)
核心文件只暴露"挂载点"，新模块通过配置文件自注册：

- **前端路由**: `src/modules/registry.ts` 导出所有模块路由，App.tsx 只 `import { moduleRoutes } from './modules/registry'`
- **Sidebar 导航**: `src/modules/registry.ts` 导出导航项，Sidebar.tsx 合并 `moduleNavItems`
- **后端路由**: `electron/modules/registry.ts` 导出路由处理器数组，server.ts 合并 `moduleRouteHandlers`
- **IPC 通道**: `electron/modules/registry.ts` 导出 IPC 处理器注册函数

### 3. 状态管理隔离原则 (Store Isolation)
每个模块拥有独立的 Zustand store，通过 `src/modules/[name]/store.ts` 管理自身状态。
跨模块通信使用：
- **Host Event Bus** (已有): `electron/api/event-bus.ts` 的 `HostEventBus`
- **全局事件**: `window.electron.ipcRenderer.on('module:event', ...)`

### 4. 上游兼容策略 (Upstream Compatibility)
- **CLAUDE.md 文档**: 在 `CLAUDE.md` 中标注所有"扩展点"文件及其用途，方便 merge 时识别
- **最小修改清单**: 仅修改 6 个核心文件作为挂载点
- **Patch 脚本**: 提供 `scripts/apply-module-patch.mjs`，在上游更新后自动重新应用挂载点修改

---

## 核心技术决策

### 决策 1: 数据持久化方式
**方案**: 复用 Control Center 的 JSON 文件存储模式，但统一放到 ClawX 的 `userData` 目录下。

理由：
- Control Center 的 JSON 存储已非常成熟（带原子写入、校验、归一化）
- ClawX 本身是桌面应用，无需引入 SQLite/数据库增加复杂度
- 与现有 `electron-store` 风格一致

路径: `{app.getPath('userData')}/modules/[module-name]/`

### 决策 2: UI 组件库策略
**方案**: 严格复用 ClawX 现有组件体系（shadcn/ui + Tailwind + Lucide React）。

理由：
- 保持视觉一致性
- 不引入新依赖
- 已有 `GlassCard` 等效果可从 Desktop 0.3.0 dist 中逆向参考样式

### 决策 3: 后端运行时模式
**方案**: 在现有 Host API Server 中增加模块路由，不另起服务。

理由：
- ClawX 已有完善的 HTTP API 层（`electron/api/server.ts`）
- 复用现有 CORS、Auth、错误处理中间件
- 前端已通过 `hostApiFetch` 统一调用

### 决策 4: 与 Gateway 的集成
**方案**: 模块通过现有 Gateway Manager 与 OpenClaw Gateway 通信。

理由：
- Control Center 直接操作 `openclaw` CLI，但 ClawX 已封装了 Gateway HTTP/WebSocket 层
- 复用 `electron/gateway/manager.ts` 的 `gatewayManager.httpProxy` 和 `wsClient`

---

## 详细实施计划

### 阶段 0: 基础设施搭建 (Foundation)
**目标**: 创建模块注册系统和扩展点，使后续模块可独立开发

#### 0.1 创建模块目录结构
```
src/modules/
  ├── registry.ts              # 前端模块注册中心
  ├── types.ts                 # 模块共享类型
  └── _shared/                 # 模块间共享组件/工具
      ├── ModulePageLayout.tsx # 模块统一页面布局
      └── useModuleStore.ts    # 模块 store 工厂

electron/modules/
  ├── registry.ts              # 后端模块注册中心
  ├── types.ts                 # 后端模块共享类型
  └── _shared/                 # 模块间共享工具
      ├── json-store.ts        # JSON 文件存储基类（从 Control Center 提取）
      └── module-logger.ts     # 模块日志工具
```

#### 0.2 修改核心挂载点文件（共 6 个）

| 文件 | 修改内容 | 影响范围 |
|------|----------|----------|
| `src/App.tsx` | 引入 `moduleRoutes`，合并到 Routes | 路由 |
| `src/components/layout/Sidebar.tsx` | 引入 `moduleNavItems`，合并到 navItems | 导航 |
| `electron/api/server.ts` | 引入 `moduleRouteHandlers`，合并到 routeHandlers | API |
| `electron/main/ipc-handlers.ts` | 调用 `registerModuleIpcHandlers()` | IPC |
| `src/i18n/index.ts` | 引入模块翻译命名空间 | i18n |
| `electron/main/index.ts` | 调用 `initModules(ctx)` | 模块初始化 |

**关键设计**: 每个挂载点修改都包裹在 `// === MODULE EXTENSION POINT ===` 注释中，便于识别和自动化处理。

#### 0.3 提取 Control Center 基础设施
从 `docs/openclaw-control-center-main/src/runtime/` 中提取以下基础工具到 `electron/modules/_shared/`：
- `json-store.ts`: 原子写入 JSON 文件、校验、归一化的基类（融合 `chat-store.ts` 和 `collaboration-hall-store.ts` 的模式）
- `runtime-path.ts`: 模块运行时目录解析

**预计工期**: 2-3 天

---

### 阶段 1: 仪表盘 (Dashboard) - P0
**目标**: 提供系统级概览视图

#### 功能规格
- **系统健康卡片**: Gateway 状态、活跃会话数、待审批数、阻塞任务数
- **Token 使用图表**: 今日/7日/30日 Token 消耗趋势（使用 `recharts` 或纯 CSS 图表）
- **活跃 Agent 列表**: 当前运行的 Agent 及其状态
- **快捷操作**: 快速跳转至常用页面

#### 实现要点
- **后端** (`electron/modules/dashboard/`):
  - `store.ts`: 从 Gateway 聚合状态数据（复用 `gatewayManager.getStatus()`）
  - `routes.ts`: `GET /api/dashboard/overview` 返回聚合数据
  - 数据源: Gateway WS 状态、Session 列表、Cron 任务状态
- **前端** (`src/modules/dashboard/`):
  - `index.tsx`: 仪表盘页面
  - `components/`: StatCard, TrendChart, QuickActions
  - `store.ts`: Zustand store，定时轮询后端 API

#### 参考来源
- Desktop 0.3.0 的 `AreaChart`, `GlassCard`, `StatusDot`, `activity` 组件（从 dist 逆向样式）
- Control Center 的 `Overview`, `Usage`, `Staff` 页面逻辑

**预计工期**: 3-4 天

---

### 阶段 2: 协作/群聊 (Collaboration Hall) - P0
**目标**: 实现多 Agent 群聊大厅

#### 调研结论

Control Center 协作大厅是一个极其复杂的子系统，核心文件规模：

| 文件 | 规模 | 职责 |
|------|------|------|
| `collaboration-hall-store.ts` | ~1300 行 | Hall/Message/TaskCard 的 CRUD + 校验/归一化 |
| `collaboration-hall-orchestrator.ts` | ~1400 行 | 完整编排器：讨论→指派→执行→评审闭环 |
| `collaboration-stream.ts` | ~500 行 | SSE 实时流服务器 |
| `hall-mention-router.ts` | ~50 行 | @提及解析 |
| `hall-role-resolver.ts` | ~100 行 | 角色解析 |
| `hall-speaker-policy.ts` | ~200 行 | 讨论轮次策略 |
| `hall-runtime-dispatch.ts` | ~400 行 | Gateway 运行时派发 |

**ClawX 与 Control Center 的关键差异：**

| 差异点 | Control Center | ClawX | 适配策略 |
|--------|---------------|-------|----------|
| Gateway 通信 | ToolClient (直接调用 openclaw CLI) | GatewayManager (WS RPC + HTTP 代理) | 重写 dispatch 层，使用 `rpc()` |
| 实时流 | 自建 SSE Server | HostEventBus (IPC + SSE fallback) | 复用 HostEventBus，新命名空间 `collab:*` |
| Agent 列表 | agent-roster.json | `useAgentsStore` (Gateway RPC) | 从 Gateway 获取 Agent 列表生成 participants |
| 存储路径 | `{runtimeDir}/collaboration-*.json` | `{userData}/modules/collaboration/*.json` | 使用 `getModuleFilePath` |

#### 核心设计决策

**决策 1：编排器简化策略**
Control Center 的 orchestrator（1400 行）实现了全自动闭环。在 ClawX 中：
- **保留**：讨论轮次跟踪（`discussionCycle`）、阶段状态机（`stage`）、执行项列表（`plannedExecutionItems`）
- **简化**：不实现自动 Agent 调用。用户手动点击"指派执行"后，通过 Gateway RPC 触发 `agent.run`，前端轮询更新状态
- **保留**：`@handoff` 消息识别，自动推进 `currentExecutionItem` 到下一项
- **移除**：自动 draft reply、自动 speaker 选择、自动 discussion domain 推断

**决策 2：实时流策略**
不复建 SSE Server，后端写操作通过 `HostEventBus.emit('collab:invalidate', {...})` 推送变更事件，前端通过 `subscribeHostEvent('collab:invalidate', handler)` 接收。

**决策 3：Participant 来源**
从 ClawX 的 `listAgentsSnapshot()` 动态生成，Semantic role 通过名称关键词推断（移植 `hall-role-resolver.ts`，50 行），Human 用户固定为 `participantId = "human"`。

#### 功能规格
- **大厅视图**: 共享时间线，所有 Agent 在一个线程中回复
- **角色识别**: human / planner / coder / reviewer / manager
- **@提及路由**: `@agent-name` 将消息路由给特定 Agent
- **讨论-执行-评审流程**:
  1. Discussion: 多人讨论，按 planner→coder→reviewer→manager 轮次收集回复
  2. Assign: 指派执行者（更新 currentOwner）
  3. Execution: 单 owner 执行，完成后 `@handoff` 给下一个
  4. Review: 最后 owner 完成后进入评审
- **实时流**: 通过 HostEventBus 推送变更事件，前端自动刷新
- **与 Gateway 集成**: `assign` 通过 `gatewayManager.rpc('agent.run', ...)` 手动触发

#### 实施子任务

| 子任务 | 内容 | 文件 | 工期 |
|--------|------|------|------|
| 2.1 | 数据模型与类型定义 | `types.ts` (前后端) | 0.5 天 |
| 2.2 | 后端存储层 | `store.ts` (3 个 JsonStore + CRUD + 校验归一化) | 1.5 天 |
| 2.3 | 后端路由 | `routes.ts` (11 个 REST API) | 1.5 天 |
| 2.4 | @提及路由与角色解析 | `mention-router.ts`, `role-resolver.ts` (直接移植) | 0.5 天 |
| 2.5 | 讨论轮次策略 | `speaker-policy.ts` (移植核心函数) | 0.5 天 |
| 2.6 | Gateway 运行时调度 | `runtime-dispatch.ts` (简化版 `agent.run` 触发) | 0.5 天 |
| 2.7 | 实时流集成 | `event-publisher.ts` (HostEventBus 封装) | 0.5 天 |
| 2.8 | 前端 Store | `store.ts` (Zustand + SSE 监听) | 1 天 |
| 2.9 | 前端页面与组件 | `CollaborationPage.tsx` + 6 个组件 | 2 天 |
| 2.10 | 模块注册与集成测试 | `registry.ts` + 翻译文件 | 0.5 天 |
| **总计** | | | **~9 天** |

#### 后端文件结构
```
electron/modules/collaboration/
├── index.ts              # BackendModule 导出
├── types.ts              # 共享类型定义
├── store.ts              # JsonStore 封装 + CRUD
├── routes.ts             # REST API 路由
├── mention-router.ts     # @提及解析
├── role-resolver.ts      # 角色解析
├── speaker-policy.ts     # 讨论轮次策略
├── runtime-dispatch.ts   # Gateway 调度（简化）
└── event-publisher.ts    # HostEventBus 事件推送
```

#### 前端文件结构
```
src/modules/collaboration/
├── index.tsx             # FrontendModule 导出
├── types.ts              # 共享类型定义
├── store.ts              # Zustand store
├── CollaborationPage.tsx # 主页面
└── components/
    ├── HallTimeline.tsx
    ├── HallInput.tsx
    ├── TaskCard.tsx
    ├── TaskCardList.tsx
    ├── ParticipantBadge.tsx
    └── ExecutionOrderEditor.tsx
```

#### 数据模型
复用 Control Center 的完整类型系统：
- `CollaborationHall`, `HallMessage`, `HallTaskCard`
- `HallParticipant`, `HallExecutionItem`
- `ExecutionLock`, `TaskDiscussionCycle`

存储文件:
- `{userData}/modules/collaboration/halls.json`
- `{userData}/modules/collaboration/messages.json`
- `{userData}/modules/collaboration/task-cards.json`

#### 参考来源
- `docs/openclaw-control-center-main/src/runtime/collaboration-hall-store.ts`
- `docs/openclaw-control-center-main/src/runtime/collaboration-hall-orchestrator.ts`
- `docs/openclaw-control-center-main/src/runtime/hall-*.ts`
- `docs/openclaw-control-center-main/src/ui/collaboration-hall.ts`

#### 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Control Center orchestrator 逻辑过于复杂，简化后功能不完整 | 中 | 明确 MVP 范围：保留数据模型和手动流程，自动调度后续迭代 |
| Gateway RPC `agent.run` 参数格式不确定 | 高 | 预留适配层，`runtime-dispatch.ts` 参数结构可配置 |
| 大量消息时的前端性能 | 中 | HallTimeline 首期先分页加载，后期添加虚拟滚动 |
| 与任务看板模块的数据一致性 | 中 | TaskCard 的 `projectId`/`taskId` 预留关联字段，等任务看板实现后对接 |

**预计工期**: ~9 天（最复杂的模块）

---

### 阶段 3: 任务看板 (Tasks) - P0
**目标**: 可视化任务管理，含"今日排程"和"下一批排程"

#### 功能规格
- **看板视图**: Kanban 板（todo / in_progress / blocked / done）
- **今日排程**: 显示今日到期或计划今日执行的任务
- **下一批排程**: 显示即将到来的任务（按优先级排序）
- **任务详情**: 标题、描述、负责人、截止日期、DOD（完成的定义）、产物、回滚计划
- **预算阈值**: 每个任务可配置 Token/Cost 预算
- **执行链**: 显示任务的执行历史和相关会话

#### 实现要点
- **后端** (`electron/modules/tasks/`):
  - 移植 `task-store.ts`: Project + Task 存储
  - 移植 `task-summary.ts`: 任务汇总计算
  - 移植 `task-heartbeat.ts`: 任务心跳检查
  - 移植 `budget-policy.ts` + `budget-governance.ts`: 预算策略与评估
  - `routes.ts`: CRUD API + 排程查询
- **前端** (`src/modules/tasks/`):
  - `index.tsx`: 看板主页面
  - `components/KanbanBoard.tsx`: 拖拽看板
  - `components/TaskCard.tsx`: 任务卡片
  - `components/TodaySchedule.tsx`: 今日排程面板
  - `components/NextBatchSchedule.tsx`: 下一批排程面板
  - `components/TaskDetailDrawer.tsx`: 任务详情抽屉
  - `store.ts`: Zustand store

#### 与协作大厅的集成
- 任务创建时自动在协作大厅创建对应的 `HallTaskCard`
- 任务状态变更通过事件总线通知协作大厅
- 在任务看板中可快速跳转到关联的协作大厅线程

#### 参考来源
- `docs/openclaw-control-center-main/src/runtime/task-store.ts`
- `docs/openclaw-control-center-main/src/runtime/task-summary.ts`
- `docs/openclaw-control-center-main/src/runtime/task-heartbeat.ts`
- `docs/openclaw-control-center-main/src/runtime/budget-*.ts`

**预计工期**: 5-7 天

---

### 阶段 4: 智能体看板 (Agent Board) - P1
**目标**: Agent 实时状态网格视图

#### 功能规格
- **Agent 网格**: 卡片式展示所有 Agent
- **状态指示**: idle / running / blocked / waiting_approval / error
- **能力标签**: 显示每个 Agent 的技能和专长
- **快速操作**: 快速启动对话、查看最近输出
- **会话关联**: 显示每个 Agent 当前绑定的会话

#### 实现要点
- **后端** (`electron/modules/agent-board/`):
  - 复用现有 `electron/api/routes/agents.ts` 和 `sessions.ts`
  - 聚合 Agent 状态数据（无需新存储）
  - `routes.ts`: `GET /api/agent-board/overview`
- **前端** (`src/modules/agent-board/`):
  - `index.tsx`: 看板主页面
  - `components/AgentCard.tsx`: Agent 卡片（GlassCard 风格）
  - `components/AgentStatusBadge.tsx`: 状态徽章
  - `store.ts`: 聚合现有 `useAgentsStore` 和 `useChatStore` 数据

#### 参考来源
- Desktop 0.3.0 的 `MultiAgentView` 组件（从 dist 推断布局）
- Control Center 的 `Staff` 页面逻辑

**预计工期**: 3-4 天

---

### 阶段 5: 文档中心 (Documents) - P1
**目标**: 从会话历史自动提取结构化文档

#### 功能规格
- **自动提取**: 扫描会话历史，识别文档类消息（Markdown 标题、代码块、列表、PRD、架构文档等）
- **分类**: 总结复盘 / 计划路线 / 规格设计 / 操作手册 / 内容草稿 / 会话文档
- **搜索**: 按标题/内容/分类搜索
- **源追溯**: 每个文档显示来源会话和 Agent
- **手动编辑**: 支持编辑文档内容并写回存储

#### 实现要点
- **后端** (`electron/modules/documents/`):
  - 移植 `doc-hub.ts`: 会话扫描 + 文档提取 + 结构化存储
  - `routes.ts`: `GET /api/documents` (列表), `GET /api/documents/:id` (详情), `POST /api/documents/:id` (更新)
- **前端** (`src/modules/documents/`):
  - `index.tsx`: 文档列表页面
  - `components/DocCard.tsx`: 文档卡片
  - `components/DocEditor.tsx`: 文档编辑器
  - `components/DocFilterBar.tsx`: 分类筛选
  - `store.ts`: Zustand store

#### 参考来源
- `docs/openclaw-control-center-main/src/runtime/doc-hub.ts`

**预计工期**: 3-4 天

---

### 阶段 6: 记忆增强 (Memory+) - P1
**目标**: 增强现有 Memory 页面

#### 功能规格
- **Agent 记忆列表**: 显示每个 Agent 的记忆文件
- **记忆健康度**: 显示记忆是否可用、可搜索、需要关注
- **记忆搜索**: 跨 Agent 搜索记忆内容
- **记忆编辑**: 直接编辑记忆文件
- **会话关联**: 显示哪些会话使用了哪些记忆

#### 实现要点
- **后端** (`electron/modules/memory-plus/`):
  - 读取 `~/.openclaw/agents/[agent]/memory/` 目录
  - 复用 Control Center 的 `openclaw-cli-insights.ts` 中的记忆状态检测逻辑
  - `routes.ts`: 记忆文件 CRUD + 搜索
- **前端** (`src/modules/memory-plus/`):
  - `index.tsx`: 记忆管理页面（替换或增强现有 `src/pages/Memory/`）
  - `components/MemoryFileCard.tsx`: 记忆文件卡片
  - `components/MemorySearch.tsx`: 搜索框
  - `components/MemoryEditor.tsx`: 编辑器
  - `store.ts`: Zustand store

#### 与现有 Memory 页面的关系
- 现有 `src/pages/Memory/` 是基础版本
- 新模块提供更强大的功能
- 可在 Sidebar 中将旧入口替换为新入口，或保留两者

#### 参考来源
- `docs/openclaw-control-center-main/src/runtime/openclaw-cli-insights.ts`
- Desktop 0.3.0 的 `MemoryExplorer` 组件

**预计工期**: 3-4 天

---

### 阶段 7: 任务房间 (Task Rooms) - P2
**目标**: 任务级独立聊天室，支持外部通道桥接

#### 功能规格
- **任务绑定**: 每个任务可有一个主聊天室
- **房间阶段**: intake → discussion → assigned → executing → review → completed
- **参与者角色**: human / planner / coder / reviewer / manager
- **交接记录**: 记录工作交接历史
- **外部桥接**: 可选同步到 Discord Webhook 或 Telegram Bot

#### 实现要点
- **后端** (`electron/modules/task-rooms/`):
  - 移植 `chat-store.ts`: ChatRoom + ChatMessage 存储
  - 移植 `task-room-bridge.ts`: Discord/Telegram 桥接
  - 移植 `room-orchestrator.ts`: 房间编排（assign/handoff/review）
  - `routes.ts`: REST API
- **前端** (`src/modules/task-rooms/`):
  - `index.tsx`: 房间列表
  - `components/RoomChat.tsx`: 房间聊天视图
  - `components/RoomStageFlow.tsx`: 阶段流转可视化
  - `store.ts`: Zustand store

#### 与协作大厅的关系
- 协作大厅是"宏观"讨论（哪个任务先做、谁来负责）
- 任务房间是"微观"执行（具体任务的技术细节、代码实现）
- 协作大厅中的 TaskCard 可关联到任务房间

#### 参考来源
- `docs/openclaw-control-center-main/src/runtime/chat-store.ts`
- `docs/openclaw-control-center-main/src/runtime/task-room-bridge.ts`
- `docs/openclaw-control-center-main/src/runtime/room-orchestrator.ts`

**预计工期**: 4-5 天

---

## 上游兼容策略（详细）

### 策略 1: 最小修改清单
只有以下 6 个核心文件会被修改作为"扩展点"，其他所有代码都在独立目录：

1. `src/App.tsx` — 增加模块路由（约 +5 行）
2. `src/components/layout/Sidebar.tsx` — 增加模块导航（约 +5 行）
3. `electron/api/server.ts` — 增加模块路由处理器（约 +5 行）
4. `electron/main/ipc-handlers.ts` — 增加模块 IPC 注册（约 +3 行）
5. `src/i18n/index.ts` — 增加模块翻译加载（约 +5 行）
6. `electron/main/index.ts` — 增加模块初始化（约 +3 行）

### 策略 2: 自动化 Patch 脚本
创建 `scripts/apply-module-system.mjs`，功能：
- 检查 6 个扩展点文件是否包含模块系统引用
- 如果不存在，自动插入（基于 AST 或正则）
- 提供 `--check` 模式用于 CI 验证

### 策略 3: Git 工作流建议
建议采用以下分支策略：
```
main (跟踪上游 ClawX)
  └── feature/modules-enhancement (本改造的开发分支)
        ├── module/dashboard
        ├── module/collaboration
        ├── module/tasks
        └── ...
```

上游更新时：
1. `git fetch upstream`
2. `git checkout main && git merge upstream/main`
3. `git checkout feature/modules-enhancement`
4. `git merge main`（扩展点文件可能需要手动解决冲突，但模块代码完全独立）
5. 运行 `pnpm run modules:verify` 检查模块系统完整性

### 策略 4: 防御性编程
- 模块系统支持**懒加载**：模块文件不存在时不报错
- 模块支持**运行时开关**：Settings 中可增加"启用/禁用模块"选项
- 模块错误**隔离**：单个模块的崩溃不影响其他模块和核心功能

---

## 技术栈与依赖

### 新增依赖（评估中）
| 依赖 | 用途 | 必需 |
|------|------|------|
| `recharts` | 仪表盘图表 | 可选（可用纯 CSS 替代） |
| `@hello-pangea/dnd` | 看板拖拽 | 是 |
| `date-fns` | 日期处理（排程） | 是（或复用现有） |

### 现有依赖复用
- **shadcn/ui 组件**: Card, Badge, Button, Input, Dialog, Drawer, Tabs, ScrollArea, Avatar, Separator, Tooltip, DropdownMenu...
- **图标**: Lucide React（已有）
- **状态管理**: Zustand（已有）
- **路由**: React Router（已有）
- **HTTP**: `hostApiFetch`（已有）
- **事件**: `HostEventBus`（已有）
- **国际化**: `react-i18next`（已有）

---

## 测试策略

### 单元测试
- 每个模块的 `store.ts` 和工具函数使用 Vitest 测试
- 位置: `src/modules/[name]/__tests__/` 和 `electron/modules/[name]/__tests__/`

### E2E 测试
- 使用 Playwright 测试关键用户流程
- 新增 `tests/e2e/modules/` 目录
- 覆盖: 创建任务 → 在协作大厅讨论 → 指派执行 → 在看板追踪状态

### 回归测试
- 每次阶段完成后运行 `pnpm run comms:replay` 和 `pnpm run comms:compare`
- 确保模块不影响现有通信路径

---

## 实施排期

| 阶段 | 内容 | 预计工期 | 累计 |
|------|------|----------|------|
| 0 | 基础设施 + 注册系统 | 2-3 天 | 3 天 |
| 1 | 仪表盘 (Dashboard) | 3-4 天 | 7 天 |
| 2 | 协作/群聊 (Collaboration) | 7-10 天 | 17 天 |
| 3 | 任务看板 (Tasks) | 5-7 天 | 24 天 |
| 4 | 智能体看板 (Agent Board) | 3-4 天 | 28 天 |
| 5 | 文档中心 (Documents) | 3-4 天 | 32 天 |
| 6 | 记忆增强 (Memory+) | 3-4 天 | 36 天 |
| 7 | 任务房间 (Task Rooms) | 4-5 天 | 41 天 |
| — | 集成测试 + 优化 | 3-5 天 | 46 天 |

**总计: 约 6-7 周（单人全职）**
**建议: 按阶段 0→1→2→3 优先交付 MVP，后续模块可并行开发**

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Control Center 代码与 ClawX 运行时差异大 | 高 | 只移植数据模型和逻辑，Gateway 通信层完全重写适配 ClawX 的 `gatewayManager` |
| 上游 ClawX 大版本更新破坏扩展点 | 中 | 扩展点修改最小化 + Patch 脚本自动化 + 详细注释 |
| 模块间循环依赖 | 中 | 通过事件总线解耦，禁止模块间直接 import store |
| 性能问题（大量消息/任务） | 中 | 虚拟列表、分页加载、本地缓存、按需 SSE 订阅 |
| 数据迁移（后续版本） | 低 | JSON 存储带 schemaVersion 字段，支持版本升级函数 |

---

## 关键文件索引

### ClawX 现有核心文件（挂载点）
- `src/App.tsx` — 路由挂载点
- `src/components/layout/Sidebar.tsx` — 导航挂载点
- `src/components/layout/MainLayout.tsx` — 布局
- `electron/api/server.ts` — API 服务器
- `electron/api/routes/*.ts` — 现有路由参考
- `electron/main/index.ts` — 主进程入口
- `electron/main/ipc-handlers.ts` — IPC 处理器
- `src/lib/host-api.ts` — 前端 API 调用
- `src/stores/*.ts` — 现有 store 参考

### Control Center 参考文件（移植源）
- `docs/openclaw-control-center-main/src/types.ts` — 完整数据模型
- `docs/openclaw-control-center-main/src/runtime/collaboration-hall-store.ts` — 协作大厅存储
- `docs/openclaw-control-center-main/src/runtime/collaboration-hall-orchestrator.ts` — 协作编排
- `docs/openclaw-control-center-main/src/runtime/chat-store.ts` — 聊天室存储
- `docs/openclaw-control-center-main/src/runtime/task-store.ts` — 任务存储
- `docs/openclaw-control-center-main/src/runtime/doc-hub.ts` — 文档中心
- `docs/openclaw-control-center-main/src/runtime/task-room-bridge.ts` — 外部桥接
- `docs/openclaw-control-center-main/src/runtime/budget-*.ts` — 预算系统
- `docs/openclaw-control-center-main/src/runtime/hall-*.ts` — 大厅辅助逻辑

### OpenClaw Desktop 参考（样式/布局推断）
- `dist/assets/AreaChart-*.js` — 图表组件
- `dist/assets/MultiAgentView-*.js` — 多 Agent 视图
- `dist/assets/MemoryExplorer-*.js` — 记忆浏览器
- `dist/assets/GlassCard-*.js` — 玻璃卡片效果

---

## 验证清单

- [ ] `pnpm typecheck` 通过（无新增 TS 错误）
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过（含新增模块测试）
- [ ] `pnpm run test:e2e` 通过（含新增模块 E2E）
- [ ] `pnpm run comms:replay` + `pnpm run comms:compare` 通过
- [ ] 上游 main 分支可正常 merge 到本分支
- [ ] 每个模块可独立启用/禁用
- [ ] 模块错误不导致整个应用崩溃
