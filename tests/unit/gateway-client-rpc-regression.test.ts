// @vitest-environment node
/**
 * Isolated Gateway regression for GatewayClient RPC method mapping.
 *
 * This test spawns a real OpenClaw 2026.6.6 Gateway in a temporary state
 * directory, connects over WebSocket, and exercises GatewayClient methods
 * against the live runtime. It is skipped when build/openclaw is not present.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { GatewayClient } from '../../electron/gateway/client';
import { GatewayManager } from '../../electron/gateway/manager';
import { UnsupportedGatewayMethodError } from '../../electron/gateway/rpc-method-map';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENCLAW_ENTRY = path.resolve(__dirname, '../../build/openclaw/openclaw.mjs');

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.listen(0, '127.0.0.1');
  });
}

async function waitForHttpHealth(port: number, timeoutMs = 30000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Gateway HTTP health did not become ready on port ${port}`);
}

function handshake(ws: WebSocket, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => reject(new Error('Gateway connect handshake timeout')), timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      const msg = message as { type?: string; id?: string; ok?: boolean; payload?: unknown; error?: unknown };
      if (msg.type === 'res' && msg.id === id) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        if (msg.ok) resolve(msg.payload);
        else reject(new Error(`connect failed: ${JSON.stringify(msg.error)}`));
      }
    };
    ws.on('message', onMessage);
    ws.send(
      JSON.stringify({
        type: 'req',
        id,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 4,
          client: {
            id: 'gateway-client',
            version: '0.0.1',
            platform: process.platform,
            mode: 'backend',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: [],
          commands: [],
          permissions: {},
          auth: {},
          locale: 'en-US',
          userAgent: 'clawdock-regression/0.0.1',
        },
      }),
    );
  });
}

function callGateway(ws: WebSocket, method: string, params: unknown = {}, timeoutMs = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => reject(new Error(`RPC timeout: ${method}`)), timeoutMs);
    const onMessage = (data: WebSocket.RawData) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      const msg = message as { type?: string; id?: string; ok?: boolean; payload?: unknown; error?: unknown };
      if (msg.type === 'res' && msg.id === id) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        if (msg.ok) resolve(msg.payload);
        else reject(new Error(`${method} failed: ${JSON.stringify(msg.error)}`));
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

describe.skipIf(!existsSync(OPENCLAW_ENTRY))(
  'GatewayClient RPC mapping regression against OpenClaw 2026.6.6',
  () => {
    let port = 0;
    let stateDir = '';
    let proc: ChildProcess | null = null;
    let ws: WebSocket | null = null;
    let client: GatewayClient | null = null;

    beforeAll(async () => {
      port = await getFreePort();
      stateDir = mkdtempSync(path.join(tmpdir(), 'clawdock-rpc-reg-'));

      proc = spawn(
        process.execPath,
        [OPENCLAW_ENTRY, 'gateway', 'run', '--port', String(port), '--auth', 'none', '--allow-unconfigured', '--force'],
        {
          env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
          stdio: 'ignore',
          detached: true,
        },
      );

      await waitForHttpHealth(port);

      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws!.once('open', () => resolve());
        ws!.once('error', reject);
      });

      await handshake(ws);

      const manager = {
        rpc: <T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> =>
          callGateway(ws!, method, params, timeoutMs) as Promise<T>,
      } as unknown as GatewayManager;

      client = new GatewayClient(manager);
    }, 60000);

    afterAll(async () => {
      ws?.close();
      if (proc?.pid) {
        try {
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          // already exited
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          process.kill(-proc.pid, 'SIGKILL');
        } catch {
          // already exited
        }
      }
      rmSync(stateDir, { recursive: true, force: true });
    });

    it('getHealth maps to health and resolves', async () => {
      const result = await client!.getHealth();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('getConfig maps to config.get and resolves', async () => {
      const result = await client!.getConfig();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('listProviders maps to models.list and resolves', async () => {
      const result = await client!.listProviders();
      expect(result).toBeDefined();
    });

    it('listCronTasks maps to cron.list and resolves', async () => {
      const result = await client!.listCronTasks();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('getChatHistory maps to chat.history without METHOD_NOT_FOUND', async () => {
      // chat.history may fail for other reasons (no sessions), but it must not
      // fail because the method is unadvertised.
      await expect(client!.getChatHistory(10, 0)).rejects.not.toThrow(/METHOD_NOT_FOUND/);
    });

    it('removed channel methods throw UnsupportedGatewayMethodError before the wire', async () => {
      await expect(client!.listChannels()).rejects.toThrow(UnsupportedGatewayMethodError);
    });

    it('removed skill methods throw UnsupportedGatewayMethodError before the wire', async () => {
      await expect(client!.enableSkill('skill-1')).rejects.toThrow(UnsupportedGatewayMethodError);
    });

    it('removed cron write methods throw UnsupportedGatewayMethodError before the wire', async () => {
      await expect(client!.createCronTask({ name: 't', schedule: '* * * * *', command: 'echo', enabled: true }))
        .rejects.toThrow(UnsupportedGatewayMethodError);
    });
  },
);
