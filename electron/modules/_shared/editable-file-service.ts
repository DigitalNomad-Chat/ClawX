import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { EditableFileEntry, EditableAgentScope, EditableFileScope } from "./editable-file-types";
import { resolveEditableAgentScopes, OPENCLAW_CONFIG_PATH, resolveOpenClawWorkspaceRoot } from "./workspace-resolver";

const EDITABLE_TEXT_FILE_MAX_BYTES = 1024 * 1024;
const EDITABLE_TEXT_CONTENT_MAX_CHARS = 240_000;
const MEMORY_EDITABLE_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const WORKSPACE_EDITABLE_EXTENSIONS = new Set([".md", ".markdown"]);
const WORKSPACE_EDITABLE_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "agents", "state", "scripts", "skills", "docs"]);

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
  scope: EditableFileScope;
  category: string;
  sourcePath: string;
  relativeBase?: string;
  facetKey?: string;
  facetLabel?: string;
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
      scope: input.scope,
      title: basename(input.sourcePath) || relativePath,
      excerpt: toPlainSummary(raw, 160),
      category: input.category,
      sourcePath: input.sourcePath,
      relativePath,
      updatedAt: meta.mtime.toISOString(),
      size: meta.size,
      facetKey: input.facetKey,
      facetLabel: input.facetLabel,
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
    seen.add(key);
    output.push(entry);
  };

  // Main MEMORY.md
  await append(await buildEntry({
    scope: "memory",
    category: "Main 长期记忆",
    sourcePath: join(root, "MEMORY.md"),
    relativeBase: root,
    facetKey: "main",
    facetLabel: "Main",
  }));

  // Main memory/ dir
  const mainMemoryDir = join(root, "memory");
  try {
    for (const name of await readdir(mainMemoryDir)) {
      const path = join(mainMemoryDir, name);
      const ext = extname(name).toLowerCase();
      if (!MEMORY_EDITABLE_EXTENSIONS.has(ext)) continue;
      await append(await buildEntry({
        scope: "memory",
        category: "Main 记忆记录",
        sourcePath: path,
        relativeBase: root,
        facetKey: "main",
        facetLabel: "Main",
      }));
    }
  } catch { /* ignore */ }

  // Agent scopes
  for (const scope of scopes) {
    if (scope.facetKey === "main") continue;
    await append(await buildEntry({
      scope: "memory",
      category: `${scope.facetLabel} 长期记忆`,
      sourcePath: join(scope.workspaceRoot, "MEMORY.md"),
      relativeBase: root,
      facetKey: scope.facetKey,
      facetLabel: scope.facetLabel,
    }));
    const agentMemoryDir = join(scope.workspaceRoot, "memory");
    try {
      for (const name of await readdir(agentMemoryDir)) {
        const path = join(agentMemoryDir, name);
        const ext = extname(name).toLowerCase();
        if (!MEMORY_EDITABLE_EXTENSIONS.has(ext)) continue;
        await append(await buildEntry({
          scope: "memory",
          category: `${scope.facetLabel} 记忆记录`,
          sourcePath: path,
          relativeBase: root,
          facetKey: scope.facetKey,
          facetLabel: scope.facetLabel,
        }));
      }
    } catch { /* ignore */ }
  }

  return output.sort((a, b) =>
    (a.facetKey === "main" ? -1 : b.facetKey === "main" ? 1 : (a.facetLabel ?? "").localeCompare(b.facetLabel ?? "", "zh-Hans-CN"))
    || b.updatedAt.localeCompare(a.updatedAt)
    || a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN")
  );
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
    seen.add(key);
    output.push(entry);
  };

  // Main shared docs
  for (const rel of SHARED_DOCUMENT_FILE_CANDIDATES) {
    await append(await buildEntry({
      scope: "workspace",
      category: "Main 核心文档",
      sourcePath: join(root, rel),
      relativeBase: root,
      facetKey: "main",
      facetLabel: "Main",
    }));
  }

  // Walk workspace markdown files
  async function walk(dir: string, current: string): Promise<void> {
    try {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
          if (!WORKSPACE_EDITABLE_SKIP_DIRS.has(entry.name)) await walk(dir, path);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!WORKSPACE_EDITABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
        await append(await buildEntry({
          scope: "workspace",
          category: "Main 工作区文档",
          sourcePath: path,
          relativeBase: root,
          facetKey: "main",
          facetLabel: "Main",
        }));
      }
    } catch { /* ignore */ }
  }
  await walk(root, root);

  // Agent core docs
  for (const scope of scopes) {
    if (scope.facetKey === "main") continue;
    for (const name of AGENT_DOCUMENT_FILE_CANDIDATES) {
      await append(await buildEntry({
        scope: "workspace",
        category: `${scope.facetLabel} 核心文档`,
        sourcePath: join(scope.workspaceRoot, name),
        relativeBase: root,
        facetKey: scope.facetKey,
        facetLabel: scope.facetLabel,
      }));
    }
  }

  return output.sort((a, b) => {
    const fa = a.facetLabel ?? "";
    const fb = b.facetLabel ?? "";
    if (fa !== fb) {
      if (fa === "Main") return -1;
      if (fb === "Main") return 1;
      return fa.localeCompare(fb, "zh-Hans-CN");
    }
    const pa = documentFilePriority(a.relativePath) - documentFilePriority(b.relativePath);
    if (pa !== 0) return pa;
    return a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN");
  });
}

function documentFilePriority(relativePath: string): number {
  const name = basename(relativePath).toLowerCase();
  const order = [
    "agents.md", "identity.md", "soul.md", "user.md", "hall.md",
    "tasks.md", "bootstrap.md", "heartbeat.md", "tools.md",
    "readme.md", "notebook.md", "focus.md", "inbox.md",
    "routines.md", "learnings.md",
  ];
  const index = order.indexOf(name);
  return index === -1 ? order.length + 1 : index;
}

function isPathWithin(target: string, allowedRoot: string): boolean {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(allowedRoot);
  return resolvedTarget.startsWith(resolvedRoot + "/") || resolvedTarget === resolvedRoot;
}

export async function readEditableFile(scope: EditableFileScope, filePath: string): Promise<{ entry: EditableFileEntry; content: string } | undefined> {
  const root = resolveOpenClawWorkspaceRoot();
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
  const updated = await buildEntry({
    scope,
    category: entry.category,
    sourcePath: entry.sourcePath,
    relativeBase: resolveOpenClawWorkspaceRoot(),
    facetKey: entry.facetKey,
    facetLabel: entry.facetLabel,
  });
  return updated ? { entry: updated, content } : undefined;
}
