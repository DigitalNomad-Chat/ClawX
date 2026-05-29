# ClawX 模型管理功能增强设计文档

## 背景

OpenClawSwitch 项目具备完善的配置管理功能：
- **全局默认模型**：在 `agents.defaults.model` 中统一管理
- **Agent 级模型分配**：在 `agents.list[].model` 中为每个 Agent 独立分配模型

ClawX 当前已支持 Agent 级模型覆盖（`AgentModelModal` + `updateAgentModel` API），但缺少：
1. 全局默认模型的 **UI 管理入口**（仅被动从 `openclaw.json` 读取）
2. Agent 模型分配的 **集中概览与批量操作界面**

## 目标

将 OpenClawSwitch 的"全局默认模型"和"Agent 级模型分配"能力以最小改动方式移植到 ClawX。

## 方案概述（方案 A：最小改动移植）

在 ClawX 现有 Provider/Agent 架构基础上，仅增加 UI 管理层，不引入新配置体系。

## 详细设计

### 一、全局默认模型配置

**位置**：`Models` 页面（`src/pages/Models/index.tsx`）

**UI 设计**：
在 `ProvidersSettings` 下方新增 `GlobalDefaultModelCard` 卡片：
```
┌─ Global Default Model ─────────────────────────┐
│  Current: anthropic/claude-sonnet-4-6          │
│  [Configure]                                   │
└────────────────────────────────────────────────┘
```

**交互**：
- 点击 **Configure** 打开模型选择弹窗（复用 `AgentModelModal` 的选择逻辑，抽取为 `ModelSelectorModal`）
- 保存时调用 `PUT /api/agents/default-model`
- 空状态提示："尚未设置全局默认模型"

**后端变更**：
- `electron/utils/agent-config.ts`：新增 `updateDefaultModel(modelRef: string | null)`
  - 写入/清除 `openclaw.json` 的 `agents.defaults.model.primary`
- `electron/api/routes/agents.ts`：新增路由 `PUT /api/agents/default-model`

### 二、Agent 模型分配（二级页面模式）

**位置**：`Models` 页面入口 + 二级视图

**UI 设计**：
在 `Models` 页面新增入口按钮 **"Agent Model Assignments"**，点击进入二级视图（模仿 `BindingManageView`）：

```
Models 页面
├── ProvidersSettings
├── GlobalDefaultModelCard
├── [Agent Model Assignments] ← 按钮
└── Token Usage History
        ↓
AgentModelAssignmentsView（二级页面）
├── Header: ← Back | Agent Model Assignments | [Batch Set]
├── 列表展示所有 Agent:
│   ├─ Agent Name | Current Model | Status
│   └─ [Edit] [Reset to Default]
└── Batch Set Modal
```

**列表字段**：
- Agent 名称
- 当前模型（显示 `modelDisplay`，如 `claude-sonnet-4-6`）
- 状态标签：继承（使用全局默认）/ 已覆盖（Agent 独立设置）
- 操作：编辑（打开模型选择弹窗）、重置为全局默认

**批量操作**：
- 点击 **Batch Set** 打开弹窗，选择模型后应用到所有 Agent
- 支持"全选"和"取消全选"

**后端变更**：
- `electron/utils/agent-config.ts`：新增 `batchUpdateAgentModels(modelRef: string | null)`
  - 遍历 `agents.list`，统一设置/清除 `model` 字段
- `electron/api/routes/agents.ts`：新增路由 `PUT /api/agents/batch-model`

### 三、模型选择弹窗复用

将 `AgentModelModal` 的选择逻辑抽取为共享组件 `ModelSelectorModal`：
- Props: `defaultModelRef`, `onSave`, `onClose`
- 复用 `buildRuntimeProviderOptions`、`splitModelRef`
- 支持"使用全局默认"快捷按钮

### 四、优先级链展示

在 Models 页面顶部增加说明：
```
模型选择优先级：Agent 独立模型 → 全局默认模型 → Provider Account 默认模型
```

## 数据流

```
前端                          后端
│                              │
├─ GET /api/agents ───────────►├─ readOpenClawConfig()
│  ← AgentsSnapshot            │  ← agents.defaults.model
│                              │
├─ PUT /api/agents/default-model
│  ───────────────────────────►├─ updateDefaultModel()
│  ← AgentsSnapshot            │  → writeOpenClawConfig()
│                              │
├─ PUT /api/agents/batch-model
│  ───────────────────────────►├─ batchUpdateAgentModels()
│  ← AgentsSnapshot            │  → writeOpenClawConfig()
```

## 涉及文件清单

### 后端
| 文件 | 变更 |
|---|---|
| `electron/utils/agent-config.ts` | 新增 `updateDefaultModel`、`batchUpdateAgentModels` |
| `electron/api/routes/agents.ts` | 新增 `PUT /api/agents/default-model`、`PUT /api/agents/batch-model` |

### 前端
| 文件 | 变更 |
|---|---|
| `src/stores/agents.ts` | 新增 `updateDefaultModel`、`batchUpdateAgentModels` actions |
| `src/components/models/ModelSelectorModal.tsx` | 新增（抽取自 `AgentModelModal`） |
| `src/components/models/AgentModelAssignmentsView.tsx` | 新增（二级页面） |
| `src/pages/Models/index.tsx` | 新增 `GlobalDefaultModelCard` 和入口按钮 |
| `src/pages/Agents/index.tsx` | 将 `AgentModelModal` 替换为复用 `ModelSelectorModal` |

## 复用策略

- `buildRuntimeProviderOptions` / `splitModelRef` — 直接使用
- `AgentModelModal` UI 逻辑 → 抽取为 `ModelSelectorModal`
- `BindingManageView` 模式 → 参考实现 `AgentModelAssignmentsView`
- i18n key 命名遵循现有 `channels.json` / `agents.json` 模式

## 测试计划

1. 设置全局默认模型 → 验证 `openclaw.json` 写入正确
2. 为单个 Agent 设置覆盖模型 → 验证 `agents.list[].model` 写入正确
3. 批量设置 Agent 模型 → 验证所有 Agent 模型统一变更
4. 重置 Agent 模型为全局默认 → 验证 `model` 字段被清除
5. 刷新页面 → 验证状态正确恢复
