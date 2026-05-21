import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import { readOpenClawConfig, writeOpenClawConfig } from '../../utils/channel-config';
import {
  parseAllBindings,
  addBindingToConfig,
  updateBindingInConfig,
  removeBindingFromConfig,
} from '../../utils/agent-config';

async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw) as T;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export async function handleBindingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/bindings')) return false;

  // GET /api/bindings — 获取所有绑定
  if (url.pathname === '/api/bindings' && req.method === 'GET') {
    try {
      const config = await readOpenClawConfig();
      const bindings = parseAllBindings(config as Record<string, unknown>);
      sendJson(res, 200, { success: true, bindings });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // POST /api/bindings — 添加绑定
  if (url.pathname === '/api/bindings' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        agentId: string;
        channel: string;
        routingMode?: string;
        accountId?: string;
        peerKind?: string;
        peerId?: string;
        comment?: string;
        bindingType?: string;
        acp?: Record<string, unknown>;
      }>(req);

      if (!body.agentId || !body.channel) {
        throw new Error('agentId and channel are required');
      }

      const config = await readOpenClawConfig();
      addBindingToConfig(config as Record<string, unknown>, body);
      await writeOpenClawConfig(config);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // PUT /api/bindings/:index — 更新绑定
  const putMatch = url.pathname.match(/^\/api\/bindings\/(\d+)$/);
  if (putMatch && req.method === 'PUT') {
    try {
      const index = parseInt(putMatch[1], 10);
      const body = await parseJsonBody<{
        agentId: string;
        channel: string;
        routingMode?: string;
        accountId?: string;
        peerKind?: string;
        peerId?: string;
        comment?: string;
        bindingType?: string;
        acp?: Record<string, unknown>;
      }>(req);

      if (!body.agentId || !body.channel) {
        throw new Error('agentId and channel are required');
      }

      const config = await readOpenClawConfig();
      updateBindingInConfig(config as Record<string, unknown>, index, body);
      await writeOpenClawConfig(config);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // DELETE /api/bindings/:index — 删除绑定
  const deleteMatch = url.pathname.match(/^\/api\/bindings\/(\d+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    try {
      const index = parseInt(deleteMatch[1], 10);
      const config = await readOpenClawConfig();
      removeBindingFromConfig(config as Record<string, unknown>, index);
      await writeOpenClawConfig(config);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
