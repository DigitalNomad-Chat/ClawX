/**
 * Dialog Host API (P3b). Shared by legacy dialog:* IPC and host:invoke.
 */
import { dialog, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';

export function createDialogApi(): NonNullable<CompleteHostServiceRegistry['dialog']> {
  return {
    open: async (payload?: unknown) => dialog.showOpenDialog((payload ?? {}) as OpenDialogOptions),
    save: async (payload?: unknown) => dialog.showSaveDialog((payload ?? {}) as SaveDialogOptions),
    message: async (payload?: unknown) => dialog.showMessageBox((payload ?? {}) as MessageBoxOptions),
  };
}
