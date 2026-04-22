/**
 * WebSocket Server - Kernel's communication endpoint
 * Handles all requests from Electron Main Process
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { KernelEvent, KernelRequest } from '../types.js';

export interface KernelServerOptions {
  port?: number;
  onRequest?: (request: KernelRequest) => AsyncGenerator<KernelEvent> | KernelEvent[] | void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class KernelServer {
  private wss: WebSocketServer | null = null;
  private ws: WebSocket | null = null;
  private options: KernelServerOptions;
  private port: number = 0;

  constructor(options: KernelServerOptions = {}) {
    this.options = options;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Start on dynamic port if not specified
      this.wss = new WebSocketServer({ port: this.options.port || 0 }, () => {
        this.port = (this.wss?.address() as { port: number })?.port || 0;
        console.log(`[Kernel] WS Server listening on port ${this.port}`);
        resolve(this.port);
      });

      this.wss.on('error', (err) => {
        reject(err);
      });

      this.wss.on('connection', (ws) => {
        console.log('[Kernel] Electron connected');
        this.ws = ws;
        this.options.onConnect?.();

        ws.on('message', async (data) => {
          try {
            const request = JSON.parse(data.toString()) as Record<string, unknown>;
            const requestId = request.requestId as string | undefined;
            console.log(`[Kernel] Received: ${request.type}${requestId ? ` (requestId=${requestId})` : ''}`);

            const result = this.options.onRequest?.(request as KernelRequest);
            console.log(`[DEBUG WS] onRequest returned, hasResult=${!!result}, isAsyncGen=${!!result && Symbol.asyncIterator in result}`);
            if (result) {
              if (Symbol.asyncIterator in result) {
                console.log(`[DEBUG WS] Entering async generator consumption loop`);
                let eventCount = 0;
                for await (const event of result as AsyncGenerator<KernelEvent>) {
                  eventCount++;
                  console.log(`[DEBUG WS] Generator event #${eventCount}: type=${event.type}`);
                  // Propagate requestId for request-response correlation
                  this.send(requestId ? { ...event, requestId } as KernelEvent : event);
                }
                console.log(`[DEBUG WS] Async generator consumption done, totalEvents=${eventCount}`);
              } else {
                for (const event of result as KernelEvent[]) {
                  this.send(requestId ? { ...event, requestId } as KernelEvent : event);
                }
              }
            } else {
              console.log(`[DEBUG WS] onRequest returned null/undefined`);
            }
          } catch (err) {
            console.error('[Kernel] Error handling request:', err);
            this.send({
              type: 'error',
              message: `Failed to process request: ${(err as Error).message}`,
            });
          }
        });

        ws.on('close', () => {
          console.log('[Kernel] Electron disconnected');
          this.ws = null;
          this.options.onDisconnect?.();
        });

        ws.on('error', (err) => {
          console.error('[Kernel] WS error:', err);
        });
      });
    });
  }

  send(event: KernelEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.ws?.close();
      this.wss?.close(() => {
        console.log('[Kernel] WS Server stopped');
        resolve();
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
