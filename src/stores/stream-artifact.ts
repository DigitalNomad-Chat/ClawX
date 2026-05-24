import { create } from 'zustand';
import type { StreamArtifact } from '@/lib/artifact/types';

interface StreamArtifactState {
  artifacts: StreamArtifact[];
  selectedArtifactId: string | null;
  streamingArtifactId: string | null;

  addArtifact: (artifact: StreamArtifact) => void;
  updateArtifact: (id: string, updates: Partial<StreamArtifact>) => void;
  removeArtifact: (id: string) => void;
  selectArtifact: (id: string | null) => void;
  setStreamingArtifact: (id: string | null) => void;
  clearSessionArtifacts: (sessionKey: string) => void;
}

export const useStreamArtifactStore = create<StreamArtifactState>()((set) => ({
  artifacts: [],
  selectedArtifactId: null,
  streamingArtifactId: null,

  addArtifact: (artifact) => {
    set((state) => {
      const existingIndex = state.artifacts.findIndex(
        (a) =>
          a.sessionKey === artifact.sessionKey &&
          a.position.start === artifact.position.start &&
          a.type === artifact.type
      );

      if (existingIndex >= 0) {
        const updated = [...state.artifacts];
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...artifact,
          id: updated[existingIndex].id,
          updatedAt: Date.now(),
        };
        return { artifacts: updated };
      }

      return {
        artifacts: [...state.artifacts, artifact],
        selectedArtifactId: state.selectedArtifactId ?? artifact.id,
      };
    });
  },

  updateArtifact: (id, updates) => {
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
      ),
    }));
  },

  removeArtifact: (id) => {
    set((state) => {
      const filtered = state.artifacts.filter((a) => a.id !== id);
      return {
        artifacts: filtered,
        selectedArtifactId:
          state.selectedArtifactId === id
            ? filtered[0]?.id ?? null
            : state.selectedArtifactId,
        streamingArtifactId:
          state.streamingArtifactId === id ? null : state.streamingArtifactId,
      };
    });
  },

  selectArtifact: (id) => set({ selectedArtifactId: id }),

  setStreamingArtifact: (id) => {
    set({ streamingArtifactId: id });
    if (id) {
      set((state) => ({
        artifacts: state.artifacts.map((a) =>
          a.id === id ? { ...a, status: 'streaming' as const } : a
        ),
      }));
    }
  },

  clearSessionArtifacts: (sessionKey) => {
    set((state) => {
      const filtered = state.artifacts.filter((a) => a.sessionKey !== sessionKey);
      return {
        artifacts: filtered,
        selectedArtifactId:
          filtered.find((a) => a.id === state.selectedArtifactId)?.id ??
          filtered[0]?.id ??
          null,
        streamingArtifactId: null,
      };
    });
  },
}));
