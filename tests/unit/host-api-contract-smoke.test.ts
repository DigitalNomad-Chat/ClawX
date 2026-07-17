/**
 * P0 smoke: @shared alias + HostApiContract / HostEvents scaffold keys.
 * No runtime invoke — types and channel constants only.
 */
import type { HostApiContract } from '@shared/host-api/contract';
import {
  HOST_EVENT_CHANNELS,
  type HostEventContract,
} from '@shared/host-events/contract';

describe('HostApiContract scaffold', () => {
  it('declares gateway and chat modules as keys', () => {
    const keys: Array<keyof HostApiContract> = ['gateway', 'chat', 'sessions', 'media'];
    expect(keys.length).toBe(4);
  });

  it('declares the full core module surface for later registry work', () => {
    const core: Array<keyof HostApiContract> = [
      'app',
      'openclaw',
      'shell',
      'dialog',
      'window',
      'updates',
      'uv',
      'settings',
      'gateway',
      'logs',
      'channels',
      'agents',
      'diagnostics',
      'providers',
      'files',
      'media',
      'sessions',
      'chat',
      'cron',
      'skills',
      'usage',
    ];
    expect(new Set(core).size).toBe(core.length);
  });
});

describe('HostEventContract scaffold', () => {
  it('maps chat.runtimeEvent to chat:runtime-event channel', () => {
    expect(HOST_EVENT_CHANNELS.chat.runtimeEvent).toBe('chat:runtime-event');
  });

  it('keeps gateway.notification channel for dual-emit legacy path', () => {
    expect(HOST_EVENT_CHANNELS.gateway.notification).toBe('gateway:notification');
  });

  it('includes kernel.event for AgentChat stream', () => {
    expect(HOST_EVENT_CHANNELS.kernel.event).toBe('kernel:event');
  });

  it('types HostEventContract chat.runtimeEvent as a key path', () => {
    type ChatRuntimeHandler = HostEventContract['chat']['runtimeEvent'];
    const _assert: ChatRuntimeHandler = (_payload) => undefined;
    expect(typeof _assert).toBe('function');
  });
});
