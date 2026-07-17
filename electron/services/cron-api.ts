/**
 * Cron Host API (P3c medium-risk, minimal write surface).
 * delete/toggle/trigger only — list/create/update stay on legacy handlers (complex transform/repair).
 */
import type { GatewayManager } from '../gateway/manager';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { isRecord } from './payload-utils';

export type CronApiDeps = {
  gatewayManager: GatewayManager;
};

function requireId(payload?: unknown): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (isRecord(payload) && typeof payload.id === 'string' && payload.id.trim()) {
    return payload.id.trim();
  }
  throw new Error('cron job id is required');
}

export function createCronApi(
  deps: CronApiDeps,
): Pick<NonNullable<CompleteHostServiceRegistry['cron']>, 'list' | 'create' | 'update' | 'delete'> & {
  toggle: (payload?: unknown) => Promise<unknown>;
  trigger: (payload?: unknown) => Promise<unknown>;
} {
  const { gatewayManager } = deps;
  return {
    list: async () => {
      throw new Error('cron.list remains on legacy IPC for this batch (auto-repair transforms)');
    },
    create: async () => {
      throw new Error('cron.create remains on legacy IPC for this batch');
    },
    update: async () => {
      throw new Error('cron.update remains on legacy IPC for this batch');
    },
    delete: async (payload?: unknown) => {
      try {
        const id = requireId(payload);
        return await gatewayManager.rpc('cron.remove', { id });
      } catch (error) {
        console.error('Failed to delete cron job:', error);
        throw error;
      }
    },
    toggle: async (payload?: unknown) => {
      try {
        if (!isRecord(payload) || typeof payload.enabled !== 'boolean') {
          throw new Error('toggle requires { id, enabled }');
        }
        const id = requireId(payload);
        return await gatewayManager.rpc('cron.update', { id, patch: { enabled: payload.enabled } });
      } catch (error) {
        console.error('Failed to toggle cron job:', error);
        throw error;
      }
    },
    trigger: async (payload?: unknown) => {
      try {
        const id = requireId(payload);
        return await gatewayManager.rpc('cron.run', { id, mode: 'force' });
      } catch (error) {
        console.error('Failed to trigger cron job:', error);
        throw error;
      }
    },
  };
}
