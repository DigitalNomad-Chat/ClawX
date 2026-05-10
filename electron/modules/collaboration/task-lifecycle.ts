"use strict";

/**
 * Collaboration Hall — Task Lifecycle Tracker
 *
 * Records execution history and detects stalled tasks.
 */
import { loadTaskCardStore, getTaskCard, updateTaskCard } from "./store";
import type { HallExecutionLogEntry, HallTaskCard } from "./types";

/**
 * Append an entry to a TaskCard's execution log.
 */
export async function recordExecutionLog(
  taskCardId: string,
  entry: HallExecutionLogEntry,
): Promise<void> {
  const store = await loadTaskCardStore();
  const taskCard = getTaskCard(store, taskCardId);
  if (!taskCard) {
    throw new Error(`Task card '${taskCardId}' not found`);
  }

  const log = taskCard.executionLog ?? [];
  log.push(entry);
  taskCard.executionLog = log;
  taskCard.updatedAt = new Date().toISOString();
  store.updatedAt = taskCard.updatedAt;

  // Re-import store write to avoid circular dependency if we were inside store.ts
  const { getTaskCardStore } = await import("./store");
  await getTaskCardStore().write(store);
}

/**
 * Get the execution log for a TaskCard.
 */
export async function getExecutionLog(
  taskCardId: string,
): Promise<HallExecutionLogEntry[]> {
  const store = await loadTaskCardStore();
  const taskCard = getTaskCard(store, taskCardId);
  return taskCard?.executionLog ?? [];
}

/**
 * Check if a task appears stalled based on last activity.
 *
 * - healthy: active and recently updated
 * - stalled: no update for a long time while in_progress
 * - blocked: explicitly marked blocked
 */
export function checkTaskHeartbeat(
  taskCard: HallTaskCard,
  opts?: { stallThresholdMs?: number },
): "healthy" | "stalled" | "blocked" {
  if (taskCard.stage === "blocked") return "blocked";
  if (taskCard.status !== "in_progress") return "healthy";

  const threshold = opts?.stallThresholdMs ?? 1_800_000; // 30 min default
  const lastUpdate = new Date(taskCard.updatedAt).getTime();
  const now = Date.now();

  if (now - lastUpdate > threshold) {
    return "stalled";
  }
  return "healthy";
}

/**
 * Scan all active tasks and return those that are stalled.
 */
export async function findStalledTasks(
  opts?: { stallThresholdMs?: number },
): Promise<Array<{ taskCard: HallTaskCard; status: "stalled" | "blocked" }>> {
  const { loadTaskCardStore } = await import("./store");
  const store = await loadTaskCardStore();
  const result: Array<{ taskCard: HallTaskCard; status: "stalled" | "blocked" }> = [];

  for (const taskCard of store.taskCards) {
    if (taskCard.archivedAt) continue;
    const status = checkTaskHeartbeat(taskCard, opts);
    if (status === "stalled" || status === "blocked") {
      result.push({ taskCard, status });
    }
  }

  return result;
}

/**
 * Auto-mark a stalled task as blocked and record a log entry.
 */
export async function autoMarkStalled(taskCardId: string, reason?: string): Promise<HallTaskCard> {
  const note = reason || "任务长时间无响应，系统自动标记为阻塞";
  const taskCard = await updateTaskCard(taskCardId, {
    stage: "blocked",
    status: "blocked",
  });

  // Append a system log entry for the auto-block
  const log = taskCard.executionLog ?? [];
  log.push({
    participantId: "system",
    participantLabel: "系统",
    action: "blocked",
    timestamp: new Date().toISOString(),
    note,
  });
  taskCard.executionLog = log;

  const { getTaskCardStore } = await import("./store");
  const store = await loadTaskCardStore();
  const idx = store.taskCards.findIndex((c) => c.taskCardId === taskCardId);
  if (idx >= 0) {
    store.taskCards[idx] = taskCard;
    store.updatedAt = new Date().toISOString();
    await getTaskCardStore().write(store);
  }

  return taskCard;
}
