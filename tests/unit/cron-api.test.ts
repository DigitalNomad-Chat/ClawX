import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

describe('createCronApi', () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
  });

  it('delete calls cron.remove', async () => {
    rpcMock.mockResolvedValue({ ok: true });
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never });
    await api.delete('job-1');
    expect(rpcMock).toHaveBeenCalledWith('cron.remove', { id: 'job-1' });
  });

  it('toggle requires enabled boolean', async () => {
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never });
    await expect(api.toggle({ id: 'job-1' })).rejects.toThrow(/enabled/);
  });

  it('toggle with enabled calls cron.update patch only', async () => {
    rpcMock.mockResolvedValue({ ok: true });
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never });
    await api.toggle({ id: 'job-1', enabled: false });
    expect(rpcMock).toHaveBeenCalledWith('cron.update', {
      id: 'job-1',
      patch: { enabled: false },
    });
  });

  it('delete accepts { id } payload and rethrows rpc errors', async () => {
    rpcMock.mockRejectedValueOnce(new Error('rpc failed'));
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never });
    await expect(api.delete({ id: 'job-err' })).rejects.toThrow(/rpc failed/);
    expect(rpcMock).toHaveBeenCalledWith('cron.remove', { id: 'job-err' });
  });

  it('trigger force-runs job', async () => {
    rpcMock.mockResolvedValue({ started: true });
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never });
    await api.trigger({ id: 'job-2' });
    expect(rpcMock).toHaveBeenCalledWith('cron.run', { id: 'job-2', mode: 'force' });
  });

  it('omits list/create/update so host:invoke can return UNSUPPORTED', async () => {
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never }) as Record<string, unknown>;
    expect(api.list).toBeUndefined();
    expect(api.create).toBeUndefined();
    expect(api.update).toBeUndefined();
  });

  it('does not perform gateway restart as a side effect of delete/toggle/trigger', async () => {
    const restart = vi.fn();
    rpcMock.mockResolvedValue({});
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({
      gatewayManager: { rpc: rpcMock, restart } as never,
    });
    await api.delete('j1');
    await api.toggle({ id: 'j1', enabled: true });
    await api.trigger('j1');
    expect(restart).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });
});
