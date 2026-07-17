/**
 * v0.4.9 P0 — Host events contract scaffold (types + channel map only).
 *
 * Preserves #1094 M1 mapping: chat.runtimeEvent → 'chat:runtime-event'.
 * Does not change src/lib/host-events.ts runtime mapping in this phase.
 */
import type { ChatRuntimeEvent } from '../chat-runtime-events';

export type HostEventContract = {
  gateway: {
    statusChanged: (payload: unknown) => void;
    message: (payload: unknown) => void;
    notification: (payload: unknown) => void;
    healthChanged: (payload: unknown) => void;
    presenceChanged: (payload: unknown) => void;
    chatMessage: (payload: unknown) => void;
    channelStatus: (payload: unknown) => void;
    exit: (payload: unknown) => void;
    error: (payload: unknown) => void;
  };
  chat: {
    /** M1 dual-emit channel — payload is shared ChatRuntimeEvent. */
    runtimeEvent: (payload: ChatRuntimeEvent) => void;
  };
  oauth: {
    code: (payload: unknown) => void;
    success: (payload: unknown) => void;
    error: (payload: unknown) => void;
  };
  channel: {
    qr: (payload: unknown) => void;
    success: (payload: unknown) => void;
    error: (payload: unknown) => void;
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
 * Canonical IPC channel strings for host events.
 * Must stay consistent with electron/preload validChannels + src/lib/host-events.ts.
 */
export const HOST_EVENT_CHANNELS = {
  gateway: {
    statusChanged: 'gateway:status-changed',
    message: 'gateway:message',
    notification: 'gateway:notification',
    healthChanged: 'gateway:health-changed',
    presenceChanged: 'gateway:presence-changed',
    chatMessage: 'gateway:chat-message',
    channelStatus: 'gateway:channel-status',
    exit: 'gateway:exit',
    error: 'gateway:error',
  },
  chat: {
    runtimeEvent: 'chat:runtime-event',
  },
  oauth: {
    code: 'oauth:code',
    success: 'oauth:success',
    error: 'oauth:error',
  },
  channel: {
    qr: 'channel:qr',
    success: 'channel:success',
    error: 'channel:error',
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
