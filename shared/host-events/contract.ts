/**
 * v0.4.9 — Host events contract aligned to ClawDock preload + host-events.
 *
 * Authority: electron/preload validChannels (on/once) and
 * src/lib/host-events.ts HOST_EVENT_TO_IPC_CHANNEL keys/values.
 * Do not invent channel names from upstream HOST_EVENT_CHANNELS alone.
 */
import type { ChatRuntimeEvent } from '../chat-runtime-events';

/**
 * Logical event groups for typing. Subscribe keys used by subscribeHostEvent
 * are listed in HOST_EVENT_SUBSCRIBE_KEYS; IPC wire names in HOST_EVENT_CHANNELS.
 */
export type HostEventContract = {
  gateway: {
    status: (payload: unknown) => void;
    error: (payload: unknown) => void;
    notification: (payload: unknown) => void;
    health: (payload: unknown) => void;
    presence: (payload: unknown) => void;
    chatMessage: (payload: unknown) => void;
    channelStatus: (payload: unknown) => void;
    exit: (payload: unknown) => void;
  };
  chat: {
    runtimeEvent: (payload: ChatRuntimeEvent) => void;
  };
  kernel: {
    event: (payload: unknown) => void;
  };
  oauth: {
    code: (payload: unknown) => void;
    success: (payload: unknown) => void;
    error: (payload: unknown) => void;
  };
  channel: {
    whatsappQr: (payload: unknown) => void;
    whatsappSuccess: (payload: unknown) => void;
    whatsappError: (payload: unknown) => void;
    wechatQr: (payload: unknown) => void;
    wechatSuccess: (payload: unknown) => void;
    wechatError: (payload: unknown) => void;
  };
  updates: {
    statusChanged: (payload: unknown) => void;
    autoInstallCountdown: (payload: unknown) => void;
  };
  app: {
    navigate: (path: string) => void;
    newChat: () => void;
    openClawCliInstalled: (installedPath: string) => void;
  };
};

export type HostEventModule = keyof HostEventContract;
export type HostEventName<M extends HostEventModule> = keyof HostEventContract[M] & string;
export type HostEventHandler<
  M extends HostEventModule,
  E extends HostEventName<M>,
> = HostEventContract[M][E];
export type HostEventArgs<
  M extends HostEventModule,
  E extends HostEventName<M>,
> = HostEventHandler<M, E> extends (...args: infer Args) => void ? Args : never;

/**
 * IPC wire channel strings (preload on/once allowlist).
 * Values must match what Main webContents.send uses.
 */
export const HOST_EVENT_CHANNELS = {
  gateway: {
    status: 'gateway:status-changed',
    error: 'gateway:error',
    notification: 'gateway:notification',
    health: 'gateway:health-changed',
    presence: 'gateway:presence-changed',
    chatMessage: 'gateway:chat-message',
    channelStatus: 'gateway:channel-status',
    exit: 'gateway:exit',
  },
  chat: {
    runtimeEvent: 'chat:runtime-event',
  },
  kernel: {
    event: 'kernel:event',
  },
  oauth: {
    code: 'oauth:code',
    success: 'oauth:success',
    error: 'oauth:error',
  },
  channel: {
    whatsappQr: 'channel:whatsapp-qr',
    whatsappSuccess: 'channel:whatsapp-success',
    whatsappError: 'channel:whatsapp-error',
    wechatQr: 'channel:wechat-qr',
    wechatSuccess: 'channel:wechat-success',
    wechatError: 'channel:wechat-error',
  },
  updates: {
    statusChanged: 'update:status-changed',
    autoInstallCountdown: 'update:auto-install-countdown',
  },
  app: {
    navigate: 'navigate',
    newChat: 'new-chat',
    openClawCliInstalled: 'openclaw:cli-installed',
  },
} as const satisfies {
  [M in HostEventModule]: {
    [E in HostEventName<M>]: string;
  };
};

/**
 * Keys accepted by subscribeHostEvent (left side of HOST_EVENT_TO_IPC_CHANNEL).
 * Several gateway keys differ from IPC wire names (e.g. gateway:status → gateway:status-changed).
 */
export const HOST_EVENT_SUBSCRIBE_KEYS = {
  gateway: {
    status: 'gateway:status',
    error: 'gateway:error',
    notification: 'gateway:notification',
    health: 'gateway:health',
    presence: 'gateway:presence',
    chatMessage: 'gateway:chat-message',
    channelStatus: 'gateway:channel-status',
    exit: 'gateway:exit',
  },
  chat: {
    runtimeEvent: 'chat:runtime-event',
  },
  kernel: {
    event: 'kernel:event',
  },
  oauth: {
    code: 'oauth:code',
    success: 'oauth:success',
    error: 'oauth:error',
  },
  channel: {
    whatsappQr: 'channel:whatsapp-qr',
    whatsappSuccess: 'channel:whatsapp-success',
    whatsappError: 'channel:whatsapp-error',
    wechatQr: 'channel:wechat-qr',
    wechatSuccess: 'channel:wechat-success',
    wechatError: 'channel:wechat-error',
  },
} as const;
