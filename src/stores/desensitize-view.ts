import { create } from 'zustand';

interface DesensitizeViewState {
  globalShowOriginal: boolean;
  toggleGlobalShowOriginal: () => void;
  setGlobalShowOriginal: (value: boolean) => void;
}

export const useDesensitizeViewStore = create<DesensitizeViewState>((set) => ({
  globalShowOriginal: false,
  toggleGlobalShowOriginal: () => set((s) => ({ globalShowOriginal: !s.globalShowOriginal })),
  setGlobalShowOriginal: (value) => set({ globalShowOriginal: value }),
}));
