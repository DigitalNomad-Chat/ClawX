import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateRuntimePollGate,
  getRunScopedActivityMs,
  getRuntimeEvidenceCounters,
  getRuntimeRunLastActivityMs,
  isRuntimeRunFresh,
  M4_POLL_CONVERGENCE_THRESHOLDS,
  M4_POLL_ROLLBACK_BOUNDARIES,
  normalizeTimestampMs,
  clearLiveProviderToolChainEvidence,
  noteLiveProviderToolChainEvidenceFromEvent,
  noteRuntimeEventActivity,
  POLL_CONVERGENCE_ENABLED,
  recordRuntimePollObservation,
  resetLiveProviderToolChainEvidence,
  resetRuntimeActivityStamps,
  resetRuntimeEvidenceCounters,
  runtimeEvidenceHasToolActivity,
  RUNTIME_FRESHNESS_WINDOW_MS,
  setLiveProviderToolChainEvidence,
  shouldSkipHistoryPollForRuntimeEvidence,
  getLiveProviderToolChainEvidence,
} from '@/stores/chat/runtime-evidence';
import type { ChatRuntimeRunState } from '@/stores/chat/types';

function makeRun(partial: Partial<ChatRuntimeRunState> & Pick<ChatRuntimeRunState, 'runId'>): ChatRuntimeRunState {
  return {
    sessionKey: 'agent:main:main',
    status: 'running',
    assistantText: '',
    thinkingText: '',
    events: [],
    ...partial,
  };
}

describe('runtime evidence scaffold (M4.2 restricted convergence)', () => {
  afterEach(() => {
    resetRuntimeEvidenceCounters();
    resetRuntimeActivityStamps();
    resetLiveProviderToolChainEvidence();
  });

  it('enables poll convergence flag after M4.2 approval but still hard-requires live evidence', () => {
    expect(POLL_CONVERGENCE_ENABLED).toBe(true);
    expect(M4_POLL_CONVERGENCE_THRESHOLDS.requireLiveProviderToolChainEvidence).toBe(true);
    expect(M4_POLL_CONVERGENCE_THRESHOLDS.requireRunRunning).toBe(true);
    expect(M4_POLL_CONVERGENCE_THRESHOLDS.rejectPendingFinal).toBe(true);
    expect(M4_POLL_ROLLBACK_BOUNDARIES.length).toBeGreaterThan(0);
  });

  it('normalizes second-scale timestamps to milliseconds', () => {
    expect(normalizeTimestampMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(normalizeTimestampMs(Number.NaN)).toBeNull();
  });

  it('computes last activity with second-scale event.ts values', () => {
    const run = makeRun({
      runId: 'r1',
      startedAt: 1_700_000_000,
      events: [
        { type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: 1_700_000_010 },
        {
          type: 'tool.completed',
          runId: 'r1',
          toolCallId: 'c1',
          name: 'read',
          result: 'ok',
          isError: false,
          ts: 1_700_000_020,
        },
      ],
    });
    expect(getRuntimeRunLastActivityMs(run)).toBe(1_700_000_020_000);
    expect(isRuntimeRunFresh(run, 1_700_000_020_000 + 1_000)).toBe(true);
    expect(isRuntimeRunFresh(run, 1_700_000_020_000 + RUNTIME_FRESHNESS_WINDOW_MS + 1)).toBe(false);
  });

  it('detects tool-like runtime activity', () => {
    expect(runtimeEvidenceHasToolActivity(null)).toBe(false);
    expect(runtimeEvidenceHasToolActivity(makeRun({
      runId: 'r1',
      events: [{ type: 'run.started', runId: 'r1', sessionKey: 'agent:main:main' }],
    }))).toBe(false);
    expect(runtimeEvidenceHasToolActivity(makeRun({
      runId: 'r1',
      events: [{
        type: 'tool.started',
        runId: 'r1',
        sessionKey: 'agent:main:main',
        toolCallId: 'c1',
        name: 'read',
      }],
    }))).toBe(true);
  });

  it('isolates run-scoped activity so foreign session stamps cannot satisfy freshness', () => {
    noteRuntimeEventActivity({
      runId: 'run-foreign',
      sessionKey: 'agent:main:other',
      receivedAtMs: 10_000,
    });
    noteRuntimeEventActivity({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      receivedAtMs: 1_000,
    });

    expect(getRunScopedActivityMs('run-active', 'agent:main:main')).toBe(1_000);
    expect(getRunScopedActivityMs('run-active', 'agent:main:other')).toBeNull();
    expect(getRunScopedActivityMs('run-foreign', 'agent:main:main')).toBeNull();
    expect(getRunScopedActivityMs('run-foreign', 'agent:main:other')).toBe(10_000);

    const activeRun = makeRun({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      // No event.ts — freshness only via run-scoped stamp.
      events: [{
        type: 'tool.started',
        runId: 'run-active',
        toolCallId: 'c1',
        name: 'read',
      }],
    });
    // Scoped stamp is old relative to now=10_000 → not fresh despite foreign run's recent stamp.
    expect(isRuntimeRunFresh(activeRun, 10_000, {
      runScopedActivityMs: getRunScopedActivityMs('run-active', 'agent:main:main'),
    })).toBe(false);
  });

  it('rejects foreign session/run at the gate even with fresh foreign activity', () => {
    noteRuntimeEventActivity({
      runId: 'run-foreign',
      sessionKey: 'agent:main:other',
      receivedAtMs: Date.now(),
    });
    const decision = evaluateRuntimePollGate({
      run: makeRun({
        runId: 'run-foreign',
        sessionKey: 'agent:main:other',
        events: [{
          type: 'tool.started',
          runId: 'run-foreign',
          toolCallId: 'c1',
          name: 'exec',
          ts: Date.now(),
        }],
      }),
      activeRunId: 'run-foreign',
      currentSessionKey: 'agent:main:main',
      nowMs: Date.now(),
      convergenceEnabled: true,
      hasLiveProviderToolChainEvidence: true,
    });
    expect(decision.reason).toBe('session-mismatch');
    expect(decision.maySkipHistoryPoll).toBe(false);
  });

  it('never allows skip while live provider evidence is missing (hard gate)', () => {
    const now = Date.now();
    const run = makeRun({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      events: [{
        type: 'tool.started',
        runId: 'run-active',
        sessionKey: 'agent:main:main',
        toolCallId: 'c1',
        name: 'read',
        ts: now,
      }],
    });
    noteRuntimeEventActivity({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      receivedAtMs: now,
    });

    const withoutEvidence = evaluateRuntimePollGate({
      run,
      activeRunId: 'run-active',
      currentSessionKey: 'agent:main:main',
      nowMs: now + 100,
      convergenceEnabled: true,
      hasLiveProviderToolChainEvidence: false,
    });
    expect(withoutEvidence).toMatchObject({
      hasToolActivity: true,
      isFresh: true,
      sessionKeyMatches: true,
      hasLiveProviderEvidence: false,
      maySkipHistoryPoll: false,
      reason: 'no-live-provider-evidence',
    });
    expect(shouldSkipHistoryPollForRuntimeEvidence(withoutEvidence)).toBe(false);

    // Production default path (flag false + no live evidence) still no-skip.
    const productionDefault = evaluateRuntimePollGate({
      run,
      activeRunId: 'run-active',
      currentSessionKey: 'agent:main:main',
      nowMs: now + 100,
    });
    expect(productionDefault.maySkipHistoryPoll).toBe(false);
    expect(['no-live-provider-evidence', 'gates-pass-flag-disabled']).toContain(productionDefault.reason);
  });

  it('allows skip only when flag, live evidence, running run, and structural gates all pass', () => {
    const now = Date.now();
    const run = makeRun({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      status: 'running',
      events: [{
        type: 'tool.started',
        runId: 'run-active',
        sessionKey: 'agent:main:main',
        toolCallId: 'c1',
        name: 'exec',
        ts: now,
      }],
    });
    noteRuntimeEventActivity({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      receivedAtMs: now,
    });

    const decision = evaluateRuntimePollGate({
      run,
      activeRunId: 'run-active',
      currentSessionKey: 'agent:main:main',
      nowMs: now + 50,
      pendingFinal: false,
      convergenceEnabled: true,
      hasLiveProviderToolChainEvidence: true,
    });
    expect(decision.maySkipHistoryPoll).toBe(true);
    expect(decision.reason).toBe('skip-allowed');
    expect(shouldSkipHistoryPollForRuntimeEvidence(decision)).toBe(true);
  });

  it('latches live provider evidence per runId — old runs cannot authorize a new run', () => {
    expect(getLiveProviderToolChainEvidence({ runId: 'r1' })).toBe(false);
    noteLiveProviderToolChainEvidenceFromEvent({
      type: 'assistant.delta',
      runId: 'r1',
      sessionKey: 'agent:main:main',
      delta: 'x',
    });
    expect(getLiveProviderToolChainEvidence({ runId: 'r1' })).toBe(false);

    noteLiveProviderToolChainEvidenceFromEvent({
      type: 'tool.started',
      runId: 'r1',
      sessionKey: 'agent:main:main',
      toolCallId: 'c1',
      name: 'read',
    });
    expect(getLiveProviderToolChainEvidence({
      runId: 'r1',
      sessionKey: 'agent:main:main',
    })).toBe(true);
    // Different run is not authorized by r1 evidence
    expect(getLiveProviderToolChainEvidence({
      runId: 'r2',
      sessionKey: 'agent:main:main',
    })).toBe(false);
    // Foreign session for same runId rejected when both sides set sessionKey
    expect(getLiveProviderToolChainEvidence({
      runId: 'r1',
      sessionKey: 'agent:main:other',
    })).toBe(false);

    noteLiveProviderToolChainEvidenceFromEvent({
      type: 'tool.started',
      runId: 'r2',
      sessionKey: 'agent:main:main',
      toolCallId: 'c2',
      name: 'read',
    });
    // r2 latched independently; r1 still valid until cleared
    expect(getLiveProviderToolChainEvidence({ runId: 'r2', sessionKey: 'agent:main:main' })).toBe(true);
    expect(getLiveProviderToolChainEvidence({ runId: 'r1', sessionKey: 'agent:main:main' })).toBe(true);

    clearLiveProviderToolChainEvidence('r1');
    expect(getLiveProviderToolChainEvidence({ runId: 'r1' })).toBe(false);
    expect(getLiveProviderToolChainEvidence({ runId: 'r2', sessionKey: 'agent:main:main' })).toBe(true);
  });

  it('reports structured reasons for missing structural gates', () => {
    expect(evaluateRuntimePollGate({
      run: null,
      activeRunId: null,
      currentSessionKey: 'agent:main:main',
      nowMs: 1,
    }).reason).toBe('no-active-run');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        status: 'completed',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: Date.now() }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: Date.now(),
      hasLiveProviderToolChainEvidence: true,
      convergenceEnabled: true,
    }).reason).toBe('run-not-running');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: Date.now() }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: Date.now(),
      pendingFinal: true,
      hasLiveProviderToolChainEvidence: true,
      convergenceEnabled: true,
    }).reason).toBe('pending-final');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'run.started', runId: 'r1', ts: Date.now() }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: Date.now(),
      hasLiveProviderToolChainEvidence: true,
      convergenceEnabled: true,
    }).reason).toBe('no-tool-activity');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: 1 }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: 1 + RUNTIME_FRESHNESS_WINDOW_MS + 50_000,
      hasLiveProviderToolChainEvidence: true,
      convergenceEnabled: true,
    }).reason).toBe('stale-runtime');
  });

  it('records observation counters without applying skips under default loads', () => {
    const now = Date.now();
    noteRuntimeEventActivity({
      runId: 'r1',
      sessionKey: 'agent:main:main',
      receivedAtMs: now,
    });
    const candidate = evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: now }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: now,
      hasLiveProviderToolChainEvidence: true,
    });
    // flag disabled → no skip candidate without full skip path, but structural gates pass
    // skipCandidates requires hasLiveProviderEvidence too — true here, so candidate counted
    recordRuntimePollObservation(candidate, { performedLoad: true });
    const blocked = evaluateRuntimePollGate({
      run: null,
      activeRunId: null,
      currentSessionKey: 'agent:main:main',
      nowMs: now,
    });
    recordRuntimePollObservation(blocked, { performedLoad: true });

    expect(getRuntimeEvidenceCounters()).toEqual({
      pollTicks: 2,
      pollLoads: 2,
      pollSkipCandidates: 1,
      pollSkipsApplied: 0,
      runtimeEventsSeen: 1,
    });
  });
});
