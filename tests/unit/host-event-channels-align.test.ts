/**
 * P2: shared HOST_EVENT_CHANNELS must match ClawDock host-events + preload authority.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HOST_EVENT_CHANNELS,
  HOST_EVENT_SUBSCRIBE_KEYS,
} from '@shared/host-events/contract';

const hostEventsSrc = readFileSync(join(process.cwd(), 'src/lib/host-events.ts'), 'utf8');
const preloadSrc = readFileSync(join(process.cwd(), 'electron/preload/index.ts'), 'utf8');

describe('host-event channel alignment (ClawDock)', () => {
  it('maps chat runtime and kernel event IPC wires correctly', () => {
    expect(HOST_EVENT_CHANNELS.chat.runtimeEvent).toBe('chat:runtime-event');
    expect(HOST_EVENT_CHANNELS.kernel.event).toBe('kernel:event');
    expect(HOST_EVENT_SUBSCRIBE_KEYS.kernel.event).toBe('kernel:event');
  });

  it('uses WhatsApp/WeChat channel names (not generic channel:qr)', () => {
    expect(HOST_EVENT_CHANNELS.channel.whatsappQr).toBe('channel:whatsapp-qr');
    expect(HOST_EVENT_CHANNELS.channel.wechatError).toBe('channel:wechat-error');
    expect(JSON.stringify(HOST_EVENT_CHANNELS)).not.toContain('channel:qr');
  });

  it('gateway status IPC wire is gateway:status-changed', () => {
    expect(HOST_EVENT_CHANNELS.gateway.status).toBe('gateway:status-changed');
    expect(HOST_EVENT_SUBSCRIBE_KEYS.gateway.status).toBe('gateway:status');
  });

  it('preload allowlists include critical IPC wires', () => {
    for (const ch of [
      HOST_EVENT_CHANNELS.chat.runtimeEvent,
      HOST_EVENT_CHANNELS.kernel.event,
      HOST_EVENT_CHANNELS.gateway.notification,
      HOST_EVENT_CHANNELS.channel.whatsappQr,
    ]) {
      expect(preloadSrc).toContain(`'${ch}'`);
    }
  });

  it('host-events maps subscribe keys for gateway status and kernel', () => {
    expect(hostEventsSrc).toMatch(/'gateway:status'\s*:\s*'gateway:status-changed'/);
    expect(hostEventsSrc).toMatch(/'kernel:event'\s*:\s*'kernel:event'/);
  });
});
