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

  it('does not expose skills/providers/channels/chat on facade', async () => {
    const { hostApi } = await import('@/lib/host-api');
    const api = hostApi as Record<string, unknown>;
    expect(api.skills).toBeUndefined();
    expect(api.providers).toBeUndefined();
    expect(api.channels).toBeUndefined();
    expect(api.chat).toBeUndefined();
    expect(api.sessions).toBeUndefined();
    expect(api.media).toBeUndefined();
    expect(api.gateway).toBeUndefined();
    // P4b-B2: settings exposes setMany only
    expect(api.settings).toBeDefined();
    expect((api.settings as Record<string, unknown>).setMany).toEqual(expect.any(Function));
    expect((api.settings as Record<string, unknown>).getAll).toBeUndefined();
    expect((api.settings as Record<string, unknown>).get).toBeUndefined();
    expect((api.settings as Record<string, unknown>).set).toBeUndefined();
    expect((api.settings as Record<string, unknown>).reset).toBeUndefined();
    // P4b-B3: cron exposes delete/toggle/trigger only
    expect(api.cron).toBeDefined();
    const cron = api.cron as Record<string, unknown>;
    expect(cron.delete).toEqual(expect.any(Function));
    expect(cron.toggle).toEqual(expect.any(Function));
    expect(cron.trigger).toEqual(expect.any(Function));
    expect(cron.list).toBeUndefined();
    expect(cron.create).toBeUndefined();
    expect(cron.update).toBeUndefined();
    // P4b-B4/B5: logs + openclaw + uv present; no updates service
    expect(api.logs).toBeDefined();
    expect(api.updates).toBeUndefined();
    expect(api.uv).toBeDefined();
    const uv = api.uv as Record<string, unknown>;
    expect(uv.check).toEqual(expect.any(Function));
    expect(uv.installAll).toEqual(expect.any(Function));
    const oc = api.openclaw as Record<string, unknown>;
    expect(oc.status).toEqual(expect.any(Function));
    expect(oc.getDir).toEqual(expect.any(Function));
    expect(oc.getConfigDir).toEqual(expect.any(Function));
    expect(oc.getSkillsDir).toEqual(expect.any(Function));
    expect(oc.getCliCommand).toEqual(expect.any(Function));
  });

  it('P4b-B5: uv.check and installAll go through hostInvoke', async () => {
    hostInvoke
      .mockResolvedValueOnce({ id: '1', ok: true, data: true })
      .mockResolvedValueOnce({ id: '2', ok: true, data: { success: true } });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.uv.check()).resolves.toBe(true);
    await expect(hostApi.uv.installAll()).resolves.toEqual({ success: true });
    expect(hostInvoke).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ module: 'uv', action: 'check' }),
    );
    expect(hostInvoke).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ module: 'uv', action: 'installAll' }),
    );
  });

  it('P4b-B5: uv.installAll falls back to legacy uv:install-all on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: uv.installAll' },
    });
    invokeIpcMock.mockResolvedValueOnce({ success: true });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.uv.installAll()).resolves.toEqual({ success: true });
    expect(invokeIpcMock).toHaveBeenCalledWith('uv:install-all');
  });

  it('P4b-B5: uv.check falls back to legacy uv:check when bridge missing', async () => {
    vi.stubGlobal('window', {
      clawx: undefined,
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    });
    invokeIpcMock.mockResolvedValueOnce(false);
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.uv.check()).resolves.toBe(false);
    expect(invokeIpcMock).toHaveBeenCalledWith('uv:check');
  });

  it('P4b-B4: logs.readFile/getDir go through hostInvoke and wrap UI shapes', async () => {
    hostInvoke
      .mockResolvedValueOnce({ id: '1', ok: true, data: 'line1\nline2' })
      .mockResolvedValueOnce({ id: '2', ok: true, data: '/tmp/clawdock-logs' });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.logs.readFile(100)).resolves.toEqual({ content: 'line1\nline2' });
    await expect(hostApi.logs.getDir()).resolves.toEqual({ dir: '/tmp/clawdock-logs' });
    expect(hostInvoke).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        module: 'logs',
        action: 'readFile',
        payload: { tailLines: 100 },
      }),
    );
    expect(hostInvoke).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ module: 'logs', action: 'getDir' }),
    );
  });

  it('P4b-B4: logs falls back to legacy log:* IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: logs.readFile' },
    });
    invokeIpcMock.mockResolvedValueOnce('from-legacy-log');
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.logs.readFile(50)).resolves.toEqual({ content: 'from-legacy-log' });
    expect(invokeIpcMock).toHaveBeenCalledWith('log:readFile', 50);
  });

  it('P4b-B4: openclaw dir/cli helpers go through hostInvoke', async () => {
    hostInvoke
      .mockResolvedValueOnce({ id: '1', ok: true, data: '/oc' })
      .mockResolvedValueOnce({ id: '2', ok: true, data: '/oc-config' })
      .mockResolvedValueOnce({ id: '3', ok: true, data: '/oc-skills' })
      .mockResolvedValueOnce({
        id: '4',
        ok: true,
        data: { success: true, command: 'node entry.js' },
      });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.openclaw.getDir()).resolves.toBe('/oc');
    await expect(hostApi.openclaw.getConfigDir()).resolves.toBe('/oc-config');
    await expect(hostApi.openclaw.getSkillsDir()).resolves.toBe('/oc-skills');
    await expect(hostApi.openclaw.getCliCommand()).resolves.toEqual({
      success: true,
      command: 'node entry.js',
    });
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'openclaw', action: 'getDir' }),
    );
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'openclaw', action: 'getCliCommand' }),
    );
  });

  it('P4b-B4: openclaw getDir falls back to legacy IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: openclaw.getDir' },
    });
    invokeIpcMock.mockResolvedValueOnce('/legacy-oc');
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.openclaw.getDir()).resolves.toBe('/legacy-oc');
    expect(invokeIpcMock).toHaveBeenCalledWith('openclaw:getDir');
  });

  it('P4b-B3: cron delete/toggle/trigger go through hostInvoke', async () => {
    hostInvoke
      .mockResolvedValueOnce({ id: '1', ok: true, data: { removed: true } })
      .mockResolvedValueOnce({ id: '2', ok: true, data: { enabled: false } })
      .mockResolvedValueOnce({ id: '3', ok: true, data: { started: true } });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.cron.delete('job-a')).resolves.toEqual({ removed: true });
    await expect(hostApi.cron.toggle('job-a', false)).resolves.toEqual({ enabled: false });
    await expect(hostApi.cron.trigger('job-a')).resolves.toEqual({ started: true });
    expect(hostInvoke).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        module: 'cron',
        action: 'delete',
        payload: { id: 'job-a' },
      }),
    );
    expect(hostInvoke).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        module: 'cron',
        action: 'toggle',
        payload: { id: 'job-a', enabled: false },
      }),
    );
    expect(hostInvoke).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        module: 'cron',
        action: 'trigger',
        payload: { id: 'job-a' },
      }),
    );
  });

  it('P4b-B3: cron falls back to legacy cron:* IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: cron.toggle' },
    });
    invokeIpcMock.mockResolvedValueOnce({ ok: true });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.cron.toggle('job-b', true)).resolves.toEqual({ ok: true });
    expect(invokeIpcMock).toHaveBeenCalledWith('cron:toggle', 'job-b', true);
  });

  it('P4b-B3: cron business INTERNAL does not fallback', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'INTERNAL', message: 'cron channel offline' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.cron.delete('job-c')).rejects.toThrow(/cron channel offline/);
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });

  it('P4b-B2: settings.setMany goes through hostInvoke with patch payload', async () => {
    hostInvoke.mockResolvedValueOnce({ id: 's1', ok: true, data: { success: true } });
    const { hostApi } = await import('@/lib/host-api');
    const patch = {
      proxyEnabled: true,
      proxyServer: 'http://127.0.0.1:7890',
    };
    await expect(hostApi.settings.setMany(patch)).resolves.toEqual({ success: true });
    expect(hostInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'settings',
        action: 'setMany',
        payload: patch,
      }),
    );
  });

  it('P5-D-S1: settings.setMany throws on UNSUPPORTED without legacy fallback', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: settings.setMany' },
    });
    const { hostApi } = await import('@/lib/host-api');
    const patch = { launchAtStartup: true };
    await expect(hostApi.settings.setMany(patch)).rejects.toThrow(
      /Legacy fallback removed for settings.setMany/,
    );
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });

  it('P4b-B2: settings.setMany business INTERNAL does not fallback', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'INTERNAL', message: 'settings channel locked' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.settings.setMany({ theme: 'dark' })).rejects.toThrow(
      /settings channel locked/,
    );
    expect(invokeIpcMock).not.toHaveBeenCalled();
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

  it('P5-C: shell.showItemInFolder does not fallback to legacy IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: shell.showItemInFolder' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.shell.showItemInFolder('/tmp/file.txt')).rejects.toThrow(
      /Legacy fallback removed for shell\.showItemInFolder/,
    );
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });

  it('P5-C: dialog.save does not fallback to legacy IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: dialog.save' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.dialog.save({ defaultPath: '/tmp' })).rejects.toThrow(
      /Legacy fallback removed for dialog\.save/,
    );
    expect(invokeIpcMock).not.toHaveBeenCalled();
  });

  it('P5-C: dialog.message does not fallback to legacy IPC on UNSUPPORTED', async () => {
    hostInvoke.mockResolvedValueOnce({
      id: 'req',
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Unsupported host request: dialog.message' },
    });
    const { hostApi } = await import('@/lib/host-api');
    await expect(hostApi.dialog.message({ type: 'info', message: 'hi' })).rejects.toThrow(
      /Legacy fallback removed for dialog\.message/,
    );
    expect(invokeIpcMock).not.toHaveBeenCalled();
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
