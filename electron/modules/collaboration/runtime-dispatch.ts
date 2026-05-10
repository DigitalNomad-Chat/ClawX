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

  // Call Gateway — chat.send is async; it returns { runId } immediately.
  // We then poll chat.history until an assistant message appears or we time out.
  const rpcParams: Record<string, unknown> = {
    sessionKey,
    message: `${prompt.systemPrompt}\n\n${prompt.userMessage}`,
    deliver: true,
    idempotencyKey: randomUUID(),
  };

  console.log("[runtime-dispatch] Calling gatewayManager.rpc chat.send sessionKey=%s", sessionKey);

  const draftId = input.draftId || `draft-${randomUUID()}`;
  const ownDraftLifecycle = !input.draftId; // true = runtime-dispatch owns finalize/abort

  let rawReply: string;
  try {
    // Phase 1: Send the message and obtain runId
    const sendResult = await ctx.gatewayManager.rpc<{ runId?: string; status?: string } & Record<string, unknown>>(
      "chat.send", rpcParams, 30_000,
    );
    console.log("[runtime-dispatch] Gateway chat.send result keys=%j", Object.keys(sendResult ?? {}));

    // Publish draft_start event
    publishCollabEvent({
      type: "invalidate",
      hallId: hall.hallId,
      taskCardId: taskCard.taskCardId,
      reason: "draft_chunk",
      payload: {
        draftId,
        chunk: `${participant.displayName} 正在思考…`,
        authorLabel: participant.displayName,
        authorSemanticRole: participant.semanticRole,
      },
    });

    // Phase 2: Poll chat.history for the assistant reply, streaming deltas
    rawReply = await pollHistoryForAssistantReply(ctx, sessionKey, 180_000, (delta, _fullText) => {
      publishCollabEvent({
        type: "invalidate",
        hallId: hall.hallId,
        taskCardId: taskCard.taskCardId,
        reason: "draft_chunk",
        payload: {
          draftId,
          chunk: delta,
          authorLabel: participant.displayName,
          authorSemanticRole: participant.semanticRole,
        },
      });
    });

    if (!rawReply) {
      if (ownDraftLifecycle) {
        publishCollabEvent({
          type: "invalidate",
          hallId: hall.hallId,
          taskCardId: taskCard.taskCardId,
          reason: "draft_abort",
          payload: {
            draftId,
            abortReason: "Agent 未返回有效回复（超时）",
          },
        });
      }
      return { success: false, sessionKey, error: "Agent 未返回有效回复（超时）" };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[runtime-dispatch] Gateway RPC error:", errorMessage);
    if (ownDraftLifecycle) {
      publishCollabEvent({
        type: "invalidate",
        hallId: hall.hallId,
        taskCardId: taskCard.taskCardId,
        reason: "draft_abort",
        payload: {
          draftId,
          abortReason: errorMessage,
        },
      });
    }
    return { success: false, sessionKey, error: errorMessage };
  }

  // Record estimated consumption
  await consumeTaskBudget(taskCard, rawReply);

  // Sanitize reply
  const { visibleText, structuredBlock, artifactRefs } = sanitizeAgentReply(rawReply);

  // Infer language
  const language = inferHallResponseLanguage(
    `${rawReply}\n${triggerMessage?.content ?? ""}\n${taskCard.title}\n${taskCard.description}`,
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

  // If retry needed, handle according to retry count cap
  if (enforceResult.nextAction === "retry") {
    const retryContent = enforceResult.content || visibleText || buildFallbackVisibleContent(mode, participant, language);

    // Auto-retry at most once. If already retried, use fallback and don't block.
    if (retryCount >= 1) {
      console.log("[runtime-dispatch] Max retries reached (%d), using fallback", retryCount);
      const fallbackContent = buildFallbackVisibleContent(mode, participant, language);
      const fallbackMessageKind = resolveRuntimeMessageKind(mode, operatorIntent);

      const message = await appendMessage({
        hallId: taskCard.hallId,
        kind: fallbackMessageKind,
        authorParticipantId: participant.participantId,
        authorLabel: participant.displayName,
        authorSemanticRole: participant.semanticRole,
        content: fallbackContent,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          ...buildMessagePayload(structuredBlock, artifactRefs, sessionKey),
          taskStage: taskCard.stage,
          taskStatus: taskCard.status,
          retryFailed: true,
          retryReason: enforceResult.retryReason,
        },
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

    const retryMessage = `${prompt.systemPrompt}\n\n${prompt.userMessage}\n\n[系统指令] ${enforceResult.nextStep || "请提供具体交付物。"}`;
    const retryRpcParams: Record<string, unknown> = {
      sessionKey,
      message: retryMessage,
      deliver: true,
      idempotencyKey: randomUUID(),
    };

    let retryRawReply: string | null = null;
    try {
      const retrySendResult = await ctx.gatewayManager.rpc<{ runId?: string; status?: string } & Record<string, unknown>>(
        "chat.send", retryRpcParams, 30_000,
      );
      console.log("[runtime-dispatch] Retry send result keys=%j", Object.keys(retrySendResult ?? {}));
      retryRawReply = await pollHistoryForAssistantReply(ctx, sessionKey, 180_000, (delta, _fullText) => {
        publishCollabEvent({
          type: "invalidate",
          hallId: hall.hallId,
          taskCardId: taskCard.taskCardId,
          reason: "draft_chunk",
          payload: {
            draftId,
            chunk: delta,
            authorLabel: participant.displayName,
            authorSemanticRole: participant.semanticRole,
          },
        });
      });
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.error("[runtime-dispatch] Retry Gateway error:", msg);
    }

    if (retryRawReply) {
      // Re-run sanitize + enforce on retry result
      const retrySanitized = sanitizeAgentReply(retryRawReply);
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
        // Retry succeeded — record consumption, persist, and return
        await consumeTaskBudget(taskCard, retryRawReply);

        const finalVisible = retryEnforceResult.content || retrySanitized.visibleText || buildFallbackVisibleContent(mode, participant, language);
        const retryMessageKind = resolveRuntimeMessageKind(mode, operatorIntent);

        const message = await appendMessage({
          hallId: taskCard.hallId,
          kind: retryMessageKind,
          authorParticipantId: participant.participantId,
          authorLabel: participant.displayName,
          authorSemanticRole: participant.semanticRole,
          content: finalVisible,
          taskCardId: taskCard.taskCardId,
          taskId: taskCard.taskId,
          payload: {
            ...buildMessagePayload(retrySanitized.structuredBlock, retrySanitized.artifactRefs, sessionKey),
            taskStage: taskCard.stage,
            taskStatus: taskCard.status,
            retrySucceeded: true,
          },
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
    const fallbackMessageKind = resolveRuntimeMessageKind(mode, operatorIntent);
    const fallbackContent = buildFallbackVisibleContent(mode, participant, language);

    const message = await appendMessage({
      hallId: taskCard.hallId,
      kind: fallbackMessageKind,
      authorParticipantId: participant.participantId,
      authorLabel: participant.displayName,
      authorSemanticRole: participant.semanticRole,
      content: fallbackContent,
      taskCardId: taskCard.taskCardId,
      taskId: taskCard.taskId,
      payload: {
        ...buildMessagePayload(structuredBlock, artifactRefs, sessionKey),
        taskStage: taskCard.stage,
        taskStatus: taskCard.status,
        retryFailed: true,
        retryReason: enforceResult.retryReason,
      },
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

  // Determine message kind
  const messageKind = resolveRuntimeMessageKind(mode, operatorIntent);

  // Build final visible content
  const finalVisibleContent = enforceResult.content || visibleText || buildFallbackVisibleContent(mode, participant, language);

  // Persist message
  const message = await appendMessage({
    hallId: taskCard.hallId,
    kind: messageKind,
    authorParticipantId: participant.participantId,
    authorLabel: participant.displayName,
    authorSemanticRole: participant.semanticRole,
    content: finalVisibleContent,
    taskCardId: taskCard.taskCardId,
    taskId: taskCard.taskId,
    payload: {
      ...buildMessagePayload(structuredBlock, artifactRefs, sessionKey),
      taskStage: taskCard.stage,
      taskStatus: taskCard.status,
    },
  });

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
): Record<string, unknown> {
  const payload: Record<string, unknown> = { sessionKey };
  if (structured.proposal) payload.proposal = structured.proposal;
  if (structured.decision) payload.decision = structured.decision;
  if (structured.doneWhen) payload.doneWhen = structured.doneWhen;
  if (structured.executor) payload.nextOwnerParticipantId = structured.executor;
  if (structured.latestSummary) payload.status = structured.latestSummary;
  if (artifactRefs.length > 0) payload.artifactRefs = artifactRefs;
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
  const { ctx, participant, taskCard, message, timeoutMs = 120_000 } = input;

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
