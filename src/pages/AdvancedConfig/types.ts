/**
 * OpenClaw Configuration Types
 * Adapted from OpenClawSwitch for ClawDock
 */

/** Tools 配置 */
export interface ToolsConfig {
  profile?: string;
  allow?: string[];
  deny?: string[];
  web?: {
    search?: { enabled?: boolean; provider?: string; apiKey?: string };
    fetch?: { enabled?: boolean };
  };
  sessions?: { visibility?: string };
  agentToAgent?: { enabled?: boolean; allow?: string[] };
  sandbox?: { tools?: { allow?: string[]; deny?: string[] } };
}

/** Agent 列表项配置 */
export interface AgentItem {
  id: string;
  name?: string;
  workspace?: string;
  model?: string;
  skills?: string[];
  default?: boolean;
}

/** Session 配置 */
export interface SessionConfig {
  idleMinutes?: number;
  dmScope?: string;
  agentToAgent?: { maxPingPongTurns?: number };
  maintenance?: { mode?: string; pruneAfter?: string };
}

/** Hooks 配置 */
export interface HooksConfig {
  internal?: {
    enabled?: boolean;
    entries?: Record<string, { enabled?: boolean }>;
  };
}

/** Agent 默认配置 */
export interface AgentDefaults {
  model?: { primary: string; fallbacks?: string[] };
  models?: Record<string, { alias?: string }>;
  thinkingDefault?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive';
  workspace?: string;
  compaction?: { mode?: string };
  maxConcurrent?: number;
  subagents?: { maxConcurrent?: number };
  contextPruning?: { mode?: string; ttl?: string };
  timeoutSeconds?: number;
  heartbeat?: { every?: string };
}

/** OpenClaw 完整配置 */
export interface OpenClawConfig {
  tools?: ToolsConfig;
  session?: SessionConfig;
  agents?: {
    defaults?: AgentDefaults;
    list?: AgentItem[];
    [key: string]: unknown;
  };
  hooks?: HooksConfig;
  skills?: {
    load?: { extraDirs?: string[] };
    entries?: Record<string, unknown>;
    [key: string]: unknown;
  };
  messages?: {
    ackReactionScope?: string;
    [key: string]: unknown;
  };
  commands?: {
    native?: string;
    restart?: boolean;
    ownerDisplay?: string;
    [key: string]: unknown;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommand?: string;
    lastRunMode?: string;
  };
  [key: string]: unknown;
}

/** 配置文件元信息 */
export interface ConfigFileInfo {
  path: string;
  modifiedAt?: string;
  size?: number;
}

/** 配置源（配置 + 文件信息） */
export interface ConfigSource {
  config: OpenClawConfig;
  fileInfo: ConfigFileInfo;
}
