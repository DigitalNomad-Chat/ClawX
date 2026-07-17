/**
 * UV Host API (P3b). Shared by legacy uv:* IPC and host:invoke.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { checkUvInstalled, installUv, setupManagedPython } from '../utils/uv-setup';

export function createUvApi(): NonNullable<CompleteHostServiceRegistry['uv']> {
  return {
    check: async () => checkUvInstalled(),
    installAll: async () => {
      try {
        const isInstalled = await checkUvInstalled();
        if (!isInstalled) {
          await installUv();
        }
        await setupManagedPython();
        return { success: true };
      } catch (error) {
        console.error('Failed to setup uv/python:', error);
        return { success: false, error: String(error) };
      }
    },
  };
}
