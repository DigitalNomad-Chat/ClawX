/**
 * P4a: typed hostApi facade over hostInvoke + fetch/IPC fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hostInvoke = vi.fn();
const invokeIpcMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
  invokeIpc: (...args: unknown[]) => invokeIpcMock(...args),
}));

describe('hostApi facade (P4a low-risk)', () => {
  beforeEach(() => {
    hostInvoke.mockReset();
    invokeIpcMock.mockReset();
    vi.resetModules();
    vi.stubGlobal('window', {
      clawx: { hostInvoke },
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
  });

  it('calls usage.recentTokenHistory through hostInvoke', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: true,
      data: [{ model: 'm1', totalTokens: 1 }],
    });
    const { hostApi } = await import('@/lib/host-api');

    await expect(hostApi.usage.recentTokenHistory(10)).resolves.toEqual([
      { model: 'm1', totalTokens: 1 },
    ]);
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'usage',
        action: 'recentTokenHistory',
        payload: { limit: 10 },
      }),
    );
  });

  it('calls openclaw.status and app.openClawDoctor through hostInvoke', async () => {
    hostInvoke
      .mockResolvedValueOnce({ id: '1', ok: true, data: { packageExists: true } })
      .mockResolvedValueOnce({ id: '2', ok: true, data: { ok: true } });
    const { hostApi } = await import('@/lib/host-api');

    await expect(hostApi.openclaw.status()).resolves.toEqual({ packageExists: true });
    await expect(hostApi.app.openClawDoctor('fix')).resolves.toEqual({ ok: true });

    expect(hostInvoke).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ module: 'openclaw', action: 'status' }),
    );
    expect(hostInvoke).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        module: 'app',
        action: 'openClawDoctor',
        payload: { mode: 'fix' },
      }),
    );
  });

  it('throws non-UNSUPPORTED host errors', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'INTERNAL', message: 'disk failed' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.usage.recentTokenHistory()).rejects.toThrow('disk failed');
  });

  it('falls back to hostApiFetch when hostInvoke returns UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: usage.recentTokenHistory' },
    });
    invokeIpcMock.mockResolvedValueOnce({
      ok: true,
      data: { status: 200, ok: true, json: [{ model: 'fallback' }] },
    });

    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.usage.recentTokenHistory()).resolves.toEqual([{ model: 'fallback' }]);
    expect(invokeIpcMock).toHaveBeenCalledWith(
      'hostapi:fetch',
      expect.objectContaining({ path: '/api/usage/recent-token-history', method: 'GET' }),
    );
  });

  it('falls back to openclaw:status IPC when hostInvoke bridge missing', async () => {
    vi.stubGlobal('window', {
      clawx: undefined,
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    });
    invokeIpcMock.mockResolvedValueOnce({ packageExists: true, dir: '/oc' });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.openclaw.status()).resolves.toEqual({ packageExists: true, dir: '/oc' });
    expect(invokeIpcMock).toHaveBeenCalledWith('openclaw:status');
  });

  it('does not expose skills/providers/channels/chat on P4a facade', async () => {
    const { hostApi } = await import('@/lib/host-api');
    const api = hostApi as Record<string, unknown>;
    expect(api.skills).toBeUndefined();
    expect(api.providers).toBeUndefined();
    expect(api.channels).toBeUndefined();
    expect(api.chat).toBeUndefined();
    expect(api.sessions).toBeUndefined();
    expect(api.media).toBeUndefined();
  });
});
