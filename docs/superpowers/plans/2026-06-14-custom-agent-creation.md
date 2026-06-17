# 用户自定义 Agent（记忆 + 人设）功能实现规划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「超级助手 · 应用广场」中新增「创建我的 Agent」能力，让用户通过可视化表单填写人设、选择工具、编写记忆文件，最终生成以明文 markdown 存放在 `~/.clawdock/custom-agents/`、可雇佣、可编辑、可删除的自定义 Agent。

**Architecture:** 复用现有 Kernel 的 `AgentConfig` / `AgentManifestEntry` 类型，但用户自定义 Agent 不加密，直接以 OpenClaw 风格的明文 markdown 目录存放在 `~/.clawdock/custom-agents/`；Electron Main 提供 IPC CRUD，在 `marketplace:listAgents` 中把自定义 Agent 追加到预设列表；Kernel 端新增从自定义目录加载明文 Agent 的能力，并在 `session.create` 时优先匹配自定义 Agent。前端新增「创建 Agent」入口、人设表单、记忆编辑器和我的 Agent 管理区。

**Tech Stack:** Electron (Main IPC)、React 19 + Vite + TypeScript、Zustand、shadcn/ui、Node.js `fs`、ClawDock Kernel (WebSocket)。

---

## 0. 前置知识与关键路径

### 0.1 现有预设 Agent 加载链路

```
src/modules/goclaw/marketplace.tsx
  → kernelClient.listAgents()
    → IPC marketplace:listAgents
      → electron/extensions/marketplace/marketplace-api.ts::readManifest()
        → kernel/agents/manifest.json

点击雇佣 → /goclaw/chat/:agentId
  → marketplace:getAgent + marketplace:hireAgent
    → KernelLauncher session.create
      → kernel/src/main.ts
        → loadAgentOnDemand(agentId, AGENTS_DIR)
          → kernel/src/agent/agent-loader.ts
            → manifest.json → .enc 解密 → agentCache
              → buildSystemPrompt() → ReAct loop
```

### 0.2 关键类型（已存在）

- `kernel/src/types.ts:AgentConfig`：完整运行时配置。
- `kernel/src/types.ts:AgentManifestEntry`：UI 清单条目。
- `kernel/src/types.ts:AgentPackage`：预设 Agent 加密包结构（自定义 Agent 不使用）。
- `kernel/src/agent/agent-loader.ts`：`loadAgentOnDemand(id, agentsDir)`、`agentCache`。
- `kernel/scripts/encrypt-agents.mjs`：仅用于构建预设 Agent 的 `.enc` 包，不用于自定义 Agent。

### 0.3 记忆现状

- `kernel/src/engine/session-manager.ts` 每次 `session.create` 会建 `<workspace>/<agentId>/<sessionId>/{memory,uploads,output}`。
- 当前代码中没有观察到 Agent 自动读写 `memory/MEMORY.md` 或 `USER.md` 的逻辑。
- 本规划把「用户可编辑的记忆文件」作为人设的一部分：用户在创建 Agent 时填写初始 `USER.md` 与 `MEMORY.md`，启动会话时作为 `AgentConfig.user` 注入 system prompt，后续由 Agent 在 ReAct 循环中自己维护会话 workspace 中的记忆文件。

---

## 1. 数据模型与存储设计

### 1.1 自定义 Agent 文件布局

```
~/.clawdock/custom-agents/
├── manifest.json               # 自定义 Agent 公开清单
└── <agentId>/
    ├── IDENTITY.md             # 人设元数据（用户可见）
    ├── SOUL.md                 # 核心人格
    ├── AGENTS.md               # 会话规则/SOP
    ├── TOOLS.md                # 工具说明
    ├── USER.md                 # 用户画像（可选）
    ├── MEMORY.md               # 长期记忆（可选）
    └── heartbeat.md            # 定时任务（可选，小写避免冲突）
```

> 说明：自定义 Agent 不使用 `.enc` 加密，与 OpenClaw 目录结构保持一致，方便用户直接用文本编辑器修改。

### 1.2 自定义 Agent 注册表 `manifest.json`

与 `kernel/agents/manifest.json` 格式一致，但存放在 `~/.clawdock/custom-agents/manifest.json`：

```json
{
  "version": "1.0.0",
  "agents": [
    {
      "id": "my-coding-helper",
      "name": "我的代码助手",
      "nickname": "代码助手",
      "emoji": "💻",
      "creature": "耐心的全栈编程搭档，擅长解释、重构和写测试",
      "vibe": "友好、细致、鼓励式",
      "description": "根据我的代码风格提供建议",
      "tags": ["工程"],
      "scenarios": ["重构函数", "写单元测试", "解释报错"],
      "version": "1.0.0",
      "department": "engineering"
    }
  ]
}
```

### 1.3 运行时合并规则

- `marketplace:listAgents`：返回 `builtinAgents.agents.concat(customAgents.agents)`，自定义 Agent 排在后面。
- `marketplace:getAgent`：先在自定义注册表查找，再去预设注册表查找。
- Kernel `loadAgentOnDemand`：优先在自定义目录查找明文 markdown 目录；找不到再去 `AGENTS_DIR` 查找加密包。
- ID 冲突：自定义 Agent 使用前缀 `custom-`（UI 创建时自动添加），避免与预设 Agent 冲突。

---

## 2. 后端（Electron Main + Kernel）改造

### 2.1 Electron Main：自定义 Agent 目录服务

**创建文件：** `electron/extensions/marketplace/custom-agent-store.ts`

职责：
- 解析自定义 Agent 根目录：`~/.clawdock/custom-agents/`（使用 `electron/utils/paths.ts:getClawDockConfigDir()`）。
- 维护 `manifest.json` 注册表（CRUD）。
- 将表单输入保存为明文 markdown 源文件。
- 从明文 markdown 构建 `AgentConfig`。
- 为 IPC 提供增删改查接口。

### 2.2 Kernel：多目录 Agent 加载

**修改文件：** `kernel/src/agent/agent-loader.ts`

- 新增 `CUSTOM_AGENTS_DIR` 环境变量读取（Electron Main 启动 Kernel 时注入）。
- `loadAgentOnDemand` 增加第二个可选参数 `customAgentsDir`，查找顺序：
  1. `agentCache`
  2. `customAgentsDir/<id>/` 明文目录（解析 IDENTITY.md + SOUL.md + ...）
  3. `agentsDir/<id>.enc` 预设加密包
- `loadAgentManifest` 保持只读 `agentsDir/manifest.json`（UI 层在 Electron 做合并）。
- 新增 `loadPlaintextAgent(agentId, agentDir)` 函数，按 OpenClaw 约定解析 markdown 文件。

### 2.3 Kernel Launcher 注入自定义目录

**修改文件：** `electron/extensions/kernel/kernel-launcher.ts`

- 通过 `getClawDockConfigDir()` 得到 `~/.clawdock`。
- 设置 `CUSTOM_AGENTS_DIR = resolve(getClawDockConfigDir(), 'custom-agents')`。
- 在 `env` 中新增 `CUSTOM_AGENTS_DIR`（dev 与 prod 模式都注入）。

需要导入：

```ts
import { getClawDockConfigDir } from '../../utils/paths.js';
```

### 2.4 IPC 新增路由

**修改文件：** `electron/extensions/marketplace/marketplace-api.ts`

新增 handle：
- `marketplace:createCustomAgent(payload)`
- `marketplace:updateCustomAgent(agentId, payload)`
- `marketplace:deleteCustomAgent(agentId)`
- `marketplace:listCustomAgents()`
- `marketplace:listAgents` 合并预设 + 自定义。
- `marketplace:getAgent` 优先自定义。

---

## 3. 前端（Renderer）改造

### 3.1 应用广场新增「创建 Agent」入口

**修改文件：** `src/modules/goclaw/marketplace.tsx`

在 Header 右侧「使用额度」旁新增「创建 Agent」按钮，路由到 `/goclaw/custom-agent/new`。

### 3.2 自定义 Agent 编辑页

**创建文件：** `src/modules/goclaw/custom-agent-editor.tsx`

表单字段（对应 `IDENTITY.md` / manifest entry）：
- 名称 / 昵称 / emoji / 一句话定位 / 风格 / 分类 / 场景标签
- 核心人格 `SOUL.md`（大文本框）
- 会话规则 `AGENTS.md`（大文本框）
- 工具说明 `TOOLS.md`（大文本框，可预填模板）
- 用户画像 `USER.md`（记忆系统入口，可选）
- 长期记忆 `MEMORY.md`（记忆系统入口，可选）

保存时调用 `marketplace:createCustomAgent`。

### 3.3 我的 Agent 管理区

**创建文件：** `src/modules/goclaw/my-agents.tsx`

- 列表展示所有自定义 Agent。
- 支持编辑、删除、立即雇佣。
- 删除需二次确认（危险操作）。

### 3.4 Store 与 Client 扩展

**修改文件：** `src/modules/goclaw/store.ts`
- 新增 `customAgents` 状态与 `loadCustomAgents()`。

**修改文件：** `src/lib/kernel-client.ts`
- 新增 `createCustomAgent`、`updateCustomAgent`、`deleteCustomAgent`、`listCustomAgents`。

### 3.5 路由

**修改文件：** `src/App.tsx`
- 新增 `/goclaw/custom-agent/new`
- 新增 `/goclaw/custom-agent/:agentId/edit`
- 新增 `/goclaw/my-agents`

---

## 4. 记忆系统实现策略

### 4.1 两层记忆

| 层级 | 位置 | 内容 | 生命周期 |
|------|------|------|----------|
| 人设级记忆 | `~/.clawdock/custom-agents/<agentId>/USER.md` / `MEMORY.md` | 用户画像、偏好、事实 | 随 Agent 编辑更新 |
| 会话级记忆 | `<workspace>/<agentId>/<sessionId>/memory/` | 本次对话总结、输出文件 | 会话隔离 |

### 4.2 注入方式

- 创建/编辑 Agent 时，用户填写的 `USER.md` 内容存入 `AgentConfig.user`。
- 用户填写的 `MEMORY.md` 内容拼接到 `AgentConfig.soul` 末尾的「Long-term Memory」区块，或独立作为 `AgentConfig.memory`（若新增字段）。
- 为避免改 Kernel 协议，本阶段把 `MEMORY.md` 内容拼入 `soul` 末尾，标记为 `<!-- LONG_TERM_MEMORY -->`。

### 4.3 后续演进（可选）

- 在 `kernel/src/engine/react-loop.ts` 每次 turn 结束时，让 Agent 调用 `write_memory` 工具更新 `memory/MEMORY.md`。
- 本规划只做到「用户可编辑初始记忆文件并注入 system prompt」，自动维护记忆的 ReAct 逻辑后续单独规划。

---

## 5. 安全策略

- 自定义 Agent 不加密，以明文 markdown 存放在 `~/.clawdock/custom-agents/`。
- 这是预期行为：用户自己的配置应当可自由查看和编辑，与 OpenClaw 保持一致。
- 敏感内容（如 USER.md 中的个人信息）由用户自主控制；如后续有强隐私需求，可针对单个记忆文件加密，但本阶段保持简单。
- 所有文件写入都在 Electron Main 进行，renderer 只通过 IPC 发起请求。

---

## 6. 任务拆分

### Task 1: 创建自定义 Agent 后端存储服务

**Files:**
- Create: `electron/extensions/marketplace/custom-agent-store.ts`
- Modify: `electron/extensions/marketplace/marketplace-api.ts`
- Test: `electron/__tests__/custom-agent-store.test.ts`（若测试目录不存在则新建）

- [ ] **Step 1: 编写失败测试**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { addCustomAgent, listCustomAgents, deleteCustomAgent } from '../extensions/marketplace/custom-agent-store';
import { resolve } from 'path';
import { rmSync, existsSync } from 'fs';

const testDir = resolve(__dirname, '../../test-output/custom-agents');

describe('custom-agent-store', () => {
  beforeAll(() => {
    process.env.CLAWDOCK_USER_DATA_DIR = testDir;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('adds and lists a custom agent', async () => {
    const agent = {
      id: 'custom-test-helper',
      name: '测试助手',
      nickname: '测试助手',
      emoji: '🧪',
      creature: '测试用 Agent',
      vibe: '友好',
      description: '仅用于测试',
      tags: ['专项'],
      scenarios: ['跑测试'],
      soul: '你是测试助手。',
      agents: '',
      tools: '',
    };
    await addCustomAgent(agent);
    const result = listCustomAgents();
    expect(result.some(a => a.id === 'custom-test-helper')).toBe(true);
    expect(existsSync(resolve(testDir, 'custom-agents/custom-test-helper/SOUL.md'))).toBe(true);
    expect(existsSync(resolve(testDir, 'custom-agents/custom-test-helper/IDENTITY.md'))).toBe(true);
    deleteCustomAgent('custom-test-helper');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run electron/__tests__/custom-agent-store.test.ts`
Expected: FAIL `addCustomAgent is not defined`

- [ ] **Step 3: 实现最小自定义 Agent 存储服务**

```ts
/**
 * Custom Agent Store - 用户自定义 Agent 的明文 markdown 存储
 * 路径：~/.clawdock/custom-agents/
 */
import { resolve, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { getClawDockConfigDir } from '../../utils/paths.js';
import type { AgentConfig, AgentManifestEntry } from '../../../kernel/src/types.js';

export interface CustomAgentInput {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  soul: string;
  agents?: string;
  tools?: string;
  user?: string;
  memory?: string;
  heartbeat?: string;
  maxTurns?: number;
}

function getCustomAgentsDir(): string {
  const dir = resolve(getClawDockConfigDir(), 'custom-agents');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getRegistryPath(): string {
  return resolve(getCustomAgentsDir(), 'manifest.json');
}

function readRegistry(): { version: string; agents: AgentManifestEntry[] } {
  const path = getRegistryPath();
  if (!existsSync(path)) return { version: '1.0.0', agents: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeRegistry(registry: { version: string; agents: AgentManifestEntry[] }): void {
  writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2), 'utf8');
}

export function listCustomAgents(): AgentManifestEntry[] {
  return readRegistry().agents;
}

function ensureIdPrefix(id: string): string {
  return id.startsWith('custom-') ? id : `custom-${id}`;
}

export async function addCustomAgent(input: CustomAgentInput): Promise<AgentManifestEntry> {
  const id = ensureIdPrefix(input.id);
  const dir = resolve(getCustomAgentsDir(), id);
  mkdirSync(dir, { recursive: true });

  const identity = {
    name: input.name,
    nickname: input.nickname,
    emoji: input.emoji,
    creature: input.creature,
    vibe: input.vibe,
  };

  // Persist source markdown files (OpenClaw-style plaintext)
  writeFileSync(resolve(dir, 'IDENTITY.md'), buildIdentityMarkdown(input), 'utf8');
  writeFileSync(resolve(dir, 'SOUL.md'), input.soul, 'utf8');
  if (input.agents) writeFileSync(resolve(dir, 'AGENTS.md'), input.agents, 'utf8');
  if (input.tools) writeFileSync(resolve(dir, 'TOOLS.md'), input.tools, 'utf8');
  if (input.user) writeFileSync(resolve(dir, 'USER.md'), input.user, 'utf8');
  if (input.memory) writeFileSync(resolve(dir, 'MEMORY.md'), input.memory, 'utf8');
  if (input.heartbeat) writeFileSync(resolve(dir, 'heartbeat.md'), input.heartbeat, 'utf8');

  const entry: AgentManifestEntry = {
    id,
    name: input.name,
    nickname: input.nickname,
    emoji: input.emoji,
    creature: input.creature,
    vibe: input.vibe,
    description: input.description,
    tags: input.tags,
    scenarios: input.scenarios,
    version: '1.0.0',
  };

  const registry = readRegistry();
  registry.agents = registry.agents.filter(a => a.id !== id);
  registry.agents.push(entry);
  writeRegistry(registry);
  return entry;
}

export function deleteCustomAgent(id: string): void {
  const prefixed = ensureIdPrefix(id);
  const dir = resolve(getCustomAgentsDir(), prefixed);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  const registry = readRegistry();
  registry.agents = registry.agents.filter(a => a.id !== prefixed);
  writeRegistry(registry);
}

export function updateCustomAgent(id: string, input: CustomAgentInput): Promise<AgentManifestEntry> {
  const prefixed = ensureIdPrefix(id);
  deleteCustomAgent(prefixed);
  return addCustomAgent({ ...input, id: prefixed });
}

function buildIdentityMarkdown(input: CustomAgentInput): string {
  return [
    `- **Name:** ${input.name} / ${input.nickname}`,
    `- **Emoji:** ${input.emoji}`,
    `- **Creature:** ${input.creature}`,
    `- **Vibe:** ${input.vibe}`,
    `- **Department:** ${input.tags[0] || '通用'}`,
  ].join('\n');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run electron/__tests__/custom-agent-store.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add electron/extensions/marketplace/custom-agent-store.ts electron/__tests__/custom-agent-store.test.ts
git commit -m "feat(custom-agent): add plaintext backend store for user-created agents"
```

---

### Task 2: Kernel 支持自定义 Agent 目录加载

**Files:**
- Modify: `kernel/src/agent/agent-loader.ts`
- Modify: `electron/extensions/kernel/kernel-launcher.ts`
- Test: `kernel/__tests__/agent-loader.test.ts`（若测试目录不存在则新建）

- [ ] **Step 1: 编写失败测试**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadAgentOnDemand, agentCache, loadPlaintextAgent } from '../src/agent/agent-loader';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';

const testAgentsDir = resolve(__dirname, 'test-agents');
const testCustomDir = resolve(__dirname, 'test-custom-agents');

describe('loadAgentOnDemand with custom plaintext dir', () => {
  beforeAll(() => {
    agentCache.clear();
    rmSync(testAgentsDir, { recursive: true, force: true });
    rmSync(testCustomDir, { recursive: true, force: true });

    mkdirSync(testAgentsDir, { recursive: true });
    mkdirSync(testCustomDir, { recursive: true });

    mkdirSync(resolve(testCustomDir, 'custom-foo'), { recursive: true });
    writeFileSync(
      resolve(testCustomDir, 'custom-foo', 'IDENTITY.md'),
      `- **Name:** 自定义助手 / 小助\n- **Emoji:** 🦀\n- **Creature:** 测试用自定义 Agent\n- **Vibe:** 友好`,
      'utf8',
    );
    writeFileSync(resolve(testCustomDir, 'custom-foo', 'SOUL.md'), '你是自定义测试助手。', 'utf8');
  });

  afterAll(() => {
    rmSync(testAgentsDir, { recursive: true, force: true });
    rmSync(testCustomDir, { recursive: true, force: true });
  });

  it('loads custom plaintext agent before builtin', () => {
    const config = loadAgentOnDemand('custom-foo', testAgentsDir, testCustomDir);
    expect(config.id).toBe('custom-foo');
    expect(config.soul).toContain('自定义测试助手');
  });

  it('loadPlaintextAgent reads markdown source', () => {
    const config = loadPlaintextAgent('custom-foo', resolve(testCustomDir, 'custom-foo'));
    expect(config.id).toBe('custom-foo');
    expect(config.identity.name).toBe('自定义助手');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run kernel/__tests__/agent-loader.test.ts`
Expected: FAIL `loadAgentOnDemand does not accept 3 arguments` / `loadPlaintextAgent is not defined`

- [ ] **Step 3: 在 agent-loader.ts 新增明文 Agent 加载能力**

```ts
/**
 * Load a plaintext custom agent from an OpenClaw-style directory.
 */
export function loadPlaintextAgent(agentId: string, agentDir: string): AgentConfig {
  const identityPath = join(agentDir, 'IDENTITY.md');
  const soulPath = join(agentDir, 'SOUL.md');
  const agentsPath = join(agentDir, 'AGENTS.md');
  const toolsPath = join(agentDir, 'TOOLS.md');
  const userPath = join(agentDir, 'USER.md');
  const memoryPath = join(agentDir, 'MEMORY.md');
  const heartbeatPath = join(agentDir, 'heartbeat.md');

  if (!existsSync(identityPath) || !existsSync(soulPath)) {
    throw new Error(`Plaintext agent '${agentId}' missing IDENTITY.md or SOUL.md`);
  }

  const identity = parseIdentityMarkdown(readFileSync(identityPath, 'utf8'));
  let soul = readFileSync(soulPath, 'utf8');
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
  const tools = existsSync(toolsPath) ? readFileSync(toolsPath, 'utf8') : '';
  const user = existsSync(userPath) ? readFileSync(userPath, 'utf8') : undefined;
  const memory = existsSync(memoryPath) ? readFileSync(memoryPath, 'utf8') : undefined;
  const heartbeat = existsSync(heartbeatPath) ? readFileSync(heartbeatPath, 'utf8') : undefined;

  if (memory) {
    soul = `${soul}\n\n<!-- LONG_TERM_MEMORY -->\n${memory}`;
  }

  return {
    id: agentId,
    version: '1.0.0',
    identity,
    soul,
    agents,
    tools,
    user,
    heartbeat,
    maxTurns: 64,
  };
}

function parseIdentityMarkdown(content: string): AgentIdentity {
  const lines = content.split('\n');
  const result: Partial<AgentIdentity> = {
    name: '',
    nickname: '',
    emoji: '🤖',
    creature: '',
    vibe: '',
  };

  for (const line of lines) {
    const match = line.match(/^-\s*\*\*(.+?):\*\*\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (key === 'name') {
      const parts = value.split('/').map(s => s.trim());
      result.name = parts[0] || '';
      result.nickname = parts[1] || result.name;
    } else if (key === 'emoji') {
      result.emoji = value;
    } else if (key === 'creature') {
      result.creature = value;
    } else if (key === 'vibe') {
      result.vibe = value;
    }
  }

  return result as AgentIdentity;
}
```

- [ ] **Step 4: 修改 loadAgentOnDemand 支持自定义目录优先**

将现有函数替换为：

```ts
export function loadAgentOnDemand(
  agentId: string,
  agentsDir: string,
  customAgentsDir?: string,
): AgentConfig {
  // 缓存命中直接返回
  const cached = agentCache.get(agentId);
  if (cached) {
    console.log(`[Kernel] Agent '${agentId}' served from cache`);
    return cached;
  }

  // 优先加载自定义明文 Agent
  if (customAgentsDir && existsSync(join(customAgentsDir, agentId))) {
    const config = loadPlaintextAgent(agentId, join(customAgentsDir, agentId));
    agentCache.set(agentId, config);
    console.log(`[Kernel] Custom plaintext agent '${agentId}' loaded and cached`);
    return config;
  }

  // Fallback to builtin manifest validation + encrypted loading
  const manifest = loadAgentManifest(agentsDir);
  const entry = manifest.agents.find(a => a.id === agentId);
  if (!entry) {
    throw new Error(`Agent '${agentId}' not found in manifest`);
  }

  const key = deriveKey();
  const pkg = loadAgentPackage(agentId, agentsDir);
  const config = decryptAgentPackage(pkg, key);

  agentCache.set(agentId, config);
  console.log(`[Kernel] Agent '${agentId}' loaded and cached (${agentCache.size} agents in cache)`);
  return config;
}
```

> 注意：需要在文件顶部把 `import { readFileSync } from 'fs';` 改为 `import { readFileSync, existsSync } from 'fs';`。

- [ ] **Step 5: Kernel Launcher 注入 `CUSTOM_AGENTS_DIR`**

修改 `electron/extensions/kernel/kernel-launcher.ts`，在 dev 与 prod 的 `env` 中各加一行：

```ts
CUSTOM_AGENTS_DIR: resolve(getClawDockConfigDir(), 'custom-agents'),
```

Dev 模式 `startDev` 的 env 片段：

```ts
env: {
  ...process.env,
  ...providerEnv,
  KERNEL_AGENTS_DIR: agentsDir,
  KERNEL_SKILLS_DIR: skillsDir,
  OPENCLAW_HOME: getOpenClawConfigDir(),
  CUSTOM_AGENTS_DIR: resolve(getClawDockConfigDir(), 'custom-agents'),
  NODE_ENV: 'development',
},
```

Prod 模式 `startProd` 的 env 片段：

```ts
env: {
  ...process.env,
  ...providerEnv,
  KERNEL_AGENTS_DIR: agentsDir,
  KERNEL_SKILLS_DIR: skillsDir,
  OPENCLAW_HOME: getOpenClawConfigDir(),
  CUSTOM_AGENTS_DIR: resolve(getClawDockConfigDir(), 'custom-agents'),
  NODE_ENV: 'production',
} as Record<string, string>,
```

并确保文件已导入：

```ts
import { getClawDockConfigDir } from '../../utils/paths.js';
```

- [ ] **Step 6: Kernel main.ts 读取 `CUSTOM_AGENTS_DIR` 并预加载自定义 Agent**

修改 `kernel/src/main.ts`：

```ts
import { existsSync, readFileSync } from 'fs';

const CUSTOM_AGENTS_DIR = process.env.CUSTOM_AGENTS_DIR || '';
```

在 manifest 预加载后添加：

```ts
// 预加载自定义明文 Agent
if (CUSTOM_AGENTS_DIR) {
  try {
    const customManifestPath = resolve(CUSTOM_AGENTS_DIR, 'manifest.json');
    if (existsSync(customManifestPath)) {
      const customManifest = JSON.parse(readFileSync(customManifestPath, 'utf8'));
      for (const agent of customManifest.agents || []) {
        try {
          loadAgentOnDemand(agent.id, AGENTS_DIR, CUSTOM_AGENTS_DIR);
        } catch (err) {
          console.error(`[Kernel] Pre-load custom agent '${agent.id}' failed:`, err);
        }
      }
      console.log(`[Kernel] Custom agents pre-loaded: ${customManifest.agents.length}`);
    }
  } catch (err) {
    console.error('[Kernel] Failed to pre-load custom agents:', err);
  }
}
```

- [ ] **Step 7: 在 session.create 与 session.restore 传入 CUSTOM_AGENTS_DIR**

在 `kernel/src/main.ts` 的 `session.create` 分支中：

```ts
const config = loadAgentOnDemand(agentId, AGENTS_DIR, CUSTOM_AGENTS_DIR);
```

在 `session.restore` 分支中：

```ts
const config = loadAgentOnDemand(aid, AGENTS_DIR, CUSTOM_AGENTS_DIR);
```

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm vitest run kernel/__tests__/agent-loader.test.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add kernel/src/agent/agent-loader.ts kernel/src/main.ts electron/extensions/kernel/kernel-launcher.ts kernel/__tests__/agent-loader.test.ts
git commit -m "feat(kernel): support loading plaintext agents from ~/.clawdock/custom-agents"
```

---

### Task 3: IPC 路由与合并列表

**Files:**
- Modify: `electron/extensions/marketplace/marketplace-api.ts`
- Modify: `src/lib/kernel-client.ts`
- Test: `electron/__tests__/marketplace-api-custom.test.ts`（可选 mock IPC）

- [ ] **Step 1: 在 marketplace-api.ts 中导入自定义 store**

```ts
import {
  addCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
  listCustomAgents,
  type CustomAgentInput,
} from './custom-agent-store.js';
```

- [ ] **Step 2: 修改 listAgents / getAgent 合并逻辑**

替换现有 `marketplace:listAgents`：

```ts
ipcMain.handle('marketplace:listAgents', async () => {
  try {
    const manifest = readManifest();
    const custom = listCustomAgents();
    return { success: true, agents: [...manifest.agents, ...custom] };
  } catch (err) {
    console.error('[Marketplace] listAgents error:', err);
    return { success: false, error: (err as Error).message };
  }
});
```

替换现有 `marketplace:getAgent`：

```ts
ipcMain.handle('marketplace:getAgent', async (_event, agentId: string) => {
  try {
    const custom = listCustomAgents();
    const customAgent = custom.find(a => a.id === agentId);
    if (customAgent) return { success: true, agent: customAgent };

    const manifest = readManifest();
    const agent = manifest.agents.find(a => a.id === agentId);
    if (agent) return { success: true, agent };
    return { success: false, error: `Agent '${agentId}' not found` };
  } catch (err) {
    console.error('[Marketplace] getAgent error:', err);
    return { success: false, error: (err as Error).message };
  }
});
```

- [ ] **Step 3: 新增自定义 Agent CRUD IPC handle**

```ts
ipcMain.handle('marketplace:createCustomAgent', async (_event, payload: CustomAgentInput) => {
  try {
    const entry = await addCustomAgent(payload);
    return { success: true, agent: entry };
  } catch (err) {
    console.error('[Marketplace] createCustomAgent error:', err);
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('marketplace:updateCustomAgent', async (_event, agentId: string, payload: CustomAgentInput) => {
  try {
    await deleteCustomAgent(agentId);
    const entry = await addCustomAgent({ ...payload, id: agentId });
    return { success: true, agent: entry };
  } catch (err) {
    console.error('[Marketplace] updateCustomAgent error:', err);
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('marketplace:deleteCustomAgent', async (_event, agentId: string) => {
  try {
    deleteCustomAgent(agentId);
    return { success: true };
  } catch (err) {
    console.error('[Marketplace] deleteCustomAgent error:', err);
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('marketplace:listCustomAgents', async () => {
  try {
    return { success: true, agents: listCustomAgents() };
  } catch (err) {
    console.error('[Marketplace] listCustomAgents error:', err);
    return { success: false, error: (err as Error).message };
  }
});
```

- [ ] **Step 4: 在 kernel-client.ts 新增方法**

```ts
async createCustomAgent(payload: Omit<AgentInfo, 'version'> & { soul: string; agents?: string; tools?: string; user?: string; memory?: string; heartbeat?: string; maxTurns?: number }): Promise<{ success: boolean; agent?: AgentInfo; error?: string }> {
  return window.electron.ipcRenderer.invoke('marketplace:createCustomAgent', payload);
}

async updateCustomAgent(agentId: string, payload: Omit<AgentInfo, 'version'> & { soul: string; agents?: string; tools?: string; user?: string; memory?: string; heartbeat?: string; maxTurns?: number }): Promise<{ success: boolean; agent?: AgentInfo; error?: string }> {
  return window.electron.ipcRenderer.invoke('marketplace:updateCustomAgent', agentId, payload);
}

async deleteCustomAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
  return window.electron.ipcRenderer.invoke('marketplace:deleteCustomAgent', agentId);
}

async listCustomAgents(): Promise<{ success: boolean; agents?: AgentInfo[]; error?: string }> {
  return window.electron.ipcRenderer.invoke('marketplace:listCustomAgents');
}
```

- [ ] **Step 5: 提交**

```bash
git add electron/extensions/marketplace/marketplace-api.ts src/lib/kernel-client.ts
git commit -m "feat(marketplace): add custom agent CRUD IPC routes"
```

---

### Task 4: 前端自定义 Agent 编辑页

**Files:**
- Create: `src/modules/goclaw/custom-agent-editor.tsx`
- Modify: `src/App.tsx`
- Test: `src/modules/goclaw/__tests__/custom-agent-editor.test.tsx`（可选）

- [ ] **Step 1: 编写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomAgentEditor } from './custom-agent-editor';

describe('CustomAgentEditor', () => {
  it('renders form fields', () => {
    render(<CustomAgentEditor />);
    expect(screen.getByPlaceholderText('给 Agent 取个名字')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/modules/goclaw/__tests__/custom-agent-editor.test.tsx`
Expected: FAIL `Cannot find module`

- [ ] **Step 3: 实现编辑页（最小可用）**

```tsx
/**
 * Custom Agent Editor - 用户创建/编辑自定义 Agent
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { kernelClient } from '@/lib/kernel-client';
import { CATEGORIES } from './marketplace';

export function CustomAgentEditor() {
  const navigate = useNavigate();
  const { agentId } = useParams<{ agentId?: string }>();
  const isEdit = Boolean(agentId);

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    emoji: '🤖',
    creature: '',
    vibe: '',
    description: '',
    tags: [CATEGORIES[1]],
    scenarios: '',
    soul: '',
    agents: '',
    tools: '',
    user: '',
    memory: '',
  });

  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      id: agentId || form.name,
      tags: form.tags,
      scenarios: form.scenarios.split('\n').filter(Boolean),
    };
    const result = isEdit
      ? await kernelClient.updateCustomAgent(agentId!, payload)
      : await kernelClient.createCustomAgent(payload);
    setSaving(false);
    if (result.success) {
      navigate('/goclaw/marketplace');
    } else {
      alert(result.error || '保存失败');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-6 overflow-auto p-1">
      <div>
        <h1 className="text-2xl font-bold">{isEdit ? '编辑 Agent' : '创建 Agent'}</h1>
        <p className="text-sm text-muted-foreground">定义 Agent 的人设、记忆和能力</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="给 Agent 取个名字" />
        </div>
        <div className="space-y-2">
          <Label>昵称</Label>
          <Input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="简短称呼" />
        </div>
        <div className="space-y-2">
          <Label>Emoji</Label>
          <Input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🤖" />
        </div>
        <div className="space-y-2">
          <Label>分类</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={form.tags[0]}
            onChange={e => setForm(f => ({ ...f, tags: [e.target.value] }))}
          >
            {CATEGORIES.filter(c => c !== '全部').map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>一句话定位（creature）</Label>
        <Input value={form.creature} onChange={e => setForm(f => ({ ...f, creature: e.target.value }))} placeholder="例如：耐心的全栈编程搭档" />
      </div>

      <div className="space-y-2">
        <Label>风格（vibe）</Label>
        <Input value={form.vibe} onChange={e => setForm(f => ({ ...f, vibe: e.target.value }))} placeholder="例如：友好、细致、鼓励式" />
      </div>

      <div className="space-y-2">
        <Label>简介</Label>
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="在应用广场上显示的简介" />
      </div>

      <div className="space-y-2">
        <Label>擅长场景（每行一个）</Label>
        <Textarea value={form.scenarios} onChange={e => setForm(f => ({ ...f, scenarios: e.target.value }))} placeholder="重构函数\n写单元测试" rows={3} />
      </div>

      <div className="space-y-2">
        <Label>核心人格 SOUL.md</Label>
        <Textarea value={form.soul} onChange={e => setForm(f => ({ ...f, soul: e.target.value }))} placeholder="你是谁、使命、原则..." rows={6} />
      </div>

      <div className="space-y-2">
        <Label>会话规则 AGENTS.md（可选）</Label>
        <Textarea value={form.agents} onChange={e => setForm(f => ({ ...f, agents: e.target.value }))} placeholder="每次会话的工作流程、决策树" rows={4} />
      </div>

      <div className="space-y-2">
        <Label>工具说明 TOOLS.md（可选）</Label>
        <Textarea value={form.tools} onChange={e => setForm(f => ({ ...f, tools: e.target.value }))} placeholder="这个 Agent 应该如何使用工具" rows={4} />
      </div>

      <div className="space-y-2">
        <Label>用户画像 USER.md（记忆）</Label>
        <Textarea value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))} placeholder="你的用户是谁、偏好、背景" rows={4} />
      </div>

      <div className="space-y-2">
        <Label>长期记忆 MEMORY.md（记忆）</Label>
        <Textarea value={form.memory} onChange={e => setForm(f => ({ ...f, memory: e.target.value }))} placeholder="需要 Agent 记住的事实、偏好、历史" rows={4} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存 Agent'}</Button>
        <Button type="button" variant="outline" onClick={() => navigate('/goclaw/marketplace')}>取消</Button>
      </div>
    </form>
  );
}
```

> 说明：若项目没有 `@/components/ui/textarea` 或 `@/components/ui/label`，按 shadcn/ui 方式新增。

- [ ] **Step 4: 在 App.tsx 添加路由**

```tsx
import { CustomAgentEditor } from './modules/goclaw/custom-agent-editor';

// 在 /goclaw 路由下新增
<Route path="custom-agent/new" element={<CustomAgentEditor />} />
<Route path="custom-agent/:agentId/edit" element={<CustomAgentEditor />} />
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run src/modules/goclaw/__tests__/custom-agent-editor.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/modules/goclaw/custom-agent-editor.tsx src/App.tsx src/modules/goclaw/__tests__/custom-agent-editor.test.tsx
git commit -m "feat(ui): add custom agent editor page"
```

---

### Task 5: 应用广场入口与我的 Agent 管理

**Files:**
- Modify: `src/modules/goclaw/marketplace.tsx`
- Create: `src/modules/goclaw/my-agents.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 marketplace.tsx Header 添加创建入口**

在 Header 右侧：

```tsx
import { Plus } from 'lucide-react';

<div className="flex items-center gap-2">
  <Button variant="outline" size="sm" onClick={() => navigate('/goclaw/custom-agent/new')}>
    <Plus className="mr-1 h-4 w-4" />
    创建 Agent
  </Button>
  <Button variant="ghost" size="sm" onClick={() => navigate('/goclaw/my-agents')}>
    我的 Agent
  </Button>
  <UsageBar feature="marketplace" />
</div>
```

- [ ] **Step 2: 创建我的 Agent 管理页**

```tsx
/**
 * My Agents - 管理用户创建的自定义 Agent
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { kernelClient } from '@/lib/kernel-client';
import type { AgentInfo } from '@/lib/kernel-client';

export function MyAgents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kernelClient.listCustomAgents().then(result => {
      if (result.success) setAgents(result.agents || []);
      setLoading(false);
    });
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('确定删除这个自定义 Agent？此操作不可恢复。')) return;
    const result = await kernelClient.deleteCustomAgent(id);
    if (result.success) {
      setAgents(prev => prev.filter(a => a.id !== id));
    }
  }

  if (loading) return <div className="p-4">加载中...</div>;

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的 Agent</h1>
        <Button onClick={() => navigate('/goclaw/custom-agent/new')}>创建 Agent</Button>
      </div>
      {agents.length === 0 ? (
        <p className="text-muted-foreground">还没有自定义 Agent，去创建一个吧。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <div key={agent.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="text-3xl">{agent.emoji}</div>
                <div>
                  <h3 className="font-semibold">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{agent.creature}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => navigate(`/goclaw/chat/${agent.id}`)}>雇佣</Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/goclaw/custom-agent/${agent.id}/edit`)}>编辑</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(agent.id)}>删除</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

> 注意：`Button` 没有 `variant="destructive"` 时改用 `outline` + 红色样式。

- [ ] **Step 3: App.tsx 添加路由**

```tsx
import { MyAgents } from './modules/goclaw/my-agents';

<Route path="my-agents" element={<MyAgents />} />
```

- [ ] **Step 4: 提交**

```bash
git add src/modules/goclaw/marketplace.tsx src/modules/goclaw/my-agents.tsx src/App.tsx
git commit -m "feat(ui): add create button and my agents management page"
```

---

### Task 6: 端到端验证与类型修复

**Files:**
- 全项目 TypeScript 类型检查

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: 0 errors（根据现有项目命令可能是 `pnpm tsc --noEmit` 或 `pnpm run typecheck`）

- [ ] **Step 2: 启动 Electron 开发模式验证**

Run: `pnpm dev`

手动验证：
1. 进入「超级助手 → 应用广场」
2. 点击「创建 Agent」
3. 填写表单并保存
4. 在广场找到自己的 Agent
5. 点击雇佣，确认能进入聊天页并发送消息
6. 返回「我的 Agent」编辑/删除

- [ ] **Step 3: 修复类型错误并提交**

```bash
git add .
git commit -m "fix(types): resolve custom agent feature typecheck errors"
```

---

## 7. 测试策略

| 层级 | 命令 | 目标 |
|------|------|------|
| 单元测试 | `pnpm vitest run electron/__tests__/custom-agent-store.test.ts` | 明文 markdown CRUD、注册表更新 |
| 单元测试 | `pnpm vitest run kernel/__tests__/agent-loader.test.ts` | 明文 Agent 解析、自定义目录优先 |
| 类型检查 | `pnpm typecheck` | 全项目无 TS 错误 |
| 手动 E2E | `pnpm dev` | 创建、雇佣、编辑、删除 |

---

## 8. 风险与回滚

- **ID 冲突：** 强制 `custom-` 前缀，避免覆盖预设 Agent。
- **路径不存在：** `addCustomAgent` 自动创建目录；Kernel 启动时若 `CUSTOM_AGENTS_DIR` 为空则跳过自定义加载。
- **明文文件损坏：** 解析失败时抛出错误并在 Kernel 日志中打印，UI 层显示加载失败。
- **回滚：** 删除 `~/.clawdock/custom-agents/` 目录即可移除所有自定义 Agent；代码回滚只需还原 3 个文件。
- **加密失败：** 自定义 Agent 加密失败时回退到明文 JSON（仅开发模式），生产模式必须失败报错。
- **Kernel 未运行：** `marketplace:hireAgent` 已自动启动 Kernel，自定义 Agent 在启动时通过 `CUSTOM_AGENTS_DIR` 注入。
- **删除不可恢复：** 删除前必须二次确认，且只删除 `.enc` 与注册表项，保留明文源文件 7 天作为软删除（可选后续实现）。

---

## 9. 后续演进

1. **Agent 自动维护记忆：** 在 ReAct 循环中提供 `write_memory` / `read_memory` 工具，让 Agent 自动更新 `memory/MEMORY.md`。
2. **模板市场：** 允许用户基于预设 Agent 「Fork」到自己的自定义 Agent。
3. **导入/导出：** 支持导出 `custom-agents/<agentId>/` 为 zip，或导入 OpenClaw 目录结构。
4. **版本管理：** 自定义 Agent 支持版本号与升级。
