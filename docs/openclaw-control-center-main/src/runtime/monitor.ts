import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { OpenClawReadonlyAdapter } from "../adapters/openclaw-readonly";
import { POLLING_INTERVALS_MS } from "../config";
import { commanderAlerts } from "./commander";
import { writeCommanderDigest } from "./commander-digest";
import { formatDiffSummary } from "./diff-summary";
import { saveSnapshot } from "./snapshot-store";
import { runTaskHeartbeat } from "./task-heartbeat";

const RUNTIME_DIR = join(process.cwd(), "runtime");
const TIMELINE_LOG = join(RUNTIME_DIR, "timeline.log");

export interface MonitorRunSummary {
  alertsCount: number;
  changed: boolean;
  heartbeatExecuted: number;
}

export async function runMonitorOnce(adapter: OpenClawReadonlyAdapter): Promise<MonitorRunSummary> {
  const snapshot = await adapter.snapshot();
  const stored = await saveSnapshot(snapshot);
  const alerts = commanderAlerts(snapshot);
  const digest = await writeCommanderDigest(snapshot, alerts);
  const heartbeat = await runTaskHeartbeat();
  const heartbeatSummary = `heartbeat=${heartbeat.mode}:${heartbeat.executed}/${heartbeat.selected}`;

  await mkdir(RUNTIME_DIR, { recursive: true });
  await appendFile(
    TIMELINE_LOG,
    `${new Date().toISOString()} | ${formatDiffSummary(stored.diff)} | alerts=${alerts.length} | ${heartbeatSummary}\n`,
    "utf8",
  );

  console.log("[mission-control] monitor", {
    diffSummary: formatDiffSummary(stored.diff),
    alerts,
    heartbeat,
    timelineLog: TIMELINE_LOG,
    digestJson: digest.jsonPath,
    digestMarkdown: digest.markdownPath,
  });

  return {
    alertsCount: alerts.length,
    changed: hasSnapshotDiff(stored.diff),
    heartbeatExecuted: heartbeat.executed,
  };
}

export function monitorIntervalMs(): number {
  return POLLING_INTERVALS_MS.sessionsList;
}

export function nextContinuousMonitorDelayMs(
  baseIntervalMs: number,
  currentIdleStreak: number,
  summary: MonitorRunSummary | undefined,
  maxIntervalMs: number,
): { delayMs: number; idleStreak: number } {
  const normalizedBase = Math.max(1_000, Math.trunc(baseIntervalMs));
  const normalizedMax = Math.max(normalizedBase, Math.trunc(maxIntervalMs));
  if (!summary) {
    return {
      delayMs: Math.min(normalizedMax, normalizedBase * 2),
      idleStreak: 0,
    };
  }
  if (summary.changed || summary.alertsCount > 0 || summary.heartbeatExecuted > 0) {
    return {
      delayMs: normalizedBase,
      idleStreak: 0,
    };
  }
  const nextIdleStreak = Math.min(currentIdleStreak + 1, 4);
  const delayMs = Math.min(normalizedMax, normalizedBase * 2 ** nextIdleStreak);
  return {
    delayMs,
    idleStreak: nextIdleStreak,
  };
}

function hasSnapshotDiff(diff: {
  sessionsDelta: number;
  statusesDelta: number;
  cronJobsDelta: number;
  approvalsDelta: number;
  projectsDelta: number;
  tasksDelta: number;
  budgetEvaluationsDelta: number;
}): boolean {
  return Object.values(diff).some((value) => value !== 0);
}
