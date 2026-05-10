"use strict";

/**
 * Collaboration Hall — Orchestrator
 *
 * State-machine based automatic flow:
 *   discussion → assign → execution → (handoff → execution)* → review → completed
 *
 * Supports manual override at every step.
 */
import type { HostApiContext } from "../../api/context";
import type { HallTaskCard, HallParticipant, HallMessage } from "./types";
import {
  loadTaskCardStore,
  getTaskCard,
  updateTaskCard,
  loadMessageStore,
  listMessages,
  loadHallStore,
  getHall,
  acquireExecutionLock,
  releaseExecutionLock,
} from "./store";
import { runtimeDispatch, type RuntimeDispatchResult } from "./runtime-dispatch";
import { pickExecutorForTask } from "./role-resolver";
import { resolveNextDiscussionSpeaker } from "./speaker-policy";

export type OrchestratorState =
  | "idle"
  | "collecting_discussion"
  | "assigning"
  | "executing"
  | "awaiting_handoff"
  | "reviewing"
  | "completed"
  | "blocked";

export interface OrchestratorContext {
  taskCardId: string;
  state: OrchestratorState;
  enteredAt: string;
  timeoutAt?: string;
  retryCount: number;
  autoTriggered: boolean;
}

export type OrchestratorEvent =
  | { type: "discussion_message"; messageId: string }
  | { type: "discussion_sufficient" }
  | { type: "manual_assign"; participantId: string; label?: string }
  | { type: "execution_complete"; nextAction: "handoff" | "review" | "blocked" | "done"; result?: RuntimeDispatchResult }
  | { type: "manual_handoff"; nextParticipantId: string; nextLabel?: string }
  | { type: "review_submitted"; outcome: "approved" | "rejected"; participantId: string }
  | { type: "timeout" }
  | { type: "blocker_detected"; blockers: string[] }
  | { type: "manual_override"; newState: OrchestratorState; participantId?: string };

// ---------------------------------------------------------------------------
//  State transition constants
// ---------------------------------------------------------------------------

const DISCUSSION_REPLY_THRESHOLD = 2; // min non-human replies to auto-advance
const DISCUSSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const EXECUTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const REVIEW_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function getOrchestratorContext(taskCard: HallTaskCard): OrchestratorContext {
  // Derive context from taskCard fields
  const state = deriveStateFromTaskCard(taskCard);
  return {
    taskCardId: taskCard.taskCardId,
    state,
    enteredAt: taskCard.updatedAt,
    timeoutAt: computeTimeoutAt(state, taskCard.updatedAt),
    retryCount: 0,
    autoTriggered: false,
  };
}

export async function transitionOrchestrator(
  ctx: HostApiContext,
  taskCardId: string,
  event: OrchestratorEvent,
): Promise<OrchestratorContext> {
  const tStore = await loadTaskCardStore();
  const taskCard = getTaskCard(tStore, taskCardId);
  if (!taskCard) throw new Error(`Task card '${taskCardId}' not found`);

  const context = getOrchestratorContext(taskCard);
  const now = new Date().toISOString();

  let nextState: OrchestratorState = context.state;
  let updates: Parameters<typeof updateTaskCard>[1] = {};

  switch (event.type) {
    case "discussion_message": {
      if (context.state === "idle" || context.state === "collecting_discussion") {
        nextState = "collecting_discussion";
        // Check if we have enough discussion replies
        const enough = await hasEnoughDiscussionReplies(taskCard);
        if (enough) {
          nextState = "assigning";
        }
      }
      break;
    }

    case "discussion_sufficient": {
      if (context.state === "collecting_discussion" || context.state === "idle") {
        nextState = "assigning";
      }
      break;
    }

    case "manual_assign": {
      nextState = "executing";
      updates.currentOwnerParticipantId = event.participantId;
      updates.currentOwnerLabel = event.label ?? event.participantId;
      updates.stage = "execution";
      updates.status = "in_progress";
      break;
    }

    case "execution_complete": {
      if (context.state === "executing" || context.state === "awaiting_handoff") {
        const action = event.nextAction;
        if (action === "blocked") {
          nextState = "blocked";
          updates.status = "blocked";
          updates.stage = "blocked";
        } else if (action === "review") {
          nextState = "reviewing";
          updates.stage = "review";
        } else if (action === "handoff") {
          nextState = "awaiting_handoff";
        } else if (action === "done") {
          nextState = "completed";
          updates.stage = "completed";
          updates.status = "done";
        }
      }
      break;
    }

    case "manual_handoff": {
      if (context.state === "executing" || context.state === "awaiting_handoff") {
        nextState = "executing";
        updates.currentOwnerParticipantId = event.nextParticipantId;
        updates.currentOwnerLabel = event.nextLabel ?? event.nextParticipantId;
        updates.stage = "execution";
        updates.status = "in_progress";
      }
      break;
    }

    case "review_submitted": {
      if (context.state === "reviewing") {
        if (event.outcome === "approved") {
          nextState = "completed";
          updates.stage = "completed";
          updates.status = "done";
        } else {
          nextState = "blocked";
          updates.stage = "blocked";
          updates.status = "blocked";
        }
      }
      break;
    }

    case "timeout": {
      if (context.state === "collecting_discussion") {
        nextState = "assigning";
      } else if (context.state === "executing") {
        nextState = "blocked";
        updates.status = "blocked";
        updates.stage = "blocked";
      } else if (context.state === "reviewing") {
        nextState = "completed"; // Auto-approve on timeout
        updates.stage = "completed";
        updates.status = "done";
      }
      break;
    }

    case "blocker_detected": {
      nextState = "blocked";
      updates.status = "blocked";
      updates.stage = "blocked";
      updates.blockers = [...new Set([...(taskCard.blockers ?? []), ...event.blockers])];
      break;
    }

    case "manual_override": {
      nextState = event.newState;
      if (event.participantId) {
        updates.currentOwnerParticipantId = event.participantId;
      }
      break;
    }
  }

  // Apply state transition
  if (nextState !== context.state || Object.keys(updates).length > 0) {
    if (nextState !== context.state) {
      updates.stage = mapStateToStage(nextState);
      if (nextState === "completed") updates.status = "done";
      if (nextState === "blocked") updates.status = "blocked";
      if (nextState === "executing") updates.status = "in_progress";
    }
    await updateTaskCard(taskCardId, updates);
  }

  return {
    ...context,
    state: nextState,
    enteredAt: now,
    timeoutAt: computeTimeoutAt(nextState, now),
    autoTriggered: event.type !== "manual_override" && event.type !== "manual_assign" && event.type !== "manual_handoff",
  };
}

// ---------------------------------------------------------------------------
//  Auto actions
// ---------------------------------------------------------------------------

export async function autoAssignTask(
  ctx: HostApiContext,
  taskCardId: string,
): Promise<{ participant: HallParticipant | undefined; taskCard: HallTaskCard }> {
  const hStore = await loadHallStore();
  const tStore = await loadTaskCardStore();
  const taskCard = getTaskCard(tStore, taskCardId);
  if (!taskCard) throw new Error(`Task card '${taskCardId}' not found`);

  const hall = getHall(hStore, taskCard.hallId);
  if (!hall) throw new Error(`Hall '${taskCard.hallId}' not found`);

  const participant = pickExecutorForTask(hall, taskCard);
  if (!participant) {
    return { participant: undefined, taskCard };
  }

  await transitionOrchestrator(ctx, taskCardId, {
    type: "manual_assign",
    participantId: participant.participantId,
    label: participant.displayName,
  });

  // After assignment, auto-dispatch to kick off execution
  const updatedStore = await loadTaskCardStore();
  const updatedTaskCard = getTaskCard(updatedStore, taskCardId)!;
  if (updatedTaskCard.stage === "execution" && updatedTaskCard.currentOwnerParticipantId) {
    await dispatchToParticipant(ctx, updatedTaskCard, participant, hall, "execution");
  }

  return { participant, taskCard: updatedTaskCard };
}

export async function autoAdvanceTask(
  ctx: HostApiContext,
  taskCardId: string,
): Promise<OrchestratorContext> {
  const tStore = await loadTaskCardStore();
  const taskCard = getTaskCard(tStore, taskCardId);
  if (!taskCard) throw new Error(`Task card '${taskCardId}' not found`);

  const context = getOrchestratorContext(taskCard);

  switch (context.state) {
    case "idle":
    case "collecting_discussion":
      return transitionOrchestrator(ctx, taskCardId, { type: "discussion_sufficient" });

    case "assigning": {
      const { participant } = await autoAssignTask(ctx, taskCardId);
      if (!participant) {
        return transitionOrchestrator(ctx, taskCardId, { type: "manual_override", newState: "blocked" });
      }
      return getOrchestratorContext(getTaskCard(await loadTaskCardStore(), taskCardId)!);
    }

    case "executing":
    case "awaiting_handoff": {
      // Attempt to dispatch to current owner
      if (taskCard.currentOwnerParticipantId) {
        const hStore = await loadHallStore();
        const hall = getHall(hStore, taskCard.hallId);
        if (hall) {
          const participant = hall.participants.find(
            (p) => p.participantId === taskCard.currentOwnerParticipantId,
          );
          if (participant) {
            await dispatchToParticipant(ctx, taskCard, participant, hall, "execution");
          }
        }
      }
      return getOrchestratorContext(getTaskCard(await loadTaskCardStore(), taskCardId)!);
    }

    case "reviewing":
      return transitionOrchestrator(ctx, taskCardId, { type: "review_submitted", outcome: "approved", participantId: "system" });

    case "blocked":
      return transitionOrchestrator(ctx, taskCardId, { type: "manual_override", newState: "assigning" });

    case "completed":
      return context;
  }
}

export async function dispatchToParticipant(
  ctx: HostApiContext,
  taskCard: HallTaskCard,
  participant: HallParticipant,
  hall: CollaborationHall,
  mode: "discussion" | "execution" | "handoff" | "review",
): Promise<RuntimeDispatchResult> {
  // In discussion mode with an active cycle, only dispatch to the next expected speaker
  if (mode === "discussion" && taskCard.discussionCycle && !taskCard.discussionCycle.closedAt) {
    const nextSpeaker = resolveNextDiscussionSpeaker(taskCard);
    if (nextSpeaker && nextSpeaker !== participant.participantId) {
      console.log(
        "[orchestrator] Skipping dispatch to %s — next expected speaker is %s",
        participant.participantId, nextSpeaker,
      );
      return {
        success: false,
        sessionKey: "",
        error: `当前讨论轮次应由 ${nextSpeaker} 发言`,
      };
    }
  }

  // Acquire execution lock
  await acquireExecutionLock(
    taskCard.taskCardId,
    participant.participantId,
    participant.displayName,
    mode === "review" ? "review" : mode === "discussion" ? "discussion" : "execution",
    600_000,
  );

  try {
    const result = await runtimeDispatch({
      ctx,
      mode,
      participant,
      taskCard,
      hall,
    });

    // Update orchestrator state based on result
    if (result.success && result.nextAction) {
      if (mode === "execution" || mode === "handoff") {
        await transitionOrchestrator(ctx, taskCard.taskCardId, {
          type: "execution_complete",
          nextAction: result.nextAction,
          result,
        });
      } else if (mode === "review") {
        const outcome = result.nextAction === "done" || result.structured?.nextAction === "done"
          ? "approved"
          : "rejected";
        await transitionOrchestrator(ctx, taskCard.taskCardId, {
          type: "review_submitted",
          outcome,
          participantId: participant.participantId,
        });
      }
    }

    return result;
  } finally {
    await releaseExecutionLock(taskCard.taskCardId, "dispatch_complete");
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function deriveStateFromTaskCard(taskCard: HallTaskCard): OrchestratorState {
  if (taskCard.status === "done" || taskCard.stage === "completed") return "completed";
  if (taskCard.status === "blocked" || taskCard.stage === "blocked") return "blocked";
  if (taskCard.stage === "review") return "reviewing";
  if (taskCard.stage === "execution") {
    return taskCard.currentOwnerParticipantId ? "executing" : "awaiting_handoff";
  }
  if (taskCard.stage === "discussion") return "collecting_discussion";
  return "idle";
}

function mapStateToStage(state: OrchestratorState): HallTaskCard["stage"] {
  switch (state) {
    case "collecting_discussion": return "discussion";
    case "assigning": return "discussion";
    case "executing": return "execution";
    case "awaiting_handoff": return "execution";
    case "reviewing": return "review";
    case "completed": return "completed";
    case "blocked": return "blocked";
    case "idle": return "discussion";
  }
}

function computeTimeoutAt(state: OrchestratorState, enteredAt: string): string | undefined {
  const ms =
    state === "collecting_discussion" ? DISCUSSION_TIMEOUT_MS :
    state === "executing" ? EXECUTION_TIMEOUT_MS :
    state === "reviewing" ? REVIEW_TIMEOUT_MS :
    undefined;

  if (!ms) return undefined;
  return new Date(Date.parse(enteredAt) + ms).toISOString();
}

async function hasEnoughDiscussionReplies(taskCard: HallTaskCard): Promise<boolean> {
  // If a DiscussionCycle is active, check if all expected participants have responded
  const cycle = taskCard.discussionCycle;
  if (cycle && !cycle.closedAt) {
    const allResponded = cycle.expectedParticipantIds.every(
      (id) => cycle.completedParticipantIds.includes(id),
    );
    if (allResponded) return true;
  }

  const mStore = await loadMessageStore();
  const messages = listMessages(mStore, { hallId: taskCard.hallId, taskCardId: taskCard.taskCardId });

  // Count non-human, non-system messages in discussion stage
  const nonHumanCount = messages.filter(
    (m) => m.kind !== "system" && m.authorParticipantId !== "user" && !m.authorParticipantId.startsWith("human"),
  ).length;

  return nonHumanCount >= DISCUSSION_REPLY_THRESHOLD;
}
