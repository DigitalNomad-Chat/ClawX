# 读写空间（Read-Write Workspace）功能设计

## 概述

在 ChatInput 工具栏新增「读写空间」按钮。用户可选择一个本地文件夹作为当前会话的默认文件读写目录，选择后自动向 AI 发送一条一次性指令消息，告知其将文件写入该目录并写入 memory。配置仅在当前会话生效，新会话自动重置。

## 用户故事

1. 用户点击工具栏「读写空间」按钮
2. 弹出选择器，显示两个选项：
   - `{AgentName} Workspace/docs`（快捷选项，定位到 `agent.workspace/docs`）
   - `自定义目录...`（调起系统文件夹选择器）
3. 用户选择后，自动发送一条用户消息给 AI
4. 按钮变为高亮态，tooltip 显示当前路径
5. AI 收到指令后，后续文件操作默认使用该目录
6. 用户可随时点击按钮 → 「清除设置」来重置
7. 新开会话时，状态自动恢复为「未设置」

## UI 设计

### 按钮位置

在 ChatInput 工具栏中，位于 Desensitize（Shield）和 Agent Picker（@）之间插入：

```
📎 🛡️ 📂[读写空间] @ 技能 ⚡ 模型  [发送]
```

### 按钮状态

| 状态 | 图标 | 样式 | Tooltip |
|------|------|------|---------|
| 未设置 | `FolderOpen` | `text-muted-foreground` | "设置读写空间" |
| 已设置 | `FolderOpen` | `text-primary bg-primary/10` | "读写空间: /path/to/dir" |

### Popover 内容

点击按钮后弹出 popover（定位同 Skill Picker）：

```
┌─────────────────────────────┐
│  读写空间                    │
│                              │
│  ┌─ 📂 Agent Workspace/docs ─┐  ← 快捷选项
│  │   ~/.openclaw/agents/.../  │
│  │   workspace/docs           │
│  └────────────────────────────┘
│                              │
│  ┌─ 📂 自定义目录... ─────────┐  ← 调起系统文件夹选择器
│  └────────────────────────────┘
│                              │
│  [清除设置]                   │  ← 仅已设置时显示
└─────────────────────────────┘
```

## 状态管理

### Chat Store

在 `ChatState`（`src/stores/chat/types.ts`）中新增字段：

```ts
// Read-Write Workspace (session-scoped)
rwWorkDir: string | null;
setRwWorkDir: (dir: string | null) => void;
```

在 `src/stores/chat.ts` 中：
- `rwWorkDir` 初始值为 `null`
- `switchSession` / `newSession` 时重置为 `null`
- `setRwWorkDir` 更新值

### ChatInput 读取

`ChatInput` 组件通过 `useChatStore` 读取 `rwWorkDir` 渲染按钮状态。

## 指令消息

选择目录后，以**用户消息**形式发送（用户可见），内容：

```
请将以下目录设置为本次会话的默认读写工作目录。后续文件读写操作默认使用此路径（除非我明确指定其他路径）。请将此设置写入你的 memory 以便会话内持续生效。

目录：{selectedPath}
```

清除设置时，同样发送一条用户消息：

```
请清除之前设置的默认读写工作目录，后续文件读写恢复自由选择路径。请同步更新你的 memory。
```

## 文件夹选择

- **快捷选项**：直接拼接 `agent.workspace + '/docs'`，不调起系统对话框
- **自定义目录**：调用 `invokeIpc('dialog:open', { properties: ['openDirectory'] })`
- 跨平台兼容（macOS / Windows）

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/stores/chat/types.ts` | `ChatState` 新增 `rwWorkDir` / `setRwWorkDir` |
| `src/stores/chat.ts` | 实现状态 + 会话切换重置 |
| `src/pages/Chat/ChatInput.tsx` | 新增按钮 + popover + 选择逻辑 + 指令消息发送 |

## 不涉及

- 不改后端 Gateway
- 不改 Electron IPC handlers
- 不改 Agent 配置文件
- 不做 Agent 级别持久化
