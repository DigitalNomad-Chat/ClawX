import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';
import { createLogsApi } from '../../services/logs-api';

const logsApi = createLogsApi();

export async function handleLogRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // P3b: thin delegate to createLogsApi
  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const tailLines = Number(url.searchParams.get('tailLines') || '100');
    sendJson(res, 200, {
      content: await logsApi.readFile(Number.isFinite(tailLines) ? tailLines : 100),
    });
    return true;
  }

  if (url.pathname === '/api/logs/dir' && req.method === 'GET') {
    sendJson(res, 200, { dir: logsApi.getDir() });
    return true;
  }

  if (url.pathname === '/api/logs/files' && req.method === 'GET') {
    sendJson(res, 200, { files: await logsApi.listFiles() });
    return true;
  }

  return false;
}
