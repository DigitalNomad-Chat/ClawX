/**
 * Channels State Store (Hermes version)
 *
 * Manages messaging platform state via Host API.
 * Replaces legacy OpenClaw Gateway JSON-RPC with direct HTTP calls.
 */
import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';
import { CHANNEL_NAMES, type Channel, type ChannelType } from '../types/channel';

interface AddChannelParams {
  type: ChannelType;
  name: string;
  token?: string;
  [key: string]: string | undefined;
}

interface ChannelsState {
  channels: Channel[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchChannels: () => Promise<void>;
  addChannel: (params: AddChannelParams) => Promise<Channel>;
  deleteChannel: (channelId: string) => Promise<void>;
  connectChannel: (channelId: string) => Promise<void>;
  disconnectChannel: (channelId: string) => Promise<void>;
  requestQrCode: (channelType: ChannelType) => Promise<{ qrCode: string; sessionId: string }>;
  setChannels: (channels: Channel[]) => void;
  updateChannel: (channelId: string, updates: Partial<Channel>) => void;
  clearError: () => void;
}

function splitChannelId(channelId: string): { channelType: string; accountId?: string } {
  const separatorIndex = channelId.indexOf('-');
  if (separatorIndex === -1) {
    return { channelType: channelId };
  }
  return {
    channelType: channelId.slice(0, separatorIndex),
    accountId: channelId.slice(separatorIndex + 1),
  };
}

export const useChannelsStore = create<ChannelsState>((set, get) => ({
  channels: [],
  loading: false,
  error: null,

  fetchChannels: async () => {
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<{ channels?: string[] }>('/api/channels');
      const configuredTypes = data?.channels || [];

      const channels: Channel[] = configuredTypes.map((type) => ({
        id: type,
        type: type as ChannelType,
        name: CHANNEL_NAMES[type as ChannelType] || type,
        status: 'connected',
      }));

      set({ channels, loading: false });
    } catch {
      set({ channels: [], loading: false });
    }
  },

  addChannel: async (params) => {
    try {
      const { type, name, token, ...rest } = params;
      const values: Record<string, string> = { enabled: 'true', ...rest };
      if (token) {
        values.token = token;
      }

      await hostApiFetch(`/api/channels/${encodeURIComponent(type)}`, {
        method: 'PUT',
        body: JSON.stringify({ values }),
      });

      const newChannel: Channel = {
        id: type,
        type: type as ChannelType,
        name: name || CHANNEL_NAMES[type as ChannelType] || type,
        status: 'connected',
      };
      set((state) => ({
        channels: [...state.channels, newChannel],
      }));
      return newChannel;
    } catch (error) {
      console.error('Failed to add channel:', error);
      throw error;
    }
  },

  deleteChannel: async (channelId) => {
    const { channelType } = splitChannelId(channelId);

    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(channelType)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to delete channel config:', error);
    }

    // Remove from local state
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== channelId),
    }));
  },

  connectChannel: async (channelId) => {
    const { updateChannel } = get();
    updateChannel(channelId, { status: 'connecting', error: undefined });

    const { channelType } = splitChannelId(channelId);

    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(channelType)}`, {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      });
      updateChannel(channelId, { status: 'connected' });
    } catch (error) {
      updateChannel(channelId, { status: 'error', error: String(error) });
    }
  },

  disconnectChannel: async (channelId) => {
    const { updateChannel } = get();

    const { channelType } = splitChannelId(channelId);

    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(channelType)}`, {
        method: 'POST',
        body: JSON.stringify({ enabled: false }),
      });
    } catch (error) {
      console.error('Failed to disconnect channel:', error);
    }

    updateChannel(channelId, { status: 'disconnected', error: undefined });
  },

  requestQrCode: async (channelType) => {
    // QR code login is not yet implemented for Hermes.
    throw new Error(`QR code login not supported for ${channelType} in Hermes mode`);
  },

  setChannels: (channels) => set({ channels }),

  updateChannel: (channelId, updates) => {
    set((state) => ({
      channels: state.channels.map((channel) =>
        channel.id === channelId ? { ...channel, ...updates } : channel,
      ),
    }));
  },

  clearError: () => set({ error: null }),
}));
