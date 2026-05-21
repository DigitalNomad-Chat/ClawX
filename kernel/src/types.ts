/**
 * ClawDock Kernel - Core Type Definitions
 * Defines the complete WebSocket communication protocol, Agent configuration model,
 * and event types between Electron Main Process and Kernel Process.
 */

// ─────────────────────────────────────────────────────────────
// Token Usage
// ─────────────────────────────────────────────────────────────
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens: number;
}

// ─────────────────────────────────────────────────────────────
// Message Types (LLM conversation)
// ─────────────────────────────────────────────────────────────
export interface TextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultMessage {
  role: 'tool';
  toolCallId: string;
  content: string;
}

export type Message = TextMessage | ToolResultMessage;

// ─────────────────────────────────────────────────────────────
// Tool System
// ─────────────────────────────────────────────────────────────
export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface PathRule {
  pattern: string;
  allow: boolean;
}

export type PermissionMode = 'default' | 'plan' | 'full_auto';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  /** Whether this tool is read-only (safe to auto-allow) */
  isReadOnly?: boolean;
}

export interface ToolExecutionContext {
  /** Working directory (workspace root) for path resolution */
  cwd: string;
  /** Sandbox configuration for OS-level isolation (e.g. bash tool) */
  sandboxConfig?: {
    enabled: boolean;
    failIfUnavailable: boolean;
  };
}

export type ToolExecuteFn = (input: unknown, context?: ToolExecutionContext) => Promise<string>;

export interface RegisteredTool extends ToolDefinition {
  execute: ToolExecuteFn;
}

// ─────────────────────────────────────────────────────────────
// Agent Configuration (decrypted in-memory only)
// ─────────────────────────────────────────────────────────────
export interface AgentIdentity {
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  avatar?: string;
}

export interface AgentConfig {
  id: string;
  version: string;
  identity: AgentIdentity;
  soul: string; // SOUL.md content
  agents: string; // AGENTS.md content
  tools: string; // TOOLS.md content
  user?: string; // USER.md content
  heartbeat?: string; // HEARTBEAT.md content
  toolWhitelist?: string[];
  toolBlacklist?: string[];
  maxTurns: number;
  model?: string;
  temperature?: number;
  permissionMode?: PermissionMode;
  allowedDomains?: string[];
  deniedDomains?: string[];
  pathRules?: PathRule[];
  commandDenyList?: string[];
  /** Enable OS-level sandbox for bash tool (sandbox-exec on macOS, bubblewrap on Linux) */
  sandboxEnabled?: boolean;
  /** If true, refuse bash execution when the sandbox tool is unavailable. If false, fall back to unsandboxed exec with a warning. */
  sandboxFailIfUnavailable?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Agent Package (encrypted on disk)
// ─────────────────────────────────────────────────────────────
export interface AgentPackage {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

// ─────────────────────────────────────────────────────────────
// Agent Manifest Entry (public, for UI)
// ─────────────────────────────────────────────────────────────
export interface AgentManifestEntry {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  version: string;
  department?: string;
}

export interface AgentManifest {
  version: string;
  agents: AgentManifestEntry[];
}

// ─────────────────────────────────────────────────────────────
// Skill
// ─────────────────────────────────────────────────────────────
export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  category: string;
}

// ─────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────
export interface SessionInfo {
  id: string;
  agentId: string;
  agentName: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// ─────────────────────────────────────────────────────────────
// Kernel Requests (Electron → Kernel)
// ─────────────────────────────────────────────────────────────
export interface AttachmentInfo {
  fileName: string;
  stagedPath: string;
  mimeType: string;
  fileSize: number;
}

export type KernelRequest =
  | { type: 'chat.send'; sessionId: string; agentId: string; message: string; attachments?: AttachmentInfo[]; skillId?: string; permissionMode?: PermissionMode }
  | { type: 'session.create'; agentId: string }
  | { type: 'session.list' }
  | { type: 'session.info'; sessionId: string }
  | { type: 'session.switch'; sessionId: string }
  | { type: 'session.delete'; sessionId: string }
  | { type: 'session.restore'; sessionId: string; agentId: string; messages: Message[] }
  | { type: 'agent.list' }
  | { type: 'agent.detail'; agentId: string }
  | { type: 'skill.list' }
  | { type: 'skill.detail'; skillId: string }
  | { type: 'approval.respond'; requestId: string; approved: boolean; autoApprove?: boolean }
  | { type: 'kernel.shutdown' };

// ─────────────────────────────────────────────────────────────
// Kernel Events (Kernel → Electron)
// ─────────────────────────────────────────────────────────────
export type KernelEvent =
  | { type: 'turn.started'; sessionId: string; turn: number }
  | { type: 'delta.text'; sessionId: string; content: string }
  | { type: 'delta.thinking'; sessionId: string; content: string }
  | { type: 'delta.tool_call'; sessionId: string; tool: string; input: unknown }
  | { type: 'tool.started'; sessionId: string; tool: string; input?: unknown }
  | { type: 'tool.completed'; sessionId: string; tool: string; output: string }
  | { type: 'approval.request'; sessionId: string; requestId: string; tool: string; input: unknown }
  | { type: 'turn.complete'; sessionId: string; usage: TokenUsage }
  | { type: 'session.created'; sessionId: string }
  | { type: 'session.list'; sessions: SessionInfo[] }
  | { type: 'session.info'; sessionId: string; workspaceRoot: string }
  | { type: 'session.restored'; sessionId: string; messageCount: number }
  | { type: 'agent.list'; agents: AgentManifestEntry[] }
  | { type: 'agent.detail'; agent: AgentManifestEntry }
  | { type: 'skill.list'; skills: SkillEntry[] }
  | { type: 'skill.detail'; skill: SkillEntry & { content: string } }
  | { type: 'config.updated' }
  | { type: 'error'; sessionId?: string; message: string };

// ─────────────────────────────────────────────────────────────
// AI Provider Types
// ─────────────────────────────────────────────────────────────
export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamMessageRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  system?: string;
}

export interface TextDeltaEvent {
  type: 'text_delta';
  text: string;
}

export interface ToolCallDeltaEvent {
  type: 'tool_call_delta';
  toolCall: Partial<ToolCall>;
}

export interface StreamCompleteEvent {
  type: 'complete';
  usage: TokenUsage;
  toolCalls: ToolCall[];
}

export type ProviderStreamEvent =
  | TextDeltaEvent
  | ToolCallDeltaEvent
  | StreamCompleteEvent;

export interface AIProvider {
  streamMessage(request: StreamMessageRequest): AsyncGenerator<ProviderStreamEvent>;
}
