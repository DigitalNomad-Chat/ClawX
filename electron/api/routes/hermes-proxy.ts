import type { IncomingMessage, ServerResponse } from 'http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';

const HERMES_PORT = 8648;
const HERMES_BASE = `http://127.0.0.1:${HERMES_PORT}`;

function getHermesToken(): string | null {
  const hermesHome = process.env.HERMES_WEB_UI_HOME;
  if (!hermesHome) return null;
  const tokenPath = join(hermesHome, '.token');
  try {
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Proxy requests from /api/hermes/proxy/* to Hermes Server (:8648).
 * The main process injects the correct Bearer token so the renderer
 * never needs to know it.
 */
export async function handleHermesProxyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  const proxyPrefix = '/api/hermes/proxy';
  if (!url.pathname.startsWith(proxyPrefix)) {
    return false;
  }

  const targetPath = url.pathname.slice(proxyPrefix.length) || '/';
  const targetUrl = `${HERMES_BASE}/api/hermes${targetPath}${url.search}`;

  const token = getHermesToken();
  if (!token) {
    sendJson(res, 503, { success: false, error: 'Hermes Server token not available' });
    return true;
  }

  // Collect request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body,
    });

    const responseBody = await response.arrayBuffer();
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (key === 'transfer-encoding' || key === 'connection') return;
      res.setHeader(key, value);
    });
    res.end(Buffer.from(responseBody));
  } catch (error) {
    sendJson(res, 502, { success: false, error: `Hermes proxy failed: ${String(error)}` });
  }

  return true;
}
