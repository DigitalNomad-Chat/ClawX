/**
 * Electron API Type Declarations
 * Types for the APIs exposed via contextBridge
 */

export interface IpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, callback: (...args: unknown[]) => void): (() => void) | void;
  once(channel: string, callback: (...args: unknown[]) => void): void;
  off(channel: string, callback?: (...args: unknown[]) => void): void;
}

export interface ElectronAPI {
  ipcRenderer: IpcRenderer;
  openExternal: (url: string) => Promise<void>;
  getPathForFile: (file: File) => string;
  platform: NodeJS.Platform;
  isDev: boolean;
}

/** v0.4.9 P2 dual-path host invoke (preload window.clawx). */
export type HostInvokeRequest = {
  id: string;
  module: string;
  action: string;
  payload?: unknown;
};

export type HostInvokeResponse<T = unknown> =
  | { id?: string; ok: true; data: T }
  | { id?: string; ok: false; error: { code: string; message: string; details?: unknown } };

export interface ClawxAPI {
  hostInvoke: <T = unknown>(request: HostInvokeRequest) => Promise<HostInvokeResponse<T>>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    clawx?: ClawxAPI;
  }
}

export {};
