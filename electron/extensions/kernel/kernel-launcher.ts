/**
 * Kernel Launcher - Manages the independent kernel process lifecycle
 *
 * Dev mode:    spawn('npx', ['tsx', 'kernel/src/main.ts'])
 * Production:  utilityProcess.fork('kernel/kernel.js') — uses Electron's built-in Node.js
 *
 * Communication: WebSocket (kernel starts WS server on random port, outputs KERNEL_PORT=xxxxx)
 */
import { spawn, type ChildProcess } from 'child_process';
import { utilityProcess } from 'electron';
import { WebSocket } from 'ws';
import { resolve, dirname } from 'path';
import { app } from 'electron';
import type { KernelEvent, KernelRequest } from '../../../kernel/src/types.js';
import { getActiveLLMProvider } from '../marketplace/kernel-llm-store.js';

export interface KernelLauncherOptions {
  onEvent?: (event: KernelEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface PendingRequest {
  resolve: (value: KernelEvent[]) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
  events: KernelEvent[];
}

type KernelChildProcess = ChildProcess | Electron.UtilityProcess;

export class KernelLauncher {
  /** Child process — either a Node.js spawn (dev) or Electron UtilityProcess (prod) */
  private child: KernelChildProcess | null = null;
  private wsClient: WebSocket | null = null;
  private port: number = 0;
  private options: KernelLauncherOptions;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isShuttingDown = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private eventSubscribers: ((event: KernelEvent) => void)[] = [];
  /** If a start() is already in flight, reuse that promise */
  private startPromise: Promise<number> | null = null;

  constructor(options: KernelLauncherOptions = {}) {
    this.options = options;
  }

  async start(): Promise<number> {
    // Already running and connected
    if (this.isRunning()) {
      console.log('[KernelLauncher] Kernel already running');
      return this.port;
    }

    // Start in progress — wait for it
    if (this.startPromise) {
      console.log('[KernelLauncher] Waiting for existing start...');
      return this.startPromise;
    }

    // Pre-load provider env before spawning kernel
    const providerEnv = await KernelLauncher.buildProviderEnv();

    const isDev = !app.isPackaged;
    this.startPromise = isDev
      ? this.startDev(providerEnv)
      : this.startProd(providerEnv);

    try {
      const port = await this.startPromise;
      return port;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Read the active LLM provider config from the independent kernel-llm-store
   * and build an env-var map to inject into the kernel child process.
   */
  private static async buildProviderEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    try {
      const active = await getActiveLLMProvider();
      if (active) {
        // Inject API key via KERNEL_API_KEY (preferred, avoids system env collision)
        env['KERNEL_API_KEY'] = active.apiKey;
        // Keep legacy env vars for backward compat, but KERNEL_API_KEY takes precedence in kernel
        const apiKeyEnvVar = active.api === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
        env[apiKeyEnvVar] = active.apiKey;

        // Inject model and base URL
        env['KERNEL_MODEL'] = active.model;
        if (active.baseUrl) {
          env['KERNEL_BASE_URL'] = active.baseUrl;
        }

        console.log(
          `[KernelLauncher] LLM env injected: model=${active.model}, provider=${active.api}`
        );
      } else {
        console.log('[KernelLauncher] No active LLM provider configured');
      }
    } catch (err) {
      console.warn('[KernelLauncher] Failed to load LLM provider env:', err);
    }

    return env;
  }

  // ─── Dev mode: spawn via npx tsx ───

  private startDev(providerEnv: Record<string, string> = {}): Promise<number> {
    // In dev mode, derive project root from __dirname (dist-electron/main/ → project root)
    const projectRoot = resolve(__dirname, '../../');
    const agentsDir = resolve(projectRoot, 'kernel/agents');

    // Prefer pre-built bundle (fast, ~1s startup) over tsx (slow, ~25s)
    const kernelBundle = resolve(projectRoot, 'build/kernel/kernel.js');
    const hasBundle = require('fs').existsSync(kernelBundle);

    const execPath = hasBundle ? 'node' : 'npx';
    const execArgs = hasBundle ? [kernelBundle] : ['tsx', resolve(projectRoot, 'kernel/src/main.ts')];
    console.log(`[KernelLauncher] Dev mode — starting kernel via ${hasBundle ? 'pre-built bundle' : 'tsx'}:`, execArgs.join(' '));

    return new Promise((resolve, reject) => {
      const child = spawn(execPath, execArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...providerEnv,
          KERNEL_AGENTS_DIR: agentsDir,
          NODE_ENV: 'development',
        },
      });

      this.child = child;
      let portResolved = false;

      child.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        console.log('[Kernel]', line);

        const portMatch = line.match(/KERNEL_PORT=(\d+)/);
        if (portMatch && !portResolved) {
          this.port = parseInt(portMatch[1], 10);
          portResolved = true;
          this.connectWebSocket().then(() => resolve(this.port)).catch(reject);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        console.error('[Kernel stderr]', data.toString().trim());
      });

      child.on('exit', (code) => {
        console.log(`[KernelLauncher] Kernel exited with code ${code}`);
        this.handleChildExit();
      });

      child.on('error', (err) => {
        console.error('[KernelLauncher] Kernel process error:', err);
        if (!portResolved) {
          reject(err);
        }
      });

      setTimeout(() => {
        if (!portResolved) {
          child.kill();
          reject(new Error('Kernel startup timeout: no port received within 60s'));
        }
      }, 60000);
    });
  }

  // ─── Production mode: utilityProcess.fork ───

  private startProd(providerEnv: Record<string, string> = {}): Promise<number> {
    const kernelPath = resolve(process.resourcesPath!, 'kernel', 'kernel.js');
    const agentsDir = resolve(process.resourcesPath!, 'kernel', 'agents');

    console.log('[KernelLauncher] Production mode — forking kernel:', kernelPath);

    return new Promise((resolve, reject) => {
      const child = utilityProcess.fork(kernelPath, [], {
        stdio: 'pipe',
        env: {
          ...process.env,
          ...providerEnv,
          KERNEL_AGENTS_DIR: agentsDir,
          NODE_ENV: 'production',
        } as Record<string, string>,
        serviceName: 'ClawX Kernel',
      });

      this.child = child;
      let portResolved = false;

      child.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        console.log('[Kernel]', line);

        const portMatch = line.match(/KERNEL_PORT=(\d+)/);
        if (portMatch && !portResolved) {
          this.port = parseInt(portMatch[1], 10);
          portResolved = true;
          this.connectWebSocket().then(() => resolve(this.port)).catch(reject);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        console.error('[Kernel stderr]', data.toString().trim());
      });

      child.on('exit', (code: number) => {
        console.log(`[KernelLauncher] Kernel exited with code ${code}`);
        this.handleChildExit();
      });

      child.on('error', (err: Error) => {
        console.error('[KernelLauncher] Kernel process error:', err);
        if (!portResolved) {
          reject(err);
        }
      });

      setTimeout(() => {
        if (!portResolved) {
          this.killChild();
          reject(new Error('Kernel startup timeout: no port received within 30s'));
        }
      }, 30000);
    });
  }

  // ─── Lifecycle ───

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Kernel is shutting down'));
    }
    this.pendingRequests.clear();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Send graceful shutdown via WebSocket
    if (this.wsClient?.readyState === WebSocket.OPEN) {
      this.wsClient.send(JSON.stringify({ type: 'kernel.shutdown' }));
    }

    // Wait for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.wsClient?.close();
    this.wsClient = null;

    this.killChild();

    this.port = 0;
    this.isShuttingDown = false;
  }

  async restart(): Promise<number> {
    await this.stop();
    return this.start();
  }

  isRunning(): boolean {
    return this.child !== null && this.wsClient?.readyState === WebSocket.OPEN;
  }

  getPort(): number {
    return this.port;
  }

  // ─── Request methods ───

  async sendRequest(
    request: KernelRequest & { requestId?: string },
    timeoutMs = 10000,
  ): Promise<KernelEvent[]> {
    if (!this.isRunning()) {
      await this.start();
    }

    const requestId = `req_${++this.requestIdCounter}_${Date.now()}`;
    const requestWithId = { ...request, requestId };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new Error(
            `Request timeout after ${timeoutMs}ms: ${(request as Record<string, string>).type}`,
          ),
        );
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout, events: [] });
      this.wsClient?.send(JSON.stringify(requestWithId));
    });
  }

  async sendStream(request: KernelRequest): Promise<void> {
    if (!this.isRunning()) {
      await this.start();
    }
    this.wsClient?.send(JSON.stringify(request));
  }

  subscribe(callback: (event: KernelEvent) => void): () => void {
    this.eventSubscribers.push(callback);
    return () => {
      const index = this.eventSubscribers.indexOf(callback);
      if (index > -1) {
        this.eventSubscribers.splice(index, 1);
      }
    };
  }

  // ─── Internal ───

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${this.port}`;
      console.log(`[KernelLauncher] Connecting to ${wsUrl}`);

      this.wsClient = new WebSocket(wsUrl);

      this.wsClient.on('open', () => {
        console.log('[KernelLauncher] WebSocket connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.options.onConnect?.();
        resolve();
      });

      this.wsClient.on('message', (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString()) as KernelEvent;
          this.handleKernelEvent(event);
        } catch (err) {
          console.error('[KernelLauncher] Failed to parse event:', err);
        }
      });

      this.wsClient.on('close', () => {
        console.log('[KernelLauncher] WebSocket closed');
        this.wsClient = null;
        this.options.onDisconnect?.();

        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      this.wsClient.on('error', (err) => {
        console.error('[KernelLauncher] WebSocket error:', err);
        reject(err);
      });
    });
  }

  private handleKernelEvent(event: KernelEvent): void {
    const ev = event as Record<string, unknown>;

    // Request-response correlation
    const requestId = ev.requestId as string | undefined;
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!;
      pending.events.push(event);

      const isComplete =
        ev.type === 'agent.list' ||
        ev.type === 'agent.detail' ||
        ev.type === 'session.created' ||
        ev.type === 'session.list' ||
        ev.type === 'error';

      if (isComplete) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        pending.resolve(pending.events);
      }
    }

    // Forward to subscribers
    for (const subscriber of this.eventSubscribers) {
      try {
        subscriber(event);
      } catch (err) {
        console.error('[KernelLauncher] Event subscriber error:', err);
      }
    }

    this.options.onEvent?.(event);
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(() => {
      if (this.wsClient?.readyState !== WebSocket.OPEN) {
        console.log('[KernelLauncher] Heartbeat failed — connection lost');
        this.scheduleReconnect();
      }
    }, 5000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[KernelLauncher] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(
      `[KernelLauncher] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      if (!this.isShuttingDown) {
        this.restart().catch((err) => {
          console.error('[KernelLauncher] Reconnect failed:', err);
        });
      }
    }, delay);
  }

  private handleChildExit(): void {
    this.child = null;
    this.wsClient = null;

    if (!this.isShuttingDown && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private killChild(): void {
    if (!this.child) return;

    if ('kill' in this.child && typeof this.child.kill === 'function') {
      // ChildProcess (dev)
      this.child.kill('SIGTERM');
      setTimeout(() => {
        (this.child as ChildProcess)?.kill('SIGKILL');
      }, 5000);
    } else {
      // UtilityProcess (prod)
      (this.child as Electron.UtilityProcess).kill();
    }

    this.child = null;
  }
}
