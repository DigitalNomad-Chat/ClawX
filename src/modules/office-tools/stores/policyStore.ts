/**
 * Policy Store — Zustand store for policy management (frontend)
 */
import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';
import type { PolicyRecord, PolicyFamily, OfficeToolsStats } from '../types';

interface PolicyState {
  families: PolicyFamily[];
  policies: PolicyRecord[];
  stats: OfficeToolsStats | null;
  loading: boolean;
  error: string | null;

  fetchFamilies: () => Promise<void>;
  fetchPolicies: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  updateFamily: (familyId: string, name: string) => Promise<void>;
  deleteFamily: (familyId: string) => Promise<void>;
  createPolicy: (input: Omit<PolicyRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updatePolicy: (id: number, patch: Partial<Omit<PolicyRecord, 'id' | 'createdAt'>>) => Promise<void>;
  deletePolicy: (id: number) => Promise<void>;
  clearError: () => void;
}

export const usePolicyStore = create<PolicyState>((set, get) => ({
  families: [],
  policies: [],
  stats: null,
  loading: false,
  error: null,

  fetchFamilies: async () => {
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<{ success: boolean; families: PolicyFamily[] }>(
        '/api/office-tools/families'
      );
      set({ families: data.families ?? [], loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  fetchPolicies: async () => {
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<{ success: boolean; policies: PolicyRecord[] }>(
        '/api/office-tools/policies'
      );
      set({ policies: data.policies ?? [], loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  fetchStats: async () => {
    try {
      const data = await hostApiFetch<{ success: boolean; stats: OfficeToolsStats }>(
        '/api/office-tools/stats'
      );
      set({ stats: data.stats ?? null });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  createFamily: async (name: string) => {
    set({ error: null });
    try {
      await hostApiFetch('/api/office-tools/families', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await get().fetchFamilies();
      await get().fetchStats();
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateFamily: async (familyId: string, name: string) => {
    set({ error: null });
    try {
      await hostApiFetch(`/api/office-tools/families/${encodeURIComponent(familyId)}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      await get().fetchFamilies();
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteFamily: async (familyId: string) => {
    set({ error: null });
    try {
      await hostApiFetch(`/api/office-tools/families/${encodeURIComponent(familyId)}`, {
        method: 'DELETE',
      });
      await get().fetchFamilies();
      await get().fetchPolicies();
      await get().fetchStats();
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createPolicy: async (input) => {
    set({ error: null });
    try {
      await hostApiFetch('/api/office-tools/policies', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await get().fetchPolicies();
      await get().fetchFamilies();
      await get().fetchStats();
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updatePolicy: async (id, patch) => {
    set({ error: null });
    try {
      await hostApiFetch(`/api/office-tools/policies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      await get().fetchPolicies();
      await get().fetchFamilies();
      await get().fetchStats();
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deletePolicy: async (id) => {
    set({ error: null });
    try {
      await hostApiFetch(`/api/office-tools/policies/${id}`, {
        method: 'DELETE',
      });
      await get().fetchPolicies();
      await get().fetchFamilies();
      await get().fetchStats();
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
