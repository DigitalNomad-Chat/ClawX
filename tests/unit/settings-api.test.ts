import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllSettingsMock = vi.fn();
const getSettingMock = vi.fn();
const setSettingMock = vi.fn();
const resetSettingsMock = vi.fn();
const syncProxyMock = vi.fn();
const applyProxyMock = vi.fn();
const syncLaunchMock = vi.fn();
const restartMock = vi.fn();

vi.mock('../../electron/utils/store', () => ({
  getAllSettings: (...args: unknown[]) => getAllSettingsMock(...args),
  getSetting: (...args: unknown[]) => getSettingMock(...args),
  setSetting: (...args: unknown[]) => setSettingMock(...args),
  resetSettings: (...args: unknown[]) => resetSettingsMock(...args),
}));

vi.mock('../../electron/utils/openclaw-proxy', () => ({
  syncProxyConfigToOpenClaw: (...args: unknown[]) => syncProxyMock(...args),
}));

vi.mock('../../electron/main/proxy', () => ({
  applyProxySettings: (...args: unknown[]) => applyProxyMock(...args),
}));

vi.mock('../../electron/main/launch-at-startup', () => ({
  syncLaunchAtStartupSettingFromStore: (...args: unknown[]) => syncLaunchMock(...args),
}));

describe('createSettingsApi', () => {
  const gatewayManager = {
    getStatus: () => ({ state: 'running' }),
    restart: (...args: unknown[]) => restartMock(...args),
  } as never;

  beforeEach(() => {
    vi.resetModules();
    getAllSettingsMock.mockReset().mockResolvedValue({ proxyEnabled: false });
    getSettingMock.mockReset().mockResolvedValue('dark');
    setSettingMock.mockReset().mockResolvedValue(undefined);
    resetSettingsMock.mockReset().mockResolvedValue(undefined);
    syncProxyMock.mockReset().mockResolvedValue(undefined);
    applyProxyMock.mockReset().mockResolvedValue(undefined);
    syncLaunchMock.mockReset().mockResolvedValue(undefined);
    restartMock.mockReset().mockResolvedValue(undefined);
  });

  it('get accepts bare key', async () => {
    const { createSettingsApi } = await import('../../electron/services/settings-api');
    const api = createSettingsApi({ gatewayManager });
    await expect(api.get('theme')).resolves.toBe('dark');
  });

  it('set proxy key triggers proxy side effects and restart', async () => {
    const { createSettingsApi } = await import('../../electron/services/settings-api');
    const api = createSettingsApi({ gatewayManager });
    await api.set({ key: 'proxyEnabled', value: true });
    expect(setSettingMock).toHaveBeenCalled();
    expect(syncProxyMock).toHaveBeenCalled();
    expect(applyProxyMock).toHaveBeenCalled();
    expect(restartMock).toHaveBeenCalled();
  });

  it('set launchAtStartup syncs login item', async () => {
    const { createSettingsApi } = await import('../../electron/services/settings-api');
    const api = createSettingsApi({ gatewayManager });
    await api.set({ key: 'launchAtStartup', value: true });
    expect(syncLaunchMock).toHaveBeenCalled();
  });
});
