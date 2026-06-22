import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

function createMockStore<T extends Record<string, unknown>>(state: T) {
  return (selector?: (s: T) => unknown) => (selector ? selector(state) : state);
}

vi.mock('@/stores/settings', () => ({
  useSettingsStore: createMockStore({
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    devModeUnlocked: true,
    expandedAgentGroups: {},
    toggleAgentGroup: vi.fn(),
    managementToolsExpanded: true,
    toggleManagementTools: vi.fn(),
  }),
}));

vi.mock('@/stores/chat', () => ({
  useChatStore: createMockStore({
    sessions: [],
    currentSessionKey: '',
    sessionLabels: {},
    sessionLastActivity: {},
    switchSession: vi.fn(),
    newSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    loadSessions: vi.fn(),
    loadHistory: vi.fn(),
  }),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: createMockStore({
    agents: [],
    fetchAgents: vi.fn(),
  }),
}));

vi.mock('@/modules/goclaw/store', () => ({
  useGoClawStore: createMockStore({
    sidebarCollapsed: false,
  }),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: createMockStore({
    status: { state: 'idle' },
  }),
}));

vi.mock('@/extensions/registry', () => ({
  rendererExtensionRegistry: {
    getHiddenRoutes: () => new Set(),
    getExtraNavItems: () => [],
  },
}));

vi.mock('@/modules/registry', () => ({
  moduleNavItems: [],
}));

vi.mock('@/components/auth/UserBadge', () => ({
  UserBadge: () => <div data-testid="user-badge" />,
}));

describe('Sidebar dev mode nav items', () => {
  it('renders image generation nav item when dev mode is enabled', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('sidebar-nav-image-generation')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-nav-dreams')).toBeInTheDocument();
  });
});
