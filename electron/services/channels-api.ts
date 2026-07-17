/**
 * Channels Host API (P3c medium-risk, minimal surface).
 * list/get/setEnabled only — save/delete/OAuth stay on legacy handlers.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import {
  getChannelConfig,
  listConfiguredChannels,
  setChannelEnabled,
} from '../utils/channel-config';
import { isRecord } from './payload-utils';

export type ChannelsApiDeps = {
  /** Called after successful setEnabled for Gateway restart side effect. */
  onChannelEnabledChange?: (channelType: string, enabled: boolean) => void;
};

function requireChannelType(payload?: unknown): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (isRecord(payload) && typeof payload.channelType === 'string' && payload.channelType.trim()) {
    return payload.channelType.trim();
  }
  throw new Error('channelType is required');
}

export function createChannelsApi(
  deps: ChannelsApiDeps = {},
): NonNullable<CompleteHostServiceRegistry['channels']> {
  return {
    listConfigured: async () => {
      try {
        const channels = await listConfiguredChannels();
        return { success: true, channels };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    getConfig: async (payload?: unknown) => {
      try {
        const channelType = requireChannelType(payload);
        const config = await getChannelConfig(channelType);
        return { success: true, config };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    saveConfig: async () => {
      throw new Error('channels.saveConfig remains on legacy IPC/HTTP for this batch');
    },
    setEnabled: async (payload?: unknown) => {
      try {
        if (!isRecord(payload)) {
          throw new Error('setEnabled requires { channelType, enabled }');
        }
        const channelType = requireChannelType(payload);
        const enabled = Boolean(payload.enabled);
        await setChannelEnabled(channelType, enabled);
        deps.onChannelEnabledChange?.(channelType, enabled);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}
