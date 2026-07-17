/**
 * Settings Host API (P3b). Shared by legacy settings:* IPC, HTTP /api/settings*, host:invoke.
 * Preserves proxy restart + launch-at-startup side effects.
 */
import type { GatewayManager } from '../gateway/manager';
import { applyProxySettings } from '../main/proxy';
import { syncLaunchAtStartupSettingFromStore } from '../main/launch-at-startup';
import { syncProxyConfigToOpenClaw } from '../utils/openclaw-proxy';
import {
  getAllSettings,
  getSetting,
  resetSettings,
  setSetting,
  type AppSettings,
} from '../utils/store';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { isRecord } from './payload-utils';

const PROXY_KEYS = new Set<keyof AppSettings>([
  'proxyEnabled',
  'proxyServer',
  'proxyHttpServer',
  'proxyHttpsServer',
  'proxyAllServer',
  'proxyBypassRules',
]);

export type SettingsApiDeps = {
  gatewayManager: GatewayManager;
};

async function handleProxySettingsChange(gatewayManager: GatewayManager): Promise<void> {
  const settings = await getAllSettings();
  await syncProxyConfigToOpenClaw(settings, { preserveExistingWhenDisabled: false });
  await applyProxySettings(settings);
  if (gatewayManager.getStatus().state === 'running') {
    await gatewayManager.restart();
  }
}

function patchTouchesProxy(patch: Partial<AppSettings>): boolean {
  return Object.keys(patch).some((key) => PROXY_KEYS.has(key as keyof AppSettings));
}

export function createSettingsApi(
  deps: SettingsApiDeps,
): NonNullable<CompleteHostServiceRegistry['settings']> & {
  setMany: (payload?: unknown) => Promise<unknown>;
} {
  const { gatewayManager } = deps;

  return {
    getAll: async () => await getAllSettings(),
    get: async (payload?: unknown) => {
      const key = typeof payload === 'string'
        ? payload
        : isRecord(payload)
          ? payload.key
          : undefined;
      if (typeof key !== 'string' || !key) {
        throw new Error('settings key is required');
      }
      return await getSetting(key as keyof AppSettings);
    },
    set: async (payload?: unknown) => {
      if (!isRecord(payload) || typeof payload.key !== 'string') {
        throw new Error('settings set requires { key, value }');
      }
      const key = payload.key as keyof AppSettings;
      const value = payload.value as AppSettings[keyof AppSettings];
      await setSetting(key, value as never);
      if (PROXY_KEYS.has(key)) {
        await handleProxySettingsChange(gatewayManager);
      }
      if (key === 'launchAtStartup') {
        await syncLaunchAtStartupSettingFromStore();
      }
      return { success: true };
    },
    setMany: async (payload?: unknown) => {
      const patch = (isRecord(payload) ? payload : {}) as Partial<AppSettings>;
      const entries = Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>;
      for (const [key, value] of entries) {
        await setSetting(key, value as never);
      }
      if (patchTouchesProxy(patch)) {
        await handleProxySettingsChange(gatewayManager);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'launchAtStartup')) {
        await syncLaunchAtStartupSettingFromStore();
      }
      return { success: true };
    },
    reset: async () => {
      await resetSettings();
      const settings = await getAllSettings();
      await handleProxySettingsChange(gatewayManager);
      await syncLaunchAtStartupSettingFromStore();
      return { success: true, settings };
    },
  };
}

export { handleProxySettingsChange as applySettingsProxySideEffects };
