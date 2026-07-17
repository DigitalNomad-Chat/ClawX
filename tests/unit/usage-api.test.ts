import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRecentTokenUsageHistoryMock = vi.fn();

vi.mock('../../electron/utils/token-usage', () => ({
  getRecentTokenUsageHistory: (...args: unknown[]) => getRecentTokenUsageHistoryMock(...args),
}));

describe('createUsageApi', () => {
  beforeEach(() => {
    getRecentTokenUsageHistoryMock.mockReset();
    getRecentTokenUsageHistoryMock.mockResolvedValue([{ model: 'x', totalTokens: 1 }]);
  });

  it('accepts bare number limit (legacy IPC style)', async () => {
    const { createUsageApi } = await import('../../electron/services/usage-api');
    const api = createUsageApi();
    await api.recentTokenHistory(12.7);
    expect(getRecentTokenUsageHistoryMock).toHaveBeenCalledWith(12);
  });

  it('accepts { limit } payload (host:invoke / HTTP style)', async () => {
    const { createUsageApi } = await import('../../electron/services/usage-api');
    const api = createUsageApi();
    await api.recentTokenHistory({ limit: '5' });
    expect(getRecentTokenUsageHistoryMock).toHaveBeenCalledWith(5);
  });

  it('passes undefined when limit missing', async () => {
    const { createUsageApi } = await import('../../electron/services/usage-api');
    const api = createUsageApi();
    await api.recentTokenHistory();
    expect(getRecentTokenUsageHistoryMock).toHaveBeenCalledWith(undefined);
  });

  it('clamps non-positive limits to 1', async () => {
    const { createUsageApi } = await import('../../electron/services/usage-api');
    const api = createUsageApi();
    await api.recentTokenHistory(0);
    expect(getRecentTokenUsageHistoryMock).toHaveBeenCalledWith(1);
  });
});
