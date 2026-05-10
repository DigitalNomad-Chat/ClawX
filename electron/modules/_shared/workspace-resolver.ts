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
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function asArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function asString(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

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
    const defaults = asObject(agents?.defaults);
    const defaultWs = normalizeWorkspaceOverride(asString(defaults?.workspace));
    if (defaultWs) return resolve(dirname(configPath), defaultWs);

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

    const mainRow = list
      .map(asObject)
      .find((r) => normalizeLookupKey(asString(r?.id) ?? asString(r?.name) ?? "") === "main");
    const mainWs = normalizeWorkspaceOverride(asString(mainRow?.workspace));
    if (mainWs) return resolve(dirname(configPath), mainWs);
  } catch { /* ignore */ }

  return join(OPENCLAW_HOME_DIR, "workspace");
}

function resolveConfiguredAgentWorkspace(
  rawWorkspace: string | undefined,
  agentId: string,
  configDir: string,
): string | undefined {
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

      const ws =
        key === "main"
          ? root
          : (resolveConfiguredAgentWorkspace(asString(row.workspace)?.trim(), rawId, dirname(configPath)) ??
             join(root, "agents", rawId));

      output.push({
        agentId: rawId,
        facetKey: key,
        facetLabel: key === "main" ? "Main" : humanizeOperatorLabel(rawId),
        workspaceRoot: ws,
      });
    }

    if (output.length === 0) {
      return { status: "config_invalid", scopes: [buildMainEditableAgentScope(root)] };
    }

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
      output.push({
        agentId: name,
        facetKey: key,
        facetLabel: humanizeOperatorLabel(name),
        workspaceRoot: path,
      });
    }
  } catch { /* ignore */ }
  return output;
}
