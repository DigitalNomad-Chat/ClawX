import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chat } from '@/pages/Chat';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      if (typeof options === 'string') return options;
      if (key === 'toolbar.currentAgent') return `Talking to ${String(options?.agent ?? '')}`;
      return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
    },
  }),
}));

const { useChatStore, useGatewayStore } = vi.hoisted(() => {
  const gatewayState = { status: { state: 'running', gatewayReady: true } };
  const useGatewayStore = (selector: (state: typeof gatewayState) => unknown) => selector(gatewayState);
  useGatewayStore.getState = () => gatewayState;
  useGatewayStore.setState = vi.fn();
  useGatewayStore.subscribe = () => () => {};
  useGatewayStore.getInitialState = () => gatewayState;

  const chatState = {
    messages: [] as Array<Record<string, unknown>>,
    currentSessionKey: 'main:test',
    currentAgentId: 'main',
    sessionLabels: {},
    loading: false,
    loadingMoreHistory: false,
    hasMoreHistory: false,
    sending: false,
    error: null,
    runError: null,
    streamingMessage: null,
    streamingTools: [] as Array<Record<string, unknown>>,
    pendingFinal: false,
    activeRunId: null,
    sendMessage: vi.fn(),
    abortRun: vi.fn(),
    clearError: vi.fn(),
    loadMoreHistory: vi.fn(),
    loadHistory: vi.fn(),
    refresh: vi.fn(),
    cleanupEmptySession: vi.fn(),
    lastUserMessageAt: null,
  };
  const useChatStore = (selector: (state: typeof chatState) => unknown) => selector(chatState);
  useChatStore.getState = () => chatState;
  useChatStore.setState = vi.fn();
  useChatStore.subscribe = () => () => {};
  useChatStore.getInitialState = () => chatState;

  return { useChatStore, useGatewayStore };
});

vi.mock('@/stores/gateway', () => ({ useGatewayStore }));
vi.mock('@/stores/chat', () => ({ useChatStore }));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: (selector: (state: { agents: Array<{ id: string; name: string; workspace: string }>; fetchAgents: () => void }) => unknown) => selector({
    agents: [{ id: 'main', name: 'main', workspace: '/workspace' }],
    fetchAgents: vi.fn(),
  }),
}));

vi.mock('@/stores/desensitize-view', () => ({
  useDesensitizeViewStore: (selector: (state: { globalShowOriginal: boolean; toggleGlobalShowOriginal: () => void }) => unknown) => selector({
    globalShowOriginal: false,
    toggleGlobalShowOriginal: vi.fn(),
  }),
}));

vi.mock('@/stores/artifact-panel', () => ({
  useArtifactPanel: (selector: (state: { open: boolean; widthPct: number; openChanges: () => void; openPreview: () => void; close: () => void }) => unknown) => selector({
    open: true,
    widthPct: 34,
    openChanges: vi.fn(),
    openPreview: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('@/components/file-preview/ArtifactPanel', () => ({
  ArtifactPanel: () => <div data-testid="artifact-panel" />,
}));

vi.mock('@/components/file-preview/PanelResizeDivider', () => ({
  PanelResizeDivider: () => <div data-testid="panel-resize-divider" />,
}));

vi.mock('@/hooks/use-stick-to-bottom-instant', () => ({
  useStickToBottomInstant: () => ({
    contentRef: { current: null },
    scrollRef: { current: null },
    scrollToBottom: vi.fn(),
    isAtBottom: true,
  }),
}));

vi.mock('@/hooks/use-min-loading', () => ({
  useMinLoading: (value: boolean) => value,
}));

vi.mock('@/pages/Chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('@/pages/Chat/ChatToolbar', () => ({
  ChatToolbar: () => (
    <div data-testid="chat-toolbar">
      <div>Talking to main</div>
      <button aria-label="工作空间" type="button">Workspace</button>
      <button aria-label="toolbar.refresh" type="button">Refresh</button>
    </div>
  ),
}));

describe('Chat artifact panel layout', () => {
  it('renders the chat toolbar with agent badge and action buttons on macOS', async () => {
    window.electron.platform = 'darwin';

    render(<Chat />);

    expect(await screen.findByText('Talking to main')).toBeInTheDocument();
    expect(screen.getByLabelText('工作空间')).toBeInTheDocument();
    expect(screen.getByLabelText('toolbar.refresh')).toBeInTheDocument();
  });

  it('layers the right artifact panel above content when open', async () => {
    window.electron.platform = 'darwin';

    render(<Chat />);

    const panel = await screen.findByTestId('artifact-panel');
    const aside = panel.closest('aside');

    expect(aside).toBeInTheDocument();
    expect(aside).toHaveClass('lg:flex');
    expect(aside).toHaveClass('border-l');
    expect(aside).toHaveStyle({ width: '34%' });
  });
});
