import { create } from "zustand";
import { hostApiFetch } from "@/lib/host-api";
import type {
  MemoryState,
  MemoryFile,
  MemoryAgent,
  MemoryStatusSummary,
} from "./types";

interface MemoryStore extends MemoryState {
  loadFiles: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadStatus: () => Promise<void>;
  selectFile: (file: MemoryFile) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  setActiveFacet: (facet: string) => void;
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  files: [],
  agents: [],
  status: null,
  selectedFile: null,
  selectedContent: "",
  loading: false,
  saving: false,
  error: null,
  activeFacet: "main",

  loadFiles: async () => {
    set({ loading: true, error: null });
    try {
      const res = await hostApiFetch<{ ok: boolean; files: MemoryFile[] }>(
        "/api/memory/files",
      );
      if (!res.ok) throw new Error("Failed to load files");
      set({ files: res.files, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },

  loadAgents: async () => {
    try {
      const res = await hostApiFetch<{ ok: boolean; agents: MemoryAgent[] }>(
        "/api/memory/agents",
      );
      if (!res.ok) throw new Error("Failed to load agents");
      set({ agents: res.agents });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  loadStatus: async () => {
    try {
      const res = await hostApiFetch<{
        ok: boolean;
        summary: MemoryStatusSummary;
      }>("/api/memory/status");
      if (!res.ok) throw new Error("Failed to load status");
      set({ status: res.summary });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  selectFile: async (file) => {
    set({ selectedFile: file, selectedContent: "" });
    try {
      const res = await hostApiFetch<{ ok: boolean; content: string }>(
        `/api/memory/files/content?path=${encodeURIComponent(file.relativePath)}`,
      );
      if (!res.ok) throw new Error("Failed to load content");
      set({ selectedContent: res.content });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  saveFile: async (path, content) => {
    set({ saving: true });
    try {
      const res = await hostApiFetch<{ ok: boolean }>(
        "/api/memory/files/content",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content }),
        },
      );
      if (!res.ok) throw new Error("Failed to save");
      await get().loadFiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      set({ saving: false });
    }
  },

  setActiveFacet: (facet) => set({ activeFacet: facet }),
}));
