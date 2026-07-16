import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateRuntimePollGate,
  getRuntimeEvidenceCounters,
  getRuntimeRunLastActivityMs,
  isRuntimeRunFresh,
  M4_POLL_CONVERGENCE_THRESHOLDS,
  M4_POLL_ROLLBACK_BOUNDARIES,
  noteRuntimeEventSeen,
  POLL_CONVERGENCE_ENABLED,
  recordRuntimePollObservation,
  resetRuntimeEvidenceCounters,
  runtimeEvidenceHasToolActivity,
  RUNTIME_FRESHNESS_WINDOW_MS,
  shouldSkipHistoryPollForRuntimeEvidence,
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

describe('runtime evidence scaffold (M4.1)', () => {
  afterEach(() => {
    resetRuntimeEvidenceCounters();
  });

  it('keeps poll convergence disabled by default (M3-equivalent)', () => {
    expect(POLL_CONVERGENCE_ENABLED).toBe(false);
    expect(M4_POLL_CONVERGENCE_THRESHOLDS.requireLiveProviderToolChainEvidence).toBe(true);
    expect(M4_POLL_ROLLBACK_BOUNDARIES.length).toBeGreaterThan(0);
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
    expect(runtimeEvidenceHasToolActivity(makeRun({
      runId: 'r1',
      events: [{
        type: 'command.output',
        runId: 'r1',
        itemId: 'cmd',
        output: 'x',
        status: 'running',
        phase: 'update',
      }],
    }))).toBe(true);
  });

  it('computes last activity and freshness window', () => {
    const run = makeRun({
      runId: 'r1',
      startedAt: 1_000,
      events: [
        { type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: 2_000 },
        { type: 'tool.completed', runId: 'r1', toolCallId: 'c1', name: 'read', result: 'ok', isError: false, ts: 3_000 },
      ],
    });
    expect(getRuntimeRunLastActivityMs(run)).toBe(3_000);
    expect(isRuntimeRunFresh(run, 3_000 + RUNTIME_FRESHNESS_WINDOW_MS, { windowMs: RUNTIME_FRESHNESS_WINDOW_MS })).toBe(true);
    expect(isRuntimeRunFresh(run, 3_000 + RUNTIME_FRESHNESS_WINDOW_MS + 1, { windowMs: RUNTIME_FRESHNESS_WINDOW_MS })).toBe(false);
    expect(isRuntimeRunFresh(run, 10_000, {
      windowMs: 1_000,
      lastRuntimeEventAtMs: 9_500,
    })).toBe(true);
  });

  it('never allows poll skip while convergence flag is disabled even when gates pass', () => {
    const run = makeRun({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      events: [{
        type: 'tool.started',
        runId: 'run-active',
        sessionKey: 'agent:main:main',
        toolCallId: 'c1',
        name: 'read',
        ts: 5_000,
      }],
    });
    const decision = evaluateRuntimePollGate({
      run,
      activeRunId: 'run-active',
      currentSessionKey: 'agent:main:main',
      nowMs: 5_100,
    });
    expect(decision).toMatchObject({
      hasActiveRunId: true,
      hasToolActivity: true,
      isFresh: true,
      sessionKeyMatches: true,
      maySkipHistoryPoll: false,
      reason: 'gates-pass-flag-disabled',
    });
    expect(shouldSkipHistoryPollForRuntimeEvidence(decision)).toBe(false);
  });

  it('reports structured reasons for missing gates', () => {
    expect(evaluateRuntimePollGate({
      run: null,
      activeRunId: null,
      currentSessionKey: 'agent:main:main',
      nowMs: 1,
    }).reason).toBe('no-active-run');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        sessionKey: 'agent:main:other',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: 1 }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: 1,
    }).reason).toBe('session-mismatch');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'run.started', runId: 'r1', ts: 1 }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: 1,
    }).reason).toBe('no-tool-activity');

    expect(evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: 1 }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: 1 + RUNTIME_FRESHNESS_WINDOW_MS + 50,
    }).reason).toBe('stale-runtime');
  });

  it('allows skip only when flag override is true and all gates pass (test-only path)', () => {
    const run = makeRun({
      runId: 'run-active',
      sessionKey: 'agent:main:main',
      events: [{
        type: 'tool.started',
        runId: 'run-active',
        sessionKey: 'agent:main:main',
        toolCallId: 'c1',
        name: 'exec',
        ts: 100,
      }],
    });
    const decision = evaluateRuntimePollGate({
      run,
      activeRunId: 'run-active',
      currentSessionKey: 'agent:main:main',
      nowMs: 150,
      convergenceEnabled: true,
    });
    expect(decision.maySkipHistoryPoll).toBe(true);
    expect(decision.reason).toBe('skip-allowed');
    expect(shouldSkipHistoryPollForRuntimeEvidence(decision)).toBe(true);
  });

  it('records observation counters without applying skips under default loads', () => {
    noteRuntimeEventSeen();
    noteRuntimeEventSeen();
    const candidate = evaluateRuntimePollGate({
      run: makeRun({
        runId: 'r1',
        events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: 1 }],
      }),
      activeRunId: 'r1',
      currentSessionKey: 'agent:main:main',
      nowMs: 1,
    });
    recordRuntimePollObservation(candidate, { performedLoad: true });
    const blocked = evaluateRuntimePollGate({
      run: null,
      activeRunId: null,
      currentSessionKey: 'agent:main:main',
      nowMs: 1,
    });
    recordRuntimePollObservation(blocked, { performedLoad: true });

    expect(getRuntimeEvidenceCounters()).toEqual({
      pollTicks: 2,
      pollLoads: 2,
      pollSkipCandidates: 1,
      pollSkipsApplied: 0,
      runtimeEventsSeen: 2,
    });
  });
});
