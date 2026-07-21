/**
 * P4a: typed hostApi facade over hostInvoke + fetch/IPC fallback.
 * Transport fallback uses explicit error codes only (never message heuristics).
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

  it('normalizes non-array host usage payloads to an array (map-crash guard)', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: true,
      data: { entries: [{ model: 'wrapped', totalTokens: 3 }] },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.usage.recentTokenHistory()).resolves.toEqual([
      { model: 'wrapped', totalTokens: 3 },
    ]);

    hostInvoke.mockResolvedValueOnce({
      id: 'req2',
      ok: true,
      data: { success: true, count: 1 },
    });
    await expect(hostApi.usage.recentTokenHistory()).resolves.toEqual([]);
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

  it('throws non-UNSUPPORTED host errors without fallback', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'INTERNAL', message: 'disk failed' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.usage.recentTokenHistory()).rejects.toThrow('disk failed');
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });

  it('does not fallback when business error message contains "channel"', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'INTERNAL', message: 'Channel is required for delivery' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.usage.recentTokenHistory()).rejects.toThrow(/Channel is required/);
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });

  it('falls back to hostApiFetch when hostInvoke returns UNSUPPORTED code', async () => {
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

  it('falls back when bridge throws HostTransportError with CHANNEL_UNAVAILABLE', async () => {
    const { HostTransportError } = await import('@/lib/host-api-client');
    hostInvoke.mockRejectedValueOnce(
      new HostTransportError('CHANNEL_UNAVAILABLE', 'Invalid IPC channel: host:invoke'),
    );
    invokeIpcMock.mockResolvedValueOnce({
      ok: true,
      data: { status: 200, ok: true, json: [{ model: 'from-fetch' }] },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.usage.recentTokenHistory()).resolves.toEqual([{ model: 'from-fetch' }]);
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
    expect(api.settings).toBeUndefined();
    expect(api.cron).toBeUndefined();
    expect(api.gateway).toBeUndefined();
  });

  it('P4b-B1: window/shell/dialog go through hostInvoke', async () => {
    hostInvoke
      .mockResolvedValueOnce({ id: 'w1', ok: true, data: true })
      .mockResolvedValueOnce({ id: 'w2', ok: true, data: undefined })
      .mockResolvedValueOnce({ id: 's1', ok: true, data: '' })
      .mockResolvedValueOnce({ id: 'd1', ok: true, data: { response: 1 } });
    const { hostApi } = await import('@/lib/host-api');

    await expect(hostApi.window.isMaximized()).resolves.toBe(true);
    await expect(hostApi.window.minimize()).resolves.toBeUndefined();
    await expect(hostApi.shell.openPath('/tmp/x')).resolves.toBe('');
    await expect(
      hostApi.dialog.message({ type: 'question', message: 'ok', buttons: ['a', 'b'] }),
    ).resolves.toEqual({ response: 1 });

    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'window', action: 'isMaximized' }),
    );
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'window', action: 'minimize' }),
    );
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'shell',
        action: 'openPath',
        payload: { path: '/tmp/x' },
      }),
    );
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'dialog', action: 'message' }),
    );
  });

  it('P4b-B1: shell falls back to legacy shell:* IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: shell.showItemInFolder' },
    });
    invokeIpcMock.mockResolvedValueOnce(undefined);
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.shell.showItemInFolder('/tmp/file.txt')).resolves.toBeUndefined();
    expect(invokeIpcMock).toHaveBeenCalledWith('shell:showItemInFolder', '/tmp/file.txt');
  });

  it('P4b-B1: window falls back to legacy window:* IPC when bridge missing', async () => {
    vi.stubGlobal('window', {
      clawx: undefined,
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    });
    invokeIpcMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true);
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.window.maximize()).resolves.toBeUndefined();
    await expect(hostApi.window.isMaximized()).resolves.toBe(true);
    expect(invokeIpcMock).toHaveBeenCalledWith('window:maximize');
    expect(invokeIpcMock).toHaveBeenCalledWith('window:isMaximized');
  });

  it('P4b-B1: dialog business INTERNAL does not fallback', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'INTERNAL', message: 'dialog channel busy' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.dialog.open({ properties: ['openFile'] })).rejects.toThrow(
      /dialog channel busy/,
    );
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });
});
