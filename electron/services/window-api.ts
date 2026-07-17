/**
 * Window Host API (P3b). Shared by legacy window:* IPC and host:invoke.
 */
import type { BrowserWindow } from 'electron';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { isRecord } from './payload-utils';

export function createWindowApi(
  mainWindow: BrowserWindow,
): NonNullable<CompleteHostServiceRegistry['window']> {
  return {
    syncTrafficLightPosition: (payload?: unknown) => {
      // Optional; traffic-light helper may be absent on some platforms.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { syncMacTrafficLightPosition } = require('../main/traffic-light-layout') as {
          syncMacTrafficLightPosition?: (win: BrowserWindow, collapsed: boolean) => void;
        };
        const collapsed = isRecord(payload) ? Boolean(payload.sidebarCollapsed) : false;
        syncMacTrafficLightPosition?.(mainWindow, collapsed);
      } catch {
        // no-op when helper not available
      }
    },
    minimize: () => {
      mainWindow.minimize();
    },
    maximize: () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    },
    close: () => {
      mainWindow.close();
    },
    isMaximized: () => mainWindow.isMaximized(),
  };
}
