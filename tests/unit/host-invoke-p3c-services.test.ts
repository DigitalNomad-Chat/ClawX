/**
 * P3c fix: real host:invoke registry → service path (not page mock).
 * Proves implemented actions dispatch through create*Api; unimplemented return UNSUPPORTED.
 * Does not register getApiKey or complex legacy surfaces.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApiRegistry, createHostInvokeDispatcher } from '../../electron/main/ipc/host-invoke';

const listConfiguredChannelsMock = vi.fn();
const getChannelConfigMock = vi.fn();
const setChannelEnabledMock = vi.fn();
const getSkillConfigMock = vi.fn();
const getAllSkillConfigsMock = vi.fn();
const updateSkillConfigMock = vi.fn();
const hasLegacyProviderApiKeyMock = vi.fn();
const listLegacyProvidersWithKeyInfoMock = vi.fn();
const listAccountsMock = vi.fn();
const listVendorsMock = vi.fn();

vi.mock('../../electron/utils/channel-config', () => ({
  listConfiguredChannels: (...args: unknown[]) => listConfiguredChannelsMock(...args),
  getChannelConfig: (...args: unknown[]) => getChannelConfigMock(...args),
  setChannelEnabled: (...args: unknown[]) => setChannelEnabledMock(...args),
}));

vi.mock('../../electron/utils/skill-config', () => ({
  getSkillConfig: (...args: unknown[]) => getSkillConfigMock(...args),
  getAllSkillConfigs: (...args: unknown[]) => getAllSkillConfigsMock(...args),
  updateSkillConfig: (...args: unknown[]) => updateSkillConfigMock(...args),
}));

vi.mock('../../electron/services/providers/provider-service', () => ({
  getProviderService: () => ({
    listLegacyProvidersWithKeyInfo: (...args: unknown[]) => listLegacyProvidersWithKeyInfoMock(...args),
    listAccounts: (...args: unknown[]) => listAccountsMock(...args),
    listVendors: (...args: unknown[]) => listVendorsMock(...args),
    hasLegacyProviderApiKey: (...args: unknown[]) => hasLegacyProviderApiKeyMock(...args),
  }),
}));

describe('P3c services on host:invoke (real registry path)', () => {
  const rpcMock = vi.fn();
  const onChannelEnabledChange = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    listConfiguredChannelsMock.mockReset().mockResolvedValue(['feishu']);
    getChannelConfigMock.mockReset().mockResolvedValue({ enabled: true });
    setChannelEnabledMock.mockReset().mockResolvedValue(undefined);
    getSkillConfigMock.mockReset().mockResolvedValue({ env: {} });
    getAllSkillConfigsMock.mockReset().mockResolvedValue({ s1: { enabled: true } });
    updateSkillConfigMock.mockReset().mockResolvedValue({ success: true });
    hasLegacyProviderApiKeyMock.mockReset().mockResolvedValue(true);
    listLegacyProvidersWithKeyInfoMock.mockReset().mockResolvedValue([{ id: 'p1', hasKey: true, keyMasked: 'sk-****' }]);
    listAccountsMock.mockReset().mockResolvedValue([]);
    listVendorsMock.mockReset().mockResolvedValue([]);
    rpcMock.mockReset();
    onChannelEnabledChange.mockReset();
  });

  async function createP3cDispatch() {
    const { createSkillsApi } = await import('../../electron/services/skills-api');
    const { createChannelsApi } = await import('../../electron/services/channels-api');
    const { createProvidersApi } = await import('../../electron/services/providers-api');
    const { createCronApi } = await import('../../electron/services/cron-api');

    const registry = new HostApiRegistry();
    registry.registerCoreServices({
      skills: createSkillsApi(),
      channels: createChannelsApi({ onChannelEnabledChange }),
      providers: createProvidersApi(),
      cron: createCronApi({ gatewayManager: { rpc: rpcMock } as never }),
    });
    return createHostInvokeDispatcher(registry);
  }

  it('dispatches implemented skills/channels/cron/providers actions through services', async () => {
    const dispatch = await createP3cDispatch();

    const configs = await dispatch({ id: 's1', module: 'skills', action: 'getAllConfigs' });
    expect(configs.ok).toBe(true);
    if (configs.ok) expect(configs.data).toEqual({ s1: { enabled: true } });
    expect(getAllSkillConfigsMock).toHaveBeenCalled();

    const setEnabled = await dispatch({
      id: 'c1',
      module: 'channels',
      action: 'setEnabled',
      payload: { channelType: 'feishu', enabled: false },
    });
    expect(setEnabled.ok).toBe(true);
    if (setEnabled.ok) expect(setEnabled.data).toEqual({ success: true });
    expect(setChannelEnabledMock).toHaveBeenCalledWith('feishu', false);
    expect(onChannelEnabledChange).toHaveBeenCalledWith('feishu', false);

    rpcMock.mockResolvedValue({ removed: true });
    const del = await dispatch({ id: 'j1', module: 'cron', action: 'delete', payload: 'job-1' });
    expect(del.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('cron.remove', { id: 'job-1' });

    const hasKey = await dispatch({
      id: 'p1',
      module: 'providers',
      action: 'hasApiKey',
      payload: 'openai',
    });
    expect(hasKey.ok).toBe(true);
    if (hasKey.ok) expect(hasKey.data).toBe(true);
    expect(hasLegacyProviderApiKeyMock).toHaveBeenCalledWith('openai');
  });

  it('returns UNSUPPORTED for unimplemented host actions (not INTERNAL)', async () => {
    const dispatch = await createP3cDispatch();

    for (const [module, action] of [
      ['channels', 'saveConfig'],
      ['cron', 'list'],
      ['cron', 'create'],
      ['cron', 'update'],
      ['skills', 'status'],
      ['providers', 'getApiKey'],
    ] as const) {
      const res = await dispatch({ id: `${module}.${action}`, module, action });
      expect(res.ok, `${module}.${action}`).toBe(false);
      if (!res.ok) {
        expect(res.error.code, `${module}.${action}`).toBe('UNSUPPORTED');
        expect(res.error.message).toMatch(new RegExp(`${module}\\.${action}`));
      }
    }
  });

  it('does not expose providers.getApiKey even when hasApiKey is registered', async () => {
    const dispatch = await createP3cDispatch();
    const res = await dispatch({
      id: 'secret',
      module: 'providers',
      action: 'getApiKey',
      payload: 'openai',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNSUPPORTED');
  });
});
