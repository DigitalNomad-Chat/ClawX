/**
 * M4.2 — Runtime evidence + restricted history poll convergence.
 *
 * Pure helpers that answer:
 *  - does a runtime run have tool/process activity?
 *  - is that run's event stream "fresh" relative to now?
 *  - may this poll tick skip loadHistory under explicit gates?
 *
 * Skip is allowed only when POLL_CONVERGENCE_ENABLED is true AND live provider
 * tool-chain evidence has been latched AND structural gates pass (session,
 * active run, running status, tool activity, freshness, not pendingFinal).
 * All other paths keep loadHistory(true) — fallback is never removed.
 *
 * Single authority for per-run last-activity wall clocks lives in this module
 * (not duplicated in chat.ts / helpers.ts).
 */
import type { ChatRuntimeEvent } from '../../../shared/chat-runtime-events';
import type { ChatRuntimeRunState } from './types';

/** Freshness window for "runtime stream is actively covering this run". */
export const RUNTIME_FRESHNESS_WINDOW_MS = 5_000;

/**
 * M4.2 feature flag — enabled after lead approval + live item→tool dual-emit evidence.
 * Skip still requires {@link getLiveProviderToolChainEvidence} and all structural gates;
 * any uncertainty falls back to loadHistory(true).
 */
export const POLL_CONVERGENCE_ENABLED = true;

/**
 * Process-wide live-provider tool-chain evidence latch.
 * Defaults false; only flipped after verified live tool+thinking+assistant evidence.
 * Hard requirement for any future skip-allowed decision.
 */
let liveProviderToolChainEvidence = false;

export function setLiveProviderToolChainEvidence(value: boolean): void {
  liveProviderToolChainEvidence = value;
}

export function getLiveProviderToolChainEvidence(): boolean {
  return liveProviderToolChainEvidence;
}

/**
 * Documented M4.2 convergence thresholds.
 * `requireLiveProviderToolChainEvidence` is enforced in {@link evaluateRuntimePollGate}.
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
  /** Run status must be running — completed/error/aborted never suppress poll. */
  requireRunRunning: true,
  /** pendingFinal means history finalization uncertainty — never skip. */
  rejectPendingFinal: true,
  /** Live provider evidence required before skip-allowed (hard gate). */
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
  freshnessWindowMs?: number;
  /**
   * When true, history finalization / image settle is in flight — never skip.
   */
  pendingFinal?: boolean;
  /** Override for tests only — production uses POLL_CONVERGENCE_ENABLED. */
  convergenceEnabled?: boolean;
  /**
   * Override for tests only — production uses {@link getLiveProviderToolChainEvidence}.
   * Hard requirement: skip-allowed is impossible when this is false.
   */
  hasLiveProviderToolChainEvidence?: boolean;
};

export type RuntimePollGateDecision = {
  hasActiveRunId: boolean;
  hasToolActivity: boolean;
  isFresh: boolean;
  sessionKeyMatches: boolean;
  runIsRunning: boolean;
  pendingFinal: boolean;
  hasLiveProviderEvidence: boolean;
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

/**
 * Single authority: last observed activity wall clock per runId.
 * Optionally carries sessionKey so foreign-session lookups cannot reuse it.
 */
type RunActivityStamp = {
  runId: string;
  sessionKey?: string;
  atMs: number;
};

const lastActivityByRunId = new Map<string, RunActivityStamp>();

/**
 * Normalize Gateway timestamps to milliseconds.
 * Values &lt; 1e12 are treated as seconds (pre-~2033); otherwise milliseconds.
 */
export function normalizeTimestampMs(ts: number): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

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

/** Clear per-run activity stamps (tests / optional session teardown). */
export function resetRuntimeActivityStamps(): void {
  lastActivityByRunId.clear();
}

/**
 * Record that a Main-normalized runtime event was applied for a specific run.
 * This is the sole authority for run-scoped wall-clock freshness — not a
 * process-global clock that foreign sessions can satisfy.
 */
export function noteRuntimeEventActivity(params: {
  runId: string;
  sessionKey?: string | null;
  /** Event payload timestamp (seconds or ms). */
  eventTs?: number | null;
  /** Receive wall clock (ms). Defaults to Date.now(). */
  receivedAtMs?: number;
}): void {
  if (!params.runId) return;
  const fromEvent = typeof params.eventTs === 'number'
    ? normalizeTimestampMs(params.eventTs)
    : null;
  const received = typeof params.receivedAtMs === 'number' && Number.isFinite(params.receivedAtMs)
    ? params.receivedAtMs
    : Date.now();
  // Wall clock for "fresh relative to nowMs"; include normalized event ts when present.
  const atMs = fromEvent != null ? Math.max(received, fromEvent) : received;
  const sessionKey = params.sessionKey != null && params.sessionKey !== ''
    ? params.sessionKey
    : undefined;
  const existing = lastActivityByRunId.get(params.runId);
  lastActivityByRunId.set(params.runId, {
    runId: params.runId,
    sessionKey: sessionKey ?? existing?.sessionKey,
    atMs: existing && existing.atMs > atMs ? existing.atMs : atMs,
  });
  counters.runtimeEventsSeen += 1;
}

/**
 * Lookup last activity for a run. Returns null when sessionKey is provided and
 * does not match the stamp (foreign session isolation).
 */
export function getRunScopedActivityMs(
  runId: string | null | undefined,
  sessionKey?: string | null,
): number | null {
  if (!runId) return null;
  const stamp = lastActivityByRunId.get(runId);
  if (!stamp) return null;
  if (
    sessionKey
    && stamp.sessionKey
    && stamp.sessionKey !== sessionKey
  ) {
    return null;
  }
  return stamp.atMs;
}

/** @deprecated Use noteRuntimeEventActivity — kept as alias for counter-only tests. */
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

export function isToolLikeRuntimeEvent(event: ChatRuntimeEvent): boolean {
  return event.type === 'tool.started'
    || event.type === 'tool.updated'
    || event.type === 'tool.completed'
    || event.type === 'command.output'
    || event.type === 'patch.completed'
    || event.type === 'approval.updated';
}

/**
 * Latch process-wide live provider tool-chain evidence after a real tool-like
 * runtime event is applied (e.g. item→tool dual-emit). Idempotent.
 */
export function noteLiveProviderToolChainEvidenceFromEvent(event: ChatRuntimeEvent): void {
  if (isToolLikeRuntimeEvent(event)) {
    liveProviderToolChainEvidence = true;
  }
}

/**
 * Latest activity timestamp for a runtime run (event.ts, endedAt, startedAt),
 * always normalized to milliseconds.
 */
export function getRuntimeRunLastActivityMs(
  runState: ChatRuntimeRunState | null | undefined,
): number | null {
  if (!runState) return null;
  let last: number | null = null;
  const consider = (value: number | undefined): void => {
    if (typeof value !== 'number') return;
    const ms = normalizeTimestampMs(value);
    if (ms == null) return;
    if (last == null || ms > last) last = ms;
  };
  consider(runState.startedAt);
  consider(runState.endedAt);
  for (const event of runState.events) {
    consider(event.ts);
  }
  return last;
}

/**
 * True when the run's own activity is within the freshness window of nowMs.
 *
 * Only run-local timestamps count:
 *  - normalized startedAt/endedAt/event.ts on the run state
 *  - optional run-scoped wall clock from {@link getRunScopedActivityMs} / noteRuntimeEventActivity
 *
 * A bare process-global wall clock is intentionally not accepted — foreign
 * sessions cannot satisfy freshness for the active run.
 */
export function isRuntimeRunFresh(
  runState: ChatRuntimeRunState | null | undefined,
  nowMs: number,
  options?: {
    windowMs?: number;
    /** Wall-clock activity for THIS run only (must already be run-scoped). */
    runScopedActivityMs?: number | null;
  },
): boolean {
  const windowMs = options?.windowMs ?? RUNTIME_FRESHNESS_WINDOW_MS;
  const fromRun = getRuntimeRunLastActivityMs(runState);
  const fromScoped = options?.runScopedActivityMs;
  const candidates = [fromRun, fromScoped].filter(
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
 * explicit convergence flag is enabled, live provider evidence is present,
 * and all structural gates pass.
 */
export function evaluateRuntimePollGate(input: RuntimePollGateInput): RuntimePollGateDecision {
  const {
    run,
    activeRunId,
    currentSessionKey,
    nowMs,
    freshnessWindowMs = RUNTIME_FRESHNESS_WINDOW_MS,
    pendingFinal = false,
    convergenceEnabled = POLL_CONVERGENCE_ENABLED,
    hasLiveProviderToolChainEvidence = getLiveProviderToolChainEvidence(),
  } = input;

  const hasActiveRunId = Boolean(activeRunId && run && run.runId === activeRunId);
  const hasToolActivity = runtimeEvidenceHasToolActivity(run);
  const sessionOk = sessionKeyMatchesRun(run, currentSessionKey);
  const runIsRunning = Boolean(run && run.status === 'running');
  const isPendingFinal = pendingFinal === true;
  // Run-scoped only: never pass a process-global last-event wall clock.
  const runScopedActivityMs = hasActiveRunId && activeRunId
    ? getRunScopedActivityMs(activeRunId, currentSessionKey)
    : null;
  const isFresh = isRuntimeRunFresh(run, nowMs, {
    windowMs: freshnessWindowMs,
    runScopedActivityMs,
  });
  const lastActivityMs = getRuntimeRunLastActivityMs(run) ?? runScopedActivityMs;
  const hasLiveProviderEvidence = hasLiveProviderToolChainEvidence === true;

  const base = {
    hasActiveRunId,
    hasToolActivity,
    isFresh,
    sessionKeyMatches: sessionOk,
    runIsRunning,
    pendingFinal: isPendingFinal,
    hasLiveProviderEvidence,
    lastActivityMs,
  };

  if (!hasActiveRunId) {
    return { ...base, hasActiveRunId: false, maySkipHistoryPoll: false, reason: 'no-active-run' };
  }
  if (!sessionOk) {
    return { ...base, sessionKeyMatches: false, maySkipHistoryPoll: false, reason: 'session-mismatch' };
  }
  if (!runIsRunning) {
    return { ...base, runIsRunning: false, maySkipHistoryPoll: false, reason: 'run-not-running' };
  }
  if (isPendingFinal) {
    return { ...base, pendingFinal: true, maySkipHistoryPoll: false, reason: 'pending-final' };
  }
  if (!hasToolActivity) {
    return { ...base, hasToolActivity: false, maySkipHistoryPoll: false, reason: 'no-tool-activity' };
  }
  if (!isFresh) {
    return { ...base, isFresh: false, maySkipHistoryPoll: false, reason: 'stale-runtime' };
  }
  // Hard condition: live provider tool-chain evidence is mandatory for skip.
  if (!hasLiveProviderEvidence) {
    return {
      ...base,
      hasLiveProviderEvidence: false,
      maySkipHistoryPoll: false,
      reason: 'no-live-provider-evidence',
    };
  }
  if (!convergenceEnabled) {
    return { ...base, maySkipHistoryPoll: false, reason: 'gates-pass-flag-disabled' };
  }

  return {
    ...base,
    maySkipHistoryPoll: true,
    reason: 'skip-allowed',
  };
}

/**
 * Integration point for history poll. True only when {@link evaluateRuntimePollGate}
 * returns maySkipHistoryPoll — otherwise callers must loadHistory(true).
 */
export function shouldSkipHistoryPollForRuntimeEvidence(
  decision: RuntimePollGateDecision,
): boolean {
  return decision.maySkipHistoryPoll === true;
}

/**
 * Record one poll tick observation for metrics.
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
    && decision.runIsRunning
    && !decision.pendingFinal
    && decision.hasLiveProviderEvidence
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
