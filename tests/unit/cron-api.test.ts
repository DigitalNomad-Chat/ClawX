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

  it('trigger force-runs job', async () => {
    rpcMock.mockResolvedValue({ started: true });
    const { createCronApi } = await import('../../electron/services/cron-api');
    const api = createCronApi({ gatewayManager: { rpc: rpcMock } as never });
    await api.trigger({ id: 'job-2' });
    expect(rpcMock).toHaveBeenCalledWith('cron.run', { id: 'job-2', mode: 'force' });
  });
});
