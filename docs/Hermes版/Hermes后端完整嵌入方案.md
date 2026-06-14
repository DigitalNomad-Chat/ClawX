# ClawDock Hermes 后端完整嵌入方案

> 版本：v1.1
> 制定时间：2026-05-19
> 目标：将 hermes-web-ui 后端（Koa Server + Socket.IO）完整嵌入 ClawDock，替代当前不成熟的适配层
> 基准分支：`refactor/rename-to-clawdock`（72个文件已改动，+1820/-2725行）

---

## 一、背景与目标

### 1.1 当前问题

当前 `refactor/rename-to-clawdock` 分支的 Hermes 适配层存在架构性缺陷：

| 问题 | 说明 |
|------|------|
| 缺少中间编排层 | 前端 `chat.ts`（2853行）被迫承担后端工作（SSE解析、会话管理、端口路由） |
| 端口管理不完善 | `getGatewayPort()` 直接 fallback 到 8642，多 Profile 时路由错误 |
| 无会话持久化 | 依赖内存状态和轮询，无 SQLite 持久化层 |
| 无上下文压缩 | 长会话无自动压缩机制 |
| 无 Usage 统计 | 无法统计 token 消耗和 cost |
| 工具调用未转换 | Gateway 的 tool call 事件未映射为前端可展示的事件 |
| 新旧代码混杂 | `main/index.ts` 和 `ipc-handlers.ts` 中旧 `GatewayManager` 与新 `HermesGatewayManager` 并存 |

### 1.2 当前分支已有改动盘点

`refactor/rename-to-clawdock` 分支已有 **72 个文件改动**（+1820 / -2725 行），其中大量工作可在嵌入方案中复用：

**可直接复用（无需重做）：**

| 类别 | 文件 | 说明 |
|------|------|------|
| i18n | 32 个翻译文件（en/ja/ru/zh × 8 命名空间） | OpenClaw→ClawDock 文案已全部更新 |
| 前端 UI | `Setup`, `Skills`, `Dreams`, `Settings`, `Marketplace` 页面 | 文案、检测逻辑、路径适配已完成 |
| 类型定义 | `src/types/agent.ts`, `skill.ts`, `gateway.ts` | gatewayState、skillSource 等字段已扩展 |
| 基础设施 | `src/lib/api-client.ts`, `channel-alias.ts` | client ID 已改、通用化命名已完成 |
| Store 适配 | `src/stores/gateway.ts`, `channels.ts`, `skills.ts` | HTTP API 调用模式已就绪，只需改 base URL |

**需要清理（不成熟适配层）：**

| 文件 | 内容 | 嵌入方案中的命运 |
|------|------|----------------|
| `electron/hermes/cli.ts` | ~350行 CLI 封装 | **删除** — 由 Hermes Server 自带 |
| `electron/hermes/config.ts` | ~300行 YAML 配置读写 | **删除** — 由 Hermes Server 自带 |
| `electron/hermes/gateway/manager.ts` | ~250行 多 Profile Gateway 管理 | **删除** — 由 Hermes Server 自带 |
| `electron/api/routes/profiles.ts` | ~200行 Profile API 路由 | **删除** — 由 Hermes Server 自带 |
| `electron/api/routes/platforms.ts` | ~180行 Platform API 路由 | **删除** — 由 Hermes Server 自带 |
| `electron/api/routes/gateway.ts` | Hermes SSE 代理 | **删除 Hermes 相关代码**，保留 OpenClaw 兼容直到迁移完成 |
| `src/stores/chat.ts` | SSE 消费适配 | **重写** — 与 Socket.IO 方案不兼容，但事件映射逻辑可复用 |

**结论**：从当前分支切新分支比从 `main` 切更优。净节省约 1 天（i18n + UI 文案无需重做），额外代价只是删除 ~900 行不成熟代码（1 天内完成）。

### 1.3 分支策略

```bash
# 从当前分支切新分支
git checkout -b feat/hermes-embedded

# refactor/rename-to-clawdock 保留作为备份
# 后续 feat/hermes-embedded 稳定后合并回 refactor/rename-to-clawdock
```

### 1.4 目标

将 hermes-web-ui 的成熟后端完整嵌入 ClawDock：
- 复用其 **Koa HTTP Server**（123个文件，成熟的路由和中间件）
- 复用其 **Socket.IO 实时通信**（`/chat-run` namespace）
- 复用其 **SQLite 持久化层**（会话、消息、usage、群聊）
- 复用其 **Gateway 生命周期管理**（PID检测、端口分配、健康检查）
- 复用其 **上下文压缩和 token 估算**
- 保留 ClawDock 的 Electron 特有功能（文件系统、系统托盘、密钥链、设置等）

---

## 二、架构总览

### 2.1 嵌入后架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ClawDock Desktop App                              │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │              Electron Main Process                                │   │
│  │                                                                   │   │
│  │  ┌─────────────────────┐    ┌─────────────────────────────────┐ │   │
│  │  │  Host API Server    │    │  Hermes Server (Koa)            │ │   │
│  │  │  http://:13210      │    │  http://:8648                   │ │   │
│  │  │  (原生 http)         │    │  (Koa + Socket.IO)              │ │   │
│  │  │                     │    │                                 │ │   │
│  │  │  • 文件系统操作      │    │  • Socket.IO /chat-run          │ │   │
│  │  │  • 系统设置          │    │  • HTTP REST API                │ │   │
│  │  │  • 密钥链访问        │    │  • Gateway 生命周期管理          │ │   │
│  │  │  • 系统托盘          │    │  • Session/Conversation DB      │ │   │
│  │  │  • 窗口管理          │    │  • Usage 统计                   │ │   │
│  │  │  • 自动更新          │    │  • 上下文压缩                   │ │   │
│  │  │  • 扩展系统          │    │  • 群聊                         │ │   │
│  │  │                     │    │  • Terminal/Kanban WebSocket    │ │   │
│  │  └─────────────────────┘    └─────────────────────────────────┘ │   │
│  │                                                                   │   │
│  │  共享资源：                                                        │   │
│  │  • SQLite DB（~/.clawdock/hermes-server/state.db）               │   │
│  │  • 日志（~/.clawdock/hermes-server/logs/）                        │   │
│  │  • 上传目录（~/.clawdock/hermes-server/upload/）                  │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                │                                         │
│                                │ IPC                                     │
│                                ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │              React Renderer Process                               │   │
│  │                                                                   │   │
│  │  • HTTP fetch → Host API (:13210)  [Electron功能]                │   │
│  │  • HTTP fetch → Hermes Server (:8648) [AI功能]                   │   │
│  │  • Socket.IO → Hermes Server (:8648) [实时聊天]                   │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 服务器职责划分

| 功能 | Host API (:13210) | Hermes Server (:8648) |
|------|-------------------|----------------------|
| 文件系统（读/写/拖放） | ✅ | ❌ |
| 系统设置（electron-store） | ✅ | ❌ |
| 密钥链（API key 安全存储） | ✅ | ❌（从 .env 读取） |
| 系统托盘/通知 | ✅ | ❌ |
| 窗口管理 | ✅ | ❌ |
| 自动更新 | ✅ | ❌ |
| 扩展系统 | ✅ | ❌ |
| Provider 配置 | ✅ 为主 | 同步到 .env |
| **聊天对话** | ❌ | ✅ Socket.IO |
| **Session 管理** | ❌ | ✅ SQLite |
| **Gateway 生命周期** | ❌ | ✅ GatewayManager |
| **Usage 统计** | ❌ | ✅ |
| **Skills 管理** | 部分 | 运行时查询 |
| **Cron/Job 管理** | ❌ | ✅ |
| **群聊** | ❌ | ✅ |
| **Terminal** | ❌ | ✅ WebSocket |
| **Kanban** | ❌ | ✅ WebSocket |

---

## 三、实施阶段

### Phase 1: 代码移植与基础设施（预计 3-4 天）

**目标**：将 hermes-web-ui 后端代码引入 ClawDock，确保 TypeScript 编译通过。

#### 3.1.1 目录结构规划

```
ClawDock/
├── electron/                     # Electron Main Process（现有）
│   ├── main/                    # 主进程入口
│   ├── api/                     # Host API（保留，精简）
│   ├── preload/                 # IPC bridge
│   └── ...                      # 其他现有模块
│
├── server/                       # 【新增】hermes-web-ui 后端
│   ├── src/
│   │   ├── index.ts             # 启动入口（适配 Electron 环境）
│   │   ├── config.ts            # 配置（路径改为 userData）
│   │   ├── db/
│   │   │   ├── index.ts         # SQLite 连接（路径适配）
│   │   │   └── hermes/          # 所有表定义和存储
│   │   ├── routes/
│   │   │   ├── index.ts         # Koa 路由注册
│   │   │   ├── hermes/          # 所有 Hermes API 路由
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── hermes/          # GatewayManager, ChatRunSocket, GroupChat
│   │   │   ├── logger.ts        # 日志（路径适配）
│   │   │   └── ...
│   │   └── lib/                 # 工具库
│   ├── tsconfig.json
│   └── package.json             # 【新增】server 子包（可选）
│
├── src/                          # React Renderer Process（现有）
│   ├── lib/
│   │   ├── api-client.ts        # 现有 Host API 客户端
│   │   ├── hermes-api.ts        # 【新增】Hermes Server 客户端
│   │   └── ...
│   ├── stores/                   # Zustand stores（逐步迁移）
│   └── pages/                    # 页面组件
│
└── package.json                  # 合并依赖
```

#### 3.1.2 代码复制

将 hermes-web-ui `packages/server/src/` 下的所有文件复制到 ClawDock `server/src/` 目录：

| 来源 | 目标 | 说明 |
|------|------|------|
| `packages/server/src/index.ts` | `server/src/index.ts` | 启动入口，需适配 Electron |
| `packages/server/src/config.ts` | `server/src/config.ts` | 路径改为 userData |
| `packages/server/src/db/` | `server/src/db/` | 数据库路径适配 |
| `packages/server/src/routes/` | `server/src/routes/` | 路由文件 |
| `packages/server/src/services/` | `server/src/services/` | 服务层 |
| `packages/server/src/lib/` | `server/src/lib/` | 工具库 |
| `packages/server/src/controllers/` | `server/src/controllers/` | 控制器 |
| `packages/server/src/shared/` | `server/src/shared/` | 共享类型 |

#### 3.1.3 依赖合并

将 hermes-web-ui 的依赖添加到 ClawDock 的 `package.json`：

**dependencies 新增：**
```json
{
  "eventsource": "^4.1.0",
  "js-tiktoken": "^1.0.21",
  "node-edge-tts": "^1.2.10",
  "node-pty": "^1.1.0",
  "socket.io": "^4.8.3"
}
```

**devDependencies 新增：**
```json
{
  "@koa/bodyparser": "^5.0.0",
  "@koa/cors": "^5.0.0",
  "@koa/router": "^15.4.0",
  "@types/eventsource": "^1.1.15",
  "@types/js-yaml": "^4.0.9",
  "@types/koa": "^2.15.0",
  "@types/koa__cors": "^5.0.0",
  "@types/koa__router": "^12.0.5",
  "@types/koa-send": "^4.1.6",
  "@types/koa-static": "^4.0.4",
  "@types/markdown-it": "^14.1.2",
  "@types/qrcode": "^1.5.6",
  "@xterm/addon-fit": "^0.11.0",
  "@xterm/addon-web-links": "^0.12.0",
  "@xterm/xterm": "^6.0.0",
  "koa": "^2.15.3",
  "koa-send": "^5.0.1",
  "koa-static": "^5.0.0",
  "markdown-it": "^14.1.1",
  "mermaid": "^11.14.0",
  "pino": "^10.3.1",
  "pino-pretty": "^13.1.3",
  "qrcode": "^1.5.4",
  "ts-node": "^10.9.2",
  "tsoa": "^7.0.0-alpha.0"
}
```

> **注意**：以下依赖已存在于 ClawDock，无需重复添加：
> `js-yaml`, `typescript`, `vite`, `vitest`, `ws`, `@types/ws`, `@types/node`, `monaco-editor`

#### 3.1.4 路径配置适配

修改 `server/src/config.ts`：

```typescript
import { app } from 'electron';  // 在 Electron 环境中

const userDataDir = app.getPath('userData');
export const HERMES_SERVER_HOME = join(userDataDir, 'hermes-server');

export const config = {
  port: parseInt(process.env.HERMES_PORT || '8648', 10),
  host: '127.0.0.1',  // 仅监听本地，不暴露到网络
  appHome: HERMES_SERVER_HOME,
  uploadDir: join(HERMES_SERVER_HOME, 'upload'),
  dataDir: join(HERMES_SERVER_HOME, 'data'),
  corsOrigins: '*',  // 本地开发允许所有
};
```

修改 `server/src/db/index.ts`：

```typescript
const DB_DIR = config.appHome;  // 使用 userData/hermes-server/
const DB_PATH = resolve(DB_DIR, 'state.db');
```

修改 `server/src/services/logger.ts`：

```typescript
const logDir = resolve(config.appHome, 'logs');
```

#### 3.1.5 Electron Main 启动集成

在 `electron/main/index.ts` 的 `initialize()` 函数中添加 Hermes Server 启动：

```typescript
import { bootstrapHermesServer, shutdownHermesServer } from '../../../server/src/index';

let hermesServer: { close: () => Promise<void> } | null = null;

// 在 app.whenReady() 的 initialize() 中：
async function initialize() {
  // ... 现有初始化代码 ...
  
  // 启动 Hermes Server
  try {
    hermesServer = await bootstrapHermesServer();
    logger.info('Hermes Server started on http://127.0.0.1:8648');
  } catch (error) {
    logger.error('Failed to start Hermes Server:', error);
    // 非致命错误，继续启动应用
  }
  
  // ... 其余初始化 ...
}

// 在 app.on('before-quit') 中：
app.on('before-quit', async (event) => {
  // ... 现有清理代码 ...
  
  // 关闭 Hermes Server
  if (hermesServer) {
    try {
      await hermesServer.close();
      logger.info('Hermes Server shut down gracefully');
    } catch (err) {
      logger.warn('Hermes Server shutdown error:', err);
    }
  }
});
```

需要修改 `server/src/index.ts` 的 `bootstrap()` 函数：
- 移除 `process.on('uncaughtException')` 中的 `process.exit(1)`（在 Electron 中不能退出主进程）
- 移除 `process.on('unhandledRejection')` 中的 `process.exit(1)`
- 返回 `{ close: () => Promise<void> }` 供 Electron 调用
- 适配 `__dirname` 路径（Electron 打包后路径不同）

#### 3.1.6 TypeScript 配置

新增 `server/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*.ts"]
}
```

更新根目录 `tsconfig.json`，将 `server/src` 纳入 `include`：

```json
{
  "include": [
    "src/**/*",
    "electron/**/*",
    "server/src/**/*"
  ]
}
```

> 或者保持 server 独立的 tsconfig，不参与前端编译。

#### 3.1.7 清理不成熟适配层（当前分支特有）

在复制 Hermes Server 代码之前，先删除当前分支中不成熟的适配代码，避免冲突：

**删除文件：**
```bash
electron/hermes/cli.ts
electron/hermes/config.ts
electron/hermes/gateway/manager.ts
# electron/hermes/ 目录此时应为空，可删除目录
electron/api/routes/profiles.ts
electron/api/routes/platforms.ts
```

**回退/修改文件：**
```bash
electron/api/routes/gateway.ts    # 删除 Hermes SSE 代理代码，保留 OpenClaw 兼容
electron/api/context.ts           # 移除 hermesGatewayManager 字段
electron/main/index.ts            # 移除 HermesGatewayManager 初始化和事件桥接
electron/main/ipc-handlers.ts     # 移除 Hermes IPC handler
```

**编译验证：**
```bash
pnpm typecheck
```
确保删除后编译仍通过（OpenClaw 相关代码暂时保留）。

#### 3.1.8 构建脚本调整

更新 `package.json` scripts：

```json
{
  "dev": "vite",
  "dev:server": "ts-node server/src/index.ts",
  "build:server": "node scripts/build-hermes-server.mjs",
  "build": "node scripts/generate-ext-bridge.mjs && pnpm run build:vite && pnpm run build:server && ..."
}
```

新增 `scripts/build-hermes-server.mjs`（参考 hermes-web-ui 的 build-server.mjs）：

```javascript
import * as esbuild from 'esbuild';
import { resolve } from 'path';

await esbuild.build({
  entryPoints: [resolve('server/src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node23',
  format: 'cjs',
  outfile: resolve('dist-hermes-server/index.js'),
  external: ['node-pty', 'node:sqlite', 'socket.io', 'electron'],
  sourcemap: true,
  minify: true,
});
```

> **注意**：`electron` 必须 external，不能在 server bundle 中打包。

---

### Phase 2: 前端 API 客户端适配（预计 2-3 天）

**目标**：让 ClawDock 前端能够调用 Hermes Server 的 API。

#### 3.2.1 新增 Hermes API 客户端

创建 `src/lib/hermes-api.ts`：

```typescript
/**
 * Hermes Server API Client
 * Communicates with the embedded hermes-web-ui Koa server.
 */

const HERMES_BASE = 'http://127.0.0.1:8648';

// Token is fetched from Hermes Server startup or stored in config
let cachedHermesToken: string | null = null;

export async function getHermesToken(): Promise<string> {
  if (cachedHermesToken) return cachedHermesToken;
  // In development, token is auto-generated by server
  // We can fetch it via IPC from main process
  cachedHermesToken = await window.electronAPI?.getHermesToken?.() || '';
  return cachedHermesToken;
}

export async function hermesFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getHermesToken();
  const response = await fetch(`${HERMES_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// SSE stream helper
export async function hermesSseFetch(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const token = await getHermesToken();
  const response = await fetch(`${HERMES_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  // SSE parsing logic...
}
```

#### 3.2.2 Socket.IO 客户端连接

安装 `socket.io-client`：

```bash
pnpm add socket.io-client
pnpm add -D @types/socket.io-client
```

创建 `src/lib/hermes-socket.ts`：

```typescript
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getHermesSocket(): Socket {
  if (!socket) {
    socket = io('http://127.0.0.1:8648/chat-run', {
      auth: { token: '' },  // token populated after auth
    });
  }
  return socket;
}

export function disconnectHermesSocket(): void {
  socket?.disconnect();
  socket = null;
}
```

#### 3.2.3 获取 Hermes Token 的 IPC 通道

在 `electron/main/ipc-handlers.ts` 中新增：

```typescript
ipcMain.handle('hermes:getToken', async () => {
  // Read token from Hermes Server's auth file or memory
  // Hermes Server stores token at: userData/hermes-server/auth.json
  // Or we can pass it from the bootstrap function
  return hermesServerToken;  // stored in main process
});
```

在 `electron/preload/index.ts` 中暴露：

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing APIs ...
  getHermesToken: () => ipcRenderer.invoke('hermes:getToken'),
});
```

---

### Phase 3: Chat 功能迁移（预计 3-4 天）

**目标**：将 Chat 页面从 SSE 模式迁移到 Socket.IO 模式，复用 hermes-web-ui 的聊天能力。

#### 3.3.1 Chat Store 重写

当前 `src/stores/chat.ts`（2853行）需要大幅简化。核心变化：

| 功能 | 当前实现 | 新实现 |
|------|---------|--------|
| 发送消息 | `fetch('/api/chat/send')` + SSE `consumeChatSse` | Socket.IO `socket.emit('run', {...})` |
| 接收消息 | 手动解析 SSE 事件 | Socket.IO 事件：`run.started`, `message.delta`, `tool.started`, `tool.completed`, `run.completed` |
| 历史加载 | `hostApiFetch('/api/chat/history')` | `hermesFetch('/api/hermes/sessions/...')` |
| 会话列表 | `hostApiFetch('/api/sessions')` | `hermesFetch('/api/hermes/sessions')` |
| 中断运行 | `hostApiFetch('/api/chat/abort')` | `socket.emit('abort', {...})` |

新建 `src/stores/hermes-chat.ts`：

```typescript
import { create } from 'zustand';
import { getHermesSocket } from '@/lib/hermes-socket';
import { hermesFetch } from '@/lib/hermes-api';

interface HermesChatState {
  messages: Message[];
  sessions: Session[];
  sending: boolean;
  error: string | null;
  currentSessionId: string | null;
  
  // Actions
  loadSessions: () => Promise<void>;
  loadHistory: (sessionId: string) => Promise<void>;
  sendMessage: (text: string, sessionId?: string) => void;
  abortRun: (sessionId: string) => void;
}

export const useHermesChatStore = create<HermesChatState>((set, get) => ({
  // ... state
  
  sendMessage: (text, sessionId) => {
    const socket = getHermesSocket();
    const sid = sessionId || get().currentSessionId;
    
    set({ sending: true, error: null });
    
    socket.emit('run', {
      input: text,
      session_id: sid,
      model: undefined,  // use default
      instructions: undefined,
    });
  },
  
  // Socket event listeners registered on init
}));
```

#### 3.3.2 Socket 事件监听

在 `src/stores/hermes-chat.ts` 中注册 Socket.IO 事件：

```typescript
function setupSocketListeners(socket: Socket, set: any, get: any) {
  socket.on('run.started', (payload) => {
    set({ sending: true });
  });
  
  socket.on('message.delta', (payload) => {
    const { delta } = payload;
    set((state) => ({
      streamingText: (state.streamingText || '') + delta,
    }));
  });
  
  socket.on('tool.started', (payload) => {
    // Show tool call in UI
  });
  
  socket.on('tool.completed', (payload) => {
    // Show tool result
  });
  
  socket.on('run.completed', (payload) => {
    set({ sending: false, streamingText: '' });
    // Trigger history reload
  });
  
  socket.on('run.failed', (payload) => {
    set({ sending: false, error: payload.error });
  });
}
```

#### 3.3.3 保留现有 Chat Store 的兼容层

为了最小化前端页面改动，可以保留 `useChatStore` 的接口，但内部实现改为调用 Hermes：

```typescript
// src/stores/chat.ts - 适配层
export const useChatStore = create<ChatState>((set, get) => {
  const hermesStore = useHermesChatStore.getState();
  
  return {
    // 委托给 hermes store
    messages: hermesStore.messages,
    sending: hermesStore.sending,
    error: hermesStore.error,
    
    sendMessage: (text, attachments, targetAgentId) => {
      const sessionKey = resolveMainSessionKeyForAgent(targetAgentId);
      const sessionId = sessionKey.replace('agent:', '').replace(':main', '');
      hermesStore.sendMessage(text, sessionId);
    },
    
    // ... 其他方法适配
  };
});
```

#### 3.3.4 Chat 页面组件适配

Chat 页面组件 (`src/pages/Chat/index.tsx`, `ChatMessage.tsx`, `ChatInput.tsx`) 当前已经使用 `useChatStore`，如果适配层做得好，页面组件改动最小。

需要确认的事件格式映射：

| Hermes 事件 | ClawDock 期望 | 处理 |
|------------|--------------|------|
| `run.started` | `state: 'started'` | ✅ 直接映射 |
| `message.delta` | `state: 'delta'` | ✅ 直接映射 |
| `tool.started` | 工具调用开始 | ✅ 新增展示 |
| `tool.completed` | 工具调用完成 | ✅ 新增展示 |
| `run.completed` | `state: 'final'` | ✅ 直接映射 |
| `run.failed` | `state: 'error'` | ✅ 直接映射 |

---

### Phase 4: 其他功能页面迁移（预计 2-4 天）

**目标**：将 Agents、Channels、Skills、Cron、Models、Settings 等页面的数据层迁移到 Hermes Server。

**时间减少原因**：当前分支已完成的 i18n 翻译（32 个文件）和 UI 文案适配（Setup、Skills、Dreams、Settings、Marketplace）可直接复用，无需重做。

#### 3.4.1 Agents/Profiles 页面

当前 ClawDock 的 Agents 页面显示 "Agent" 列表，底层是 Hermes Profile。

迁移方案：
- 后端：使用 Hermes Server 的 `/api/hermes/profiles` API
- 前端：保留 "Agent" UI 概念，数据加载改为 `hermesFetch('/api/hermes/profiles')`
- 字段映射：Profile → Agent, platform → channel

#### 3.4.2 Channels/Platforms 页面

当前 ClawDock 的 Channels 页面显示平台配置。

迁移方案：
- 后端：使用 Hermes Server 的 `/api/hermes/config` 和 platform 路由
- 前端：保留 "Channel" UI 概念
- Secrets 管理：Hermes Server 自动处理 `.env` 和 `config.yaml` 分离

#### 3.4.3 Skills 页面

当前已完成 Skills HTTP API 适配。

迁移方案：
- 后端：使用 Hermes Server 的 `/api/hermes/skills` API
- 前端：基本无需改动，只需改 API 基础地址

#### 3.4.4 Cron/Jobs 页面

迁移方案：
- 后端：使用 Hermes Server 的 `/api/hermes/jobs` API
- 前端：改 API 调用地址

#### 3.4.5 Models 页面

迁移方案：
- 后端：使用 Hermes Server 的 `/api/hermes/models` API
- 前端：改 API 调用地址

#### 3.4.6 Settings 页面

Settings 分为两部分：
- **ClawDock 特有设置**：保留在 Host API（主题、语言、启动项、代理等）
- **Hermes 相关设置**：调用 Hermes Server API（Provider、Model、Profile 配置等）

#### 3.4.7 Dashboard/Usage 统计

Hermes Server 提供完善的 usage API：
- `GET /api/hermes/sessions/:id/usage`
- `GET /api/hermes/sessions/usage/stats?days=30`

前端 Dashboard 可以复用这些数据。

---

### Phase 5: Host API 精简与清理（预计 2-3 天）

**目标**：清理不再需要的适配代码，精简 Host API 到仅保留 Electron 特有功能。

#### 3.5.1 删除当前失败的 Hermes 适配层

删除以下文件：
- `electron/hermes/cli.ts`
- `electron/hermes/config.ts`
- `electron/hermes/gateway/manager.ts`
- `electron/api/routes/profiles.ts`（新写的 Profile 路由）
- `electron/api/routes/platforms.ts`（新写的 Platform 路由）
- `electron/api/routes/gateway.ts` 中的 Hermes 相关代码（保留 OpenClaw Gateway 兼容直到完全迁移）

#### 3.5.2 清理旧 OpenClaw 代码

在确认 Hermes Server 运行稳定后，删除：
- `electron/gateway/manager.ts` 及整个 `gateway/` 目录（旧 OpenClaw GatewayManager）
- `electron/api/routes/agents.ts`（已删除）
- `electron/api/routes/channels.ts`（待 diagnostics 解耦后）
- `electron/utils/openclaw-*.ts` 系列文件
- `electron/api/routes/` 中与 OpenClaw 相关的路由

#### 3.5.3 精简 Host API 路由

保留以下 Host API 路由（Electron 特有功能）：
- `handleAppRoutes`：应用信息、版本、系统状态
- `handleSettingsRoutes`：ClawDock 设置（主题、语言、启动项等）
- `handleFileRoutes`：文件上传/下载/预览
- `handleLogRoutes`：日志读取
- `handleDiagnosticsRoutes`：诊断信息（适配到 Hermes）
- `handleUsageRoutes`：可改为代理到 Hermes Server
- 扩展系统路由

移除以下路由（由 Hermes Server 接管）：
- Profile/Agent CRUD
- Platform/Channel CRUD
- Chat 发送/历史
- Gateway 状态/控制
- Session 管理
- Skills 运行时查询
- Cron/Job 管理
- Model 管理

---

### Phase 6: 构建与打包调整（预计 2-3 天）

**目标**：确保开发模式和生产模式都能正确构建和运行。

#### 3.6.1 开发模式

```bash
# 方式一：同时启动（推荐）
pnpm dev
# - Vite dev server (renderer)
# - Host API Server (main process)
# - Hermes Server (main process 内)

# 方式二：独立启动 Hermes Server（调试用）
pnpm dev:server
```

#### 3.6.2 生产构建

```bash
pnpm build
# 1. 构建 renderer (Vite)
# 2. 构建 main process (Vite + electron plugin)
# 3. 构建 Hermes Server (esbuild)
# 4. 打包 Electron 应用 (electron-builder)
```

#### 3.6.3 Electron Builder 配置

更新 `electron-builder.yml`：

```yaml
extraResources:
  - from: "dist-hermes-server"
    to: "hermes-server"
    filter: ["**/*"]
```

在生产环境中，Hermes Server 从 `process.resourcesPath/hermes-server/index.js` 加载。

#### 3.6.4 启动脚本适配

修改 `electron/main/index.ts` 中的 Hermes Server 启动逻辑：

```typescript
const isDev = !app.isPackaged;
const hermesServerPath = isDev
  ? resolve(__dirname, '../../server/src/index.ts')
  : resolve(process.resourcesPath, 'hermes-server/index.js');

if (isDev) {
  // 开发模式：使用 ts-node 或 tsx
  hermesServer = await import(hermesServerPath).then(m => m.bootstrapHermesServer());
} else {
  // 生产模式：require bundled JS
  hermesServer = require(hermesServerPath).bootstrapHermesServer();
}
```

---

### Phase 7: 测试与验证（预计 2-3 天）

#### 3.7.1 冒烟测试 Checklist

- [ ] 应用启动后 Hermes Server 自动启动
- [ ] `GET /health` 返回正常
- [ ] `GET /api/hermes/profiles` 返回 Profile 列表
- [ ] 聊天页面发送消息，Socket.IO 事件正常接收
- [ ] 工具调用正确展示（开始/完成）
- [ ] 会话历史正确加载和分页
- [ ] Usage 统计正确显示
- [ ] Gateway 启动/停止/重启工作正常
- [ ] 多 Profile Gateway 端口分配正确
- [ ] 文件上传/下载正常
- [ ] Settings 页面 ClawDock 设置和 Hermes 设置都能保存
- [ ] 系统托盘、自动启动、快捷键等功能正常
- [ ] 生产构建成功，打包后的应用正常运行

#### 3.7.2 性能测试

- [ ] 长会话（>100条消息）加载性能
- [ ] 上下文压缩触发时性能
- [ ] 多 Profile 并发 Gateway 资源占用
- [ ] 内存泄漏检查（Electron + Node.js 双运行时）

#### 3.7.3 回归测试

- [ ] 现有 Host API 功能不受影响
- [ ] 扩展系统正常工作
- [ ] i18n 翻译正常
- [ ] 主题切换正常

---

## 四、前端 API 调用对照表

| ClawDock 页面 | 当前 API | 新 API (Hermes Server) | 状态 |
|--------------|---------|----------------------|------|
| Setup | `/api/app/hermes-status` | `/api/app/hermes-status`（保留在 Host API） | 部分保留 |
| Chat | `POST /api/chat/send` + SSE | Socket.IO `run` event | 迁移 |
| Chat History | `GET /api/chat/history` | `GET /api/hermes/sessions/:id` | 迁移 |
| Sessions | `GET /api/sessions` | `GET /api/hermes/sessions` | 迁移 |
| Agents | `GET /api/agents` | `GET /api/hermes/profiles` | 迁移 |
| Channels | `GET /api/channels` | `GET /api/hermes/config` | 迁移 |
| Skills | `GET /api/skills/status` | `GET /api/hermes/skills` | 迁移 |
| Models | `GET /api/models` | `GET /api/hermes/models` | 迁移 |
| Cron | `GET /api/cron/list` | `GET /api/hermes/jobs` | 迁移 |
| Gateway Status | `GET /api/gateway/status` | `GET /api/hermes/gateways` | 迁移 |
| Gateway Start | `POST /api/gateway/start` | `POST /api/hermes/gateways/:name/start` | 迁移 |
| Usage | `GET /api/usage` | `GET /api/hermes/sessions/usage/stats` | 迁移 |
| Settings (ClawDock) | `GET /api/settings/*` | 保留 Host API | 保留 |
| Files | `POST /api/files/*` | 保留 Host API | 保留 |
| Diagnostics | `GET /api/diagnostics` | 保留 Host API | 保留 |

---

## 五、风险与缓解

### 5.1 依赖冲突

**风险**：hermes-web-ui 使用 Koa + Socket.IO，ClawDock 使用原生 http + ws。两者依赖不同版本的 ws 或其他库可能冲突。

**缓解**：
- 使用 pnpm overrides 统一版本
- 将 server 作为独立子包（workspace）隔离依赖
- 测试时检查 lockfile 是否有冲突

### 5.2 Electron 环境差异

**风险**：hermes-web-ui 设计为独立 Node.js 进程，某些代码在 Electron 环境中可能行为不同（如 `process.exit`、`__dirname`、信号处理等）。

**缓解**：
- 修改 `server/src/index.ts`，移除 `process.exit` 调用
- 使用 `app.getPath('userData')` 替代 `homedir()`
- 信号处理改为 Electron 生命周期事件

### 5.3 两个 HTTP 服务器资源占用

**风险**：同时运行 Host API 和 Hermes Server 可能增加内存和 CPU 占用。

**缓解**：
- Hermes Server 监听 localhost，不对外暴露
- 必要时可将 Hermes Server 的 Koa 应用挂载到 Host API 的 HTTP server 中（如果技术可行）
- 实际上两个服务器的开销都很小（Node.js 轻量级）

### 5.4 Socket.IO CORS 问题

**风险**：Electron renderer 通过 `http://localhost:8648` 连接 Socket.IO 可能遇到 CORS 问题。

**缓解**：
- Hermes Server 的 CORS 配置已允许 `*`（本地开发）
- 生产环境可限制为 `file://` 和 `http://localhost:*`
- Electron 的 `webSecurity: false` 也可解决（不推荐）

### 5.5 前端改动量大

**风险**：所有 Store 和页面组件都需要修改 API 调用。

**缓解**：
- 使用适配层模式（保留现有 store 接口，内部委托给 Hermes）
- 优先迁移核心功能（Chat），其他页面逐步迁移
- 保留旧代码作为 fallback，直到新功能稳定

### 5.6 数据库迁移

**风险**：现有用户的数据（会话、设置等）可能丢失。

**缓解**：
- Hermes Server 使用新的数据库文件（`~/.clawdock/hermes-server/state.db`）
- 旧数据保留在 `~/.clawdock/` 下不删除
- 未来可编写迁移脚本将旧数据导入新数据库
- 会话数据可让用户导出后再导入

---

## 六、回滚方案

1. **代码回滚**：所有变更在 `feat/hermes-embedded` 分支上开发，`refactor/rename-to-clawdock` 分支不受影响。若方案失败，直接切回原分支即可
2. **数据回滚**：Hermes Server 使用独立的数据目录（`~/.clawdock/hermes-server/`），不影响现有 `~/.clawdock/` 下的数据
3. **功能回滚**：通过 feature flag 控制 Hermes Server 启动，可在设置中禁用
4. **中间状态回滚**：每完成一个 Phase 都提交一次，可随时回退到上一个稳定 Phase

---

## 七、里程碑与验收标准

### Milestone 1: Phase 1 完成（代码移植）
- [ ] `server/src/` 目录完整复制
- [ ] TypeScript 编译零错误（`tsc --noEmit`）
- [ ] `pnpm install` 成功，无依赖冲突
- [ ] Electron main 能启动 Hermes Server
- [ ] `GET /health` 返回 200

### Milestone 2: Phase 2-3 完成（Chat 功能）
- [ ] 前端能通过 Socket.IO 发送消息
- [ ] 能接收 `message.delta` 和 `run.completed` 事件
- [ ] 工具调用正确展示
- [ ] 会话历史正确加载
- [ ] 多 Profile 切换正常

### Milestone 3: Phase 4 完成（全功能迁移）
- [ ] 所有页面 API 调用迁移完成
- [ ] Agents/Channels/Skills/Cron/Models 页面数据正常
- [ ] Settings 页面 ClawDock 和 Hermes 设置都能保存
- [ ] Dashboard Usage 统计正常

### Milestone 4: Phase 5-7 完成（清理与发布）
- [ ] 旧适配代码清理完成
- [ ] 生产构建成功
- [ ] 打包后的应用正常运行
- [ ] 冒烟测试全部通过

---

## 八、执行优先级

| 优先级 | 阶段 | 预计时间 | 阻塞项 | 备注 |
|--------|------|----------|--------|------|
| P0 | Phase 1: 代码移植 | 3-4天 | 无 | 含清理当前不成熟适配层 |
| P0 | Phase 2: 前端客户端 | 2-3天 | Phase 1 | |
| P0 | Phase 3: Chat 迁移 | 3-4天 | Phase 2 | |
| P1 | Phase 4: 其他页面 | **2-4天** | Phase 3 | **-1天（i18n/UI文案已做）** |
| P1 | Phase 5: 清理 | 2-3天 | Phase 4 | |
| P2 | Phase 6: 构建调整 | 2-3天 | Phase 5 | |
| P2 | Phase 7: 测试 | 2-3天 | Phase 6 | |

**总预计时间：16-24 天**（相比从 `main` 切节省约 1 天）

---

## 九、附录

### 9.1 hermes-web-ui 后端文件清单

```
packages/server/src/
├── index.ts                          # 启动入口
├── config.ts                         # 配置
├── db/
│   ├── index.ts                      # SQLite/JSON 存储
│   └── hermes/
│       ├── init.ts                   # 初始化
│       ├── schemas.ts                # 表定义
│       ├── sessions-db.ts            # 会话查询
│       ├── session-store.ts          # 会话存储
│       ├── usage-store.ts            # Usage 存储
│       ├── conversations-db.ts       # 对话查询
│       └── compression-snapshot.ts   # 压缩快照
├── routes/
│   ├── index.ts                      # 路由注册
│   ├── health.ts                     # 健康检查
│   ├── webhook.ts                    # Webhook
│   ├── upload.ts                     # 上传
│   ├── update.ts                     # 更新
│   ├── auth.ts                       # 认证
│   └── hermes/                       # Hermes 路由
│       ├── sessions.ts               # 会话
│       ├── profiles.ts               # Profile
│       ├── skills.ts                 # Skills
│       ├── plugins.ts                # 插件
│       ├── memory.ts                 # 记忆
│       ├── models.ts                 # 模型
│       ├── providers.ts              # Provider
│       ├── config.ts                 # 配置
│       ├── logs.ts                   # 日志
│       ├── gateways.ts               # Gateway
│       ├── jobs.ts                   # Cron/Job
│       ├── kanban.ts                 # Kanban
│       ├── group-chat.ts             # 群聊
│       ├── chat-run.ts               # Chat run Socket
│       └── ...
├── services/
│   ├── logger.ts                     # 日志
│   ├── auth.ts                       # 认证
│   ├── login-limiter.ts              # 登录限制
│   ├── shutdown.ts                   # 关机处理
│   ├── gateway-bootstrap.ts          # Gateway 启动
│   ├── hermes/
│   │   ├── gateway-manager.ts        # Gateway 管理器
│   │   ├── hermes-cli.ts             # CLI 封装
│   │   ├── hermes-profile.ts         # Profile 管理
│   │   ├── run-chat/                 # Chat 运行
│   │   │   ├── index.ts              # ChatRunSocket
│   │   │   ├── handle-api-run.ts     # API 运行
│   │   │   ├── handle-bridge-run.ts  # Bridge 运行
│   │   │   ├── response-stream.ts    # 响应流
│   │   │   ├── sse-utils.ts          # SSE 工具
│   │   │   └── ...
│   │   ├── group-chat/               # 群聊
│   │   ├── agent-bridge/             # Agent 桥接
│   │   ├── context-engine/           # 上下文引擎
│   │   └── session-deleter.ts        # 会话删除
│   └── ...
├── lib/
│   ├── llm-json.ts                   # LLM JSON
│   ├── llm-prompt.ts                 # 系统提示
│   └── context-compressor/           # 上下文压缩
├── controllers/                      # 控制器（被路由调用）
└── shared/                           # 共享类型
```

### 9.2 关键接口说明

**Hermes Server Socket.IO 事件（前端需处理）：**

| 事件 | 方向 | 说明 |
|------|------|------|
| `run` | emit | 发送消息 |
| `cancel_queued_run` | emit | 取消排队 |
| `resume` | emit | 恢复会话 |
| `abort` | emit | 中断运行 |
| `approval.respond` | emit | 响应审批 |
| `run.started` | on | 运行开始 |
| `message.delta` | on | 文本增量 |
| `tool.started` | on | 工具调用开始 |
| `tool.completed` | on | 工具调用完成 |
| `run.completed` | on | 运行完成 |
| `run.failed` | on | 运行失败 |
| `run.queued` | on | 排队状态 |
| `approval.resolved` | on | 审批已解决 |
| `session.command` | on | 会话命令响应 |

---

*文档结束*
