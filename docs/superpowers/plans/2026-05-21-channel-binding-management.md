# 频道绑定管理高级设置 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有频道页面内新增"绑定管理"子视图，支持 peer/accountId/both 三种路由模式 + route/acp 两种绑定类型，并提供未绑定 Agent 置顶提醒和快速绑定功能。

**Architecture:** 在 Channels 页面内通过 `activeView` state 切换两个子视图（`channels` 和 `bindings`）。绑定管理子视图包含：未绑定提醒横幅、绑定关系列表、添加/编辑/删除绑定弹窗。后端扩展 binding 验证逻辑以支持 peer 字段，新增独立 `/api/bindings` CRUD 端点。现有频道页面的行内 `<select>` 快捷绑定保持不变。

**Tech Stack:** React + TypeScript (前端), Electron HTTP API (后端), Zustand (状态), Tailwind + shadcn/ui (样式), react-i18next (国际化)

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/components/channels/BindingManageView.tsx` | 绑定管理子视图：未绑定提醒 + 绑定列表 + 操作入口 |
| `src/components/channels/AddBindingModal.tsx` | 添加/编辑绑定弹窗：表单 + 路由模式切换 + peer/acp 字段 |
| `electron/api/routes/bindings.ts` | 绑定管理独立 API：GET/POST/PUT/DELETE `/api/bindings` |

### 修改文件

| 文件 | 改动说明 |
|------|---------|
| `src/types/channel.ts` | 新增 RoutingMode, BindingType, PeerKind, BindingInfo, BindingRequest 类型 |
| `src/pages/Channels/index.tsx` | 添加 activeView state + 视图切换 + 头部"绑定管理"入口按钮 |
| `electron/utils/agent-config.ts` | 放宽 `isChannelBinding()` 验证，允许 match 包含 peer 字段；新增 binding 序列化/反序列化工具函数 |
| `electron/api/server.ts` | 注册 `handleBindingRoutes` 到路由数组 |
| `src/i18n/locales/zh/channels.json` | 新增绑定管理相关中文文案 |

### 不改动文件

| 文件 | 原因 |
|------|------|
| `App.tsx` | 不新增路由 |
| `src/components/layout/Sidebar.tsx` | 不新增侧边栏入口 |
| `src/components/channels/ChannelConfigModal.tsx` | 频道配置弹窗保持不变 |
| `electron/api/routes/channels.ts` | 现有 PUT/DELETE `/api/channels/binding` 保持不变（向后兼容） |

---

## Chunk 1: 类型定义 + 后端 API

### Task 1: 扩展绑定类型定义

**Files:**
- Modify: `src/types/channel.ts`

- [ ] **Step 1: 在 channel.ts 中新增绑定相关类型**

在文件末尾（`CHANNEL_META` 之前）添加：

```typescript
// ═══ Binding Types ═══

/** 路由模式：决定消息如何匹配到绑定规则 */
export type RoutingMode = 'peer' | 'accountId' | 'both';

/** 绑定类型：标准路由 vs 远程 Agent 协议 */
export type BindingType = 'route' | 'acp';

/** Peer 类型：私聊 vs 群聊（仅 peer/both 模式） */
export type PeerKind = 'dm' | 'group';

/** ACP 远程 Agent 配置（仅 acp 绑定类型） */
export interface AcpConfig {
  endpoint: string;
  protocol?: string;
  capabilities?: string[];
}

/** Discord 绑定扩展字段 */
export interface DiscordBindingFields {
  guildId?: string;
  teamId?: string;
  roles?: string[];
}

/** 绑定信息（后端返回给前端） */
export interface BindingInfo {
  index: number;
  agentId: string;
  channel: string;
  routingMode: RoutingMode;
  accountId?: string;
  peerKind?: PeerKind;
  peerId?: string;
  comment?: string;
  bindingType: BindingType;
  acp?: AcpConfig;
  discord?: DiscordBindingFields;
}

/** 绑定请求（前端提交给后端） */
export interface BindingRequest {
  agentId: string;
  channel: string;
  routingMode?: RoutingMode;
  accountId?: string;
  peerKind?: PeerKind;
  peerId?: string;
  comment?: string;
  bindingType?: BindingType;
  acp?: AcpConfig;
  discord?: DiscordBindingFields;
}

/** 路由模式选项（UI 展示用） */
export const ROUTING_MODE_OPTIONS: { value: RoutingMode; label: string; description: string }[] = [
  { value: 'peer', label: 'Peer', description: '通过聊天对象路由' },
  { value: 'accountId', label: 'Account ID', description: '通过账号 ID 路由' },
  { value: 'both', label: 'Both', description: '同时支持两种方式' },
];

/** 绑定类型选项（UI 展示用） */
export const BINDING_TYPE_OPTIONS: { value: BindingType; label: string; description: string }[] = [
  { value: 'route', label: '路由绑定', description: '标准消息路由（默认）' },
  { value: 'acp', label: 'ACP 远程', description: '远程 Agent 协议绑定' },
];

/** Peer 类型选项（UI 展示用） */
export const PEER_KIND_OPTIONS: { value: PeerKind; label: string }[] = [
  { value: 'dm', label: '私聊 (DM)' },
  { value: 'group', label: '群聊 (Group)' },
];
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit 2>&1 | grep "channel.ts" || echo "OK"`
Expected: 无新增错误

---

### Task 2: 放宽后端绑定验证 + 新增序列化工具

**Files:**
- Modify: `electron/utils/agent-config.ts`

- [ ] **Step 1: 扩展 BindingMatch 类型以支持 peer**

找到 `BindingMatch` 接口定义（约第 54-58 行），扩展为：

```typescript
interface PeerMatch {
  kind: string;
  id: string;
}

interface BindingMatch extends Record<string, unknown> {
  channel?: string;
  accountId?: string;
  peer?: PeerMatch;
}
```

- [ ] **Step 2: 修改 `isChannelBinding()` 以接受 peer 字段**

找到 `isChannelBinding()` 函数（约第 219-230 行），将验证逻辑从"只允许 channel 或 channel+accountId"改为"允许 channel + 任意组合的 accountId/peer"：

```typescript
function isChannelBinding(binding: unknown): binding is BindingConfig {
  if (!binding || typeof binding !== 'object') return false;
  const candidate = binding as BindingConfig;
  if (typeof candidate.agentId !== 'string' || !candidate.agentId) return false;
  if (!candidate.match || typeof candidate.match !== 'object' || Array.isArray(candidate.match)) return false;
  if (typeof candidate.match.channel !== 'string' || !candidate.match.channel) return false;
  // Allow: {channel}, {channel, accountId}, {channel, peer}, {channel, accountId, peer}
  const allowedKeys = new Set(['channel', 'accountId', 'peer']);
  return Object.keys(candidate.match).every((key) => allowedKeys.has(key));
}
```

- [ ] **Step 3: 新增 binding 序列化/反序列化工具函数**

在 `agent-config.ts` 中新增以下导出函数：

```typescript
/** 从 match 结构推断路由模式 */
export function inferRoutingMode(match: BindingMatch): RoutingMode {
  const hasAccountId = typeof match.accountId === 'string' && match.accountId;
  const hasPeer = match.peer && typeof match.peer.id === 'string' && match.peer.id;
  if (hasAccountId && hasPeer) return 'both';
  if (hasAccountId) return 'accountId';
  return 'peer';
}

/** 从 BindingRequest 构建 match 对象（用于写入 openclaw.json） */
export function buildBindingMatch(request: {
  channel: string;
  routingMode?: string;
  accountId?: string;
  peerKind?: string;
  peerId?: string;
}): Record<string, unknown> {
  const match: Record<string, unknown> = { channel: request.channel };
  const mode = request.routingMode || 'peer';

  if (mode === 'accountId' || mode === 'both') {
    if (request.accountId) {
      match.accountId = request.accountId;
    }
  }
  if (mode === 'peer' || mode === 'both') {
    if (request.peerId) {
      match.peer = {
        kind: request.peerKind || 'dm',
        id: request.peerId,
      };
    }
  }
  return match;
}

/** 解析所有绑定为 BindingInfo[] */
export function parseAllBindings(config: Record<string, unknown>): BindingInfo[] {
  const bindings = config.bindings;
  if (!Array.isArray(bindings)) return [];

  return bindings
    .map((binding: unknown, index: number) => {
      if (!isChannelBinding(binding)) return null;
      const b = binding as BindingConfig;
      const match = b.match!;
      const mode = inferRoutingMode(match);

      return {
        index,
        agentId: b.agentId || '',
        channel: match.channel || '',
        routingMode: mode,
        accountId: mode === 'accountId' || mode === 'both' ? match.accountId : undefined,
        peerKind: (mode === 'peer' || mode === 'both') && match.peer ? match.peer.kind as string : undefined,
        peerId: (mode === 'peer' || mode === 'both') && match.peer ? match.peer.id : undefined,
        comment: typeof b.comment === 'string' ? b.comment : undefined,
        bindingType: (b.type === 'acp' ? 'acp' : 'route') as BindingType,
        acp: b.acp as AcpConfig | undefined,
        discord: match.discord as DiscordBindingFields | undefined,
      };
    })
    .filter((item): item is BindingInfo => item !== null);
}

/** 添加绑定到 config */
export function addBindingToConfig(
  config: Record<string, unknown>,
  request: {
    agentId: string;
    channel: string;
    routingMode?: string;
    accountId?: string;
    peerKind?: string;
    peerId?: string;
    comment?: string;
    bindingType?: string;
    acp?: Record<string, unknown>;
  }
): void {
  if (!Array.isArray(config.bindings)) {
    config.bindings = [];
  }

  const match = buildBindingMatch(request);
  const entry: Record<string, unknown> = {
    agentId: request.agentId,
    match,
  };

  if (request.bindingType === 'acp') {
    entry.type = 'acp';
  }
  if (request.comment) {
    entry.comment = request.comment;
  }
  if (request.acp) {
    entry.acp = request.acp;
  }

  (config.bindings as unknown[]).push(entry);
}

/** 更新指定索引的绑定 */
export function updateBindingInConfig(
  config: Record<string, unknown>,
  index: number,
  request: {
    agentId: string;
    channel: string;
    routingMode?: string;
    accountId?: string;
    peerKind?: string;
    peerId?: string;
    comment?: string;
    bindingType?: string;
    acp?: Record<string, unknown>;
  }
): void {
  if (!Array.isArray(config.bindings)) return;
  const bindings = config.bindings as unknown[];
  if (index < 0 || index >= bindings.length) return;

  const match = buildBindingMatch(request);
  const entry: Record<string, unknown> = {
    agentId: request.agentId,
    match,
  };

  if (request.bindingType === 'acp') {
    entry.type = 'acp';
  }
  if (request.comment) {
    entry.comment = request.comment;
  }
  if (request.acp) {
    entry.acp = request.acp;
  }

  bindings[index] = entry;
}

/** 删除指定索引的绑定 */
export function removeBindingFromConfig(
  config: Record<string, unknown>,
  index: number
): void {
  if (!Array.isArray(config.bindings)) return;
  const bindings = config.bindings as unknown[];
  if (index < 0 || index >= bindings.length) return;
  bindings.splice(index, 1);
  if (bindings.length === 0) {
    delete config.bindings;
  }
}
```

- [ ] **Step 4: 在文件顶部补充类型导入**

确保以下类型在文件中可用（从 `../../src/types/channel` 导入，或在文件内定义本地版本以避免 electron/src 交叉引用）：

由于 electron 层无法直接导入前端 src 的类型，需要在 `agent-config.ts` 文件内定义本地版本。这些类型已在 Step 1 的 `BindingMatch` 扩展和 Step 3 的函数签名中内联。

- [ ] **Step 5: 运行 TypeScript 检查**

Run: `npx tsc --noEmit 2>&1 | grep "agent-config" || echo "OK"`

---

### Task 3: 新增绑定管理 API 路由

**Files:**
- Create: `electron/api/routes/bindings.ts`
- Modify: `electron/api/server.ts`

- [ ] **Step 1: 创建 bindings.ts 路由文件**

```typescript
import type { IncomingMessage, ServerResponse } from 'http';
import { RouteHandlerContext } from '../server';
import { readConfig, writeConfig } from '../../utils/channel-config';
import {
  parseAllBindings,
  addBindingToConfig,
  updateBindingInConfig,
  removeBindingFromConfig,
} from '../../utils/agent-config';

async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw) as T;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export async function handleBindingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: RouteHandlerContext
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/bindings')) return false;

  // GET /api/bindings — 获取所有绑定
  if (url.pathname === '/api/bindings' && req.method === 'GET') {
    try {
      const config = await readConfig();
      const bindings = parseAllBindings(config as Record<string, unknown>);
      sendJson(res, 200, { success: true, bindings });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // POST /api/bindings — 添加绑定
  if (url.pathname === '/api/bindings' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        agentId: string;
        channel: string;
        routingMode?: string;
        accountId?: string;
        peerKind?: string;
        peerId?: string;
        comment?: string;
        bindingType?: string;
        acp?: Record<string, unknown>;
      }>(req);

      if (!body.agentId || !body.channel) {
        throw new Error('agentId and channel are required');
      }

      const config = await readConfig();
      addBindingToConfig(config as Record<string, unknown>, body);
      await writeConfig(config);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // PUT /api/bindings/:index — 更新绑定
  const putMatch = url.pathname.match(/^\/api\/bindings\/(\d+)$/);
  if (putMatch && req.method === 'PUT') {
    try {
      const index = parseInt(putMatch[1], 10);
      const body = await parseJsonBody<{
        agentId: string;
        channel: string;
        routingMode?: string;
        accountId?: string;
        peerKind?: string;
        peerId?: string;
        comment?: string;
        bindingType?: string;
        acp?: Record<string, unknown>;
      }>(req);

      if (!body.agentId || !body.channel) {
        throw new Error('agentId and channel are required');
      }

      const config = await readConfig();
      updateBindingInConfig(config as Record<string, unknown>, index, body);
      await writeConfig(config);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // DELETE /api/bindings/:index — 删除绑定
  const deleteMatch = url.pathname.match(/^\/api\/bindings\/(\d+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    try {
      const index = parseInt(deleteMatch[1], 10);
      const config = await readConfig();
      removeBindingFromConfig(config as Record<string, unknown>, index);
      await writeConfig(config);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
```

注意：`readConfig` / `writeConfig` 需要从现有工具中导入或使用现有的配置读写机制。实际实现时需确认这些函数的签名。

- [ ] **Step 2: 在 server.ts 中注册新路由**

在 `electron/api/server.ts` 中：

1. 添加导入：
```typescript
import { handleBindingRoutes } from './routes/bindings';
```

2. 在 `coreRouteHandlers` 数组中，在 `handleChannelRoutes` 之前添加 `handleBindingRoutes`：

```typescript
const coreRouteHandlers: RouteHandler[] = [
  handleAppRoutes,
  handleGatewayRoutes,
  handleSettingsRoutes,
  handleProviderRoutes,
  handleAgentRoutes,
  handleBindingRoutes,    // <-- 新增
  handleChannelRoutes,
  handleSkillRoutes,
  // ...
];
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npx tsc --noEmit 2>&1 | grep -E "(bindings\.ts|server\.ts|agent-config)" || echo "OK"`

---

## Chunk 2: 前端组件 — 添加绑定弹窗

### Task 4: 创建 AddBindingModal 组件

**Files:**
- Create: `src/components/channels/AddBindingModal.tsx`

- [ ] **Step 1: 创建 AddBindingModal 组件**

该组件复用现有 ChannelConfigModal 的视觉风格（圆角 Card、品牌色光带、labelClasses 等）。

核心 props：
```typescript
interface AddBindingModalProps {
  agents: { id: string; name: string }[];
  /** 可选：预填充 agentId（从快速绑定传入） */
  initialAgentId?: string;
  /** 可选：编辑模式，传入现有 binding 数据 */
  editBinding?: BindingInfo;
  onConfirm: (request: BindingRequest) => void | Promise<void>;
  onClose: () => void;
}
```

表单字段（按顺序）：
1. **Agent 选择** — `<select>` 下拉，选项来自 `agents` prop
2. **渠道选择** — `<select>` 下拉，选项来自 `getPrimaryChannels()` + CHANNEL_NAMES
3. **路由模式** — 按钮组切换（peer / accountId / both），默认 `peer`
4. **绑定类型** — 按钮组切换（route / acp），默认 `route`
5. **账号选择** — `<select>` 下拉，当 `routingMode === 'accountId' || 'both'` 时显示
6. **Peer Kind** — 按钮组（DM / Group），当 `routingMode === 'peer' || 'both'` 时显示
7. **Peer ID** — `<input>` 文本框，当 `routingMode === 'peer' || 'both'` 时显示
8. **ACP 配置** — 端点 URL + 协议 + 能力声明，当 `bindingType === 'acp'` 时显示
9. **备注** — `<input>` 文本框（可选）

样式：复用 ChannelConfigModal 中的常量（`inputBaseClasses`, `labelClasses` 等），或从共享位置导入。

验证逻辑：
- `agentId` 必填
- `channel` 必填
- peer/both 模式：`peerId` 必填
- accountId/both 模式：`accountId` 必填
- acp 类型：`endpoint` 必填

- [ ] **Step 2: 运行 TypeScript 检查**

---

## Chunk 3: 前端组件 — 绑定管理子视图

### Task 5: 创建 BindingManageView 组件

**Files:**
- Create: `src/components/channels/BindingManageView.tsx`

- [ ] **Step 1: 创建 BindingManageView 组件**

该组件是绑定管理的主体视图，在频道页面内通过 `activeView === 'bindings'` 切换显示。

核心结构：

```typescript
interface BindingManageViewProps {
  agents: { id: string; name: string }[];
  onBack: () => void;  // 返回频道列表视图
}
```

内部状态：
- `bindings: BindingInfo[]` — 从 `/api/bindings` 加载
- `showAddModal: boolean` — 控制添加绑定弹窗
- `editBinding: BindingInfo | null` — 当前编辑的绑定
- `deleteTarget: { index: number; label: string } | null` — 删除确认目标

**区域 1：返回按钮 + 标题**
```
[← 返回频道列表]
📻 绑定管理（高级）
管理频道账号与 Agent 之间的消息路由规则
```

**区域 2：未绑定提醒横幅**（学习 OpenClawSwitch）
- 计算逻辑：`agents.filter(a => !bindings.some(b => b.agentId === a.id))`
- 每个未绑定 Agent 一行，右侧"快速绑定"按钮
- 点击快速绑定 → 打开 AddBindingModal 并预填充 agentId

**区域 3：绑定列表**
- 按渠道分组（类似频道页面的 configuredGroups）
- 每个绑定一张卡片，显示：
  - 渠道图标 + 渠道名
  - 路由模式标签（Peer / Account / Both）
  - Peer 模式：显示 peerKind(dm/group) + peerId（脱敏）
  - AccountId 模式：显示账号名
  - Both 模式：两者都显示
  - Agent 名称
  - 绑定类型标签（route/acp）
  - 备注
  - 编辑/删除按钮

**区域 4：添加绑定按钮**
- 页面底部的固定按钮
- 点击打开 AddBindingModal

**数据获取：**
- `fetchBindings()` 调用 `GET /api/bindings`
- 添加/编辑/删除后重新 fetch

- [ ] **Step 2: 运行 TypeScript 检查**

---

### Task 6: 频道页面集成视图切换

**Files:**
- Modify: `src/pages/Channels/index.tsx`

- [ ] **Step 1: 添加 activeView state 和导入**

```typescript
import { BindingManageView } from '@/components/channels/BindingManageView';

// 在 Channels 组件内部：
const [activeView, setActiveView] = useState<'channels' | 'bindings'>('channels');
```

- [ ] **Step 2: 修改头部区域，添加"绑定管理"入口按钮**

在头部刷新按钮旁边添加：

```tsx
<div className="flex items-center gap-3">
  <Radio className="h-6 w-6 text-primary" />
  <div>
    <h1 className="text-2xl font-bold">{t('title')}</h1>
    <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
  </div>
</div>
<div className="flex items-center gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => setActiveView('bindings')}
  >
    <Settings2 className="h-4 w-4 mr-2" />
    {t('bindingManage.entry')}
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={handleRefresh}
    disabled={gatewayStatus.state !== 'running'}
  >
    <RefreshCw className={cn('h-4 w-4 mr-2', isUsingStableValue && 'animate-spin')} />
    {t('refresh')}
  </Button>
</div>
```

需要额外导入 `Settings2` 图标。

- [ ] **Step 3: 添加视图切换逻辑**

在 return 中，用 activeView 条件渲染：

```tsx
return (
  <div data-testid="channels-page" className="flex h-full flex-col gap-6">
    {activeView === 'bindings' ? (
      <BindingManageView
        agents={visibleAgents}
        onBack={() => setActiveView('channels')}
      />
    ) : (
      <>
        {/* 现有频道页面的全部内容保持不变 */}
      </>
    )}
  </div>
);
```

注意：当 `activeView === 'bindings'` 时，仍需保持现有的数据加载逻辑（agents, channelGroups 等），因为切回 channels 视图时需要这些数据。BindingManageView 自己管理 bindings 数据的获取。

- [ ] **Step 4: 运行 TypeScript 检查**

---

## Chunk 4: 国际化 + 联调

### Task 7: 补充国际化文案

**Files:**
- Modify: `src/i18n/locales/zh/channels.json`

- [ ] **Step 1: 添加绑定管理相关文案**

在 `channels.json` 中新增 `bindingManage` 节点：

```json
{
  "bindingManage": {
    "entry": "绑定管理",
    "title": "绑定管理（高级）",
    "subtitle": "管理频道账号与 Agent 之间的消息路由规则",
    "back": "返回频道列表",
    "unboundWarning": "发现 {{count}} 个 Agent 未配置任何渠道绑定",
    "quickBind": "快速绑定",
    "ignoreAll": "全部忽略",
    "noBindings": "暂无绑定规则。点击下方按钮添加第一条绑定。",
    "addBinding": "添加绑定",
    "editBinding": "编辑绑定",
    "deleteBinding": "删除绑定",
    "deleteConfirm": "确定要删除此绑定规则吗？",
    "bindingSaved": "绑定规则已保存",
    "bindingDeleted": "绑定规则已删除",
    "bindingFailed": "操作失败: {{error}}",
    "fields": {
      "agent": "选择 Agent",
      "agentPlaceholder": "选择要绑定的 Agent",
      "channel": "选择渠道",
      "channelPlaceholder": "选择消息渠道",
      "routingMode": "路由模式",
      "bindingType": "绑定类型",
      "accountId": "选择账号",
      "accountIdPlaceholder": "选择渠道账号",
      "peerKind": "Peer 类型",
      "peerId": "Peer ID",
      "peerIdPlaceholder": "例如: ou_xxxxxx, 123456789",
      "comment": "备注",
      "commentPlaceholder": "可选备注信息",
      "acpEndpoint": "端点 URL",
      "acpEndpointPlaceholder": "例如: https://remote-agent.example.com",
      "acpProtocol": "协议",
      "acpCapabilities": "能力声明"
    },
    "routingModes": {
      "peer": "Peer",
      "peerDesc": "通过聊天对象路由",
      "accountId": "Account ID",
      "accountIdDesc": "通过账号 ID 路由",
      "both": "Both",
      "bothDesc": "同时支持两种方式"
    },
    "bindingTypes": {
      "route": "路由绑定",
      "routeDesc": "标准消息路由（默认）",
      "acp": "ACP 远程",
      "acpDesc": "远程 Agent 协议绑定"
    },
    "peerKinds": {
      "dm": "私聊 (DM)",
      "group": "群聊 (Group)"
    },
    "labels": {
      "peer": "Peer",
      "account": "Account",
      "both": "私聊 + Account",
      "route": "路由",
      "acp": "ACP"
    }
  }
}
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/zh/channels.json','utf8')); console.log('JSON valid')"`

---

### Task 8: 全量 TypeScript 检查 + 手动验证

- [ ] **Step 1: 运行完整 TypeScript 编译检查**

Run: `npx tsc --noEmit`

- [ ] **Step 2: 手动验证清单**

1. 频道页面正常显示，无回归
2. 头部出现"绑定管理"入口按钮
3. 点击后切换到绑定管理视图
4. 绑定管理视图显示未绑定提醒（如有）
5. 快速绑定 → 预填充 agentId → 选择渠道 → 保存成功
6. 绑定列表正确显示已添加的绑定
7. 编辑/删除绑定正常工作
8. 点击"返回频道列表"切回原视图
9. 频道页面的行内 `<select>` 快捷绑定仍然正常
