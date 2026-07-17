import { describe, expect, it } from 'vitest';
import type { ChatRuntimeEvent } from '../../shared/chat-runtime-events';
import { applyRuntimeEventToRuns } from '@/stores/chat/runtime-graph';

function toolStarted(overrides: Partial<Extract<ChatRuntimeEvent, { type: 'tool.started' }>> = {}): ChatRuntimeEvent {
  return {
    type: 'tool.started',
    runId: 'run-1',
    sessionKey: 'agent:main:main',
    seq: 1,
    toolCallId: 'call-1',
    name: 'read',
    args: { path: '/tmp/a' },
    ...overrides,
  };
}

describe('applyRuntimeEventToRuns', () => {
  it('creates a running run on run.started and accumulates assistant/thinking text', () => {
    let runs = applyRuntimeEventToRuns({}, {
      type: 'run.started',
      runId: 'run-1',
      sessionKey: 'agent:main:main',
      seq: 1,
      startedAt: 10,
    });
    expect(runs['run-1']).toMatchObject({
      runId: 'run-1',
      status: 'running',
      startedAt: 10,
      assistantText: '',
      thinkingText: '',
    });
    expect(runs['run-1'].events).toHaveLength(1);

    runs = applyRuntimeEventToRuns(runs, {
      type: 'assistant.delta',
      runId: 'run-1',
      seq: 2,
      delta: 'hel',
    });
    runs = applyRuntimeEventToRuns(runs, {
      type: 'assistant.delta',
      runId: 'run-1',
      seq: 3,
      delta: 'lo',
    });
    expect(runs['run-1'].assistantText).toBe('hello');

    runs = applyRuntimeEventToRuns(runs, {
      type: 'thinking.delta',
      runId: 'run-1',
      seq: 4,
      text: 'hmm',
    });
    expect(runs['run-1'].thinkingText).toBe('hmm');
  });

  it('dedupes consecutive events with the same seq and does not double-append', () => {
    const event = toolStarted({ seq: 5 });
    let runs = applyRuntimeEventToRuns({}, event);
    runs = applyRuntimeEventToRuns(runs, event);
    expect(runs['run-1'].events).toHaveLength(1);
  });

  it('marks terminal status on run.ended without requiring UI consumption', () => {
    let runs = applyRuntimeEventToRuns({}, {
      type: 'run.started',
      runId: 'run-1',
      seq: 1,
    });
    runs = applyRuntimeEventToRuns(runs, {
      type: 'run.ended',
      runId: 'run-1',
      seq: 9,
      status: 'completed',
      endedAt: 99,
    });
    expect(runs['run-1'].status).toBe('completed');
    expect(runs['run-1'].endedAt).toBe(99);
  });

  it('keeps independent runIds isolated', () => {
    let runs = applyRuntimeEventToRuns({}, {
      type: 'run.started',
      runId: 'run-a',
      seq: 1,
    });
    runs = applyRuntimeEventToRuns(runs, {
      type: 'run.started',
      runId: 'run-b',
      seq: 1,
    });
    runs = applyRuntimeEventToRuns(runs, {
      type: 'assistant.delta',
      runId: 'run-a',
      seq: 2,
      text: 'only-a',
    });
    expect(runs['run-a'].assistantText).toBe('only-a');
    expect(runs['run-b'].assistantText).toBe('');
  });

  it('dedupes tool.started/completed across tool+item dual stream when interrupted by other events', () => {
    let runs = applyRuntimeEventToRuns({}, {
      type: 'run.started',
      runId: 'run-1',
      seq: 1,
    });
    // stream=tool
    runs = applyRuntimeEventToRuns(runs, toolStarted({ seq: 2, toolCallId: 'call-1' }));
    // intervening assistant delta would break consecutive-only dedupe
    runs = applyRuntimeEventToRuns(runs, {
      type: 'assistant.delta',
      runId: 'run-1',
      seq: 3,
      delta: 'x',
    });
    // stream=item mapped to the same tool.started
    runs = applyRuntimeEventToRuns(runs, toolStarted({
      seq: 4,
      toolCallId: 'call-1',
      args: undefined,
    }));
    const started = runs['run-1'].events.filter((e) => e.type === 'tool.started');
    expect(started).toHaveLength(1);

    runs = applyRuntimeEventToRuns(runs, {
      type: 'tool.completed',
      runId: 'run-1',
      seq: 5,
      toolCallId: 'call-1',
      name: 'read',
      result: { ok: true },
      isError: false,
    });
    runs = applyRuntimeEventToRuns(runs, {
      type: 'assistant.delta',
      runId: 'run-1',
      seq: 6,
      delta: 'y',
    });
    // item end → tool.completed same toolCallId/isError
    runs = applyRuntimeEventToRuns(runs, {
      type: 'tool.completed',
      runId: 'run-1',
      seq: 7,
      toolCallId: 'call-1',
      name: 'read',
      isError: false,
    });
    const completed = runs['run-1'].events.filter((e) => e.type === 'tool.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ result: { ok: true } });
  });
});
