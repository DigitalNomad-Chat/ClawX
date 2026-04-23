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

interface ChatSendResult {
  text?: string;
  message?: string;
  content?: string;
  [key: string]: unknown;
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
//  Main dispatch
// ---------------------------------------------------------------------------

export async function runtimeDispatch(input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  const { ctx, mode, participant, taskCard, hall, triggerMessage, operatorIntent, dispatch = true } = input;

  const agentId = (participant.agentId ?? participant.participantId).trim();
  console.log("[runtime-dispatch] agentId=%s mode=%s dispatch=%s", agentId, mode, dispatch);
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

  // Call Gateway
  const rpcParams: Record<string, unknown> = {
    sessionKey,
    message: `${prompt.systemPrompt}\n\n${prompt.userMessage}`,
    deliver: true,
    idempotencyKey: randomUUID(),
  };

  console.log("[runtime-dispatch] Calling gatewayManager.rpc chat.send sessionKey=%s", sessionKey);

  let rawReply: string;
  try {
    const result = await ctx.gatewayManager.rpc<ChatSendResult>("chat.send", rpcParams, 180_000);
    console.log("[runtime-dispatch] Gateway result keys=%j", Object.keys(result ?? {}));
    rawReply = result.text ?? result.message ?? result.content ?? String(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[runtime-dispatch] Gateway RPC error:", errorMessage);
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

  // If retry needed, return early (caller should retry)
  if (enforceResult.nextAction === "retry") {
    return {
      success: true,
      sessionKey,
      structured: structuredBlock,
      nextAction: "continue",
      retryNeeded: true,
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
  await applyStructuredBlockToTaskCard(taskCard.taskCardId, structuredBlock, artifactRefs, participant);

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

  // If executor is specified, update owner
  if (structured.executor) {
    updates.currentOwnerParticipantId = structured.executor;
    updates.currentOwnerLabel = structured.executor;
  }

  if (Object.keys(updates).length > 0) {
    await updateTaskCard(taskCardId, updates);
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
