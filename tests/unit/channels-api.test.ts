import { beforeEach, describe, expect, it, vi } from 'vitest';

const listConfiguredChannelsMock = vi.fn();
const getChannelConfigMock = vi.fn();
const setChannelEnabledMock = vi.fn();

vi.mock('../../electron/utils/channel-config', () => ({
  listConfiguredChannels: (...args: unknown[]) => listConfiguredChannelsMock(...args),
  getChannelConfig: (...args: unknown[]) => getChannelConfigMock(...args),
  setChannelEnabled: (...args: unknown[]) => setChannelEnabledMock(...args),
}));

describe('createChannelsApi', () => {
  beforeEach(() => {
    vi.resetModules();
    listConfiguredChannelsMock.mockReset().mockResolvedValue(['feishu']);
    getChannelConfigMock.mockReset().mockResolvedValue({ token: 'x' });
    setChannelEnabledMock.mockReset().mockResolvedValue(undefined);
  });

  it('listConfigured returns success envelope', async () => {
    const { createChannelsApi } = await import('../../electron/services/channels-api');
    await expect(createChannelsApi().listConfigured()).resolves.toEqual({
      success: true,
      channels: ['feishu'],
    });
  });

  it('setEnabled invokes side-effect callback', async () => {
    const onChange = vi.fn();
    const { createChannelsApi } = await import('../../electron/services/channels-api');
    await createChannelsApi({ onChannelEnabledChange: onChange }).setEnabled({
      channelType: 'feishu',
      enabled: false,
    });
    expect(setChannelEnabledMock).toHaveBeenCalledWith('feishu', false);
    expect(onChange).toHaveBeenCalledWith('feishu', false);
  });

  it('saveConfig is not implemented in this batch', async () => {
    const { createChannelsApi } = await import('../../electron/services/channels-api');
    await expect(createChannelsApi().saveConfig()).rejects.toThrow(/legacy/);
  });
});
