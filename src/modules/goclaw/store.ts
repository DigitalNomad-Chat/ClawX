/**
 * GoClaw 模块级状态管理
 * 管理内部侧边栏折叠、Agent列表、最近会话等共享数据
 */
import { create } from 'zustand';
import { kernelClient } from '@/lib/kernel-client';
import { AGENT_DISPLAY_NAME_MAP } from './agent-components';

export interface GoClawAgent {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  version: string;
}

export interface GoClawSession {
  sessionId: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

interface GoClawState {
  sidebarCollapsed: boolean;
  agents: GoClawAgent[];
  agentsLoading: boolean;
  recentSessions: GoClawSession[];
  sessionsLoading: boolean;
  expandedAgentGroups: Record<string, boolean>;

  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  toggleAgentGroup: (agentId: string) => void;

  loadAgents: () => Promise<void>;
  loadRecentSessions: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  clearAgentSessions: (agentId: string) => Promise<boolean>;
}

export const useGoClawStore = create<GoClawState>((set, get) => ({
  sidebarCollapsed: false,
  agents: [],
  agentsLoading: false,
  recentSessions: [],
  sessionsLoading: false,
  expandedAgentGroups: {},

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toggleAgentGroup: (agentId) =>
    set((s) => ({
      expandedAgentGroups: {
        ...s.expandedAgentGroups,
        [agentId]: !s.expandedAgentGroups[agentId],
      },
    })),

  loadAgents: async () => {
    set({ agentsLoading: true });
    try {
      const result = await kernelClient.listAgents();
      if (result.success && result.agents) {
        const agents = (result.agents as GoClawAgent[]).map((agent) => {
          const displayName = AGENT_DISPLAY_NAME_MAP[agent.id];
          if (displayName) {
            return { ...agent, name: displayName };
          }
          return agent;
        });
        set({ agents });
      }
    } catch (err) {
      console.error('[GoClaw] Failed to load agents:', err);
    } finally {
      set({ agentsLoading: false });
    }
  },

  loadRecentSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const result = await kernelClient.listHistory();
      if (result.success && result.sessions) {
        const sessions = result.sessions.map((s) => ({
          sessionId: s.sessionId,
          agentId: s.agentId,
          agentName: s.agentName,
          agentEmoji: s.agentEmoji,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        }));
        set({ recentSessions: sessions });
      } else {
        set({ recentSessions: [] });
      }
    } catch (err) {
      console.error('[GoClaw] Failed to load recent sessions:', err);
      set({ recentSessions: [] });
    } finally {
      set({ sessionsLoading: false });
    }
  },

  deleteSession: async (sessionId) => {
    try {
      const result = await kernelClient.deleteHistory(sessionId);
      if (result.success) {
        await get().loadRecentSessions();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[GoClaw] Failed to delete session:', err);
      return false;
    }
  },

  clearAgentSessions: async (agentId) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('history:clearAgent', agentId) as { success: boolean; removed?: number };
      if (result.success) {
        await get().loadRecentSessions();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[GoClaw] Failed to clear agent sessions:', err);
      return false;
    }
  },
}));
