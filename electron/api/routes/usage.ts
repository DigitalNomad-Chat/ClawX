import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';
import { createUsageApi } from '../../services/usage-api';

const usageApi = createUsageApi();

export async function handleUsageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // P3a: thin delegate to createUsageApi (shared with usage:recentTokenHistory IPC + host:invoke)
  if (url.pathname === '/api/usage/recent-token-history' && req.method === 'GET') {
    const rawLimit = url.searchParams.get('limit');
    sendJson(res, 200, await usageApi.recentTokenHistory({ limit: rawLimit }));
    return true;
  }

  return false;
}
