import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideHistoryPollTick } from '@/stores/chat/history-poll';
import {
  evaluateRuntimePollGate,
  noteLiveProviderToolChainEvidenceFromEvent,
  noteRuntimeEventActivity,
  resetLiveProviderToolChainEvidence,
  resetRuntimeActivityStamps,
  resetRuntimeEvidenceCounters,
  RUNTIME_FRESHNESS_WINDOW_MS,
  setLiveProviderToolChainEvidence,
} from '@/stores/chat/runtime-evidence';
import type { ChatRuntimeRunState } from '@/stores/chat/types';
import type { RuntimePollGateDecision } from '@/stores/chat/runtime-evidence';

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

function fullSkipGate(now: number): RuntimePollGateDecision {
  const run = makeRun({
    runId: 'run-active',
    sessionKey: 'agent:main:main',
    status: 'running',
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
  return evaluateRuntimePollGate({
    run,
    activeRunId: 'run-active',
    currentSessionKey: 'agent:main:main',
    nowMs: now + 50,
    pendingFinal: false,
    convergenceEnabled: true,
    hasLiveProviderToolChainEvidence: true,
  });
}

describe('decideHistoryPollTick (M4.2)', () => {
  afterEach(() => {
    resetRuntimeEvidenceCounters();
    resetRuntimeActivityStamps();
    resetLiveProviderToolChainEvidence();
    vi.useRealTimers();
  });

  it('stops when not sending', () => {
    expect(decideHistoryPollTick({
      sending: false,
      hasStreamingMessage: false,
      lastChatEventAtMs: 0,
      nowMs: 10_000,
      silenceWindowMs: 2_500,
      gate: fullSkipGate(10_000),
    })).toBe('stop');
  });

  it('defers while streaming or within silence window even if skip gates pass', () => {
    const gate = fullSkipGate(10_000);
    expect(gate.maySkipHistoryPoll).toBe(true);
    expect(decideHistoryPollTick({
      sending: true,
      hasStreamingMessage: true,
      lastChatEventAtMs: 0,
      nowMs: 10_000,
      silenceWindowMs: 2_500,
      gate,
    })).toBe('defer-streaming');
    expect(decideHistoryPollTick({
      sending: true,
      hasStreamingMessage: false,
      lastChatEventAtMs: 9_000,
      nowMs: 10_000,
      silenceWindowMs: 2_500,
      gate,
    })).toBe('defer-silence');
  });

  it('skips load only when silence elapsed and runtime skip is allowed', () => {
    const now = 20_000;
    const gate = fullSkipGate(now);
    expect(decideHistoryPollTick({
      sending: true,
      hasStreamingMessage: false,
      lastChatEventAtMs: now - 3_000,
      nowMs: now,
      silenceWindowMs: 2_500,
      gate,
    })).toBe('skip-runtime');
  });

  it('loads history for every documented fallback reason', () => {
    const now = Date.now();
    const baseTick = {
      sending: true as const,
      hasStreamingMessage: false,
      lastChatEventAtMs: now - 5_000,
      nowMs: now,
      silenceWindowMs: 2_500,
    };

    const cases: Array<{ name: string; gate: RuntimePollGateDecision }> = [
      {
        name: 'no-active-run',
        gate: evaluateRuntimePollGate({
          run: null,
          activeRunId: null,
          currentSessionKey: 'agent:main:main',
          nowMs: now,
          convergenceEnabled: true,
          hasLiveProviderToolChainEvidence: true,
        }),
      },
      {
        name: 'session-mismatch',
        gate: evaluateRuntimePollGate({
          run: makeRun({
            runId: 'r1',
            sessionKey: 'agent:main:other',
            events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: now }],
          }),
          activeRunId: 'r1',
          currentSessionKey: 'agent:main:main',
          nowMs: now,
          convergenceEnabled: true,
          hasLiveProviderToolChainEvidence: true,
        }),
      },
      {
        name: 'run-not-running',
        gate: evaluateRuntimePollGate({
          run: makeRun({
            runId: 'r1',
            status: 'completed',
            events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: now }],
          }),
          activeRunId: 'r1',
          currentSessionKey: 'agent:main:main',
          nowMs: now,
          convergenceEnabled: true,
          hasLiveProviderToolChainEvidence: true,
        }),
      },
      {
        name: 'pending-final',
        gate: evaluateRuntimePollGate({
          run: makeRun({
            runId: 'r1',
            events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: now }],
          }),
          activeRunId: 'r1',
          currentSessionKey: 'agent:main:main',
          nowMs: now,
          pendingFinal: true,
          convergenceEnabled: true,
          hasLiveProviderToolChainEvidence: true,
        }),
      },
      {
        name: 'no-tool-activity',
        gate: evaluateRuntimePollGate({
          run: makeRun({
            runId: 'r1',
            events: [{ type: 'run.started', runId: 'r1', ts: now }],
          }),
          activeRunId: 'r1',
          currentSessionKey: 'agent:main:main',
          nowMs: now,
          convergenceEnabled: true,
          hasLiveProviderToolChainEvidence: true,
        }),
      },
      {
        name: 'no-live-provider-evidence',
        gate: evaluateRuntimePollGate({
          run: makeRun({
            runId: 'r1',
            events: [{ type: 'tool.started', runId: 'r1', toolCallId: 'c1', name: 'read', ts: now }],
          }),
          activeRunId: 'r1',
          currentSessionKey: 'agent:main:main',
          nowMs: now,
          convergenceEnabled: true,
          hasLiveProviderToolChainEvidence: false,
        }),
      },
    ];

    for (const { name, gate } of cases) {
      expect(gate.maySkipHistoryPoll, name).toBe(false);
      expect(decideHistoryPollTick({ ...baseTick, gate }), name).toBe('load');
    }
  });

  it('scheduler: continuous skip reschedules, then loads after freshness window expires', () => {
    vi.useFakeTimers();
    // Use ms wall clocks (>= 1e12) so normalizeTimestampMs does not treat them as seconds.
    const start = 1_700_000_000_000;
    vi.setSystemTime(start);

    const runId = 'run-timeline';
    const sessionKey = 'agent:main:main';
    const POLL_INTERVAL = 2_000;
    const SILENCE = 2_500;
    const lastChatEventAtMs = start - SILENCE - 1;

    noteRuntimeEventActivity({
      runId,
      sessionKey,
      receivedAtMs: start,
    });
    noteLiveProviderToolChainEvidenceFromEvent({
      type: 'tool.started',
      runId,
      sessionKey,
      toolCallId: 'c1',
      name: 'read',
      ts: start,
    });

    const run = makeRun({
      runId,
      sessionKey,
      status: 'running',
      events: [{
        type: 'tool.started',
        runId,
        sessionKey,
        toolCallId: 'c1',
        name: 'read',
        ts: start,
      }],
    });

    const actions: string[] = [];
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    const pollHistory = () => {
      const nowMs = Date.now();
      const gate = evaluateRuntimePollGate({
        run,
        activeRunId: runId,
        currentSessionKey: sessionKey,
        nowMs,
        pendingFinal: false,
        convergenceEnabled: true,
        // Use production get() path via scoped latch (no override)
      });
      const action = decideHistoryPollTick({
        sending: true,
        hasStreamingMessage: false,
        lastChatEventAtMs,
        nowMs,
        silenceWindowMs: SILENCE,
        gate,
      });
      actions.push(`${action}@${nowMs - start}`);
      // Mirror production: skip/load/defer all reschedule except stop
      if (action !== 'stop') {
        scheduled = setTimeout(pollHistory, POLL_INTERVAL);
      }
    };

    pollHistory();
    expect(actions[0]).toBe('skip-runtime@0');

    vi.advanceTimersByTime(POLL_INTERVAL);
    expect(actions.at(-1)?.startsWith('skip-runtime')).toBe(true);

    // Still inside 5s freshness window
    vi.advanceTimersByTime(POLL_INTERVAL);
    expect(actions.filter((a) => a.startsWith('skip-runtime')).length).toBeGreaterThanOrEqual(2);

    // Cross freshness window (5s) — next tick must load and still reschedule
    vi.advanceTimersByTime(RUNTIME_FRESHNESS_WINDOW_MS);
    const loadEntry = actions.find((a) => a.startsWith('load@'));
    expect(loadEntry).toBeTruthy();
    const loadOffset = Number(loadEntry!.split('@')[1]);
    expect(loadOffset).toBeGreaterThan(RUNTIME_FRESHNESS_WINDOW_MS - POLL_INTERVAL);
    expect(scheduled).not.toBeNull();

    // One more tick still loads (stale) and keeps scheduling — no permanent silence
    const before = actions.length;
    vi.advanceTimersByTime(POLL_INTERVAL);
    expect(actions.length).toBeGreaterThan(before);
    expect(actions.at(-1)?.startsWith('load@')).toBe(true);
  });
});
