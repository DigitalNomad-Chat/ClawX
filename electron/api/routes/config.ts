/**
 * OpenClaw Config Routes
 * Read/write the full openclaw.json configuration.
 *
 * These endpoints give the Advanced Config page direct file-level access
 * to ~/.openclaw/openclaw.json so it can manage tools, session, agents,
 * hooks, skills, messages, commands and wizard sections.
 */
import { stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { IncomingMessage, ServerResponse } from 'http';
import { readOpenClawConfig, writeOpenClawConfig } from '../../utils/channel-config';
import { withConfigLock } from '../../utils/config-mutex';
import { logger } from '../../utils/logger';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';

const CONFIG_FILE = join(homedir(), '.openclaw', 'openclaw.json');

export async function handleConfigRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // ── GET /api/config ──────────────────────────────────────────────
  // Return the full openclaw.json with file metadata.
  if (url.pathname === '/api/config' && req.method === 'GET') {
    try {
      const config = await readOpenClawConfig();
      let fileInfo: { path: string; modifiedAt?: string; size?: number } = { path: CONFIG_FILE };
      try {
        const s = await stat(CONFIG_FILE);
        fileInfo.modifiedAt = s.mtime.toISOString();
        fileInfo.size = s.size;
      } catch { /* file may not exist yet */ }
      sendJson(res, 200, { success: true, config, fileInfo });
    } catch (error) {
      logger.error('Failed to read config', error);
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── POST /api/config ─────────────────────────────────────────────
  // Write the full openclaw.json (replaces entire file).
  if (url.pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ config: Record<string, unknown> }>(req);
      if (!body.config || typeof body.config !== 'object') {
        sendJson(res, 400, { success: false, error: 'Missing config object in request body' });
        return true;
      }
      await withConfigLock(async () => {
        await writeOpenClawConfig(body.config as Parameters<typeof writeOpenClawConfig>[0]);
      });
      sendJson(res, 200, { success: true });
    } catch (error) {
      logger.error('Failed to write config', error);
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── GET /api/config/agents ───────────────────────────────────────
  // Return agents.list and agents.defaults from openclaw.json.
  if (url.pathname === '/api/config/agents' && req.method === 'GET') {
    try {
      const config = await readOpenClawConfig();
      const agents = config.agents as Record<string, unknown> | undefined;
      sendJson(res, 200, {
        success: true,
        list: agents?.list ?? [],
        defaults: agents?.defaults ?? {},
      });
    } catch (error) {
      logger.error('Failed to read agent config', error);
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── GET /api/config/skills ───────────────────────────────────────
  // Return the installed skills grouped by source (workspace / agent).
  if (url.pathname === '/api/config/skills' && req.method === 'GET') {
    try {
      const config = await readOpenClawConfig();
      const skills = config.skills as Record<string, unknown> | undefined;
      sendJson(res, 200, {
        success: true,
        load: skills?.load ?? {},
        entries: skills?.entries ?? {},
      });
    } catch (error) {
      logger.error('Failed to read skill config', error);
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
