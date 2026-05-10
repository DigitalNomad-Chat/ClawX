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

interface TimedSourceCache<T> {
  value: T;
  expiresAt: number;
}

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
  } finally {
    memoryInFlight = undefined;
  }
}

async function fetchMemorySummary(): Promise<OpenClawMemorySummary> {
  try {
    const json = await runOpenClawJson(["memory", "status", "--json"]);
    return summarizeOpenClawMemory(json);
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      status: "unknown",
      okCount: 0,
      warnCount: 0,
      blockedCount: 0,
      agents: [],
    };
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
      agentId: asString(root.agentId) ?? "unknown",
      status: agentStatus,
      files,
      chunks,
      issuesCount: issues.length,
      dirty,
      vectorAvailable,
      searchable,
      lastUpdateAt: asString(qmd?.lastUpdateAt),
    } satisfies OpenClawMemoryAgentSummary;
  });

  const okCount = items.filter((i) => i.status === "ok").length;
  const warnCount = items.filter((i) => i.status === "warn" || i.status === "info").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;

  return {
    generatedAt: new Date().toISOString(),
    status:
      blockedCount > 0 ? "blocked" : warnCount > 0 ? "warn" : okCount > 0 ? "ok" : "unknown",
    okCount,
    warnCount,
    blockedCount,
    agents: items.sort(
      (a, b) =>
        insightStatusRank(a.status) - insightStatusRank(b.status) ||
        a.agentId.localeCompare(b.agentId),
    ),
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
      const { stdout } = await execFileAsync(command, args, {
        env,
        timeout: INSIGHT_COMMAND_TIMEOUT_MS,
        maxBuffer: INSIGHT_COMMAND_MAX_BUFFER,
      });
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
  // 常见安装路径，确保 Electron 主进程能找到
  candidates.push(
    join(homedir(), ".local", "bin", "openclaw"),
    "/usr/local/bin/openclaw",
  );
  if (process.platform === "win32") {
    candidates.push("openclaw.cmd");
  }
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
    writeFileSync(CLEAN_CONFIG_PATH, `${JSON.stringify(data, null, 2)}
`, "utf8");
  } catch {
    /* best-effort */
  }
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
  try {
    return JSON.parse(trimmed);
  } catch {
    /* keep scanning */
  }
  const starts: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "{" || input[i] === "[") starts.push(i);
  }
  for (const start of starts) {
    try {
      return JSON.parse(input.slice(start).trim());
    } catch {
      /* next */
    }
  }
  return undefined;
}

function asObject(input: unknown): Record<string, unknown> | undefined {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function asArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function asString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input : undefined;
}

function asNumber(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}

function asBoolean(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}
