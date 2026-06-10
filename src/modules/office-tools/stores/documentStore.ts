/**
 * Document Store — Zustand store for document processing sessions (frontend)
 */
import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';
import type { DocumentSession } from '../types';

interface DocumentState {
  sessions: DocumentSession[];
  currentSessionId: string | null;
  loading: boolean;
  error: string | null;

  fetchSessions: () => Promise<void>;
  createSession: (data: Omit<DocumentSession, 'id' | 'createdAt' | 'updatedAt'>) => Promise<DocumentSession>;
  updateSession: (id: string, patch: Partial<Omit<DocumentSession, 'id' | 'createdAt'>>) => Promise<DocumentSession | null>;
  deleteSession: (id: string) => Promise<void>;
  deleteAllSessions: () => Promise<void>;
  setCurrentSession: (id: string | null) => void;
  loadSession: (session: DocumentSession) => void;
  clearError: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<{ success: boolean; sessions: DocumentSession[] }>(
        '/api/office-tools/document-sessions'
      );
      set({ sessions: data.sessions ?? [], loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  createSession: async (data) => {
    set({ error: null });
    try {
      const result = await hostApiFetch<{ success: boolean; session: DocumentSession }>(
        '/api/office-tools/document-sessions',
        { method: 'POST', body: JSON.stringify(data) }
      );
      await get().fetchSessions();
      set({ currentSessionId: result.session.id });
      return result.session;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateSession: async (id, patch) => {
    set({ error: null });
    try {
      const result = await hostApiFetch<{ success: boolean; session: DocumentSession }>(
        `/api/office-tools/document-sessions/${encodeURIComponent(id)}`,
        { method: 'PUT', body: JSON.stringify(patch) }
      );
      await get().fetchSessions();
      return result.session;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteSession: async (id) => {
    set({ error: null });
    try {
      await hostApiFetch(`/api/office-tools/document-sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await get().fetchSessions();
      if (get().currentSessionId === id) {
        set({ currentSessionId: null });
      }
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteAllSessions: async () => {
    set({ error: null });
    try {
      await hostApiFetch('/api/office-tools/document-sessions', { method: 'DELETE' });
      set({ sessions: [], currentSessionId: null });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  setCurrentSession: (id) => set({ currentSessionId: id }),

  loadSession: (session) => {
    set({ currentSessionId: session.id });
  },

  clearError: () => set({ error: null }),
}));
