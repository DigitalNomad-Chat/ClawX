/**
 * ReAct Loop Engine - Core reasoning-acting loop
 * Implements the ReAct pattern: LLM generates -> check tool calls -> execute -> feed back -> repeat
 */
import type {
  AIProvider,
  AgentConfig,
  KernelEvent,
  Message,
  ToolCall,
} from '../types.js';
import type { ToolRegistry } from '../tools/registry.js';
import { buildSystemPrompt } from '../agent/prompt-builder.js';
import { PermissionChecker } from '../security/permission-checker.js';
import { auditToolInvoke, auditToolResult, auditPermission, auditApproval } from '../security/audit-logger.js';
import { readFileSync } from 'fs';

const DEFAULT_MAX_TURNS = 64;
const MAX_ATTACHMENT_TEXT_SIZE = 100_000; // 100KB text limit
const MAX_ATTACHMENT_IMAGE_SIZE = 5_000_000; // 5MB image limit

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isTextMimeType(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  const textTypes = [
    'application/json', 'application/xml', 'application/javascript',
    'application/typescript', 'application/x-yaml', 'application/toml',
  ];
  return textTypes.includes(mimeType);
}

function buildAttachmentContext(
  attachments: Array<{ fileName: string; stagedPath: string; mimeType: string; fileSize: number }>,
): string {
  const parts: string[] = [];
  for (const att of attachments) {
    if (att.mimeType.startsWith('image/')) {
      parts.push(`[Attached image: ${att.fileName} (${att.mimeType}, ${formatSize(att.fileSize)})]`);
    } else if (isTextMimeType(att.mimeType)) {
      try {
        let content = readFileSync(att.stagedPath, 'utf8');
        if (content.length > MAX_ATTACHMENT_TEXT_SIZE) {
          content = content.slice(0, MAX_ATTACHMENT_TEXT_SIZE)
            + `\n\n[File truncated: ${att.fileName} exceeds ${MAX_ATTACHMENT_TEXT_SIZE} characters]`;
        }
        parts.push(`--- Attachment: ${att.fileName} ---\n${content}\n--- End of ${att.fileName} ---`);
      } catch {
        parts.push(`[Attached file: ${att.fileName} (${att.mimeType}, ${formatSize(att.fileSize)}) - could not read content]`);
      }
    } else {
      parts.push(`[Attached file: ${att.fileName} (${att.mimeType}, ${formatSize(att.fileSize)})]`);
    }
  }
  return parts.join('\n\n');
}

export interface ReActLoopOptions {
  provider: AIProvider;
  agentConfig: AgentConfig;
  toolRegistry: ToolRegistry;
  sessionId: string;
  messages: Message[];
  workspaceRoot?: string;
  maxTurns?: number;
  onEvent?: (event: KernelEvent) => void;
  /** Callback to request user approval for a mutating tool. Returns true if approved. */
  requestApproval?: (requestId: string, tool: string, input: unknown) => Promise<boolean>;
  /** File attachments to include in the conversation context */
  attachments?: Array<{ fileName: string; stagedPath: string; mimeType: string; fileSize: number }>;
}

/**
 * Run the ReAct loop for a single user message turn
 * Yields events as they happen (streaming)
 */
export async function* runReActLoop(
  options: ReActLoopOptions
): AsyncGenerator<KernelEvent> {
  const {
    provider,
    agentConfig,
    toolRegistry,
    sessionId,
    messages,
    maxTurns = agentConfig.maxTurns ?? DEFAULT_MAX_TURNS,
    requestApproval,
    attachments,
  } = options;

  const permissionChecker = new PermissionChecker();

  console.log(`[DEBUG ReAct] START sessionId=${sessionId}, maxTurns=${maxTurns}, msgCount=${messages.length}, attachments=${attachments?.length ?? 0}`);

  // ── Inject attachment content into the last user message ──
  if (attachments && attachments.length > 0) {
    const attachmentContext = buildAttachmentContext(attachments);
    // Find the last user message and append attachment context
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        messages[i] = {
          ...messages[i],
          content: `${messages[i].content}\n\n${attachmentContext}`,
        };
        console.log(`[DEBUG ReAct] Injected attachment context into user message at index ${i}`);
        break;
      }
    }
  }

  const systemPrompt = buildSystemPrompt(agentConfig);
  const availableTools = toolRegistry.filter(
    agentConfig.toolWhitelist,
    agentConfig.toolBlacklist
  );
  console.log(`[DEBUG ReAct] systemPromptLen=${systemPrompt.length}, tools=${availableTools.length}`);

  for (let turn = 0; turn < maxTurns; turn++) {
    console.log(`[DEBUG ReAct] Turn ${turn} START`);
    yield { type: 'turn.started', sessionId, turn };
    console.log(`[DEBUG ReAct] Turn ${turn} yielded turn.started`);

    // 1. Call LLM with streaming
    console.log(`[DEBUG ReAct] Calling provider.streamMessage...`);
    const stream = provider.streamMessage({
      messages,
      tools: availableTools,
      system: systemPrompt,
    });
    console.log(`[DEBUG ReAct] provider.streamMessage returned`);

    let assistantContent = '';
    const toolCalls: ToolCall[] = [];

    console.log(`[DEBUG ReAct] Entering stream iteration...`);
    let streamEventCount = 0;
    for await (const event of stream) {
      streamEventCount++;
      console.log(`[DEBUG ReAct] Stream event #${streamEventCount}: type=${event.type}`);
      if (event.type === 'text_delta') {
        assistantContent += event.text;
        yield { type: 'delta.text', sessionId, content: event.text };
      }

      if (event.type === 'complete') {
        toolCalls.push(...event.toolCalls);
      }
    }
    console.log(`[DEBUG ReAct] Stream iteration done, events=${streamEventCount}, assistantLen=${assistantContent.length}`);

    // Add assistant message to history
    messages.push({ role: 'assistant', content: assistantContent });

    // 2. No tool calls -> turn complete
    if (toolCalls.length === 0) {
      console.log(`[DEBUG ReAct] No tool calls, yielding turn.complete`);
      yield { type: 'turn.complete', sessionId, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
      return;
    }

    // 3. Execute tool calls
    for (const call of toolCalls) {
      yield { type: 'tool.started', sessionId, tool: call.name, input: call.input };
      const auditWorkspace = options.workspaceRoot || '';
      const agentId = agentConfig.id;

      // Check if tool exists and is allowed
      const toolDef = toolRegistry.get(call.name);
      if (!toolDef) {
        const error = `Error: Tool '${call.name}' is not available.`;
        yield { type: 'tool.completed', sessionId, tool: call.name, output: error };
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: error,
        });
        if (auditWorkspace) auditPermission(auditWorkspace, sessionId, agentId, call.name, 'blocked: tool_not_found');
        continue;
      }

      // Permission check
      const perm = permissionChecker.evaluate(call.name, call.input, toolDef, agentConfig);
      if (!perm.allowed && !perm.requiresConfirmation) {
        const error = `Error: ${perm.reason}`;
        yield { type: 'tool.completed', sessionId, tool: call.name, output: error };
        messages.push({ role: 'tool', toolCallId: call.id, content: error });
        if (auditWorkspace) auditPermission(auditWorkspace, sessionId, agentId, call.name, `blocked: ${perm.reason}`, { mode: agentConfig.permissionMode });
        continue;
      }

      if (perm.requiresConfirmation && requestApproval) {
        const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        yield {
          type: 'approval.request',
          sessionId,
          requestId: approvalId,
          tool: call.name,
          input: call.input,
        };

        const approved = await requestApproval(approvalId, call.name, call.input);
        if (auditWorkspace) auditApproval(auditWorkspace, sessionId, agentId, approvalId, approved, call.name);
        if (!approved) {
          const error = `Error: Tool '${call.name}' was not approved by user.`;
          yield { type: 'tool.completed', sessionId, tool: call.name, output: error };
          messages.push({ role: 'tool', toolCallId: call.id, content: error });
          continue;
        }
      }

      // Build execution context with optional sandbox config
      const execContext = options.workspaceRoot
        ? {
            cwd: options.workspaceRoot,
            sandboxConfig: {
              enabled: agentConfig.sandboxEnabled ?? false,
              failIfUnavailable: agentConfig.sandboxFailIfUnavailable ?? false,
            },
          }
        : undefined;

      if (auditWorkspace) auditToolInvoke(auditWorkspace, sessionId, agentId, call.name, call.input);
      const toolStartTime = Date.now();

      try {
        const result = await toolRegistry.execute(call.name, call.input, execContext);
        const durationMs = Date.now() - toolStartTime;
        yield { type: 'tool.completed', sessionId, tool: call.name, output: result };
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result,
        });
        if (auditWorkspace) auditToolResult(auditWorkspace, sessionId, agentId, call.name, result, durationMs);
      } catch (err: unknown) {
        const durationMs = Date.now() - toolStartTime;
        const error = `Error executing tool '${call.name}': ${(err as Error).message}`;
        yield { type: 'tool.completed', sessionId, tool: call.name, output: error };
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: error,
        });
        if (auditWorkspace) auditToolResult(auditWorkspace, sessionId, agentId, call.name, error, durationMs, (err as Error).message);
      }
    }
  }

  // Max turns reached
  yield {
    type: 'error',
    sessionId,
    message: `Maximum turns (${maxTurns}) reached. Conversation halted.`,
  };
}
