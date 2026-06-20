/**
 * Vitest Test Setup
 * Global test configuration and mocks
 */
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Provide a minimal `electron` mock so tests that transitively import
// main-process code (logger, store, etc.) don't blow up when the Electron
// binary is not present (e.g. CI with ELECTRON_SKIP_BINARY_DOWNLOAD=1).
// Individual test files can override with their own vi.mock('electron', ...).
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/clawdock-test'),
    getVersion: vi.fn().mockReturnValue('0.0.0-test'),
    getName: vi.fn().mockReturnValue('clawdock-test'),
    isPackaged: false,
    isReady: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    off: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: vi.fn(),
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeHandler: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: vi.fn() } } },
  utilityProcess: {},
}));

// Mock window.electron API
const mockElectron = {
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  },
  openExternal: vi.fn(),
  getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? ''),
  platform: 'darwin',
  isDev: true,
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'electron', {
    value: mockElectron,
    writable: true,
  });
}

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom 28.x exposes a hollow `localStorage`/`sessionStorage` when its
// localStorage-file backing store is unavailable — the objects exist but
// lack the Storage API methods (getItem/setItem/removeItem/clear/key/length).
// Zustand's `persist` middleware calls `storage.setItem` at hydrate time, so
// render tests mounting a persist-backed store (e.g. `useArtifactPanel`)
// crash with "storage.setItem is not a function". Fall back to an in-memory
// implementation whenever the built-in store is missing the methods.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length() {
      return store.size;
    },
  } as Storage;
}

if (typeof window !== 'undefined') {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const current = (window as unknown as Record<string, unknown>)[name];
    if (!current || typeof (current as { setItem?: unknown }).setItem !== 'function') {
      Object.defineProperty(window, name, {
        value: createMemoryStorage(),
        writable: true,
        configurable: true,
      });
    }
  }
}

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
