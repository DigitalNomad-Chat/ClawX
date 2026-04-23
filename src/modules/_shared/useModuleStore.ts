/**
 * Factory for creating isolated Zustand stores inside modules.
 * Follows the same patterns as the core stores but scoped to a module.
 */
import { create } from 'zustand';

interface ModuleStoreState {
  /** Set of enabled module ids (persisted in electron-store via IPC) */
  enabledModules: Set<string>;
  /** Toggle a module on/off */
  toggleModule: (id: string) => void;
  /** Check if a module is enabled */
  isEnabled: (id: string) => boolean;
}

export const useModuleStore = create<ModuleStoreState>((set, get) => ({
  enabledModules: new Set(),

  toggleModule: (id: string) =>
    set((state) => {
      const next = new Set(state.enabledModules);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { enabledModules: next };
    }),

  isEnabled: (id: string) => get().enabledModules.has(id),
}));
