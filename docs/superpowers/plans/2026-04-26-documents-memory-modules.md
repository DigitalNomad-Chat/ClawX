# 文档中心与记忆增强模块移植计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 将 openclaw-control-center 的文档中心（Docs）和记忆增强（Memory+）模块移植到 ClawX Electron 桌面客户端中，使 ClawX 具备管理 Markdown 文档和监控记忆系统健康状态的能力。

**架构：** 采用 ClawX 双面模块注册系统，后端通过 IPC Host API 暴露文件操作和状态查询接口，前端使用 React + Zustand 渲染。共享基础设施（工作区解析、文件服务、通用组件）提取到 `_shared/` 目录供两个模块复用。

**Tech Stack:** Electron 40+, React 19, TypeScript, Zustand, Tailwind CSS, shadcn/ui, node:fs/promises, IPC via hostApiFetch

---

## 文件结构映射

### 新增后端共享文件（`electron/modules/_shared/`）

| 文件 | 职责 |
|------|------|
| `workspace-resolver.ts` | 解析 OpenClaw 工作区根目录、智能体配置和目录 |
| `editable-file-service.ts` | 文件发现、读取、写入，路径安全校验 |
| `editable-file-types.ts` | 共享类型定义（EditableFileEntry, EditableAgentScope） |
| `module-logger.ts` | 模块级命名空间日志（已存在，复用） |

### 文档模块后端（`electron/modules/documents/`）

| 文件 | 职责 |
|------|------|
| `index.ts` | 模块注册（修改现有存根） |
| `routes.ts` | Host API 路由（4 个端点） |
| `doc-hub.ts` | 聊天历史结构化文档提取（复用控制中心逻辑） |

### 记忆模块后端（`electron/modules/memory-plus/`）

| 文件 | 职责 |
|------|------|
| `index.ts` | 模块注册（修改现有存根） |
| `routes.ts` | Host API 路由（5 个端点） |
| `memory-status.ts` | 记忆系统健康状态查询（CLI + Gateway RPC 双通道） |

### 前端共享组件（`src/modules/_shared/`）

| 文件 | 职责 |
|------|------|
| `components/MarkdownEditor.tsx` | Markdown 预览/编辑双模式（基于 `@uiw/react-md-editor` 或 shadcn textarea + `react-markdown`） |
| `components/EditableFileList.tsx` | 文件列表卡片，支持 scope/facet 切换 |
| `components/AgentFacetTabs.tsx` | 智能体标签页切换 |
| `hooks/useAutoSave.ts` | 自动保存 hook（防抖） |

### 文档模块前端（`src/modules/documents/`）

| 文件 | 职责 |
|------|------|
| `index.tsx` | 模块注册（修改现有存根） |
| `DocumentsPage.tsx` | 主页面：概览 + 文件列表 + 编辑器 |
| `store.ts` | Zustand store |
| `types.ts` | 模块类型定义 |
| `i18n/index.ts` | zh/en 翻译 |

### 记忆模块前端（`src/modules/memory-plus/`）

| 文件 | 职责 |
|------|------|
| `index.tsx` | 模块注册（修改现有存根） |
| `MemoryPage.tsx` | 主页面：概览 + 状态卡片 + 文件列表 + 编辑器 |
| `store.ts` | Zustand store |
| `types.ts` | 模块类型定义 |
| `i18n/index.ts` | zh/en 翻译 |
| `components/StatusCard.tsx` | 记忆状态概览卡片 |
| `components/AgentStatusRow.tsx` | 单个智能体状态行 |

---

## Chunk 1: 后端共享基础设施

### Task 1: 定义共享类型

**Files:**
- Create: `electron/modules/_shared/editable-file-types.ts`

- [ ] **Step 1: 编写类型定义**

```typescript
export interface EditableFileEntry {
  scope: "memory" | "workspace";
  title: string;
  excerpt: string;
  category: string;
  sourcePath: string;
  relativePath: string;
  updatedAt: string;
  size: number;
  facetKey?: string;
  facetLabel?: string;
}

export interface EditableAgentScope {
  agentId: string;
  facetKey: string;
  facetLabel: string;
  workspaceRoot: string;
}

export type EditableFileScope = "memory" | "workspace";
export type EditableAgentScopeConfigStatus = "configured" | "config_invalid" | "config_missing";
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/_shared/editable-file-types.ts
git commit -m "feat(doc-memory): add shared editable file types"
```

### Task 2: 工作区解析器

**Files:**
- Create: `electron/modules/_shared/workspace-resolver.ts`
- Modify: `electron/modules/_shared/index.ts`（如果存在，导出新增模块）

- [ ] **Step 1: 实现解析器**

```typescript
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { EditableAgentScope, EditableAgentScopeConfigStatus } from "./editable-file-types";

export const OPENCLAW_HOME_DIR = process.env.OPENCLAW_HOME?.trim() || join(homedir(), ".openclaw");
export const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || join(OPENCLAW_HOME_DIR, "openclaw.json");

function safeReadTextFileSync(path: string): string | undefined {
  try { return readFileSync(path, "utf8"); } catch { return undefined; }
}

function normalizeLookupKey(input: string): string {
  return input.trim().toLowerCase();
}

function humanizeOperatorLabel(input: string): string {
  return input.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeWorkspaceOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "未标注" || trimmed === "unlisted") return undefined;
  return trimmed;
}

function asObject(input: unknown): Record<string, unknown> | undefined {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : undefined;
}
function asArray(input: unknown): unknown[] { return Array.isArray(input) ? input : []; }
function asString(input: unknown): string | undefined { return typeof input === "string" ? input : undefined; }

export function resolveOpenClawWorkspaceRoot(
  explicitWorkspaceRoot?: string,
  configText?: string,
  configPath: string = OPENCLAW_CONFIG_PATH,
): string {
  const explicit = explicitWorkspaceRoot?.trim();
  if (explicit) return resolve(explicit);
  const text = configText ?? safeReadTextFileSync(configPath);
  if (!text?.trim()) return join(OPENCLAW_HOME_DIR, "workspace");
  try {
    const root = asObject(JSON.parse(text));
    const agents = asObject(root?.agents);
    const list = asArray(agents?.list);
    const inferredRoots = new Set<string>();
    for (const item of list) {
      const row = asObject(item);
      const ws = normalizeWorkspaceOverride(asString(row?.workspace));
      if (!ws) continue;
      const wsPath = resolve(dirname(configPath), ws);
      if (basename(dirname(wsPath)).toLowerCase() === "agents") {
        inferredRoots.add(dirname(dirname(wsPath)));
      }
    }
    if (inferredRoots.size === 1) return [...inferredRoots][0];
    const mainRow = list.map(asObject).find((r) => normalizeLookupKey(asString(r?.id) ?? asString(r?.name) ?? "") === "main");
    const mainWs = normalizeWorkspaceOverride(asString(mainRow?.workspace));
    if (mainWs) return resolve(dirname(configPath), mainWs);
  } catch { /* ignore */ }
  return join(OPENCLAW_HOME_DIR, "workspace");
}

function resolveConfiguredAgentWorkspace(rawWorkspace: string | undefined, agentId: string, configDir: string): string | undefined {
  const ws = normalizeWorkspaceOverride(rawWorkspace);
  return ws ? resolve(configDir, ws) : undefined;
}

function buildMainEditableAgentScope(workspaceRoot: string): EditableAgentScope {
  return { agentId: "main", facetKey: "main", facetLabel: "Main", workspaceRoot };
}

export function resolveEditableAgentScopes(
  configPath: string = OPENCLAW_CONFIG_PATH,
  workspaceRoot?: string,
): { status: EditableAgentScopeConfigStatus; scopes: EditableAgentScope[] } {
  const root = workspaceRoot ?? resolveOpenClawWorkspaceRoot(undefined, undefined, configPath);
  const raw = safeReadTextFileSync(configPath);
  if (!raw?.trim()) {
    const fallback = loadFromWorkspaceDirs(root);
    return { status: fallback.length > 1 ? "configured" : "config_missing", scopes: fallback };
  }
  try {
    const parsed = asObject(JSON.parse(raw));
    const agents = asObject(parsed?.agents);
    const list = asArray(agents?.list);
    const output: EditableAgentScope[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      const row = asObject(item);
      if (!row) continue;
      const rawId = asString(row.id)?.trim() ?? asString(row.name)?.trim() ?? "";
      const key = normalizeLookupKey(rawId);
      if (!rawId || !key || seen.has(key)) continue;
      seen.add(key);
      const ws = key === "main"
        ? root
        : (resolveConfiguredAgentWorkspace(asString(row.workspace)?.trim(), rawId, dirname(configPath)) ?? join(root, "agents", rawId));
      output.push({ agentId: rawId, facetKey: key, facetLabel: key === "main" ? "Main" : humanizeOperatorLabel(rawId), workspaceRoot: ws });
    }
    if (output.length === 0) return { status: "config_invalid", scopes: [buildMainEditableAgentScope(root)] };
    return { status: "configured", scopes: ensureMain(output, root) };
  } catch {
    return { status: "config_invalid", scopes: [buildMainEditableAgentScope(root)] };
  }
}

function ensureMain(scopes: EditableAgentScope[], root: string): EditableAgentScope[] {
  if (scopes.some((s) => s.facetKey === "main")) return scopes;
  return [buildMainEditableAgentScope(root), ...scopes];
}

function loadFromWorkspaceDirs(root: string): EditableAgentScope[] {
  const { readdirSync, statSync } = require("node:fs");
  const output: EditableAgentScope[] = [buildMainEditableAgentScope(root)];
  const agentsDir = join(root, "agents");
  try {
    for (const name of readdirSync(agentsDir)) {
      const path = join(agentsDir, name);
      if (!statSync(path).isDirectory()) continue;
      const key = normalizeLookupKey(name);
      if (!key) continue;
      output.push({ agentId: name, facetKey: key, facetLabel: humanizeOperatorLabel(name), workspaceRoot: path });
    }
  } catch { /* ignore */ }
  return output;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/_shared/workspace-resolver.ts
git commit -m "feat(doc-memory): add OpenClaw workspace resolver"
```

### Task 3: 文件服务

**Files:**
- Create: `electron/modules/_shared/editable-file-service.ts`

- [ ] **Step 1: 实现文件服务**

```typescript
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { EditableFileEntry, EditableAgentScope, EditableFileScope } from "./editable-file-types";
import { resolveEditableAgentScopes, OPENCLAW_CONFIG_PATH, resolveOpenClawWorkspaceRoot } from "./workspace-resolver";

const EDITABLE_TEXT_FILE_MAX_BYTES = 1024 * 1024;
const EDITABLE_TEXT_CONTENT_MAX_CHARS = 240_000;
const MEMORY_EDITABLE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const WORKSPACE_EDITABLE_EXTENSIONS = new Set([".md", ".markdown"]);
const WORKSPACE_EDITABLE_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

const SHARED_DOCUMENT_FILE_CANDIDATES = [
  "AGENTS.md", "IDENTITY.md", "SOUL.md", "USER.md", "TASKS.md",
  "BOOTSTRAP.md", "HEARTBEAT.md", "TOOLS.md",
] as const;

const AGENT_DOCUMENT_FILE_CANDIDATES = [
  "AGENTS.md", "IDENTITY.md", "SOUL.md", "USER.md", "TASKS.md",
  "HEARTBEAT.md", "TOOLS.md", "README.md", "BOOTSTRAP.md",
  "NOTEBOOK.md", "focus.md", "inbox.md", "routines.md",
] as const;

async function safeReadTextFile(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); } catch { return undefined; }
}

function toPlainSummary(raw: string, maxLength: number): string {
  const cleaned = raw.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + "...";
}

async function buildEntry(input: {
  scope: EditableFileScope; category: string; sourcePath: string;
  relativeBase?: string; facetKey?: string; facetLabel?: string;
}): Promise<EditableFileEntry | undefined> {
  try {
    const meta = await stat(input.sourcePath);
    if (!meta.isFile() || meta.size > EDITABLE_TEXT_FILE_MAX_BYTES) return undefined;
    const raw = await safeReadTextFile(input.sourcePath);
    if (raw === undefined) return undefined;
    const relativePath = input.relativeBase
      ? relative(input.relativeBase, input.sourcePath) || basename(input.sourcePath)
      : basename(input.sourcePath);
    return {
      scope: input.scope, title: basename(input.sourcePath) || relativePath,
      excerpt: toPlainSummary(raw, 160), category: input.category,
      sourcePath: input.sourcePath, relativePath, updatedAt: meta.mtime.toISOString(),
      size: meta.size, facetKey: input.facetKey, facetLabel: input.facetLabel,
    };
  } catch { return undefined; }
}

export async function listEditableMemoryFiles(): Promise<EditableFileEntry[]> {
  const output: EditableFileEntry[] = [];
  const seen = new Set<string>();
  const root = resolveOpenClawWorkspaceRoot();
  const scopes = resolveEditableAgentScopes().scopes;
  const append = async (entry: EditableFileEntry | undefined) => {
    if (!entry) return;
    const key = `${entry.facetKey ?? ""}::${resolve(entry.sourcePath)}`;
    if (seen.has(key)) return;
    seen.add(key); output.push(entry);
  };
  // Main MEMORY.md
  await append(await buildEntry({ scope: "memory", category: "Main 长期记忆", sourcePath: join(root, "MEMORY.md"), relativeBase: root, facetKey: "main", facetLabel: "Main" }));
  // Main memory/ dir
  const mainMemoryDir = join(root, "memory");
  try { for (const name of await readdir(mainMemoryDir)) {
    const path = join(mainMemoryDir, name);
    const ext = extname(name).toLowerCase();
    if (!MEMORY_EDITABLE_EXTENSIONS.has(ext)) continue;
    await append(await buildEntry({ scope: "memory", category: "Main 记忆记录", sourcePath: path, relativeBase: root, facetKey: "main", facetLabel: "Main" }));
  }} catch { /* ignore */ }
  // Agent scopes
  for (const scope of scopes) {
    if (scope.facetKey === "main") continue;
    await append(await buildEntry({ scope: "memory", category: `${scope.facetLabel} 长期记忆`, sourcePath: join(scope.workspaceRoot, "MEMORY.md"), relativeBase: root, facetKey: scope.facetKey, facetLabel: scope.facetLabel }));
    const agentMemoryDir = join(scope.workspaceRoot, "memory");
    try { for (const name of await readdir(agentMemoryDir)) {
      const path = join(agentMemoryDir, name);
      const ext = extname(name).toLowerCase();
      if (!MEMORY_EDITABLE_EXTENSIONS.has(ext)) continue;
      await append(await buildEntry({ scope: "memory", category: `${scope.facetLabel} 记忆记录`, sourcePath: path, relativeBase: root, facetKey: scope.facetKey, facetLabel: scope.facetLabel }));
    }} catch { /* ignore */ }
  }
  return output.sort((a, b) => (a.facetKey === "main" ? -1 : b.facetKey === "main" ? 1 : (a.facetLabel ?? "").localeCompare(b.facetLabel ?? "", "zh-Hans-CN")) || b.updatedAt.localeCompare(a.updatedAt) || a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN"));
}

export async function listEditableWorkspaceFiles(): Promise<EditableFileEntry[]> {
  const output: EditableFileEntry[] = [];
  const seen = new Set<string>();
  const root = resolveOpenClawWorkspaceRoot();
  const scopes = resolveEditableAgentScopes().scopes;
  const append = async (entry: EditableFileEntry | undefined) => {
    if (!entry) return;
    const key = `${entry.facetKey ?? ""}::${resolve(entry.sourcePath)}`;
    if (seen.has(key)) return;
    seen.add(key); output.push(entry);
  };
  // Main shared docs
  for (const rel of SHARED_DOCUMENT_FILE_CANDIDATES) {
    await append(await buildEntry({ scope: "workspace", category: "Main 核心文档", sourcePath: join(root, rel), relativeBase: root, facetKey: "main", facetLabel: "Main" }));
  }
  // Walk workspace markdown files
  async function walk(dir: string, current: string): Promise<void> {
    try { for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) { if (!WORKSPACE_EDITABLE_SKIP_DIRS.has(entry.name)) await walk(dir, path); continue; }
      if (!entry.isFile()) continue;
      if (!WORKSPACE_EDITABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      await append(await buildEntry({ scope: "workspace", category: "Main 工作区文档", sourcePath: path, relativeBase: root, facetKey: "main", facetLabel: "Main" }));
    }} catch { /* ignore */ }
  }
  await walk(root, root);
  // Agent core docs
  for (const scope of scopes) {
    if (scope.facetKey === "main") continue;
    for (const name of AGENT_DOCUMENT_FILE_CANDIDATES) {
      await append(await buildEntry({ scope: "workspace", category: `${scope.facetLabel} 核心文档`, sourcePath: join(scope.workspaceRoot, name), relativeBase: root, facetKey: scope.facetKey, facetLabel: scope.facetLabel }));
    }
  }
  return output.sort((a, b) => {
    const fa = a.facetLabel ?? "", fb = b.facetLabel ?? "";
    if (fa !== fb) { if (fa === "Main") return -1; if (fb === "Main") return 1; return fa.localeCompare(fb, "zh-Hans-CN"); }
    const pa = documentFilePriority(a.relativePath) - documentFilePriority(b.relativePath);
    if (pa !== 0) return pa;
    return a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN");
  });
}

function documentFilePriority(relativePath: string): number {
  const name = basename(relativePath).toLowerCase();
  const order = ["agents.md", "identity.md", "soul.md", "user.md", "hall.md", "tasks.md", "bootstrap.md", "heartbeat.md", "tools.md", "readme.md", "notebook.md", "focus.md", "inbox.md", "routines.md", "learnings.md"];
  const i = order.indexOf(name);
  return i === -1 ? order.length + 1 : i;
}

function isPathWithin(target: string, allowedRoot: string): boolean {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(allowedRoot);
  return resolvedTarget.startsWith(resolvedRoot + "/") || resolvedTarget === resolvedRoot;
}

export async function readEditableFile(scope: EditableFileScope, filePath: string): Promise<{ entry: EditableFileEntry; content: string } | undefined> {
  const root = resolveOpenClawWorkspaceRoot();
  const scopes = resolveEditableAgentScopes().scopes;
  const candidates = scope === "memory" ? await listEditableMemoryFiles() : await listEditableWorkspaceFiles();
  const match = candidates.find((c) => c.relativePath === filePath || c.sourcePath === filePath);
  if (!match) return undefined;
  if (!isPathWithin(match.sourcePath, root)) return undefined;
  const content = await safeReadTextFile(match.sourcePath);
  if (content === undefined) return undefined;
  return { entry: match, content };
}

export async function writeEditableFileContent(scope: EditableFileScope, filePath: string, content: string): Promise<{ entry: EditableFileEntry; content: string } | undefined> {
  if (content.length > EDITABLE_TEXT_CONTENT_MAX_CHARS) throw new Error("Content exceeds max length");
  const result = await readEditableFile(scope, filePath);
  if (!result) return undefined;
  const { entry } = result;
  if (!isPathWithin(entry.sourcePath, resolveOpenClawWorkspaceRoot())) return undefined;
  await mkdir(dirname(entry.sourcePath), { recursive: true });
  await writeFile(entry.sourcePath, content, "utf8");
  const updated = await buildEntry({ scope, category: entry.category, sourcePath: entry.sourcePath, relativeBase: resolveOpenClawWorkspaceRoot(), facetKey: entry.facetKey, facetLabel: entry.facetLabel });
  return updated ? { entry: updated, content } : undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/_shared/editable-file-service.ts
git commit -m "feat(doc-memory): add editable file service with path security"
```

---

## Chunk 2: 文档模块后端

### Task 4: 文档模块路由

**Files:**
- Create: `electron/modules/documents/routes.ts`
- Modify: `electron/modules/documents/index.ts`

- [ ] **Step 1: 实现路由**

```typescript
import type { ModuleRouteHandler } from "../types";
import { createModuleLogger } from "../_shared/module-logger";
import { listEditableWorkspaceFiles, readEditableFile, writeEditableFileContent } from "../_shared/editable-file-service";
import { resolveEditableAgentScopes } from "../_shared/workspace-resolver";

const logger = createModuleLogger("documents");

export const documentRouteHandlers: ModuleRouteHandler[] = [
  {
    method: "GET",
    path: "/api/documents/files",
    handler: async (ctx) => {
      try {
        const files = await listEditableWorkspaceFiles();
        ctx.res.statusCode = 200;
        ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, count: files.length, files }));
      } catch (err) {
        logger.error("Failed to list document files:", err);
        ctx.res.statusCode = 500;
        ctx.res.end(JSON.stringify({ ok: false, error: "Failed to list files" }));
      }
    },
  },
  {
    method: "GET",
    path: "/api/documents/files/content",
    handler: async (ctx) => {
      try {
        const path = new URL(ctx.req.url ?? "/", "http://localhost").searchParams.get("path");
        if (!path) { ctx.res.statusCode = 400; ctx.res.end(JSON.stringify({ ok: false, error: "path is required" })); return; }
        const result = await readEditableFile("workspace", path);
        if (!result) { ctx.res.statusCode = 404; ctx.res.end(JSON.stringify({ ok: false, error: "File not found" })); return; }
        ctx.res.statusCode = 200;
        ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, entry: result.entry, content: result.content }));
      } catch (err) {
        logger.error("Failed to read document:", err);
        ctx.res.statusCode = 500;
        ctx.res.end(JSON.stringify({ ok: false, error: "Failed to read file" }));
      }
    },
  },
  {
    method: "PUT",
    path: "/api/documents/files/content",
    handler: async (ctx) => {
      try {
        const body = await new Promise<unknown>((resolve, reject) => {
          let data = "";
          ctx.req.on("data", (c) => (data += c));
          ctx.req.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
          ctx.req.on("error", reject);
        });
        const payload = body as Record<string, unknown>;
        const filePath = typeof payload.path === "string" ? payload.path : "";
        const content = typeof payload.content === "string" ? payload.content : "";
        if (!filePath) { ctx.res.statusCode = 400; ctx.res.end(JSON.stringify({ ok: false, error: "path is required" })); return; }
        const result = await writeEditableFileContent("workspace", filePath, content);
        if (!result) { ctx.res.statusCode = 404; ctx.res.end(JSON.stringify({ ok: false, error: "File not found" })); return; }
        ctx.res.statusCode = 200;
        ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, entry: result.entry, content: result.content }));
      } catch (err) {
        logger.error("Failed to write document:", err);
        ctx.res.statusCode = 500;
        ctx.res.end(JSON.stringify({ ok: false, error: "Failed to write file" }));
      }
    },
  },
  {
    method: "GET",
    path: "/api/documents/agents",
    handler: async (ctx) => {
      try {
        const scopes = resolveEditableAgentScopes().scopes;
        ctx.res.statusCode = 200;
        ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, agents: scopes.map((s) => ({ key: s.facetKey, label: s.facetLabel })) }));
      } catch (err) {
        logger.error("Failed to list agents:", err);
        ctx.res.statusCode = 500;
        ctx.res.end(JSON.stringify({ ok: false, error: "Failed to list agents" }));
      }
    },
  },
];
```

- [ ] **Step 2: 更新模块注册**

```typescript
// electron/modules/documents/index.ts
import type { BackendModule } from "../types";
import { documentRouteHandlers } from "./routes";

const documentsModule: BackendModule = {
  id: "documents",
  name: "文档中心",
  routeHandlers: documentRouteHandlers,
  enabledByDefault: true,
};

export default documentsModule;
```

- [ ] **Step 3: Commit**

```bash
git add electron/modules/documents/routes.ts electron/modules/documents/index.ts
git commit -m "feat(documents): add backend routes for document CRUD"
```

---

## Chunk 3: 记忆模块后端

### Task 5: 记忆状态查询

**Files:**
- Create: `electron/modules/memory-plus/memory-status.ts`

- [ ] **Step 1: 实现记忆状态查询**

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const execFileAsync = promisify(execFile);
const INSIGHT_CACHE_TTL_MS = 15_000;
const INSIGHT_COMMAND_TIMEOUT_MS = 8_000;
const INSIGHT_COMMAND_MAX_BUFFER = 4 * 1024 * 1024;

export type OpenClawInsightStatus = "ok" | "warn" | "blocked" | "info" | "unknown";

export interface OpenClawMemoryAgentSummary {
  agentId: string;
  status: OpenClawInsightStatus;
  files: number;
  chunks: number;
  issuesCount: number;
  dirty: boolean;
  vectorAvailable: boolean;
  searchable: boolean;
  lastUpdateAt?: string;
}

export interface OpenClawMemorySummary {
  generatedAt: string;
  status: OpenClawInsightStatus;
  okCount: number;
  warnCount: number;
  blockedCount: number;
  agents: OpenClawMemoryAgentSummary[];
}

interface TimedSourceCache<T> { value: T; expiresAt: number; }

let memoryCache: TimedSourceCache<OpenClawMemorySummary> | undefined;
let memoryInFlight: Promise<OpenClawMemorySummary> | undefined;

export async function loadCachedOpenClawMemorySummary(): Promise<OpenClawMemorySummary> {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) return memoryCache.value;
  if (memoryInFlight) return memoryInFlight;
  const next = fetchMemorySummary();
  memoryInFlight = next;
  try {
    const value = await next;
    memoryCache = { value, expiresAt: now + INSIGHT_CACHE_TTL_MS };
    return value;
  } finally { memoryInFlight = undefined; }
}

async function fetchMemorySummary(): Promise<OpenClawMemorySummary> {
  try {
    const json = await runOpenClawJson(["memory", "status", "--json"]);
    return summarizeOpenClawMemory(json);
  } catch {
    return { generatedAt: new Date().toISOString(), status: "unknown", okCount: 0, warnCount: 0, blockedCount: 0, agents: [] };
  }
}

function summarizeOpenClawMemory(memoryJson: unknown): OpenClawMemorySummary {
  const items = asArray(memoryJson).map((item) => {
    const root = asObject(item) ?? {};
    const status = asObject(root.status);
    const vector = asObject(status?.vector);
    const custom = asObject(status?.custom);
    const qmd = asObject(custom?.qmd);
    const scan = asObject(root.scan);
    const issues = asArray(scan?.issues);
    const files = asNumber(status?.files) ?? 0;
    const chunks = asNumber(status?.chunks) ?? 0;
    const dirty = asBoolean(status?.dirty) === true;
    const vectorAvailable = asBoolean(vector?.available) === true;
    const searchable = files > 0 && vectorAvailable;
    let agentStatus: OpenClawInsightStatus = "ok";
    if (!vectorAvailable || issues.length > 0) agentStatus = "warn";
    if (files === 0 || chunks === 0) agentStatus = "blocked";
    else if (dirty) agentStatus = "info";
    return {
      agentId: asString(root.agentId) ?? "unknown", status: agentStatus, files, chunks,
      issuesCount: issues.length, dirty, vectorAvailable, searchable,
      lastUpdateAt: asString(qmd?.lastUpdateAt),
    } satisfies OpenClawMemoryAgentSummary;
  });
  const okCount = items.filter((i) => i.status === "ok").length;
  const warnCount = items.filter((i) => i.status === "warn" || i.status === "info").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  return {
    generatedAt: new Date().toISOString(),
    status: blockedCount > 0 ? "blocked" : warnCount > 0 ? "warn" : okCount > 0 ? "ok" : "unknown",
    okCount, warnCount, blockedCount,
    agents: items.sort((a, b) => insightStatusRank(a.status) - insightStatusRank(b.status) || a.agentId.localeCompare(b.agentId)),
  };
}

function insightStatusRank(s: OpenClawInsightStatus): number {
  return s === "blocked" ? 0 : s === "warn" ? 1 : s === "info" ? 2 : s === "ok" ? 3 : 4;
}

async function runOpenClawJson(args: string[]): Promise<unknown> {
  const candidates = buildOpenClawCommandCandidates();
  const env = buildOpenClawCommandEnv();
  for (const command of candidates) {
    try {
      const { stdout } = await execFileAsync(command, args, { env, timeout: INSIGHT_COMMAND_TIMEOUT_MS, maxBuffer: INSIGHT_COMMAND_MAX_BUFFER });
      return parseEmbeddedJson(stdout) ?? {};
    } catch (error) {
      const recovered = recoverOpenClawCommandJson(error);
      if (recovered !== undefined) return recovered;
      if (!shouldTryNextOpenClawCommand(error)) return {};
    }
  }
  return {};
}

function buildOpenClawCommandCandidates(): string[] {
  const explicit = (process.env.OPENCLAW_BIN_PATH ?? process.env.OPENCLAW_BIN ?? "").trim();
  const candidates = [explicit, "openclaw"];
  if (process.platform === "win32") candidates.push("openclaw.cmd");
  return [...new Set(candidates.filter(Boolean))];
}

const CLEAN_CONFIG_PATH = join(homedir(), ".openclaw", ".control-center-clean.json");
let cleanConfigChecked = false;

function ensureCleanOpenClawConfig(): void {
  if (cleanConfigChecked) return;
  cleanConfigChecked = true;
  try {
    const raw = readFileSync(join(homedir(), ".openclaw", "openclaw.json"), "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    delete data.plugins;
    writeFileSync(CLEAN_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch { /* best-effort */ }
}

function buildOpenClawCommandEnv(): NodeJS.ProcessEnv {
  const baseEnv = { ...process.env };
  const openClawHome = process.env.OPENCLAW_HOME?.trim();
  if (openClawHome && basename(openClawHome) === ".openclaw") {
    baseEnv.OPENCLAW_HOME = dirname(openClawHome);
  }
  ensureCleanOpenClawConfig();
  if (existsSync(CLEAN_CONFIG_PATH) && !process.env.OPENCLAW_CONFIG_PATH?.trim()) {
    baseEnv.OPENCLAW_CONFIG_PATH = CLEAN_CONFIG_PATH;
  }
  return baseEnv;
}

function shouldTryNextOpenClawCommand(error: unknown): boolean {
  const root = asObject(error);
  const code = root?.code;
  if (code === "ENOENT") return true;
  if (process.platform !== "win32") return false;
  const stderr = typeof root?.stderr === "string" ? root.stderr : "";
  const message = typeof root?.message === "string" ? root.message : "";
  return /not recognized/i.test(`${stderr}\n${message}`) || /cannot find the file/i.test(`${stderr}\n${message}`);
}

function recoverOpenClawCommandJson(error: unknown): unknown {
  const root = asObject(error);
  const stdout = typeof root?.stdout === "string" ? root.stdout : "";
  if (!stdout.trim()) return undefined;
  return parseEmbeddedJson(stdout);
}

function parseEmbeddedJson(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { /* keep scanning */ }
  const starts: number[] = [];
  for (let i = 0; i < input.length; i++) { if (input[i] === "{" || input[i] === "[") starts.push(i); }
  for (const start of starts) {
    try { return JSON.parse(input.slice(start).trim()); } catch { /* next */ }
  }
  return undefined;
}

function asObject(input: unknown): Record<string, unknown> | undefined {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
}
function asArray(input: unknown): unknown[] { return Array.isArray(input) ? input : []; }
function asString(input: unknown): string | undefined { return typeof input === "string" && input.trim() ? input : undefined; }
function asNumber(input: unknown): number | undefined { return typeof input === "number" && Number.isFinite(input) ? input : undefined; }
function asBoolean(input: unknown): boolean | undefined { return typeof input === "boolean" ? input : undefined; }
```

- [ ] **Step 2: Commit**

```bash
git add electron/modules/memory-plus/memory-status.ts
git commit -m "feat(memory): add memory status query via openclaw CLI"
```

### Task 6: 记忆模块路由

**Files:**
- Create: `electron/modules/memory-plus/routes.ts`
- Modify: `electron/modules/memory-plus/index.ts`

- [ ] **Step 1: 实现路由**

```typescript
import type { ModuleRouteHandler } from "../types";
import { createModuleLogger } from "../_shared/module-logger";
import { listEditableMemoryFiles, readEditableFile, writeEditableFileContent } from "../_shared/editable-file-service";
import { resolveEditableAgentScopes } from "../_shared/workspace-resolver";
import { loadCachedOpenClawMemorySummary } from "./memory-status";

const logger = createModuleLogger("memory-plus");

export const memoryRouteHandlers: ModuleRouteHandler[] = [
  {
    method: "GET", path: "/api/memory/files",
    handler: async (ctx) => {
      try {
        const files = await listEditableMemoryFiles();
        ctx.res.statusCode = 200;
        ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, count: files.length, files }));
      } catch (err) { logger.error("Failed to list memory files:", err); ctx.res.statusCode = 500; ctx.res.end(JSON.stringify({ ok: false, error: "Failed to list files" })); }
    },
  },
  {
    method: "GET", path: "/api/memory/files/content",
    handler: async (ctx) => {
      try {
        const path = new URL(ctx.req.url ?? "/", "http://localhost").searchParams.get("path");
        if (!path) { ctx.res.statusCode = 400; ctx.res.end(JSON.stringify({ ok: false, error: "path is required" })); return; }
        const result = await readEditableFile("memory", path);
        if (!result) { ctx.res.statusCode = 404; ctx.res.end(JSON.stringify({ ok: false, error: "File not found" })); return; }
        ctx.res.statusCode = 200; ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, entry: result.entry, content: result.content }));
      } catch (err) { logger.error("Failed to read memory file:", err); ctx.res.statusCode = 500; ctx.res.end(JSON.stringify({ ok: false, error: "Failed to read file" })); }
    },
  },
  {
    method: "PUT", path: "/api/memory/files/content",
    handler: async (ctx) => {
      try {
        const body = await new Promise<unknown>((resolve, reject) => {
          let data = "";
          ctx.req.on("data", (c) => (data += c));
          ctx.req.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
          ctx.req.on("error", reject);
        });
        const payload = body as Record<string, unknown>;
        const filePath = typeof payload.path === "string" ? payload.path : "";
        const content = typeof payload.content === "string" ? payload.content : "";
        if (!filePath) { ctx.res.statusCode = 400; ctx.res.end(JSON.stringify({ ok: false, error: "path is required" })); return; }
        const result = await writeEditableFileContent("memory", filePath, content);
        if (!result) { ctx.res.statusCode = 404; ctx.res.end(JSON.stringify({ ok: false, error: "File not found" })); return; }
        ctx.res.statusCode = 200; ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, entry: result.entry, content: result.content }));
      } catch (err) { logger.error("Failed to write memory file:", err); ctx.res.statusCode = 500; ctx.res.end(JSON.stringify({ ok: false, error: "Failed to write file" })); }
    },
  },
  {
    method: "GET", path: "/api/memory/agents",
    handler: async (ctx) => {
      try {
        const scopes = resolveEditableAgentScopes().scopes;
        ctx.res.statusCode = 200; ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, agents: scopes.map((s) => ({ key: s.facetKey, label: s.facetLabel })) }));
      } catch (err) { logger.error("Failed to list agents:", err); ctx.res.statusCode = 500; ctx.res.end(JSON.stringify({ ok: false, error: "Failed to list agents" })); }
    },
  },
  {
    method: "GET", path: "/api/memory/status",
    handler: async (ctx) => {
      try {
        const summary = await loadCachedOpenClawMemorySummary();
        ctx.res.statusCode = 200; ctx.res.setHeader("Content-Type", "application/json");
        ctx.res.end(JSON.stringify({ ok: true, summary }));
      } catch (err) { logger.error("Failed to load memory status:", err); ctx.res.statusCode = 500; ctx.res.end(JSON.stringify({ ok: false, error: "Failed to load memory status" })); }
    },
  },
];
```

- [ ] **Step 2: 更新模块注册**

```typescript
// electron/modules/memory-plus/index.ts
import type { BackendModule } from "../types";
import { memoryRouteHandlers } from "./routes";

const memoryPlusModule: BackendModule = {
  id: "memory-plus", name: "记忆增强",
  routeHandlers: memoryRouteHandlers, enabledByDefault: true,
};

export default memoryPlusModule;
```

- [ ] **Step 3: Commit**

```bash
git add electron/modules/memory-plus/routes.ts electron/modules/memory-plus/index.ts
git commit -m "feat(memory): add backend routes for memory CRUD and status"
```

---

## Chunk 4: 前端共享组件

### Task 7: Markdown 编辑器组件

**Files:**
- Create: `src/modules/_shared/components/MarkdownEditor.tsx`

- [ ] **Step 1: 使用现有 shadcn textarea + react-markdown 实现**

```tsx
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Pencil, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

export function MarkdownEditor({ initialContent, onSave, readOnly = false }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try { await onSave(content); setDirty(false); } finally { setSaving(false); }
  }, [content, onSave]);

  return (
    <div className="flex flex-col h-full gap-3">
      <Tabs defaultValue={readOnly ? "preview" : "edit"} className="flex flex-col flex-1">
        <TabsList className="self-start">
          <TabsTrigger value="edit" disabled={readOnly}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> 编辑
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="w-3.5 h-3.5 mr-1" /> 预览
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="flex-1 flex flex-col mt-2">
          <Textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            className="flex-1 font-mono text-sm resize-none min-h-[300px]"
            disabled={readOnly}
          />
          <div className="flex justify-end gap-2 mt-2">
            {dirty && <span className="text-xs text-muted-foreground self-center">有未保存的更改</span>}
            <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="preview" className="flex-1 mt-2">
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 border rounded-md bg-card min-h-[300px] overflow-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/_shared/components/MarkdownEditor.tsx
git commit -m "feat(ui): add shared MarkdownEditor component"
```

### Task 8: 文件列表和智能体标签页

**Files:**
- Create: `src/modules/_shared/components/EditableFileList.tsx`
- Create: `src/modules/_shared/components/AgentFacetTabs.tsx`

- [ ] **Step 1: 实现文件列表**

```tsx
import { useState, useMemo } from "react";
import { FileText, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { EditableFileEntry } from "../../../../electron/modules/_shared/editable-file-types";

interface EditableFileListProps {
  entries: EditableFileEntry[];
  selectedPath: string | null;
  onSelect: (entry: EditableFileEntry) => void;
  facetKey?: string;
}

export function EditableFileList({ entries, selectedPath, onSelect, facetKey }: EditableFileListProps) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = entries;
    if (facetKey) list = list.filter((e) => e.facetKey === facetKey || facetKey === "all");
    if (!needle) return list;
    return list.filter((e) => e.title.toLowerCase().includes(needle) || e.excerpt.toLowerCase().includes(needle) || e.category.toLowerCase().includes(needle));
  }, [entries, search, facetKey]);

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜索文件..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="flex-1 overflow-auto border rounded-md">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">没有找到文件</div>
        ) : (
          <div className="divide-y">
            {filtered.map((entry) => (
              <button
                key={entry.sourcePath}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${selectedPath === entry.sourcePath ? "bg-accent" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{entry.title}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.excerpt}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="bg-secondary px-1.5 py-0.5 rounded">{entry.category}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(entry.updatedAt).toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现智能体标签页**

```tsx
interface AgentFacetTabsProps {
  agents: Array<{ key: string; label: string }>;
  activeKey: string;
  onChange: (key: string) => void;
  includeAll?: boolean;
}

export function AgentFacetTabs({ agents, activeKey, onChange, includeAll = false }: AgentFacetTabsProps) {
  const tabs = includeAll ? [{ key: "all", label: "全部" }, ...agents] : agents;
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {tabs.map((agent) => (
        <button
          key={agent.key}
          onClick={() => onChange(agent.key)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
            activeKey === agent.key
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {agent.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/_shared/components/EditableFileList.tsx src/modules/_shared/components/AgentFacetTabs.tsx
git commit -m "feat(ui): add shared file list and agent facet tabs"
```

---

## Chunk 5: 文档模块前端

### Task 9: 文档 Store 和类型

**Files:**
- Create: `src/modules/documents/types.ts`
- Create: `src/modules/documents/store.ts`
- Create: `src/modules/documents/i18n/index.ts`

- [ ] **Step 1: 类型和 Store**

```typescript
// types.ts
export interface DocumentAgent {
  key: string;
  label: string;
}

export interface DocumentFile {
  title: string;
  excerpt: string;
  category: string;
  sourcePath: string;
  relativePath: string;
  updatedAt: string;
  size: number;
  facetKey?: string;
  facetLabel?: string;
}

export interface DocumentState {
  files: DocumentFile[];
  agents: DocumentAgent[];
  selectedFile: DocumentFile | null;
  selectedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  activeFacet: string;
}
```

```typescript
// store.ts
import { create } from "zustand";
import { hostApiFetch } from "@/lib/host-api";
import type { DocumentState, DocumentFile, DocumentAgent } from "./types";

interface DocumentStore extends DocumentState {
  loadFiles: () => Promise<void>;
  loadAgents: () => Promise<void>;
  selectFile: (file: DocumentFile) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  setActiveFacet: (facet: string) => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  files: [], agents: [], selectedFile: null, selectedContent: "",
  loading: false, saving: false, error: null, activeFacet: "main",

  loadFiles: async () => {
    set({ loading: true, error: null });
    try {
      const res = await hostApiFetch<{ ok: boolean; files: DocumentFile[] }>("/api/documents/files");
      if (!res.ok) throw new Error("Failed to load files");
      set({ files: res.files, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  },

  loadAgents: async () => {
    try {
      const res = await hostApiFetch<{ ok: boolean; agents: DocumentAgent[] }>("/api/documents/agents");
      if (!res.ok) throw new Error("Failed to load agents");
      set({ agents: res.agents });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  selectFile: async (file) => {
    set({ selectedFile: file, selectedContent: "" });
    try {
      const res = await hostApiFetch<{ ok: boolean; content: string }>(`/api/documents/files/content?path=${encodeURIComponent(file.relativePath)}`);
      if (!res.ok) throw new Error("Failed to load content");
      set({ selectedContent: res.content });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  saveFile: async (path, content) => {
    set({ saving: true });
    try {
      const res = await hostApiFetch<{ ok: boolean }>("/api/documents/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await get().loadFiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      set({ saving: false });
    }
  },

  setActiveFacet: (facet) => set({ activeFacet: facet }),
}));
```

```typescript
// i18n/index.ts
const translations = {
  zh: {
    pageTitle: "文档中心",
    overview: "文档概览",
    mainDocuments: "Main 文档",
    files: "份",
    agentsFound: "已发现智能体",
    items: "个",
    availableViews: "可切换查看",
    description: "这里只保留 Main 文档，以及当前启用智能体最常用、最值得调整的那几份 Markdown。",
    noFiles: "当前没有发现可编辑的 Main 文档或智能体核心文档。",
    documentWorkbench: "文档工作台",
    saveHint: "保存后会直接写回源文件。",
  },
  en: {
    pageTitle: "Document Center",
    overview: "Document Overview",
    mainDocuments: "Main documents",
    files: "files",
    agentsFound: "Agents found",
    items: "items",
    availableViews: "Available views",
    description: "Keeps only Main documents plus the most useful Markdown files for each active agent.",
    noFiles: "No editable Main documents or core agent documents were found.",
    documentWorkbench: "Document Workbench",
    saveHint: "Edits write back to source files.",
  },
} as const;

export function t(key: keyof typeof translations.zh, lang: "zh" | "en"): string {
  return translations[lang]?.[key] ?? translations.en[key];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/documents/types.ts src/modules/documents/store.ts src/modules/documents/i18n/index.ts
git commit -m "feat(documents): add frontend store, types, and i18n"
```

### Task 10: 文档页面和模块注册

**Files:**
- Create: `src/modules/documents/DocumentsPage.tsx`
- Modify: `src/modules/documents/index.tsx`

- [ ] **Step 1: 实现页面**

```tsx
import { useEffect } from "react";
import { FileText } from "lucide-react";
import { ModulePageLayout } from "../_shared/ModulePageLayout";
import { useDocumentStore } from "./store";
import { t } from "./i18n";
import { MarkdownEditor } from "../_shared/components/MarkdownEditor";
import { EditableFileList } from "../_shared/components/EditableFileList";
import { AgentFacetTabs } from "../_shared/components/AgentFacetTabs";

export function DocumentsPage() {
  const lang = "zh" as const;
  const store = useDocumentStore();
  const { files, agents, selectedFile, selectedContent, loading, saving, activeFacet } = store;
  const mainCount = files.filter((f) => f.facetKey === "main").length;

  useEffect(() => { store.loadFiles(); store.loadAgents(); }, []);

  return (
    <ModulePageLayout title={t("pageTitle", lang)} icon={<FileText className="w-5 h-5" />}>
      <div className="space-y-4">
        {/* Overview Card */}
        <div className="bg-card border rounded-lg p-4">
          <h2 className="text-lg font-semibold">{t("overview", lang)}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            {t("mainDocuments", lang)} {mainCount} {t("files", lang)} · {t("agentsFound", lang)} {Math.max(0, agents.filter((a) => a.key !== "main").length)} {t("items", lang)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{t("description", lang)}</div>
        </div>

        {/* Agent Tabs */}
        <AgentFacetTabs agents={agents} activeKey={activeFacet} onChange={store.setActiveFacet} />

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: "500px" }}>
          <div className="lg:col-span-1 border rounded-lg overflow-hidden bg-card">
            <div className="p-2 border-b bg-muted/50 text-sm font-medium">{t("documentWorkbench", lang)}</div>
            <div className="p-2 h-[calc(500px-40px)]">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">加载中...</div>
              ) : (
                <EditableFileList entries={files} selectedPath={selectedFile?.sourcePath ?? null} onSelect={store.selectFile} facetKey={activeFacet} />
              )}
            </div>
          </div>
          <div className="lg:col-span-2 border rounded-lg overflow-hidden bg-card flex flex-col">
            <div className="p-2 border-b bg-muted/50 text-sm font-medium flex justify-between items-center">
              <span>{selectedFile ? selectedFile.title : "请选择一个文件"}</span>
              {selectedFile && <span className="text-xs text-muted-foreground">{t("saveHint", lang)}</span>}
            </div>
            <div className="flex-1 p-2 overflow-auto">
              {selectedFile ? (
                <MarkdownEditor initialContent={selectedContent} onSave={(c) => store.saveFile(selectedFile.relativePath, c)} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{t("noFiles", lang)}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
```

- [ ] **Step 2: 更新模块注册**

```tsx
// src/modules/documents/index.tsx
import type { FrontendModule } from "../types";
import { Route } from "react-router-dom";
import { FileText } from "lucide-react";
import { DocumentsPage } from "./DocumentsPage";

const documentsModule: FrontendModule = {
  id: "documents",
  name: "文档中心",
  routes: [<Route key="documents" path="/documents" element={<DocumentsPage />} />],
  navItems: [{ path: "/documents", label: "文档中心", icon: <FileText className="w-4 h-4" />, order: 25 }],
  enabledByDefault: true,
};

export default documentsModule;
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/documents/DocumentsPage.tsx src/modules/documents/index.tsx
git commit -m "feat(documents): add DocumentsPage and module registration"
```

---

## Chunk 6: 记忆模块前端

### Task 11: 记忆 Store 和类型

**Files:**
- Create: `src/modules/memory-plus/types.ts`
- Create: `src/modules/memory-plus/store.ts`
- Create: `src/modules/memory-plus/i18n/index.ts`

- [ ] **Step 1: 类型和 Store**

```typescript
// types.ts
export interface MemoryAgent {
  key: string;
  label: string;
}

export interface MemoryFile {
  title: string;
  excerpt: string;
  category: string;
  sourcePath: string;
  relativePath: string;
  updatedAt: string;
  size: number;
  facetKey?: string;
  facetLabel?: string;
}

export interface MemoryAgentStatus {
  agentId: string;
  status: "ok" | "warn" | "blocked" | "info" | "unknown";
  files: number;
  chunks: number;
  issuesCount: number;
  dirty: boolean;
  vectorAvailable: boolean;
  searchable: boolean;
  lastUpdateAt?: string;
}

export interface MemoryStatusSummary {
  generatedAt: string;
  status: "ok" | "warn" | "blocked" | "info" | "unknown";
  okCount: number;
  warnCount: number;
  blockedCount: number;
  agents: MemoryAgentStatus[];
}

export interface MemoryState {
  files: MemoryFile[];
  agents: MemoryAgent[];
  status: MemoryStatusSummary | null;
  selectedFile: MemoryFile | null;
  selectedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  activeFacet: string;
}
```

```typescript
// store.ts
import { create } from "zustand";
import { hostApiFetch } from "@/lib/host-api";
import type { MemoryState, MemoryFile, MemoryAgent, MemoryStatusSummary } from "./types";

interface MemoryStore extends MemoryState {
  loadFiles: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadStatus: () => Promise<void>;
  selectFile: (file: MemoryFile) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  setActiveFacet: (facet: string) => void;
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  files: [], agents: [], status: null, selectedFile: null, selectedContent: "",
  loading: false, saving: false, error: null, activeFacet: "main",

  loadFiles: async () => {
    set({ loading: true, error: null });
    try {
      const res = await hostApiFetch<{ ok: boolean; files: MemoryFile[] }>("/api/memory/files");
      if (!res.ok) throw new Error("Failed to load files");
      set({ files: res.files, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error", loading: false });
    }
  },

  loadAgents: async () => {
    try {
      const res = await hostApiFetch<{ ok: boolean; agents: MemoryAgent[] }>("/api/memory/agents");
      if (!res.ok) throw new Error("Failed to load agents");
      set({ agents: res.agents });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  loadStatus: async () => {
    try {
      const res = await hostApiFetch<{ ok: boolean; summary: MemoryStatusSummary }>("/api/memory/status");
      if (!res.ok) throw new Error("Failed to load status");
      set({ status: res.summary });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  selectFile: async (file) => {
    set({ selectedFile: file, selectedContent: "" });
    try {
      const res = await hostApiFetch<{ ok: boolean; content: string }>(`/api/memory/files/content?path=${encodeURIComponent(file.relativePath)}`);
      if (!res.ok) throw new Error("Failed to load content");
      set({ selectedContent: res.content });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  saveFile: async (path, content) => {
    set({ saving: true });
    try {
      const res = await hostApiFetch<{ ok: boolean }>("/api/memory/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await get().loadFiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      set({ saving: false });
    }
  },

  setActiveFacet: (facet) => set({ activeFacet: facet }),
}));
```

```typescript
// i18n/index.ts
const translations = {
  zh: {
    pageTitle: "记忆增强",
    overview: "记忆概览",
    mainMemories: "Main 记忆",
    files: "份",
    agentsFound: "已发现智能体",
    items: "个",
    availableViews: "可切换查看",
    description: "这里只保留记忆相关文件：根目录 MEMORY.md、memory/，以及各智能体自己的 MEMORY.md 与 memory/。",
    noFiles: "当前没有可编辑的记忆文件。",
    memoryWorkbench: "记忆文件工作台",
    saveHint: "保存后会写回原文件。",
    memoryStatus: "记忆状态",
    healthy: "正常",
    needsAttention: "需关注",
    unavailable: "不可用",
    fileCount: "份记忆",
    chunkCount: "个块",
    searchable: "可搜索",
    searchNotReady: "搜索未就绪",
    refreshPending: "待刷新",
    issues: "个异常",
    ready: "可用",
    check: "检查",
    statusOk: "当前可见智能体的记忆状态正常。",
    statusWarn: "记忆整体可用，但有些智能体还需要检查。",
    statusBlocked: "有智能体的记忆还不可用。",
  },
  en: {
    pageTitle: "Memory+",
    overview: "Memory Overview",
    mainMemories: "Main memories",
    files: "files",
    agentsFound: "Agents found",
    items: "items",
    availableViews: "Available views",
    description: "Keeps only memory-related files: root MEMORY.md, memory/, and each agent's own MEMORY.md and memory/.",
    noFiles: "There are no editable memory files right now.",
    memoryWorkbench: "Memory Workbench",
    saveHint: "Saving writes back to source files.",
    memoryStatus: "Memory Status",
    healthy: "Healthy",
    needsAttention: "Needs attention",
    unavailable: "Unavailable",
    fileCount: "files",
    chunkCount: "chunks",
    searchable: "searchable",
    searchNotReady: "search not ready",
    refreshPending: "refresh pending",
    issues: "issue(s)",
    ready: "Ready",
    check: "Check",
    statusOk: "Memory looks healthy for the visible agents.",
    statusWarn: "Memory works, but some agents still need attention.",
    statusBlocked: "Some agents still do not have usable memory.",
  },
} as const;

export function t(key: keyof typeof translations.zh, lang: "zh" | "en"): string {
  return translations[lang]?.[key] ?? translations.en[key];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/memory-plus/types.ts src/modules/memory-plus/store.ts src/modules/memory-plus/i18n/index.ts
git commit -m "feat(memory): add frontend store, types, and i18n"
```

### Task 12: 状态卡片组件

**Files:**
- Create: `src/modules/memory-plus/components/StatusCard.tsx`

- [ ] **Step 1: 实现状态卡片**

```tsx
import { Brain, AlertTriangle, XCircle, CheckCircle, Info } from "lucide-react";
import type { MemoryStatusSummary, MemoryAgentStatus } from "../types";
import { t } from "../i18n";

interface StatusCardProps {
  summary: MemoryStatusSummary | null;
  lang: "zh" | "en";
}

function statusIcon(status: MemoryAgentStatus["status"]) {
  if (status === "ok") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  if (status === "blocked") return <XCircle className="w-4 h-4 text-red-500" />;
  return <Info className="w-4 h-4 text-blue-500" />;
}

function statusBadgeClass(status: MemoryAgentStatus["status"]) {
  if (status === "ok") return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
  if (status === "warn") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
  if (status === "blocked") return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
}

export function StatusCard({ summary, lang }: StatusCardProps) {
  if (!summary) {
    return (
      <div className="bg-card border rounded-lg p-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Brain className="w-5 h-5" />{t("memoryStatus", lang)}</h2>
        <div className="text-sm text-muted-foreground mt-2">正在读取记忆状态...</div>
      </div>
    );
  }

  const headline = summary.status === "blocked" ? t("statusBlocked", lang)
    : summary.status === "warn" ? t("statusWarn", lang)
    : t("statusOk", lang);

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Brain className="w-5 h-5" />{t("memoryStatus", lang)}</h2>
          <div className="text-sm text-muted-foreground mt-1">{headline}</div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeClass(summary.status)}`}>
          {summary.status === "ok" ? t("healthy", lang) : summary.status === "warn" ? t("needsAttention", lang) : summary.status === "blocked" ? t("unavailable", lang) : "Loading"}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-secondary/50 rounded p-2 text-center"><div className="text-lg font-bold text-green-600">{summary.okCount}</div><div className="text-xs text-muted-foreground">{t("healthy", lang)}</div></div>
        <div className="bg-secondary/50 rounded p-2 text-center"><div className="text-lg font-bold text-yellow-600">{summary.warnCount}</div><div className="text-xs text-muted-foreground">{t("needsAttention", lang)}</div></div>
        <div className="bg-secondary/50 rounded p-2 text-center"><div className="text-lg font-bold text-red-600">{summary.blockedCount}</div><div className="text-xs text-muted-foreground">{t("unavailable", lang)}</div></div>
      </div>
      <div className="mt-3 space-y-2">
        {summary.agents.map((agent) => (
          <div key={agent.agentId} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
            <div className="flex items-center gap-2">
              {statusIcon(agent.status)}
              <div>
                <div className="text-sm font-medium">{agent.agentId}</div>
                <div className="text-xs text-muted-foreground">
                  {agent.files} {t("fileCount", lang)} · {agent.chunks} {t("chunkCount", lang)} · {agent.searchable ? t("searchable", lang) : t("searchNotReady", lang)}
                  {agent.issuesCount > 0 ? ` · ${agent.issuesCount} ${t("issues", lang)}` : agent.dirty ? ` · ${t("refreshPending", lang)}` : ""}
                  {agent.lastUpdateAt ? ` · ${new Date(agent.lastUpdateAt).toLocaleString()}` : ""}
                </div>
              </div>
            </div>
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(agent.status)}`}>
              {agent.searchable ? t("ready", lang) : t("check", lang)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/memory-plus/components/StatusCard.tsx
git commit -m "feat(memory): add memory status card component"
```

### Task 13: 记忆页面和模块注册

**Files:**
- Create: `src/modules/memory-plus/MemoryPage.tsx`
- Modify: `src/modules/memory-plus/index.tsx`

- [ ] **Step 1: 实现页面**

```tsx
import { useEffect } from "react";
import { Brain } from "lucide-react";
import { ModulePageLayout } from "../_shared/ModulePageLayout";
import { useMemoryStore } from "./store";
import { t } from "./i18n";
import { MarkdownEditor } from "../_shared/components/MarkdownEditor";
import { EditableFileList } from "../_shared/components/EditableFileList";
import { AgentFacetTabs } from "../_shared/components/AgentFacetTabs";
import { StatusCard } from "./components/StatusCard";

export function MemoryPage() {
  const lang = "zh" as const;
  const store = useMemoryStore();
  const { files, agents, status, selectedFile, selectedContent, loading, saving, activeFacet } = store;
  const mainCount = files.filter((f) => f.facetKey === "main").length;

  useEffect(() => {
    store.loadFiles();
    store.loadAgents();
    store.loadStatus();
    const interval = setInterval(() => store.loadStatus(), 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ModulePageLayout title={t("pageTitle", lang)} icon={<Brain className="w-5 h-5" />}>
      <div className="space-y-4">
        {/* Overview Card */}
        <div className="bg-card border rounded-lg p-4">
          <h2 className="text-lg font-semibold">{t("overview", lang)}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            Main {t("mainMemories", lang)} {mainCount} {t("files", lang)} · {t("agentsFound", lang)} {Math.max(0, agents.filter((a) => a.key !== "main").length)} {t("items", lang)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{t("description", lang)}</div>
        </div>

        {/* Agent Tabs */}
        <AgentFacetTabs agents={agents} activeKey={activeFacet} onChange={store.setActiveFacet} />

        {/* Status Card */}
        <StatusCard summary={status} lang={lang} />

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: "500px" }}>
          <div className="lg:col-span-1 border rounded-lg overflow-hidden bg-card">
            <div className="p-2 border-b bg-muted/50 text-sm font-medium">{t("memoryWorkbench", lang)}</div>
            <div className="p-2 h-[calc(500px-40px)]">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">加载中...</div>
              ) : (
                <EditableFileList entries={files} selectedPath={selectedFile?.sourcePath ?? null} onSelect={store.selectFile} facetKey={activeFacet} />
              )}
            </div>
          </div>
          <div className="lg:col-span-2 border rounded-lg overflow-hidden bg-card flex flex-col">
            <div className="p-2 border-b bg-muted/50 text-sm font-medium flex justify-between items-center">
              <span>{selectedFile ? selectedFile.title : "请选择一个文件"}</span>
              {selectedFile && <span className="text-xs text-muted-foreground">{t("saveHint", lang)}</span>}
            </div>
            <div className="flex-1 p-2 overflow-auto">
              {selectedFile ? (
                <MarkdownEditor initialContent={selectedContent} onSave={(c) => store.saveFile(selectedFile.relativePath, c)} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{t("noFiles", lang)}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
```

- [ ] **Step 2: 更新模块注册**

```tsx
// src/modules/memory-plus/index.tsx
import type { FrontendModule } from "../types";
import { Route } from "react-router-dom";
import { Brain } from "lucide-react";
import { MemoryPage } from "./MemoryPage";

const memoryPlusModule: FrontendModule = {
  id: "memory-plus",
  name: "记忆增强",
  routes: [<Route key="memory-plus" path="/memory-plus" element={<MemoryPage />} />],
  navItems: [{ path: "/memory-plus", label: "记忆增强", icon: <Brain className="w-4 h-4" />, order: 26 }],
  enabledByDefault: true,
};

export default memoryPlusModule;
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/memory-plus/MemoryPage.tsx src/modules/memory-plus/index.tsx src/modules/memory-plus/components/StatusCard.tsx
git commit -m "feat(memory): add MemoryPage and module registration"
```

---

## 验收与测试

### 测试清单

- [ ] 启动 ClawX 开发模式 (`pnpm dev`)，确认无编译错误
- [ ] 确认侧边栏出现"文档中心"和"记忆增强"导航项
- [ ] 访问 `/documents`，确认文件列表加载正常
- [ ] 点击文件，确认 Markdown 编辑器显示内容
- [ ] 编辑并保存文件，确认写入源文件
- [ ] 访问 `/memory-plus`，确认记忆文件列表加载
- [ ] 确认记忆状态卡片显示智能体状态
- [ ] 确认智能体标签页切换过滤文件列表
- [ ] 运行 `pnpm lint` 和 `pnpm typecheck`，确认无错误
- [ ] 运行 `pnpm test`，确认现有测试通过

### 最终提交

```bash
git commit -m "feat: integrate documents and memory+ modules from openclaw-control-center"
```
