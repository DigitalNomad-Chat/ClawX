import type { IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody, sendJson } from '../route-utils';
import type { HostApiContext } from '../context';
import { desensitize, restore } from '../services/desensitize';

export async function handleDesensitizeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/desensitize' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ text: string }>(req);
      if (!body.text || typeof body.text !== 'string') {
        sendJson(res, 400, { success: false, error: 'text field is required' });
        return true;
      }
      const result = desensitize(body.text);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/desensitize/restore' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ text: string; map: Record<string, string> }>(req);
      if (!body.text || typeof body.text !== 'string' || !body.map || typeof body.map !== 'object') {
        sendJson(res, 400, { success: false, error: 'text and map fields are required' });
        return true;
      }
      const result = restore(body.text, body.map);
      sendJson(res, 200, { success: true, text: result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
