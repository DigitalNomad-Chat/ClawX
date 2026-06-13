"use strict";

/**
 * Collaboration Hall — Runtime Dispatch Engine
 *
 * Full-featured agent execution dispatch:
 *   1. Build differentiated prompt (mode-aware)
 *   2. Call Gateway via chat.send RPC
 *   3. Sanitize agent reply (remove ANSI/tool traces)
 *   4. Parse <hall-structured> JSON block
 *   5. Enforce concrete deliverable (retry if missing)
 *   6. Persist message and update TaskCard
 *
 * This is a non-streaming implementation (streaming to be added in Phase 3).
 */
import { randomUUID } from "node:crypto";
import type { HostApiContext } from "../../api/context";
import type {
  HallMessage,
  HallParticipant,
  HallTaskCard,
  CollaborationHall,
  TaskArtifact,
} from "./types";
import {
  getTaskCard,
  loadTaskCardStore,
  loadMessageStore,
  updateTaskCard,
  appendMessage,
} from "./store";
import { buildDispatchPrompt, inferDiscussionDomain, type DispatchMode, type HallOperatorIntent } from "./prompt-builder";
import { sanitizeAgentReply, inferHallResponseLanguage } from "./content-sanitizer";
import type { ParsedStructuredBlock } from "./content-sanitizer";
import { enforceConcreteDeliverable } from "./deliverable-enforcer";
import { checkTaskBudget, consumeTaskBudget } from "./budget-governance";
import { loadAgentPersona } from "./persona-loader";
import { pickPrimaryParticipantByRole } from "./role-resolver";
import { publishCollabEvent } from "./event-publisher";
import { publishDraftStart, publishDraftChunk, publishDraftChunkRaw, abortDraft } from "./stream-publisher";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface RuntimeDispatchInput {
  ctx: HostApiContext;
  mode: DispatchMode;
  participant: HallParticipant;
  taskCard: HallTaskCard;
  hall: CollaborationHall;
  triggerMessage?: HallMessage;
  operatorIntent?: HallOperatorIntent;
  dispatch?: boolean; // false = only build prompt for preview
  retryCount?: number; // current retry attempt number (0 = first)
  draftId?: string; // external draft ID for SSE event correlation
}

export interface RuntimeDispatchResult {
  success: boolean;
  message?: HallMessage;
  sessionKey: string;
  structured?: ParsedStructuredBlock;
  nextAction?: "continue" | "review" | "blocked" | "handoff" | "done";
  retryNeeded?: boolean;
  retryInstruction?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
//  Session key helpers (reused from previous implementation)
// ---------------------------------------------------------------------------

function resolveSessionKey(participant: HallParticipant, taskCard: HallTaskCard): string {
  const agentId = (participant.agentId ?? participant.participantId).trim();
  if (!agentId) throw new Error("Participant has no agentId");

  // Prefer thread-scoped key
  const threadScoped = `agent:${agentId}:hall:${taskCard.taskId}`;

  if (taskCard.sessionKeys) {
    for (const key of taskCard.sessionKeys) {
      if (key === threadScoped) return key;
    }
    for (const key of taskCard.sessionKeys) {
      if (key.startsWith(`agent:${agentId}:`)) return key;
    }
  }

  return threadScoped;
}

async function recordSessionKey(taskCardId: string, sessionKey: string): Promise<void> {
  const store = await loadTaskCardStore();
  const taskCard = getTaskCard(store, taskCardId);
  if (!taskCard) return;

  const keys = new Set([...(taskCard.sessionKeys ?? []), sessionKey]);
  await updateTaskCard(taskCardId, { sessionKeys: [...keys] });
}

// ---------------------------------------------------------------------------
//  Message history helpers
// ---------------------------------------------------------------------------

async function fetchRecentThreadMessages(
  taskCard: HallTaskCard,
  limit = 20,
): Promise<HallMessage[]> {
  const mStore = await loadMessageStore();
  return mStore.messages
    .filter((m) => m.hallId === taskCard.hallId)
    .filter((m) => !taskCard.taskCardId || m.taskCardId === taskCard.taskCardId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-limit);
}

// ---------------------------------------------------------------------------
//  Gateway history polling helper
// ---------------------------------------------------------------------------

interface HistoryMessage {
  role?: string;
  content?: string;
  text?: string;
  [key: string]: unknown;
}

interface HistoryResult {
  messages?: HistoryMessage[];
  [key: string]: unknown;
}

/**
 * Extract plain text from a Gateway message content field.
 * Content may be a string or an array of content blocks (Anthropic/OpenAI format).
 */
function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content as Array<{ type?: string; text?: string }>) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      }
    }
    return parts.join("\n");
  }
  if (typeof content === "object" && content !== null && "text" in content) {
    const c = content as { text?: string };
    return c.text || "";
  }
  return "";
}

/**
 * Poll chat.history for the latest assistant message.
 * The Gateway processes the agent run asynchronously; we poll until the
 * assistant reply appears in the session history or the timeout expires.
 */
async function pollHistoryForAssistantReply(
  ctx: HostApiContext,
  sessionKey: string,
  timeoutMs: number,
  onDelta?: (delta: string, fullText: string) => void,
): Promise<string | null> {
  const POLL_INTERVAL = 3_000;
  const deadline = Date.now() + timeoutMs;
  let previousMessageCount = 0;
  let lastAssistantText = "";

  // Take a snapshot of current history length so we can detect new messages
  try {
    const initial = await ctx.gatewayManager.rpc<HistoryResult>(
      "chat.history", { sessionKey, limit: 200 }, 15_000,
    );
    previousMessageCount = initial?.messages?.length ?? 0;
    console.log("[runtime-dispatch] pollHistory: initial message count=%d", previousMessageCount);
  } catch {
    // Gateway may still be processing — start polling anyway
    console.log("[runtime-dispatch] pollHistory: initial fetch failed, will retry");
  }

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    try {
      const history = await ctx.gatewayManager.rpc<HistoryResult>(
        "chat.history", { sessionKey, limit: 200 }, 15_000,
      );

      const messages = history?.messages;
      if (!messages || messages.length === 0) continue;

      // Find the latest assistant message
      let latestAssistantText = "";
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant") {
          const text = extractMessageText(msg.content) || extractMessageText(msg.text);
          if (text) {
            latestAssistantText = text;
            break;
          }
        }
      }

      // If we found a new/updated assistant message, compute delta and stream it
      if (latestAssistantText) {
        if (latestAssistantText.length > lastAssistantText.length) {
          const delta = latestAssistantText.slice(lastAssistantText.length);
          lastAssistantText = latestAssistantText;
          if (onDelta && delta) {
            onDelta(delta, latestAssistantText);
          }
        }

        // Check if the message is complete (new message appeared after our snapshot)
        if (messages.length > previousMessageCount) {
          console.log("[runtime-dispatch] pollHistory: got assistant reply (%d chars)", latestAssistantText.length);
          return latestAssistantText;
        }
      }
    } catch (err) {
      console.warn("[runtime-dispatch] pollHistory: error", err instanceof Error ? err.message : err);
    }
  }

  console.error("[runtime-dispatch] pollHistory: timed out after %dms", timeoutMs);
  return null;
}

interface StreamedAgentRunResult {
  rawText: string;
  rawMessage: Record<string, unknown> | undefined;
  runId: string | undefined;
  sessionKey: string;
}

/**
 * Subscribe to Gateway chat:message events for a single run.
 * Falls back to polling if no streaming event arrives within 5 seconds.
 */
async function runAgentWithStreaming(
  ctx: HostApiContext,
  input: {
    sessionKey: string;
    rpcParams: Record<string, unknown>;
    hall: CollaborationHall;
    taskCard: HallTaskCard;
    participant: HallParticipant;
    draftId: string;
  },
  onDelta: (deltaText: string, rawMessage: Record<string, unknown>) => void,
  timeoutMs = 180_000,
): Promise<StreamedAgentRunResult> {
  const { sessionKey, rpcParams, hall, taskCard, participant, draftId } = input;

  const sendResult = await ctx.gatewayManager.rpc<{ runId?: string; status?: string } & Record<string, unknown>>(
    "chat.send", rpcParams, 180_000,
  );
  const runId = sendResult?.runId;
  console.log("[runtime-dispatch] Gateway chat.send runId=%s sessionKey=%s", runId, sessionKey);

  let lastStreamedText = "";
  let finished = false;
  let finalRawMessage: Record<string, unknown> | undefined;
  let finalRunId = runId;
  let fallbackPoller: Promise<void> | undefined;
  let fallbackActive = false;
  let streamObserved = false;
  let abortReason: string | undefined;

  const streamPublishInput = {
    draftId,
    taskCardId: taskCard.taskCardId,
    participantId: participant.participantId,
    participantLabel: participant.displayName,
    hallId: hall.hallId,
  };

  const cleanup = () => {
    ctx.gatewayManager.off("chat:message", listener);
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (overallTimer) clearTimeout(overallTimer);
  };

  const listener = (data: { message?: unknown }) => {
    const eventData = data as unknown as Record<string, unknown>;
    const payload =
      eventData && typeof eventData === "object" && "message" in eventData && typeof eventData.message === "object"
        ? (eventData.message as Record<string, unknown>)
        : eventData;
    if (!payload || typeof payload !== "object") return;

    const eventRunId = payload.runId != null ? String(payload.runId) : undefined;
    const eventSessionKey = payload.sessionKey != null ? String(payload.sessionKey) : undefined;
    const state = String(payload.state || "");

    if (!eventRunId && !eventSessionKey) return;
    if (runId && eventRunId && eventRunId !== runId) return;
    if (eventSessionKey && eventSessionKey !== sessionKey) return;

    const msg = payload.message as Record<string, unknown> | undefined;

    if (state === "started") {
      streamObserved = true;
      return;
    }

    if (state === "delta") {
      streamObserved = true;
      const text = msg ? extractMessageText(msg) : "";
      let delta = "";
      if (text.length > lastStreamedText.length && lastStreamedText && text.startsWith(lastStreamedText)) {
        delta = text.slice(lastStreamedText.length);
      } else if (text.length > lastStreamedText.length) {
        delta = text.slice(lastStreamedText.length);
      }
      lastStreamedText = text;
      if (delta) {
        onDelta(delta, msg ?? {});
      }
      publishDraftChunkRaw(streamPublishInput, delta, msg ?? {});
      return;
    }

    if (state === "final") {
      streamObserved = true;
      finalRawMessage = msg;
      finalRunId = eventRunId ?? runId;
      finished = true;
      if (msg) {
        finalizeDraft(streamPublishInput, extractMessageText(msg));
      }
      cleanup();
      return;
    }

    if (state === "error" || state === "aborted") {
      streamObserved = true;
      abortReason = state === "error" ? "Agent 执行出错" : "Agent 执行被中断";
      finished = true;
      cleanup();
    }
  };

  ctx.gatewayManager.on("chat:message", listener);

  const fallbackTimer = setTimeout(() => {
    if (finished || streamObserved) return;
    console.log("[runtime-dispatch] No streaming event after 5s, starting fallback poll");
    fallbackActive = true;
    fallbackPoller = pollHistoryForAssistantReply(
      ctx,
      sessionKey,
      timeoutMs - 5_000,
      (delta, _fullText) => {
        onDelta(delta, {});
        publishDraftChunk(streamPublishInput, delta);
      },
    ).then((text) => {
      if (!finished) {
        finalRawMessage = text ? { role: "assistant", content: text } : undefined;
        finalRunId = runId;
        finished = true;
        if (text) {
          finalizeDraft(streamPublishInput, text);
        }
        cleanup();
      }
    }).catch(() => {
      if (!finished) {
        finished = true;
        cleanup();
      }
    });
  }, 5_000);

  const overallTimer = setTimeout(() => {
    if (!finished) {
      console.error("[runtime-dispatch] runAgentWithStreaming timed out after %dms", timeoutMs);
      finished = true;
      cleanup();
    }
  }, timeoutMs);

  return new Promise((resolve, reject) => {
    const check = setInterval(() => {
      if (finished) {
        clearInterval(check);
        if (fallbackPoller && !fallbackActive) {
          // This branch should not happen; fallbackActive guards the promise.
        }
        if (finalRawMessage) {
          resolve({
            rawText: extractMessageText(finalRawMessage),
            rawMessage: finalRawMessage,
            runId: finalRunId,
            sessionKey,
          });
        } else {
          reject(new Error(abortReason || "Agent 未返回有效回复（超时）"));
        }
      }
    }, 50);
  });
}

async function loadRunContextHistory(
  ctx: HostApiContext,
  sessionKey: string,
  baselineFingerprint?: string,
): Promise<HistoryMessage[]> {
  try {
    const history = await ctx.gatewayManager.rpc<HistoryResult>(
      "chat.history", { sessionKey, limit: 200 }, 15_000,
    );
    const messages = history?.messages ?? [];
    if (!baselineFingerprint) return messages;
    // Return only messages that appeared after the baseline fingerprint
    const idx = messages.findIndex((m) => fingerprintHistoryMessage(m) === baselineFingerprint);
    return idx >= 0 ? messages.slice(idx + 1) : messages;
  } catch (err) {
    console.warn("[runtime-dispatch] loadRunContextHistory failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

function fingerprintHistoryMessage(message: HistoryMessage): string {
  const text = (extractMessageText(message.content) || extractMessageText(message.text) || "").slice(0, 200);
  return `${message.role || ""}|${text}|${JSON.stringify(message.content).slice(0, 200)}`;
}

// ---------------------------------------------------------------------------
//  Main dispatch
// ---------------------------------------------------------------------------

export async function runtimeDispatch(input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  const { ctx, mode, participant, taskCard, hall, triggerMessage, operatorIntent, dispatch = true, retryCount = 0 } = input;

  const agentId = (participant.agentId ?? participant.participantId).trim();
  console.log("[runtime-dispatch] agentId=%s mode=%s dispatch=%s retryCount=%d", agentId, mode, dispatch, retryCount);
  if (!agentId) {
    return { success: false, sessionKey: "", error: "Participant has no agentId" };
  }

  const gatewayStatus = ctx.gatewayManager.getStatus();
  console.log("[runtime-dispatch] gatewayState=%s", gatewayStatus.state);
  if (gatewayStatus.state !== "running") {
    return { success: false, sessionKey: "", error: `Gateway not running (state=${gatewayStatus.state})` };
  }

  // Resolve session key
  const sessionKey = resolveSessionKey(participant, taskCard);
  await recordSessionKey(taskCard.taskCardId, sessionKey);

  // Fetch recent messages for context
  const recentMessages = await fetchRecentThreadMessages(taskCard);

  // Load agent persona from workspace files (cached, 5-min TTL)
  let personaSummary: string | undefined;
  try {
    const persona = await loadAgentPersona(agentId);
    personaSummary = persona.summary || undefined;
  } catch (err) {
    console.warn("[runtime-dispatch] Failed to load persona for agent=%s:", agentId, err);
  }

  // Build differentiated prompt
  const prompt = buildDispatchPrompt({
    mode,
    participant,
    taskCard,
    hall,
    triggerMessage,
    recentMessages,
    currentExecutionItem: taskCard.currentExecutionItem,
    operatorIntent,
    personaSummary,
  });

  // Budget check
  const budgetCheck = await checkTaskBudget(taskCard);
  if (!budgetCheck.allowed) {
    return {
      success: false,
      sessionKey,
      error: budgetCheck.reason || "预算超限",
    };
  }

  // Preview mode: return without calling Gateway
  if (!dispatch) {
    return {
      success: true,
      sessionKey,
      structured: undefined,
      nextAction: undefined,
    };
  }

  const draftId = input.draftId || `draft-${randomUUID()}`;
  const ownDraftLifecycle = !input.draftId;

  // Capture baseline fingerprint before sending so we can extract new history turns later.
  let baselineFingerprint: string | undefined;
  try {
    const baseline = await ctx.gatewayManager.rpc<HistoryResult>(
      "chat.history", { sessionKey, limit: 200 }, 15_000,
    );
    const messages = baseline?.messages ?? [];
    if (messages.length > 0) {
      baselineFingerprint = fingerprintHistoryMessage(messages[messages.length - 1]);
    }
  } catch (err) {
    console.warn("[runtime-dispatch] Failed to capture history baseline:", err instanceof Error ? err.message : err);
  }

  // Helper to execute one agent run with real streaming + fallback polling.
  const executeOnce = async (extraInstruction?: string): Promise<StreamedAgentRunResult> => {
    const message = extraInstruction
      ? `${prompt.systemPrompt}\n\n${prompt.userMessage}\n\n[系统指令] ${extraInstruction}`
      : `${prompt.systemPrompt}\n\n${prompt.userMessage}`;
    const rpcParams: Record<string, unknown> = {
      sessionKey,
      message,
      deliver: true,
      idempotencyKey: randomUUID(),
    };

    publishDraftStart({
      draftId,
      taskCardId: taskCard.taskCardId,
      participantId: participant.participantId,
      participantLabel: participant.displayName,
      hallId: hall.hallId,
    });

    return runAgentWithStreaming(
      ctx,
      { sessionKey, rpcParams, hall, taskCard, participant, draftId },
      (_delta, _rawMessage) => {
        // Streaming deltas are already published by runAgentWithStreaming via stream-publisher.
      },
      180_000,
    );
  };

  let runResult: StreamedAgentRunResult;
  try {
    runResult = await executeOnce();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[runtime-dispatch] Gateway RPC error:", errorMessage);
    if (ownDraftLifecycle) {
      abortDraft(
        {
          draftId,
          taskCardId: taskCard.taskCardId,
          participantId: participant.participantId,
          participantLabel: participant.displayName,
          hallId: hall.hallId,
        },
        errorMessage,
      );
    }
    return { success: false, sessionKey, error: errorMessage };
  }

  // Record estimated consumption
  await consumeTaskBudget(taskCard, runResult.rawText);

  // Sanitize reply
  const { visibleText, structuredBlock, artifactRefs } = sanitizeAgentReply(runResult.rawText);

  // Infer language
  const language = inferHallResponseLanguage(
    `${runResult.rawText}\n${triggerMessage?.content ?? ""}\n${taskCard.title}\n${taskCard.description}`,
  );

  // Enforce concrete deliverable
  const enforceResult = enforceConcreteDeliverable(
    mode,
    mode === "discussion" ? operatorIntent?.text : taskCard.currentExecutionItem?.task,
    visibleText,
    structuredBlock,
    language,
    operatorIntent,
  );

  // Load context history produced during this run (thinking/tool_use/tool_result turns).
  let contextHistory = await loadRunContextHistory(ctx, sessionKey, baselineFingerprint);
  if (contextHistory.length === 0 && runResult.rawMessage) {
    contextHistory = [runResult.rawMessage as HistoryMessage];
  }

  const persistResult = async (
    finalVisible: string,
    finalStructured: ParsedStructuredBlock | undefined,
    finalArtifactRefs: TaskArtifact[],
    finalRunId: string | undefined,
    extraPayload: Record<string, unknown> = {},
  ): Promise<HallMessage> => {
    const messageKind = resolveRuntimeMessageKind(mode, operatorIntent);
    return appendMessage({
      hallId: taskCard.hallId,
      kind: messageKind,
      authorParticipantId: participant.participantId,
      authorLabel: participant.displayName,
      authorSemanticRole: participant.semanticRole,
      content: finalVisible,
      taskCardId: taskCard.taskCardId,
      taskId: taskCard.taskId,
      payload: {
        ...buildMessagePayload(
          finalStructured ?? ({} as ParsedStructuredBlock),
          finalArtifactRefs,
          sessionKey,
          finalRunId,
          contextHistory,
        ),
        taskStage: taskCard.stage,
        taskStatus: taskCard.status,
        ...extraPayload,
      },
    });
  };

  // If retry needed, handle according to retry count cap
  if (enforceResult.nextAction === "retry") {
    // Auto-retry at most once. If already retried, use fallback and don't block.
    if (retryCount >= 1) {
      console.log("[runtime-dispatch] Max retries reached (%d), using fallback", retryCount);
      const fallbackContent = buildFallbackVisibleContent(mode, participant, language);

      const message = await persistResult(fallbackContent, structuredBlock, artifactRefs, runResult.runId, {
        retryFailed: true,
        retryReason: enforceResult.retryReason,
      });

      await applyStructuredBlockToTaskCard(taskCard.taskCardId, structuredBlock, artifactRefs, participant, hall.participants);

      return {
        success: true,
        message,
        sessionKey,
        structured: structuredBlock,
        nextAction: "continue",
        retryNeeded: false,
        retryInstruction: enforceResult.nextStep,
      };
    }

    // First retry: inject retry instruction and re-call Gateway
    console.log("[runtime-dispatch] Retry %d -> %d, injecting instruction", retryCount, retryCount + 1);

    let retryRunResult: StreamedAgentRunResult | undefined;
    try {
      retryRunResult = await executeOnce(enforceResult.nextStep || "请提供具体交付物。");
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.error("[runtime-dispatch] Retry Gateway error:", msg);
    }

    if (retryRunResult) {
      // Re-run sanitize + enforce on retry result
      await consumeTaskBudget(taskCard, retryRunResult.rawText);
      const retrySanitized = sanitizeAgentReply(retryRunResult.rawText);
      const retryEnforceResult = enforceConcreteDeliverable(
        mode,
        mode === "discussion" ? operatorIntent?.text : taskCard.currentExecutionItem?.task,
        retrySanitized.visibleText,
        retrySanitized.structuredBlock,
        language,
        operatorIntent,
      );

      // If retry still fails, fall through to persist with fallback (but don't block)
      if (retryEnforceResult.nextAction !== "retry") {
        // Retry succeeded — persist, and return
        const finalVisible = retryEnforceResult.content || retrySanitized.visibleText || buildFallbackVisibleContent(mode, participant, language);

        const message = await persistResult(finalVisible, retrySanitized.structuredBlock, retrySanitized.artifactRefs, retryRunResult.runId, {
          retrySucceeded: true,
        });

        await applyStructuredBlockToTaskCard(taskCard.taskCardId, retrySanitized.structuredBlock, retrySanitized.artifactRefs, participant, hall.participants);

        const retryNextAction = retrySanitized.structuredBlock?.nextAction ?? inferNextActionFromMode(mode, retrySanitized.structuredBlock);

        return {
          success: true,
          message,
          sessionKey,
          structured: retrySanitized.structuredBlock,
          nextAction: retryNextAction,
          retryNeeded: false,
        };
      }
    }

    // Retry failed or timed out — persist original/fallback, do not block
    console.log("[runtime-dispatch] Retry failed or timed out, using fallback");
    const fallbackContent = buildFallbackVisibleContent(mode, participant, language);

    const message = await persistResult(fallbackContent, structuredBlock, artifactRefs, runResult.runId, {
      retryFailed: true,
      retryReason: enforceResult.retryReason,
    });

    await applyStructuredBlockToTaskCard(taskCard.taskCardId, structuredBlock, artifactRefs, participant);

    return {
      success: true,
      message,
      sessionKey,
      structured: structuredBlock,
      nextAction: "continue",
      retryNeeded: false,
      retryInstruction: enforceResult.nextStep,
    };
  }

  // Normal success path
  // Build final visible content
  const finalVisibleContent = enforceResult.content || visibleText || buildFallbackVisibleContent(mode, participant, language);

  // Persist message
  const message = await persistResult(finalVisibleContent, structuredBlock, artifactRefs, runResult.runId);

  // Update TaskCard from structured block
  await applyStructuredBlockToTaskCard(taskCard.taskCardId, structuredBlock, artifactRefs, participant, hall.participants);

  // Infer next action
  const nextAction = structuredBlock?.nextAction ?? inferNextActionFromMode(mode, structuredBlock);

  return {
    success: true,
    message,
    sessionKey,
    structured: structuredBlock,
    nextAction,
  };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function resolveRuntimeMessageKind(
  mode: DispatchMode,
  operatorIntent?: HallOperatorIntent,
): HallMessage["kind"] {
  if (mode === "discussion") {
    if (operatorIntent?.type === "direct_ask") return "status";
    return "proposal";
  }
  if (mode === "handoff") return "handoff";
  if (mode === "review") return "review";
  return "status";
}

function buildFallbackVisibleContent(
  mode: DispatchMode,
  participant: HallParticipant,
  language: "zh" | "en",
): string {
  const isZh = language === "zh";
  if (mode === "discussion") {
    return isZh
      ? `${participant.displayName} 参与了讨论。`
      : `${participant.displayName} joined the discussion.`;
  }
  if (mode === "handoff") {
    return isZh
      ? `${participant.displayName} 完成了当前步骤。`
      : `${participant.displayName} completed the current step.`;
  }
  if (mode === "review") {
    return isZh
      ? `${participant.displayName} 提交了评审意见。`
      : `${participant.displayName} submitted a review.`;
  }
  return isZh
    ? `${participant.displayName} 执行了任务。`
    : `${participant.displayName} executed the task.`;
}

function buildMessagePayload(
  structured: ParsedStructuredBlock,
  artifactRefs: TaskArtifact[],
  sessionKey: string,
  runId?: string,
  rawContentBlocks?: HistoryMessage[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = { sessionKey };
  if (structured.proposal) payload.proposal = structured.proposal;
  if (structured.decision) payload.decision = structured.decision;
  if (structured.doneWhen) payload.doneWhen = structured.doneWhen;
  if (structured.executor) payload.nextOwnerParticipantId = structured.executor;
  if (structured.latestSummary) payload.status = structured.latestSummary;
  if (artifactRefs.length > 0) payload.artifactRefs = artifactRefs;
  if (runId) payload.runId = runId;
  if (rawContentBlocks && rawContentBlocks.length > 0) payload.rawContentBlocks = rawContentBlocks;
  return payload;
}

async function applyStructuredBlockToTaskCard(
  taskCardId: string,
  structured: ParsedStructuredBlock,
  artifactRefs: TaskArtifact[],
  participant: HallParticipant,
  participants?: HallParticipant[],
): Promise<void> {
  const updates: Parameters<typeof updateTaskCard>[1] = {};

  if (structured.proposal) updates.proposal = structured.proposal;
  if (structured.decision) updates.decision = structured.decision;
  if (structured.doneWhen) updates.doneWhen = structured.doneWhen;
  if (structured.latestSummary) updates.latestSummary = structured.latestSummary;
  if (structured.blockers?.length) updates.blockers = structured.blockers;
  if (structured.requiresInputFrom?.length) updates.requiresInputFrom = structured.requiresInputFrom;

  // Merge artifact refs
  if (artifactRefs.length > 0) {
    const store = await loadTaskCardStore();
    const taskCard = getTaskCard(store, taskCardId);
    if (taskCard) {
      const existing = taskCard.artifactRefs ?? [];
      const seen = new Set(existing.map((a) => a.location.toLowerCase()));
      const merged = [...existing];
      for (const ref of artifactRefs) {
        if (!seen.has(ref.location.toLowerCase())) {
          merged.push(ref);
          seen.add(ref.location.toLowerCase());
        }
      }
      updates.artifactRefs = merged;
    }
  }

  // If executor is specified, resolve it to a real participant
  if (structured.executor) {
    let resolvedOwner: HallParticipant | undefined;
    const exec = structured.executor.trim();

    // Try exact participantId match
    resolvedOwner = participants?.find((p) => p.participantId === exec);
    // Try displayName match
    if (!resolvedOwner) {
      resolvedOwner = participants?.find((p) => p.displayName === exec);
    }
    // Try semantic role match (e.g. "coder", "planner")
    if (!resolvedOwner) {
      const role = exec.toLowerCase() as import("./types").HallSemanticRole;
      resolvedOwner = pickPrimaryParticipantByRole(participants ?? [], role as Exclude<import("./types").HallSemanticRole, "generalist">);
    }

    if (resolvedOwner) {
      updates.currentOwnerParticipantId = resolvedOwner.participantId;
      updates.currentOwnerLabel = resolvedOwner.displayName;
    } else {
      // Fallback: store raw executor string
      updates.currentOwnerParticipantId = exec;
      updates.currentOwnerLabel = exec;
    }
  }

  if (Object.keys(updates).length > 0) {
    await updateTaskCard(taskCardId, updates);
  }

  // Publish supplementary structured-update event with nextAction
  if (structured.nextAction) {
    const store = await loadTaskCardStore();
    const taskCard = getTaskCard(store, taskCardId);
    if (taskCard) {
      publishCollabEvent({
        type: "invalidate",
        hallId: taskCard.hallId,
        taskCardId,
        reason: "task_structured_update",
        payload: {
          proposal: taskCard.proposal,
          decision: taskCard.decision,
          doneWhen: taskCard.doneWhen,
          latestSummary: taskCard.latestSummary,
          nextAction: structured.nextAction,
          nextStep: structured.nextStep,
        },
      });
    }
  }
}

function inferNextActionFromMode(
  mode: DispatchMode,
  structured?: ParsedStructuredBlock,
): RuntimeDispatchResult["nextAction"] {
  if (structured?.nextAction) return structured.nextAction;
  if (structured?.blockers?.length) return "blocked";
  if (mode === "review") return structured?.nextAction ?? "done";
  if (mode === "handoff") return "handoff";
  return "continue";
}

// ---------------------------------------------------------------------------
//  Legacy simplified dispatch (kept for backwards compatibility)
// ---------------------------------------------------------------------------

export interface DispatchAgentRunInput {
  ctx: HostApiContext;
  participant: HallParticipant;
  taskCard: HallTaskCard;
  message: string;
  timeoutMs?: number;
}

export interface DispatchAgentRunResult {
  success: boolean;
  sessionKey?: string;
  result?: unknown;
  error?: string;
}

export async function dispatchAgentRun(input: DispatchAgentRunInput): Promise<DispatchAgentRunResult> {
  const { ctx, participant, taskCard, message, timeoutMs = 180_000 } = input;

  const result = await runtimeDispatch({
    ctx,
    mode: "execution",
    participant,
    taskCard,
    hall: {
      hallId: taskCard.hallId,
      title: "",
      participants: [],
      taskCardIds: [],
      messageIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    operatorIntent: { type: "direct_ask", text: message },
  });

  return {
    success: result.success,
    sessionKey: result.sessionKey,
    result: result.message,
    error: result.error,
  };
}
