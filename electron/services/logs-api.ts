/**
 * Logs Host API (P3b). Shared by legacy log:* IPC, HTTP /api/logs*, host:invoke.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { logger } from '../utils/logger';
import { isRecord } from './payload-utils';

function resolveCount(payload?: unknown, fallback?: number): number | undefined {
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return Math.max(Math.floor(payload), 1);
  }
  if (isRecord(payload)) {
    if (typeof payload.count === 'number' && Number.isFinite(payload.count)) {
      return Math.max(Math.floor(payload.count), 1);
    }
    if (typeof payload.tailLines === 'number' && Number.isFinite(payload.tailLines)) {
      return Math.max(Math.floor(payload.tailLines), 1);
    }
  }
  return fallback;
}

export function createLogsApi(): NonNullable<CompleteHostServiceRegistry['logs']> {
  return {
    getRecent: (payload?: unknown) => logger.getRecentLogs(resolveCount(payload)),
    readFile: async (payload?: unknown) => {
      const tail = resolveCount(payload, 200) ?? 200;
      return await logger.readLogFile(tail);
    },
    getFilePath: () => logger.getLogFilePath(),
    getDir: () => logger.getLogDir(),
    listFiles: async () => await logger.listLogFiles(),
  };
}
