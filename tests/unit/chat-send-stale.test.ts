import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prewarmChatHistoryMaxCharsCache } from './gateway-rpc-test-utils';

const { gatewayRpcMock, agentsState, hostApiFetchMock } = vi.hoisted(() => ({
  gatewayRpcMock: vi.fn(),
  agentsState: {
    agents: [] as Array<Record<string, unknown>>,
  },
  hostApiFetchMock: vi.fn(),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: {
    getState: () => ({
      status: { state: 'running', port: 18789, connectedAt: Date.now() },
      rpc: gatewayRpcMock,
    }),
  },
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: {
    getState: () => agentsState,
  },
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: (...args: unknown[]) => hostApiFetchMock(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadChatStore() {
  const mod = await import('@/stores/chat');
  await prewarmChatHistoryMaxCharsCache();
  return mod;
}

describe('useChatStore stale chat.send isolation', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    window.localStorage.clear();
    agentsState.agents = [];
    gatewayRpcMock.mockReset();
    gatewayRpcMock.mockImplementation(async (method: string) => {
      if (method === 'config.get') return {};
      if (method === 'chat.history') return { messages: [] };
      if (method === 'chat.send') return { runId: 'run-default' };
      throw new Error(`Unexpected gateway RPC: ${method}`);
    });
    hostApiFetchMock.mockReset();
    hostApiFetchMock.mockResolvedValue({ success: true, messages: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not let a stale send RPC re-arm a completed run after a newer send starts', async () => {
    let now = 1773281731000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const firstSend = deferred<{ runId?: string }>();
    const secondSend = deferred<{ runId?: string }>();
    const sendPromises = [firstSend.promise, secondSend.promise];

    gatewayRpcMock.mockImplementation(async (method: string) => {
      if (method === 'config.get') return {};
      if (method === 'chat.history') return { messages: [] };
      if (method === 'chat.send') {
        const next = sendPromises.shift();
        if (!next) throw new Error('Unexpected extra chat.send');
        return next;
      }
      throw new Error(`Unexpected gateway RPC: ${method}`);
    });

    const { useChatStore } = await loadChatStore();
    useChatStore.setState({
      currentSessionKey: 'agent:main:main',
      sessions: [{ key: 'agent:main:main' }],
      messages: [],
      sending: false,
      activeRunId: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingToolImages: [],
      error: null,
      runError: null,
    });

    const first = useChatStore.getState().sendMessage('first image request');
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().lastUserMessageAt).toBe(1773281731000);

    // History/media delivery can prove the first run is complete before the
    // blocking chat.send RPC returns. The composer is then allowed to send a
    // second turn; the late first ack must not overwrite that newer lifecycle.
    useChatStore.setState({
      sending: false,
      activeRunId: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingToolImages: [],
      error: null,
    });
    now = 1773281732000;
    const second = useChatStore.getState().sendMessage('second prompt');
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().lastUserMessageAt).toBe(1773281732000);

    firstSend.resolve({ runId: 'run-first' });
    await first;
    expect(useChatStore.getState().activeRunId).not.toBe('run-first');
    expect(useChatStore.getState().lastUserMessageAt).toBe(1773281732000);
    expect(useChatStore.getState().sending).toBe(true);

    secondSend.resolve({ runId: 'run-second' });
    await second;
    expect(useChatStore.getState().activeRunId).toBe('run-second');
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().error).toBeNull();

    nowSpy.mockRestore();
  });

  it('does not let a stale send failure clear a newer send lifecycle', async () => {
    let now = 1773281731000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const firstSend = deferred<{ runId?: string }>();
    const secondSend = deferred<{ runId?: string }>();
    const sendPromises = [firstSend.promise, secondSend.promise];

    gatewayRpcMock.mockImplementation(async (method: string) => {
      if (method === 'config.get') return {};
      if (method === 'chat.history') return { messages: [] };
      if (method === 'chat.send') {
        const next = sendPromises.shift();
        if (!next) throw new Error('Unexpected extra chat.send');
        return next;
      }
      throw new Error(`Unexpected gateway RPC: ${method}`);
    });

    const { useChatStore } = await loadChatStore();
    useChatStore.setState({
      currentSessionKey: 'agent:main:main',
      sessions: [{ key: 'agent:main:main' }],
      messages: [],
      sending: false,
      activeRunId: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingToolImages: [],
      error: null,
      runError: null,
    });

    const first = useChatStore.getState().sendMessage('first prompt');
    expect(useChatStore.getState().sending).toBe(true);

    useChatStore.setState({
      sending: false,
      activeRunId: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingToolImages: [],
      error: null,
    });
    now = 1773281732000;
    const second = useChatStore.getState().sendMessage('second prompt');
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().lastUserMessageAt).toBe(1773281732000);

    firstSend.reject(new Error('network failed for first send'));
    await first;
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().error).toBeNull();
    expect(useChatStore.getState().lastUserMessageAt).toBe(1773281732000);

    secondSend.resolve({ runId: 'run-second' });
    await second;
    expect(useChatStore.getState().activeRunId).toBe('run-second');
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().error).toBeNull();

    nowSpy.mockRestore();
  });

  it('still applies a current send failure when no newer send exists', async () => {
    gatewayRpcMock.mockImplementation(async (method: string) => {
      if (method === 'config.get') return {};
      if (method === 'chat.history') return { messages: [] };
      if (method === 'chat.send') throw new Error('provider unavailable');
      throw new Error(`Unexpected gateway RPC: ${method}`);
    });

    const { useChatStore } = await loadChatStore();
    useChatStore.setState({
      currentSessionKey: 'agent:main:main',
      sessions: [{ key: 'agent:main:main' }],
      messages: [],
      sending: false,
      activeRunId: null,
      pendingFinal: false,
      lastUserMessageAt: null,
      error: null,
    });

    await useChatStore.getState().sendMessage('only prompt');
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().error).toContain('provider unavailable');
  });
});
