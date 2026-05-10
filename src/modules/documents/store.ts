import { create } from "zustand";
import { hostApiFetch } from "@/lib/host-api";
import type { DocumentState, DocumentFile, DocumentAgent } from "./types";

interface DocumentStore extends DocumentState {
  loadFiles: () => Promise<void>;
  loadAgents: () => Promise<void>;
  selectFile: (file: DocumentFile) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  setActiveFacet: (facet: string) => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  files: [],
  agents: [],
  selectedFile: null,
  selectedContent: "",
  loading: false,
  saving: false,
  error: null,
  activeFacet: "main",

  loadFiles: async () => {
    set({ loading: true, error: null });
    try {
      const res = await hostApiFetch<{ ok: boolean; files: DocumentFile[] }>(
        "/api/documents/files"
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
      const res = await hostApiFetch<{ ok: boolean; agents: DocumentAgent[] }>(
        "/api/documents/agents"
      );
      if (!res.ok) throw new Error("Failed to load agents");
      set({ agents: res.agents });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  selectFile: async (file) => {
    set({ selectedFile: file, selectedContent: "" });
    try {
      const res = await hostApiFetch<{ ok: boolean; content: string }>(
        `/api/documents/files/content?path=${encodeURIComponent(file.relativePath)}`
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
        "/api/documents/files/content",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content }),
        }
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
