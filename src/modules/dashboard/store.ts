/**
 * Dashboard Module — Zustand Store
 */
import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';

export interface TokenHistoryEntry {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface DashboardStats {
  agentCount: number;
  sessionCount: number;
  cronJobCount: number;
  totalTokensUsed: number;
}

export interface DashboardOverview {
  gateway: {
    state: string;
    uptime?: number;
    version?: string;
    pid?: number;
  };
  stats: DashboardStats;
  tokenHistory: TokenHistoryEntry[];
}

interface DashboardState {
  overview: DashboardOverview | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number;
  fetchOverview: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  overview: null,
  loading: false,
  error: null,
  lastUpdated: 0,

  fetchOverview: async () => {
    // Debounce: don't refetch within 5s
    if (get().loading || Date.now() - get().lastUpdated < 5000) return;
    set({ loading: true, error: null });
    try {
      const res = await hostApiFetch<{ success: boolean; data: DashboardOverview; error?: string }>(
        '/api/dashboard/overview'
      );
      if (res.success && res.data) {
        set({ overview: res.data, lastUpdated: Date.now() });
      } else {
        set({ error: res.error ?? 'Failed to load dashboard' });
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },
}));
