import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';
import { createAppApi } from '../../services/app-api';

const appApi = createAppApi();

export async function handleAppRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/events' && req.method === 'GET') {
    // CORS headers are already set by the server middleware.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    ctx.eventBus.addSseClient(res);
    // Send a current-state snapshot immediately so renderer subscribers do not
    // miss lifecycle transitions that happened before the SSE connection opened.
    res.write(`event: gateway:status\ndata: ${JSON.stringify(ctx.gatewayManager.getStatus())}\n\n`);
    return true;
  }

  // Hermes installation status check (embedded — always available)
  if (url.pathname === '/api/app/hermes-status' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      installed: true,
      path: null,
      installCommand: null,
    });
    return true;
  }

  // OpenClaw doctor host API — P3a thin delegate to createAppApi
  if (url.pathname === '/api/app/openclaw-doctor' && req.method === 'POST') {
    const body = await parseJsonBody<{ mode?: string }>(req);
    const result = await appApi.openClawDoctor({ mode: body.mode });
    sendJson(res, 200, result);
    return true;
  }

  // OPTIONS is handled by the server middleware; no route-level handler needed.

  return false;
}
