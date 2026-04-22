# Phase 5 — 集成测试与内核打包执行方案

## 一、目标

将已开发的所有模块（内核引擎、Electron 扩展、前端 UI）联调为完整可用的产品，并实现可分发打包。

## 二、任务分解

### 2.1 前端内核通信层

- **kernel-client.ts** — 前端 WebSocket 客户端，连接 Electron Main Process 代理的内核
- **marketplace store** — 广场状态管理，从 IPC 获取 Agent 列表
- **AgentChat store** — 对话状态管理，流式消息接收

### 2.2 Electron 通信桥接完善

- **内核启动触发** — 首次雇佣 Agent 时自动启动内核
- **请求-响应关联** — IPC 调用需要等待内核返回对应响应
- **事件转发** — 内核流式事件通过 IPC 转发到前端

### 2.3 内核打包

- **esbuild bundle** — 将内核打包为单文件
- **Node.js SEA** — 打包为独立可执行二进制
- **资源复制** — 将加密 Agent 包复制到构建输出

### 2.4 Electron Builder 集成

- **extraResources** — 配置 electron-builder 打包内核二进制和 Agent 包
- **开发模式** — 使用 tsx/ts-node 直接运行内核源码

### 2.5 端到端联调

1. 启动 ClawX
2. 导航到 Agent 广场
3. 浏览 Agent 列表
4. 点击"雇佣"
5. 内核进程自动启动
6. 跳转到 Agent 对话页
7. 发送消息
8. 内核执行 ReAct 循环
9. 流式返回响应

## 三、关键实现点

### 3.1 前端 Kernel Client

前端不直接连接内核 WS（避免 CORS/安全），而是通过 Electron IPC 桥接：

```
Renderer → IPC invoke → Main Process → WS → Kernel Process
Renderer ← IPC on event ← Main Process ← WS ← Kernel Process
```

### 3.2 IPC 请求-响应关联

使用 requestId 关联请求和响应：

```typescript
// Main Process
const pendingRequests = new Map<string, { resolve, reject }>();

function sendRequest(type, data) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingRequests.set(requestId, { resolve });
    kernelLauncher.send({ ...data, requestId });
  });
}

// 收到内核响应时
function onKernelEvent(event) {
  if (event.requestId && pendingRequests.has(event.requestId)) {
    pendingRequests.get(event.requestId).resolve(event);
    pendingRequests.delete(event.requestId);
  }
}
```

### 3.3 流式事件转发

对于对话请求（chat.send），响应是多个 delta 事件：

```typescript
// Main Process
ipcMain.on('kernel:subscribe', (event, sessionId) => {
  const listener = (kernelEvent) => {
    if (kernelEvent.sessionId === sessionId) {
      event.sender.send('kernel:event', kernelEvent);
    }
  };
  kernelLauncher.onEvent(listener);
});
```

### 3.4 内核打包方案

**开发模式**：使用 Node.js 直接运行内核源码（`ts-node` 或 `tsx`）
**生产模式**：使用 `esbuild` 打包为单 JS 文件，再用 `pkg` 或 Node.js SEA 打包为二进制

```bash
# 开发
npx tsx kernel/src/main.ts

# 生产打包
npx esbuild kernel/src/main.ts --bundle --platform=node --outfile=dist/kernel.js
# 然后使用 pkg 或 Node.js SEA 打包为二进制
```

## 四、验收标准

| # | 验收项 | 标准 |
|---|--------|------|
| 1 | Agent 广场显示 | 页面加载后显示至少 2 个 Agent 卡片 |
| 2 | 雇佣 Agent | 点击"雇佣"后，内核进程启动成功 |
| 3 | Agent 对话 | 跳转到对话页面，显示 Agent 身份信息 |
| 4 | 消息发送 | 用户输入消息后，Agent 有响应（模拟或真实） |
| 5 | 类型检查 | `pnpm run typecheck` 无错误 |
| 6 | 构建成功 | `pnpm run build:vite` 无错误 |

## 五、风险与应对

| 风险 | 应对 |
|------|------|
| 内核依赖打包问题 | 使用 esbuild external 排除 native 模块 |
| IPC 通信延迟 | 使用本地 WS，延迟 < 5ms |
| 内核崩溃影响主应用 | 独立进程 + supervisor 自动重启 |
| Agent 配置过大 | 仅加载用户雇佣的 Agent，按需解密 |
