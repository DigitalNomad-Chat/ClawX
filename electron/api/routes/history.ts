import type { IncomingMessage, ServerResponse } from 'http';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { getOpenClawConfigDir } from '../../utils/paths';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';

const SAFE_SESSION_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

interface RawMessage {
  role: string;
  content: unknown;
  timestamp?: number;
  id?: string;
  [key: string]: unknown;
}

interface SessionEntry {
  key: string;
  label?: string;
  displayName?: string;
  thinkingLevel?: string;
  model?: string;
  updatedAt?: number;
}

/**
 * Resolve the JSONL file path for a session key by reading sessions.json.
 */
async function resolveSessionJsonlPath(sessionKey: string): Promise<string | null> {
  if (!sessionKey.startsWith('agent:')) return null;
  const parts = sessionKey.split(':');
  if (parts.length < 3) return null;
  const agentId = parts[1];
  if (!SAFE_SESSION_SEGMENT.test(agentId)) return null;

  const sessionsDir = join(getOpenClawConfigDir(), 'agents', agentId, 'sessions');
  const sessionsJsonPath = join(sessionsDir, 'sessions.json');

  try {
    const raw = await readFile(sessionsJsonPath, 'utf8');
    const sessionsJson = JSON.parse(raw) as Record<string, unknown>;

    let uuidFileName: string | undefined;
    // Format A: { sessions: [{ key, file, ... }] }
    if (Array.isArray(sessionsJson.sessions)) {
      const entry = (sessionsJson.sessions as Array<Record<string, unknown>>)
        .find((s) => s.key === sessionKey || s.sessionKey === sessionKey);
      if (entry) {
        uuidFileName = (entry.file ?? entry.fileName ?? entry.path) as string | undefined;
        if (!uuidFileName && typeof entry.id === 'string') {
          uuidFileName = `${entry.id}.jsonl`;
        }
      }
    }
    // Format B: { [sessionKey]: { sessionFile, ... } }
    if (!uuidFileName && sessionsJson[sessionKey] != null) {
      const val = sessionsJson[sessionKey];
      if (typeof val === 'string') {
        uuidFileName = val;
      } else if (typeof val === 'object' && val !== null) {
        const entry = val as Record<string, unknown>;
        const absFile = (entry.sessionFile ?? entry.file ?? entry.fileName ?? entry.path) as string | undefined;
        if (absFile) {
          if (absFile.startsWith('/') || absFile.match(/^[A-Za-z]:\\/)) {
            return absFile;
          }
          uuidFileName = absFile;
        } else {
          const uuidVal = (entry.id ?? entry.sessionId) as string | undefined;
          if (uuidVal) uuidFileName = uuidVal.endsWith('.jsonl') ? uuidVal : `${uuidVal}.jsonl`;
        }
      }
    }

    if (!uuidFileName) return null;
    if (!uuidFileName.endsWith('.jsonl')) uuidFileName = `${uuidFileName}.jsonl`;
    return join(sessionsDir, uuidFileName);
  } catch {
    return null;
  }
}

/**
 * Stream-read a JSONL file and keep only the last `limit` messages.
 * Memory usage is O(limit), not O(file size).
 */
async function readLastMessagesFromJsonl(filePath: string, limit: number): Promise<RawMessage[]> {
  const startedAt = Date.now();
  const ring: string[] = new Array(limit);
  let count = 0;
  let head = 0;

  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    ring[head] = line;
    head = (head + 1) % limit;
    count += 1;
  }

  const messages: RawMessage[] = [];
  const effectiveCount = Math.min(count, limit);
  for (let i = 0; i < effectiveCount; i += 1) {
    const idx = (head + limit - effectiveCount + i) % limit;
    const line = ring[idx];
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as { type?: string; message?: unknown };
      if (parsed.type === 'message' && parsed.message) {
        messages.push(parsed.message as RawMessage);
      }
    } catch {
      // Skip malformed lines
    }
  }

  console.log(`[history] readLastMessagesFromJsonl: ${filePath} limit=${limit} lines=${count} msgs=${messages.length} in ${Date.now() - startedAt}ms`);
  return messages;
}

/**
 * Parse a sessions.json file into normalized session entries.
 * Handles all three known formats.
 */
async function parseSessionsJson(filePath: string, agentId: string): Promise<SessionEntry[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const entries: SessionEntry[] = [];

    // Format A / C: { sessions: [{ key, label, displayName, thinkingLevel, model, updatedAt, id, file, fileName, path }] }
    if (Array.isArray(json.sessions)) {
      for (const s of json.sessions as Array<Record<string, unknown>>) {
        const key = String(s.key || s.sessionKey || '');
        if (!key) continue;
        entries.push({
          key,
          label: s.label ? String(s.label) : undefined,
          displayName: s.displayName ? String(s.displayName) : undefined,
          thinkingLevel: s.thinkingLevel ? String(s.thinkingLevel) : undefined,
          model: s.model ? String(s.model) : undefined,
          updatedAt: parseSessionUpdatedAtMs(s.updatedAt),
        });
      }
    }

    // Format B: { [sessionKey]: { sessionFile, label, displayName, updatedAt, ... } }
    for (const [key, val] of Object.entries(json)) {
      if (key === 'sessions') continue;
      if (!key || typeof val !== 'object' || val === null) continue;
      const entry = val as Record<string, unknown>;
      entries.push({
        key,
        label: entry.label ? String(entry.label) : undefined,
        displayName: entry.displayName ? String(entry.displayName) : undefined,
        thinkingLevel: entry.thinkingLevel ? String(entry.thinkingLevel) : undefined,
        model: entry.model ? String(entry.model) : undefined,
        updatedAt: parseSessionUpdatedAtMs(entry.updatedAt),
      });
    }

    return entries;
  } catch {
    return [];
  }
}

function parseSessionUpdatedAtMs(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Scan all agent session directories and collect session entries.
 */
async function listAllSessionsFast(): Promise<SessionEntry[]> {
  const startedAt = Date.now();
  const agentsDir = join(getOpenClawConfigDir(), 'agents');
  const sessions: SessionEntry[] = [];

  let agentIds: string[] = [];
  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    agentIds = entries.filter((e) => e.isDirectory() && SAFE_SESSION_SEGMENT.test(e.name)).map((e) => e.name);
  } catch {
    return sessions;
  }

  await Promise.all(
    agentIds.map(async (agentId) => {
      const sessionsJsonPath = join(agentsDir, agentId, 'sessions', 'sessions.json');
      const agentSessions = await parseSessionsJson(sessionsJsonPath, agentId);
      sessions.push(...agentSessions);
    }),
  );

  // Deduplicate: keep canonical (agent:xxx:key) over short (key) forms
  const canonicalBySuffix = new Map<string, string>();
  for (const s of sessions) {
    if (!s.key.startsWith('agent:')) continue;
    const parts = s.key.split(':');
    if (parts.length < 3) continue;
    const suffix = parts.slice(2).join(':');
    if (suffix && !canonicalBySuffix.has(suffix)) {
      canonicalBySuffix.set(suffix, s.key);
    }
  }

  const seen = new Set<string>();
  const result = sessions.filter((s) => {
    if (!s.key.startsWith('agent:') && canonicalBySuffix.has(s.key)) return false;
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });

  console.log(`[history] listAllSessionsFast: agents=${agentIds.length} sessions=${result.length} in ${Date.now() - startedAt}ms`);
  return result;
}

export async function handleHistoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/sessions/history' && req.method === 'GET') {
    try {
      const sessionKey = url.searchParams.get('sessionKey')?.trim() || '';
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? Math.min(1000, Math.max(1, parseInt(limitParam, 10))) : 30;

      if (!sessionKey) {
        sendJson(res, 400, { success: false, error: 'sessionKey is required' });
        return true;
      }

      const filePath = await resolveSessionJsonlPath(sessionKey);
      if (!filePath) {
        sendJson(res, 404, { success: false, error: 'Session not found' });
        return true;
      }

      const messages = await readLastMessagesFromJsonl(filePath, limit);

      sendJson(res, 200, {
        success: true,
        messages,
        sessionKey,
        count: messages.length,
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/sessions/list' && req.method === 'GET') {
    try {
      const sessions = await listAllSessionsFast();
      sendJson(res, 200, {
        success: true,
        sessions,
        count: sessions.length,
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
