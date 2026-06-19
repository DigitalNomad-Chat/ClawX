/** Metadata for locally-attached files (not from Gateway) */
export interface AttachedFileMeta {
  fileName: string;
  mimeType: string;
  fileSize: number;
  preview: string | null;
  filePath?: string;
  source?: 'user-upload' | 'tool-result' | 'message-ref' | 'gateway-media';
  /**
   * For Gateway-injected outgoing media (assistant-media). The Gateway emits
   * an `image` content block with a relative URL like
   * `/api/chat/media/outgoing/<sessionKey>/<attachmentId>/full`. The renderer
   * cannot reach Gateway HTTP directly (CORS / env drift), so this URL is
   * resolved through the Main-process proxy in `media:getThumbnails`, which
   * looks up `~/.openclaw/media/outgoing/records/<attachmentId>.json` and
   * loads the original file off disk.
   */
  gatewayUrl?: string;
}

/** Raw message from OpenClaw chat.history */
export interface RawMessage {
  role: 'user' | 'assistant' | 'system' | 'toolresult';
  content: unknown; // string | ContentBlock[]
  timestamp?: number;
  id?: string;
  toolCallId?: string;
  toolName?: string;
  details?: unknown;
  isError?: boolean;
  stopReason?: string;
  stop_reason?: string;
  errorMessage?: string;
  error_message?: string;
  /** Local-only: file metadata for user-uploaded attachments (not sent to/from Gateway) */
  _attachedFiles?: AttachedFileMeta[];
  /** Local-only: desensitize map for restoring original PII */
  _desensitizeMap?: Record<string, string>;
}

/** Content block inside a message */
export interface ContentBlock {
  type: 'text' | 'image' | 'thinking' | 'tool_use' | 'tool_result' | 'toolCall' | 'toolResult';
  text?: string;
  thinking?: string;
  source?: { type: string; media_type?: string; data?: string; url?: string };
  /** Flat image format from Gateway tool results (no source wrapper) */
  data?: string;
  mimeType?: string;
  /**
   * Flat URL on an `image` block. Gateway-injected assistant-media messages
   * use this shape: `{ type:'image', url:'/api/chat/media/outgoing/...', mimeType, width, height, alt, openUrl }`.
   * Neither nested `source.url` nor flat `data` is set in that case; the
   * renderer must read `block.url` directly to surface the artifact.
   */
  url?: string;
  /** Optional companion of `url` — points at a higher-resolution variant. */
  openUrl?: string;
  /** Pixel width of the original image, used for layout hints. */
  width?: number;
  /** Pixel height of the original image, used for layout hints. */
  height?: number;
  /** Human-readable filename / alt text emitted by the Gateway. */
  alt?: string;
  id?: string;
  name?: string;
  input?: unknown;
  arguments?: unknown;
  content?: unknown;
}

/** Session from sessions.list */
export interface ChatSession {
  key: string;
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  thinkingLevel?: string;
  model?: string;
  updatedAt?: number;
}

export interface ToolStatus {
  id?: string;
  toolCallId?: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
  summary?: string;
  updatedAt: number;
}

export interface ChatState {
  // Messages
  messages: RawMessage[];
  loading: boolean;
  error: string | null;
  runError: string | null;

  // Streaming
  sending: boolean;
  activeRunId: string | null;
  streamingText: string;
  streamingMessage: unknown | null;
  streamingTools: ToolStatus[];
  pendingFinal: boolean;
  lastUserMessageAt: number | null;
  /** Images collected from tool results, attached to the next assistant message */
  pendingToolImages: AttachedFileMeta[];

  // Abort
  /** Set to true when user explicitly aborts a run; used to force-close stale execution graphs */
  userAbortedRun: boolean;

  // Sessions
  sessions: ChatSession[];
  currentSessionKey: string;
  currentAgentId: string;
  /** First user message text per session key, used as display label */
  sessionLabels: Record<string, string>;
  /** Last message timestamp (ms) per session key, used for sorting */
  sessionLastActivity: Record<string, number>;

  // History pagination
  /** Whether there are more historical messages available to load */
  hasMoreHistory: boolean;
  /** Number of historical messages already loaded (for offset calculation) */
  historyOffset: number;
  /** Whether older messages are currently being fetched */
  loadingMoreHistory: boolean;

  // Thinking
  thinkingLevel: string | null;

  // Read-Write Workspace (agent-scoped, persists across sessions within same agent)
  rwWorkDir: string | null;
  agentRwWorkDirs: Record<string, string | null>;
  setRwWorkDir: (dir: string | null) => void;

  // Actions
  loadSessions: () => Promise<void>;
  switchSession: (key: string) => void;
  newSession: () => void;
  deleteSession: (key: string) => Promise<void>;
  renameSession: (key: string, newLabel: string) => void;
  cleanupEmptySession: () => void;
  loadHistory: (quiet?: boolean) => Promise<void>;
  /** Load earlier messages; prepend them to the existing message list */
  loadMoreHistory: () => Promise<void>;
  sendMessage: (
    text: string,
    attachments?: Array<{
      fileName: string;
      mimeType: string;
      fileSize: number;
      stagedPath: string;
      preview: string | null;
    }>,
    targetAgentId?: string | null,
    desensitizeMap?: Record<string, string>,
  ) => Promise<void>;
  abortRun: () => Promise<void>;
  handleChatEvent: (event: Record<string, unknown>) => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export const DEFAULT_CANONICAL_PREFIX = 'agent:main';
export const DEFAULT_SESSION_KEY = `${DEFAULT_CANONICAL_PREFIX}:main`;
