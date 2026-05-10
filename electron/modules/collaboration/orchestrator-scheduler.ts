"use strict";

/**
 * Collaboration Hall — Orchestrator Scheduler
 *
 * Periodically scans all TaskCards and:
 *   - Advances discussion → assign when enough replies collected
 *   - Auto-assigns when in assigning state
 *   - Marks execution as blocked on timeout
 *   - Auto-approves review on timeout
 */
import type { HostApiContext } from "../../api/context";
import { createModuleLogger } from "../_shared/module-logger";
import { loadTaskCardStore, listTaskCards, getActiveLock } from "./store";
import {
  getOrchestratorContext,
  transitionOrchestrator,
  autoAssignTask,
  autoAdvanceTask,
  type OrchestratorState,
} from "./orchestrator";
import { checkTaskHeartbeat, autoMarkStalled } from "./task-lifecycle";

const logger = createModuleLogger("orchestrator-scheduler");

export interface SchedulerOptions {
  checkIntervalMs: number;
  discussionTimeoutMs: number;
  executionTimeoutMs: number;
  reviewTimeoutMs: number;
}

const DEFAULT_OPTS: SchedulerOptions = {
  checkIntervalMs: 30_000,
  discussionTimeoutMs: 5 * 60_000,
  executionTimeoutMs: 10 * 60_000,
  reviewTimeoutMs: 5 * 60_000,
};

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startOrchestratorScheduler(ctx: HostApiContext, opts?: Partial<SchedulerOptions>): () => void {
  if (timer) {
    logger.warn("Scheduler already running; stopping previous instance");
    stopOrchestratorScheduler();
  }

  const options = { ...DEFAULT_OPTS, ...opts };
  isRunning = true;

  logger.info("Starting orchestrator scheduler (interval=%dms)", options.checkIntervalMs);

  timer = setInterval(async () => {
    if (!isRunning) return;
    try {
      await runSchedulerTick(ctx, options);
    } catch (error) {
      logger.error("Scheduler tick failed:", error);
    }
  }, options.checkIntervalMs);

  return () => stopOrchestratorScheduler();
}

export function stopOrchestratorScheduler(): void {
  isRunning = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("Orchestrator scheduler stopped");
  }
}

// ---------------------------------------------------------------------------
//  Tick logic
// ---------------------------------------------------------------------------

async function runSchedulerTick(ctx: HostApiContext, opts: SchedulerOptions): Promise<void> {
  const tStore = await loadTaskCardStore();
  const activeCards = listTaskCards(tStore, { includeArchived: false })
    .filter((c) => c.status !== "done" && c.stage !== "completed");

  const now = Date.now();

  for (const taskCard of activeCards) {
    try {
      // Heartbeat: auto-mark stalled tasks as blocked
      const heartbeat = checkTaskHeartbeat(taskCard, { stallThresholdMs: opts.executionTimeoutMs });
      if (heartbeat === "stalled") {
        logger.warn("TaskCard %s stalled; auto-marking as blocked", taskCard.taskCardId);
        await autoMarkStalled(taskCard.taskCardId, `超过 ${Math.round(opts.executionTimeoutMs / 60000)} 分钟无响应`);
        continue;
      }

      const context = getOrchestratorContext(taskCard);
      const state = context.state;

      // Check timeout
      if (context.timeoutAt) {
        const timeoutTs = Date.parse(context.timeoutAt);
        if (now >= timeoutTs) {
          logger.info("TaskCard %s timed out in state %s", taskCard.taskCardId, state);
          await transitionOrchestrator(ctx, taskCard.taskCardId, { type: "timeout" });
          continue;
        }
      }

      // State-specific auto-advance
      switch (state) {
        case "collecting_discussion": {
          // Check if enough replies (orchestrator already does this)
          await autoAdvanceTask(ctx, taskCard.taskCardId);
          break;
        }

        case "assigning": {
          await autoAssignTask(ctx, taskCard.taskCardId);
          break;
        }

        case "executing": {
          // Check if execution lock is stale
          const lock = await getActiveLock(taskCard.taskCardId);
          if (!lock && taskCard.currentOwnerParticipantId) {
            // Lock released but still in executing → likely handoff needed
            logger.info("TaskCard %s execution lock released, awaiting handoff", taskCard.taskCardId);
          }
          break;
        }

        case "awaiting_handoff": {
          // If no next owner queued, try to auto-assign from planned order
          if (!taskCard.currentOwnerParticipantId && taskCard.plannedExecutionOrder.length > 0) {
            const nextId = taskCard.plannedExecutionOrder[0];
            const hStore = await loadTaskCardStore(); // loadHallStore would be better but we need hall
            // This case is handled by manual/auto handoff API
          }
          break;
        }

        case "reviewing": {
          // Timeout handled above
          break;
        }

        case "blocked": {
          // Stay blocked until manual override
          break;
        }
      }
    } catch (error) {
      logger.error("Failed to process taskCard %s:", taskCard.taskCardId, error);
    }
  }
}
