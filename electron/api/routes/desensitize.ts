import type { IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody, sendJson } from '../route-utils';
import type { HostApiContext } from '../context';
import { desensitize, restore, markSensitive, batchMarkSensitive } from '../services/desensitize';
import type { BatchMarkItem } from '../services/desensitize';

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
      sendJson(res, 200, { success: true, text: result.text, map: result.map, stats: result.stats });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/desensitize/mark' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        text: string;
        map: Record<string, string>;
        selection: string;
        type: string;
      }>(req);
      if (!body.text || typeof body.text !== 'string' || !body.map || typeof body.map !== 'object') {
        sendJson(res, 400, { success: false, error: 'text and map fields are required' });
        return true;
      }
      if (!body.selection || typeof body.selection !== 'string') {
        sendJson(res, 400, { success: false, error: 'selection field is required' });
        return true;
      }
      if (!body.type || typeof body.type !== 'string') {
        sendJson(res, 400, { success: false, error: 'type field is required' });
        return true;
      }
      const result = markSensitive(body.text, body.map, body.selection, body.type);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/desensitize/edit' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        text: string;
        map: Record<string, string>;
      }>(req);
      if (!body.text || typeof body.text !== 'string' || !body.map || typeof body.map !== 'object') {
        sendJson(res, 400, { success: false, error: 'text and map fields are required' });
        return true;
      }
      // Edit simply accepts the new text; map stays the same.
      sendJson(res, 200, { success: true, text: body.text, map: body.map });
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

  if (url.pathname === '/api/desensitize/batch-mark' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        text: string;
        map: Record<string, string>;
        items: BatchMarkItem[];
      }>(req);
      if (!body.text || typeof body.text !== 'string' || !body.map || typeof body.map !== 'object') {
        sendJson(res, 400, { success: false, error: 'text and map fields are required' });
        return true;
      }
      if (!Array.isArray(body.items)) {
        sendJson(res, 400, { success: false, error: 'items must be an array' });
        return true;
      }
      const result = batchMarkSensitive(body.text, body.map, body.items);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
