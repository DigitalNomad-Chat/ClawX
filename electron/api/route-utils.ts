import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Check whether an origin is a local loopback address.
 *
 * The Host API only listens on 127.0.0.1 and requires a per-session
 * random Bearer token for every request, so the CORS policy is not
 * the primary security boundary.  Accepting any localhost origin
 * (regardless of port) keeps things simple when Vite auto-increments
 * its dev-server port or when the Electron renderer is served from a
 * non-default port.
 */
function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      && url.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

/**
 * Validate that mutation requests (POST/PUT/DELETE) carry a JSON Content-Type.
 * This prevents "simple request" CSRF where the browser skips the preflight
 * when Content-Type is text/plain or application/x-www-form-urlencoded.
 */
export function requireJsonContentType(req: IncomingMessage): boolean {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
    return true;
  }
  // Requests without a body (content-length 0 or absent) are safe — CSRF
  // "simple request" attacks rely on sending a crafted body.
  const contentLength = req.headers['content-length'];
  if (contentLength === '0' || contentLength === undefined) {
    return true;
  }
  const ct = req.headers['content-type'] || '';
  return ct.includes('application/json');
}

export function setCorsHeaders(res: ServerResponse, origin?: string): void {
  // Accept any localhost origin — the per-session Bearer token already
  // provides strong authentication; CORS is a secondary defence.
  if (origin && isLocalhostOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendNoContent(res: ServerResponse): void {
  res.statusCode = 204;
  res.end();
}

export function sendText(res: ServerResponse, statusCode: number, text: string): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}
