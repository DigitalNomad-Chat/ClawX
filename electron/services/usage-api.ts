/**
 * Low-risk usage Host API (P3a).
 * Shared by legacy IPC, HTTP Host API routes, and host:invoke.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getRecentTokenUsageHistory } from '../utils/token-usage';
import { isRecord } from './payload-utils';

function resolveLimit(payload?: unknown): number | undefined {
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return Math.max(Math.floor(payload), 1);
  }
  if (typeof payload === 'string' && payload.trim()) {
    const parsed = Number(payload);
    if (Number.isFinite(parsed)) return Math.max(Math.floor(parsed), 1);
  }
  if (isRecord(payload) && 'limit' in payload) {
    return resolveLimit(payload.limit);
  }
  return undefined;
}

export function createUsageApi(): NonNullable<CompleteHostServiceRegistry['usage']> {
  return {
    recentTokenHistory: async (payload?: unknown) => {
      return await getRecentTokenUsageHistory(resolveLimit(payload));
    },
  };
}

export { resolveLimit as resolveUsageHistoryLimit };
