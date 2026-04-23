"use strict";

/**
 * Collaboration Hall — Stream Manager
 *
 * SSE endpoint that pushes real-time collaboration events to connected clients.
 * Subscribes to HostEventBus and forwards collab:invalidate events as SSE.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostApiContext } from "../../api/context";
import { createModuleLogger } from "../_shared/module-logger";

const logger = createModuleLogger("collab-stream");

// Track active SSE connections per hallId
const connections = new Map<string, Set<ServerResponse>>();

export function createCollabStreamHandler(_ctx: HostApiContext): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const hallId = url.searchParams.get("hallId")?.trim() || "main";

    // Setup SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ hallId, timestamp: new Date().toISOString() })}\n\n`);

    // Register connection
    if (!connections.has(hallId)) {
      connections.set(hallId, new Set());
    }
    connections.get(hallId)!.add(res);

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(":heartbeat\n\n");
      } catch {
        cleanup();
      }
    }, 30_000);

    // Cleanup on close
    const cleanup = () => {
      clearInterval(heartbeat);
      connections.get(hallId)?.delete(res);
      try {
        res.end();
      } catch {
        // ignore
      }
    };

    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);

    logger.debug("SSE client connected for hallId=%s", hallId);
  };
}

/**
 * Broadcast an event to all SSE clients subscribed to a hall.
 * Called by event-publisher when collab:invalidate events are emitted.
 */
export function broadcastToHall(hallId: string, eventName: string, payload: Record<string, unknown>): void {
  const clients = connections.get(hallId);
  if (!clients || clients.size === 0) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(message);
    } catch {
      clients.delete(res);
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }
}
