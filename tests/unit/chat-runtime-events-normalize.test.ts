import { describe, expect, it } from 'vitest';
import { normalizeGatewayChatRuntimeEvent } from '@electron/gateway/chat-runtime-events';

describe('normalizeGatewayChatRuntimeEvent', () => {
  it('returns null for non-object / missing runId / unknown stream', () => {
    expect(normalizeGatewayChatRuntimeEvent(null)).toBeNull();
    expect(normalizeGatewayChatRuntimeEvent(undefined)).toBeNull();
    expect(normalizeGatewayChatRuntimeEvent('agent')).toBeNull();
    expect(normalizeGatewayChatRuntimeEvent({ stream: 'assistant', data: { text: 'x' } })).toBeNull();
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'mystery',
      data: {},
    })).toBeNull();
  });

  it('does not treat lifecycle phase=end as run.ended', () => {
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      sessionKey: 'agent:main:main',
      stream: 'lifecycle',
      seq: 4,
      ts: 10,
      data: { phase: 'end', endedAt: 11 },
    })).toBeNull();
  });

  it('normalizes lifecycle start and terminal phases', () => {
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      sessionKey: 'agent:main:main',
      stream: 'lifecycle',
      seq: 1,
      ts: 1,
      data: { phase: 'start', startedAt: 2 },
    })).toEqual({
      type: 'run.started',
      runId: 'run-1',
      sessionKey: 'agent:main:main',
      seq: 1,
      ts: 1,
      startedAt: 2,
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'lifecycle',
      seq: 2,
      ts: 3,
      data: { phase: 'completed', endedAt: 4 },
    })).toMatchObject({
      type: 'run.ended',
      runId: 'run-1',
      status: 'completed',
      endedAt: 4,
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'lifecycle',
      data: { phase: 'error', error: 'boom', endedAt: 5 },
    })).toMatchObject({
      type: 'run.ended',
      status: 'error',
      error: 'boom',
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'lifecycle',
      data: { phase: 'aborted', endedAt: 6 },
    })).toMatchObject({
      type: 'run.ended',
      status: 'aborted',
    });
  });

  it('normalizes assistant / thinking / tool streams', () => {
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'assistant',
      seq: 1,
      data: { text: 'hello', delta: 'lo', replace: true, mediaUrls: ['a.png', 1, ''] },
    })).toEqual({
      type: 'assistant.delta',
      runId: 'run-1',
      sessionKey: undefined,
      seq: 1,
      ts: undefined,
      text: 'hello',
      delta: 'lo',
      replace: true,
      phase: undefined,
      mediaUrls: ['a.png'],
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'thinking',
      data: { text: 'hmm', delta: 'm' },
    })).toMatchObject({
      type: 'thinking.delta',
      text: 'hmm',
      delta: 'm',
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'tool',
      data: { phase: 'start', toolCallId: 'c1', name: 'read', args: { path: '/x' } },
    })).toMatchObject({
      type: 'tool.started',
      toolCallId: 'c1',
      name: 'read',
      args: { path: '/x' },
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'tool',
      data: { phase: 'update', toolCallId: 'c1', name: 'read', partialResult: { n: 1 } },
    })).toMatchObject({
      type: 'tool.updated',
      partialResult: { n: 1 },
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'tool',
      data: { phase: 'result', toolCallId: 'c1', name: 'read', result: 'ok', isError: false },
    })).toMatchObject({
      type: 'tool.completed',
      result: 'ok',
      isError: false,
    });
  });

  it('rejects tool events missing toolCallId or name', () => {
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'tool',
      data: { phase: 'start', name: 'read' },
    })).toBeNull();
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'tool',
      data: { phase: 'start', toolCallId: 'c1' },
    })).toBeNull();
  });

  it('normalizes command_output / patch / approval streams', () => {
    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'command_output',
      data: {
        itemId: 'i1',
        toolCallId: 'c1',
        name: 'bash',
        output: 'hi',
        exitCode: 0,
        durationMs: 12,
      },
    })).toMatchObject({
      type: 'command.output',
      itemId: 'i1',
      output: 'hi',
      exitCode: 0,
      durationMs: 12,
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'patch',
      data: { summary: 'edit', added: 1, modified: 2, deleted: 0 },
    })).toMatchObject({
      type: 'patch.completed',
      summary: 'edit',
      added: 1,
      modified: 2,
      deleted: 0,
    });

    expect(normalizeGatewayChatRuntimeEvent({
      runId: 'run-1',
      stream: 'approval',
      data: { title: 'exec', status: 'pending', message: 'allow?' },
    })).toMatchObject({
      type: 'approval.updated',
      title: 'exec',
      status: 'pending',
      message: 'allow?',
    });
  });
});
