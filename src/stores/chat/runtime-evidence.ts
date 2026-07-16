/**
 * M4.1 — Runtime evidence / protection scaffold (no poll convergence yet).
 *
 * Pure helpers that answer:
 *  - does a runtime run have tool/process activity?
 *  - is that run's event stream "fresh" relative to now?
 *  - would a future M4.2 poll skip be allowed under explicit gates?
 *
 * Default behavior is M3-equivalent: poll skip is always disabled until
 * POLL_CONVERGENCE_ENABLED is deliberately turned on after lead approval and
 * live provider tool-chain evidence.
 */
import type { ChatRuntimeEvent } from '../../../shared/chat-runtime-events';
import type { ChatRuntimeRunState } from './types';

/** Freshness window for "runtime stream is actively covering this run". */
export const RUNTIME_FRESHNESS_WINDOW_MS = 5_000;

/**
 * M4.2 feature flag — MUST stay false for M4.1.
 * When true (only after lead authorization + live tool-chain evidence),
 * happy-path history poll may skip when {@link evaluateRuntimePollGate}
 * returns maySkipHistoryPoll.
 */
export const POLL_CONVERGENCE_ENABLED = false;

/**
 * Documented M4.2 convergence thresholds (not enforced while flag is off).
 * Lead may revise; code comments + harness acceptance reference these keys.
 */
export const M4_POLL_CONVERGENCE_THRESHOLDS = {
  /** Runtime tool/process events required before any poll skip candidate. */
  requireToolActivity: true,
  /** Max age of last runtime activity for "fresh" coverage. */
  freshnessWindowMs: RUNTIME_FRESHNESS_WINDOW_MS,
  /** SessionKey must match current session when present on the run. */
  requireSessionKeyMatch: true,
  /** Active runId required — residual terminal runs never suppress poll. */
  requireActiveRunId: true,
  /** Live provider evidence required before enabling POLL_CONVERGENCE_ENABLED. */
  requireLiveProviderToolChainEvidence: true,
} as const;

/**
 * Rollback / stop boundaries for future M4.2. If any fire, set
 * POLL_CONVERGENCE_ENABLED=false immediately and restore full poll.
 */
export const M4_POLL_ROLLBACK_BOUNDARIES = [
  'tool multi-round Thinking/stop control disappears mid-run',
  'phase=end treated as run terminal',
  'image generation settle regression',
  'stale send or New Chat run-cache regression',
  'runtime coverage insufficient and history falls behind',
  'comms message_loss or order violations',
] as const;

export type RuntimePollGateInput = {
  run: ChatRuntimeRunState | null | undefined;
  activeRunId: string | null | undefined;
  currentSessionKey: string | null | undefined;
  nowMs: number;
  /** Optional module-level last runtime event wall clock (Main dual-emit). */
  lastRuntimeEventAtMs?: number | null;
  freshnessWindowMs?: number;
  /** Override for tests only — production uses POLL_CONVERGENCE_ENABLED. */
  convergenceEnabled?: boolean;
};

export type RuntimePollGateDecision = {
  hasActiveRunId: boolean;
  hasToolActivity: boolean;
  isFresh: boolean;
  sessionKeyMatches: boolean;
  lastActivityMs: number | null;
  /** True only when every documented gate passes AND convergence is enabled. */
  maySkipHistoryPoll: boolean;
  /** Human-readable primary reason (stable for unit assertions). */
  reason: string;
};

/** In-memory observation counters (M4.1 metrics scaffold; not persisted). */
export type RuntimeEvidenceCounters = {
  pollTicks: number;
  pollLoads: number;
  pollSkipCandidates: number;
  pollSkipsApplied: number;
  runtimeEventsSeen: number;
};

const counters: RuntimeEvidenceCounters = {
  pollTicks: 0,
  pollLoads: 0,
  pollSkipCandidates: 0,
  pollSkipsApplied: 0,
  runtimeEventsSeen: 0,
};

export function getRuntimeEvidenceCounters(): Readonly<RuntimeEvidenceCounters> {
  return { ...counters };
}

export function resetRuntimeEvidenceCounters(): void {
  counters.pollTicks = 0;
  counters.pollLoads = 0;
  counters.pollSkipCandidates = 0;
  counters.pollSkipsApplied = 0;
  counters.runtimeEventsSeen = 0;
}

export function noteRuntimeEventSeen(): void {
  counters.runtimeEventsSeen += 1;
}

/**
 * True when runtime run has tool/process activity suitable for graph priority
 * or (future) poll-coverage claims. Mirrors M3 graph preference predicate.
 */
export function runtimeEvidenceHasToolActivity(
  runState: ChatRuntimeRunState | null | undefined,
): boolean {
  if (!runState) return false;
  return runState.events.some((event) => isToolLikeRuntimeEvent(event));
}

function isToolLikeRuntimeEvent(event: ChatRuntimeEvent): boolean {
  return event.type === 'tool.started'
    || event.type === 'tool.updated'
    || event.type === 'tool.completed'
    || event.type === 'command.output'
    || event.type === 'patch.completed'
    || event.type === 'approval.updated';
}

/**
 * Latest activity timestamp for a runtime run (event.ts, endedAt, startedAt).
 * Returns null when no usable timestamps exist.
 */
export function getRuntimeRunLastActivityMs(
  runState: ChatRuntimeRunState | null | undefined,
): number | null {
  if (!runState) return null;
  let last: number | null = null;
  const consider = (value: number | undefined): void => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    if (last == null || value > last) last = value;
  };
  consider(runState.startedAt);
  consider(runState.endedAt);
  for (const event of runState.events) {
    consider(event.ts);
  }
  return last;
}

/**
 * True when the run's last activity (or lastRuntimeEventAtMs) is within the
 * freshness window of nowMs.
 */
export function isRuntimeRunFresh(
  runState: ChatRuntimeRunState | null | undefined,
  nowMs: number,
  options?: {
    windowMs?: number;
    lastRuntimeEventAtMs?: number | null;
  },
): boolean {
  const windowMs = options?.windowMs ?? RUNTIME_FRESHNESS_WINDOW_MS;
  const fromRun = getRuntimeRunLastActivityMs(runState);
  const fromModule = options?.lastRuntimeEventAtMs;
  const candidates = [fromRun, fromModule].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (candidates.length === 0) return false;
  const last = Math.max(...candidates);
  return nowMs - last <= windowMs;
}

function sessionKeyMatchesRun(
  run: ChatRuntimeRunState | null | undefined,
  currentSessionKey: string | null | undefined,
): boolean {
  if (!run) return false;
  if (!run.sessionKey) return true;
  if (!currentSessionKey) return false;
  return run.sessionKey === currentSessionKey;
}

/**
 * Evaluate whether runtime evidence *could* cover the active run for poll
 * purposes. Does not mutate state. maySkipHistoryPoll is false unless the
 * explicit convergence flag is enabled and all gates pass.
 */
export function evaluateRuntimePollGate(input: RuntimePollGateInput): RuntimePollGateDecision {
  const {
    run,
    activeRunId,
    currentSessionKey,
    nowMs,
    lastRuntimeEventAtMs = null,
    freshnessWindowMs = RUNTIME_FRESHNESS_WINDOW_MS,
    convergenceEnabled = POLL_CONVERGENCE_ENABLED,
  } = input;

  const hasActiveRunId = Boolean(activeRunId && run && run.runId === activeRunId);
  const hasToolActivity = runtimeEvidenceHasToolActivity(run);
  const isFresh = isRuntimeRunFresh(run, nowMs, {
    windowMs: freshnessWindowMs,
    lastRuntimeEventAtMs,
  });
  const sessionOk = sessionKeyMatchesRun(run, currentSessionKey);
  const lastActivityMs = getRuntimeRunLastActivityMs(run);

  if (!hasActiveRunId) {
    return {
      hasActiveRunId: false,
      hasToolActivity,
      isFresh,
      sessionKeyMatches: sessionOk,
      lastActivityMs,
      maySkipHistoryPoll: false,
      reason: 'no-active-run',
    };
  }
  if (!sessionOk) {
    return {
      hasActiveRunId: true,
      hasToolActivity,
      isFresh,
      sessionKeyMatches: false,
      lastActivityMs,
      maySkipHistoryPoll: false,
      reason: 'session-mismatch',
    };
  }
  if (!hasToolActivity) {
    return {
      hasActiveRunId: true,
      hasToolActivity: false,
      isFresh,
      sessionKeyMatches: true,
      lastActivityMs,
      maySkipHistoryPoll: false,
      reason: 'no-tool-activity',
    };
  }
  if (!isFresh) {
    return {
      hasActiveRunId: true,
      hasToolActivity: true,
      isFresh: false,
      sessionKeyMatches: true,
      lastActivityMs,
      maySkipHistoryPoll: false,
      reason: 'stale-runtime',
    };
  }

  // Candidate: all evidence gates pass. Still blocked unless flag enabled.
  if (!convergenceEnabled) {
    return {
      hasActiveRunId: true,
      hasToolActivity: true,
      isFresh: true,
      sessionKeyMatches: true,
      lastActivityMs,
      maySkipHistoryPoll: false,
      reason: 'gates-pass-flag-disabled',
    };
  }

  return {
    hasActiveRunId: true,
    hasToolActivity: true,
    isFresh: true,
    sessionKeyMatches: true,
    lastActivityMs,
    maySkipHistoryPoll: true,
    reason: 'skip-allowed',
  };
}

/**
 * Integration point for history poll. Under M4.1 defaults this always returns
 * false so poll cadence matches M3 exactly.
 */
export function shouldSkipHistoryPollForRuntimeEvidence(
  decision: RuntimePollGateDecision,
): boolean {
  return decision.maySkipHistoryPoll === true;
}

/**
 * Record one poll tick observation. When applySkip is false (M4.1 default),
 * pollLoads increments whenever a load is about to happen.
 */
export function recordRuntimePollObservation(
  decision: RuntimePollGateDecision,
  options?: { appliedSkip?: boolean; performedLoad?: boolean },
): void {
  counters.pollTicks += 1;
  if (
    decision.hasToolActivity
    && decision.isFresh
    && decision.hasActiveRunId
    && decision.sessionKeyMatches
  ) {
    counters.pollSkipCandidates += 1;
  }
  if (options?.appliedSkip) {
    counters.pollSkipsApplied += 1;
  }
  if (options?.performedLoad) {
    counters.pollLoads += 1;
  }
}
