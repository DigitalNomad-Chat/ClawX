import { afterEach, describe, expect, it } from 'vitest';
import { decideHistoryPollTick } from '@/stores/chat/history-poll';
import {
  evaluateRuntimePollGate,
  noteRuntimeEventActivity,
  resetRuntimeActivityStamps,
  resetRuntimeEvidenceCounters,
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
    setLiveProviderToolChainEvidence(false);
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
});
