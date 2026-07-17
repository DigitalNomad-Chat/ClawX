/**
 * Normalize token-usage history payloads from host:invoke / HTTP / IPC.
 * Always returns a plain array so UI list rendering never calls .map on objects.
 */

export function normalizeUsageHistoryEntries<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['entries', 'items', 'history', 'records', 'data', 'result'] as const) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return nested as T[];
      }
    }
  }
  return [];
}
