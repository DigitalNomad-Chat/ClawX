"use strict";

/**
 * Collaboration Hall — Persona Loader
 *
 * Reads agent persona files (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, README.md)
 * from the agent's workspace directory. Results are cached with a 5-minute TTL.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { readOpenClawConfig } from "../../utils/channel-config";
import type { OpenClawConfig } from "../../utils/channel-config";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface AgentPersona {
  agentId: string;
  /** Concatenated persona content from all discovered files */
  summary: string;
  /** Individual file contents keyed by filename */
  files: Record<string, string>;
  /** Timestamp when the persona was loaded */
  loadedAt: number;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const PERSONA_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "README.md",
] as const;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
//  Cache
// ---------------------------------------------------------------------------

const personaCache = new Map<string, AgentPersona>();

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Load agent persona from workspace files.
 * Results are cached for 5 minutes.
 */
export async function loadAgentPersona(agentId: string): Promise<AgentPersona> {
  const cached = personaCache.get(agentId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  const files: Record<string, string> = {};
  const parts: string[] = [];

  // Resolve workspace directory for the agent
  const workspaceDir = await resolveWorkspaceDir(agentId);

  for (const filename of PERSONA_FILES) {
    try {
      const filePath = resolve(workspaceDir, filename);
      const content = await readFile(filePath, "utf-8");
      const trimmed = content.trim();
      if (trimmed) {
        files[filename] = trimmed;
        parts.push(`--- ${filename} ---\n${trimmed}`);
      }
    } catch {
      // File does not exist — skip silently
    }
  }

  const persona: AgentPersona = {
    agentId,
    summary: parts.join("\n\n"),
    files,
    loadedAt: Date.now(),
  };

  personaCache.set(agentId, persona);
  return persona;
}

/**
 * Invalidate cached persona for a specific agent (or all agents).
 */
export function invalidatePersonaCache(agentId?: string): void {
  if (agentId) {
    personaCache.delete(agentId);
  } else {
    personaCache.clear();
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

async function resolveWorkspaceDir(agentId: string): Promise<string> {
  try {
    const config = await readOpenClawConfig();
    const agents = config?.agents?.list ?? [];
    const entry = agents.find((a: { id: string }) => a.id === agentId);

    if (entry?.workspace) {
      return entry.workspace.replace(/^~/, homedir());
    }
  } catch {
    // Config read failed — fall back to default
  }

  // Default workspace paths:
  //   main agent → ~/.openclaw/workspace
  //   other agents → ~/.openclaw/workspace-<agentId>
  if (agentId === "main") {
    return resolve(homedir(), ".openclaw", "workspace");
  }
  return resolve(homedir(), ".openclaw", `workspace-${agentId}`);
}
