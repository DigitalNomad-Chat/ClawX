/**
 * Policy Store — Zustand store for policy management (frontend)
 */
import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';
import type { PolicyRecord, PolicyFamily, OfficeToolsStats } from '../types';

type SortBy = 'daysToRenewal' | 'premium' | 'productName';
type SortOrder = 'asc' | 'desc';

/** 分页列表响应（与后端 GET /policies 一致） */
interface PolicyListResponse {
  success: boolean;
  items: PolicyRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** CSV 导入结果（与后端 importPolicies 返回一致） */
interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

interface PolicyState {
  families: PolicyFamily[];
  policies: PolicyRecord[];
  stats: OfficeToolsStats | null;
  loading: boolean;
  error: string | null;

  // 筛选 / 分页 / 排序状态
  filterFamilyId: string | undefined;
  filterInsuranceType: string | undefined;
  filterRenewalStatus: string | undefined;
  searchKeyword: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  currentPage: number;
  pageSize: number;
  totalPolicies: number;
  totalPages: number;

  fetchFamilies: () => Promise<void>;
  fetchPolicies: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  updateFamily: (familyId: string, name: string) => Promise<void>;
  deleteFamily: (familyId: string) => Promise<void>;
  createPolicy: (input: Omit<PolicyRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updatePolicy: (id: number, patch: Partial<Omit<PolicyRecord, 'id' | 'createdAt'>>) => Promise<void>;
  deletePolicy: (id: number) => Promise<void>;

  // 筛选 / 分页 / 排序操作（变更筛选/排序时重置到第 1 页）
  setFilterFamilyId: (familyId?: string) => void;
  setFilterInsuranceType: (type?: string) => void;
  setFilterRenewalStatus: (status?: string) => void;
  setSearchKeyword: (keyword: string) => void;
  setSortBy: (sortBy: SortBy) => void;
  setSortOrder: (order: SortOrder) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // CSV 导入导出
  importPolicies: (csvText: string, familyId: string) => Promise<ImportResult>;
  exportPolicies: (familyId?: string) => Promise<void>;
  downloadImportTemplate: () => Promise<void>;
  /** Mark the current cycle as paid — sets lastRenewalDate to today */
  markPaid: (policyId: number) => Promise<void>;

  clearError: () => void;
}

export const usePolicyStore = create<PolicyState>((set, get) => ({
  families: [],
  policies: [],
  stats: null,
  loading: false,
  error: null,

  filterFamilyId: undefined,
  filterInsuranceType: undefined,
  filterRenewalStatus: undefined,
  searchKeyword: '',
  sortBy: 'daysToRenewal',
  sortOrder: 'asc',
  currentPage: 1,
  pageSize: 20,
  totalPolicies: 0,
  totalPages: 1,

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
      // 读取当前筛选 / 分页 / 排序状态，构造查询参数
      const state = get();
      const params = new URLSearchParams();
      if (state.filterFamilyId) params.set('familyId', state.filterFamilyId);
      if (state.filterInsuranceType) params.set('insuranceType', state.filterInsuranceType);
      if (state.filterRenewalStatus) params.set('renewalStatus', state.filterRenewalStatus);
      if (state.searchKeyword.trim()) params.set('search', state.searchKeyword.trim());
      params.set('sortBy', state.sortBy);
      params.set('sortOrder', state.sortOrder);
      params.set('page', String(state.currentPage));
      params.set('pageSize', String(state.pageSize));

      const data = await hostApiFetch<PolicyListResponse>(
        `/api/office-tools/policies?${params.toString()}`
      );
      set({
        policies: data.items ?? [],
        totalPolicies: data.total ?? 0,
        totalPages: data.totalPages ?? 1,
        loading: false,
      });
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

  fetchDashboardStats: async () => {
    try {
      const data = await hostApiFetch<{ success: boolean; stats: OfficeToolsStats }>(
        '/api/office-tools/policies/dashboard/stats'
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

  // 筛选 / 排序变更时重置到第 1 页，避免停留在越界页码
  setFilterFamilyId: (familyId) => set({ filterFamilyId: familyId, currentPage: 1 }),
  setFilterInsuranceType: (type) => set({ filterInsuranceType: type, currentPage: 1 }),
  setFilterRenewalStatus: (status) => set({ filterRenewalStatus: status, currentPage: 1 }),
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword, currentPage: 1 }),
  setSortBy: (sortBy) => set({ sortBy, currentPage: 1 }),
  setSortOrder: (order) => set({ sortOrder: order, currentPage: 1 }),
  setPage: (page) => {
    const clamped = Math.max(1, Math.min(page, get().totalPages || 1));
    set({ currentPage: clamped });
  },
  setPageSize: (size) => set({ pageSize: Math.max(1, size), currentPage: 1 }),

  importPolicies: async (csvText, familyId) => {
    set({ error: null });
    try {
      const result = await hostApiFetch<{ success: boolean } & ImportResult>(
        '/api/office-tools/policies/import',
        { method: 'POST', body: JSON.stringify({ csvText, familyId }) }
      );
      await get().fetchPolicies();
      await get().fetchFamilies();
      await get().fetchStats();
      return {
        created: result.created ?? 0,
        updated: result.updated ?? 0,
        errors: result.errors ?? [],
      };
    } catch (error) {
      return { created: 0, updated: 0, errors: [String(error)] };
    }
  },

  exportPolicies: async (familyId) => {
    set({ error: null });
    try {
      const url = familyId
        ? `/api/office-tools/policies/export/csv?familyId=${encodeURIComponent(familyId)}`
        : '/api/office-tools/policies/export/csv';
      // hostApiFetch 对 text/csv 响应返回原始文本字符串
      const csvText = await hostApiFetch<string>(url);
      // CSV 文本已含 UTF-8 BOM（由后端 policiesToCsv 添加），保证 Excel 正确显示中文
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `policies_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  downloadImportTemplate: async () => {
    set({ error: null });
    try {
      const csvText = await hostApiFetch<string>('/api/office-tools/policies/import-template/csv');
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `policy_import_template_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  markPaid: async (policyId) => {
    set({ error: null });
    try {
      await hostApiFetch(`/api/office-tools/policies/${policyId}/mark-paid`, { method: 'POST' });
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
