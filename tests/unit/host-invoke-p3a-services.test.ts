import { describe, expect, it, vi } from 'vitest';
import { HostApiRegistry, createHostInvokeDispatcher } from '../../electron/main/ipc/host-invoke';

vi.mock('../../electron/utils/token-usage', () => ({
  getRecentTokenUsageHistory: vi.fn(async (limit?: number) => [{ limit: limit ?? null }]),
}));

vi.mock('../../electron/utils/paths', () => ({
  getOpenClawStatus: () => ({ packageExists: true, dir: '/oc', entryPath: '/oc/e.js' }),
  getOpenClawSkillsDir: () => '/oc/skills',
  ensureDir: vi.fn(),
}));

vi.mock('../../electron/utils/openclaw-cli', () => ({
  getOpenClawCliCommand: () => 'oc-cli',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: () => true,
  };
});

describe('P3a services on host:invoke', () => {
  it('dispatches openclaw.status and usage.recentTokenHistory', async () => {
    const { createOpenClawApi } = await import('../../electron/services/openclaw-api');
    const { createUsageApi } = await import('../../electron/services/usage-api');
    const registry = new HostApiRegistry();
    registry.registerCoreServices({
      openclaw: createOpenClawApi(),
      usage: createUsageApi(),
    });
    const dispatch = createHostInvokeDispatcher(registry);

    const status = await dispatch({ id: '1', module: 'openclaw', action: 'status' });
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.data).toMatchObject({ packageExists: true });

    const usage = await dispatch({
      id: '2',
      module: 'usage',
      action: 'recentTokenHistory',
      payload: { limit: 3 },
    });
    expect(usage.ok).toBe(true);
    if (usage.ok) expect(usage.data).toEqual([{ limit: 3 }]);
  });
});
