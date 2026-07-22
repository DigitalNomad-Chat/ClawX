// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GatewayClient } from '../../electron/gateway/client';
import { GatewayManager } from '../../electron/gateway/manager';
import {
  GATEWAY_CLIENT_LEGACY_TO_METHOD_MAP,
  resolveGatewayClientMethod,
  UnsupportedGatewayMethodError,
} from '../../electron/gateway/rpc-method-map';

describe('GatewayClient RPC method mapping for OpenClaw 2026.6.6', () => {
  function createClient() {
    const rpc = vi.fn().mockResolvedValue({});
    const manager = {
      rpc,
      getStatus: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    } as unknown as GatewayManager;
    return { client: new GatewayClient(manager), rpc };
  }

  describe('resolveGatewayClientMethod', () => {
    it('maps legacy names to the real 2026.6.6 method names', () => {
      expect(resolveGatewayClientMethod('system.health')).toBe('health');
      expect(resolveGatewayClientMethod('system.config')).toBe('config.get');
      expect(resolveGatewayClientMethod('cron.list')).toBe('cron.list');
    });

    it('throws UnsupportedGatewayMethodError for unsupported legacy names', () => {
      expect(() => resolveGatewayClientMethod('channels.list')).toThrow(UnsupportedGatewayMethodError);
      expect(() => resolveGatewayClientMethod('skills.enable')).toThrow(UnsupportedGatewayMethodError);
      expect(() => resolveGatewayClientMethod('chat.send')).toThrow(UnsupportedGatewayMethodError);
      expect(() => resolveGatewayClientMethod('chat.history')).toThrow(UnsupportedGatewayMethodError);
      expect(() => resolveGatewayClientMethod('providers.list')).toThrow(UnsupportedGatewayMethodError);
      expect(() => resolveGatewayClientMethod('system.version')).toThrow(UnsupportedGatewayMethodError);
    });

    it('throws UnsupportedGatewayMethodError for unknown legacy names', () => {
      expect(() => resolveGatewayClientMethod('unknown.legacy')).toThrow(UnsupportedGatewayMethodError);
    });
  });

  describe('compatible methods', () => {
    it('getHealth calls health', async () => {
      const { client, rpc } = createClient();
      rpc.mockResolvedValueOnce({ ok: true, uptime: 12 });
      await client.getHealth();
      expect(rpc.mock.calls[0][0]).toBe('health');
    });

    it('getConfig calls config.get', async () => {
      const { client, rpc } = createClient();
      await client.getConfig();
      expect(rpc.mock.calls[0][0]).toBe('config.get');
    });

    it('listCronTasks calls cron.list', async () => {
      const { client, rpc } = createClient();
      await client.listCronTasks();
      expect(rpc.mock.calls[0][0]).toBe('cron.list');
    });
  });

  describe('removed or incompatible methods', () => {
    const unsupportedCases: Array<{ name: string; call: (client: GatewayClient) => Promise<unknown> }> = [
      { name: 'listChannels', call: (c) => c.listChannels() },
      { name: 'getChannel', call: (c) => c.getChannel('x') },
      { name: 'connectChannel', call: (c) => c.connectChannel('x') },
      { name: 'disconnectChannel', call: (c) => c.disconnectChannel('x') },
      { name: 'getChannelQRCode', call: (c) => c.getChannelQRCode('telegram') },
      { name: 'listSkills', call: (c) => c.listSkills() },
      { name: 'enableSkill', call: (c) => c.enableSkill('s') },
      { name: 'disableSkill', call: (c) => c.disableSkill('s') },
      { name: 'getSkillConfig', call: (c) => c.getSkillConfig('s') },
      { name: 'updateSkillConfig', call: (c) => c.updateSkillConfig('s', {}) },
      { name: 'sendMessage', call: (c) => c.sendMessage('hello') },
      { name: 'getChatHistory', call: (c) => c.getChatHistory() },
      { name: 'clearChatHistory', call: (c) => c.clearChatHistory() },
      { name: 'listProviders', call: (c) => c.listProviders() },
      { name: 'createCronTask', call: (c) => c.createCronTask({ name: 't', schedule: '* * * * *', command: 'echo', enabled: true }) },
      { name: 'updateCronTask', call: (c) => c.updateCronTask('t', {}) },
      { name: 'deleteCronTask', call: (c) => c.deleteCronTask('t') },
      { name: 'runCronTask', call: (c) => c.runCronTask('t') },
      { name: 'setProvider', call: (c) => c.setProvider({ id: 'p', name: 'P', type: 'openai', enabled: true }) },
      { name: 'removeProvider', call: (c) => c.removeProvider('p') },
      { name: 'testProvider', call: (c) => c.testProvider('p') },
      { name: 'updateConfig', call: (c) => c.updateConfig({}) },
      { name: 'getVersion', call: (c) => c.getVersion() },
      { name: 'getSkillBundles', call: (c) => c.getSkillBundles() },
      { name: 'installBundle', call: (c) => c.installBundle('b') },
    ];

    it.each(unsupportedCases)('$name throws UnsupportedGatewayMethodError and does not call rpc', async ({ call }) => {
      const { client, rpc } = createClient();
      await expect(call(client)).rejects.toThrow(UnsupportedGatewayMethodError);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('mapping coverage', () => {
    it('every legacy method used by GatewayClient is present in the map', () => {
      const expectedKeys = [
        'channels.list',
        'channels.get',
        'channels.connect',
        'channels.disconnect',
        'channels.getQRCode',
        'skills.list',
        'skills.enable',
        'skills.disable',
        'skills.getConfig',
        'skills.updateConfig',
        'chat.send',
        'chat.history',
        'chat.clear',
        'cron.list',
        'cron.create',
        'cron.update',
        'cron.delete',
        'cron.run',
        'providers.list',
        'providers.set',
        'providers.remove',
        'providers.test',
        'system.health',
        'system.config',
        'system.updateConfig',
        'system.version',
        'skills.bundles',
        'skills.installBundle',
      ];
      for (const key of expectedKeys) {
        expect(key in GATEWAY_CLIENT_LEGACY_TO_METHOD_MAP).toBe(true);
      }
    });
  });
});
