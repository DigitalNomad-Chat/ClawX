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

vi.mock('@/lib/api-client', () => ({
  invokeIpc: vi.fn(async () => null),
}));

async function loadChatStore() {
  const mod = await import('@/stores/chat');
  await prewarmChatHistoryMaxCharsCache();
  return mod;
}

describe('useChatStore newSession run-state cache', () => {
  beforeEach(async () => {
    vi.resetModules();
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
    vi.restoreAllMocks();
  });

  it('preserves a running session lifecycle when creating a new chat and switching back', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1773281731555);
    const { useChatStore } = await loadChatStore();
    const loadHistory = vi.fn(async () => {});
    useChatStore.setState({
      currentSessionKey: 'agent:main:a',
      currentAgentId: 'main',
      sessions: [{ key: 'agent:main:a' }],
      messages: [{ role: 'user', content: 'run in a' }],
      sending: true,
      activeRunId: 'run-a',
      pendingFinal: false,
      lastUserMessageAt: 1773281731000,
      streamingText: '',
      streamingMessage: null,
      streamingTools: [],
      pendingToolImages: [],
      sessionLabels: {},
      sessionLastActivity: { 'agent:main:a': 1773281731000 },
      agentRwWorkDirs: {},
      hasMoreHistory: false,
      historyOffset: 0,
      loadingMoreHistory: false,
      thinkingLevel: null,
      error: null,
      runError: null,
      loadHistory,
    });

    useChatStore.getState().newSession();
    expect(useChatStore.getState().currentSessionKey).toBe('agent:main:session-1773281731555');
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);

    useChatStore.getState().switchSession('agent:main:a');

    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().activeRunId).toBe('run-a');
    expect(useChatStore.getState().messages).toEqual([{ role: 'user', content: 'run in a' }]);
    expect(useChatStore.getState().lastUserMessageAt).toBe(1773281731000);
    expect(loadHistory).toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('does not let a late send result for the source session pollute the new chat', async () => {
    let now = 1773281731000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    let resolveSend!: (value: { runId?: string }) => void;
    const sendPromise = new Promise<{ runId?: string }>((resolve) => {
      resolveSend = resolve;
    });

    gatewayRpcMock.mockImplementation(async (method: string) => {
      if (method === 'config.get') return {};
      if (method === 'chat.history') return { messages: [] };
      if (method === 'chat.send') return sendPromise;
      throw new Error(`Unexpected gateway RPC: ${method}`);
    });

    const { useChatStore } = await loadChatStore();
    const loadHistory = vi.fn(async () => {});
    useChatStore.setState({
      currentSessionKey: 'agent:main:main',
      currentAgentId: 'main',
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
      sessionLabels: {},
      sessionLastActivity: {},
      agentRwWorkDirs: {},
      hasMoreHistory: false,
      historyOffset: 0,
      loadingMoreHistory: false,
      thinkingLevel: null,
      error: null,
      runError: null,
      loadHistory,
    });

    const pending = useChatStore.getState().sendMessage('long running prompt');
    expect(useChatStore.getState().sending).toBe(true);
    const sourceLastUserMessageAt = useChatStore.getState().lastUserMessageAt;

    now = 1773281731555;
    useChatStore.getState().newSession();
    expect(useChatStore.getState().currentSessionKey).toBe('agent:main:session-1773281731555');
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().error).toBeNull();

    resolveSend({ runId: 'run-source-late' });
    await pending;

    // New chat must stay idle; late runId belongs to the source session cache only.
    expect(useChatStore.getState().currentSessionKey).toBe('agent:main:session-1773281731555');
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().activeRunId).toBeNull();
    expect(useChatStore.getState().error).toBeNull();

    useChatStore.getState().switchSession('agent:main:main');
    expect(useChatStore.getState().sending).toBe(true);
    expect(useChatStore.getState().activeRunId).toBe('run-source-late');
    expect(useChatStore.getState().lastUserMessageAt).toBe(sourceLastUserMessageAt);

    nowSpy.mockRestore();
  });
});
