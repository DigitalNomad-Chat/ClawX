/**
 * Feishu User Cache
 * Extracts and caches sender information from:
 *   1. OpenClaw WebSocket events (chat:message, notification)
 *   2. OpenClaw session log files (~/.openclaw/agents/ * /sessions/ * .jsonl)
 * This avoids needing Feishu contact API permissions (contact:user.base:readonly).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { getDataDir, ensureDir, getOpenClawConfigDir } from './paths';
import { logger } from './logger';

export interface FeishuKnownUser {
  openId: string;
  name: string;
  lastMessagePreview: string;
  lastSeenAt: number;
  agentId?: string;
}

const CACHE_FILE = `${getDataDir()}/cache/feishu-known-users.json`;
const MAX_CACHE_SIZE = 200;

const cache = new Map<string, FeishuKnownUser>();
let cacheLoaded = false;

function loadCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as FeishuKnownUser[];
      for (const user of data) {
        if (user.openId && typeof user.openId === 'string') {
          cache.set(user.openId, user);
        }
      }
      logger.info(`[FeishuUserCache] Loaded ${cache.size} users from disk`);
    }
  } catch (err) {
    logger.debug('[FeishuUserCache] Failed to load cache:', err);
  }
}

function saveCache(): void {
  try {
    ensureDir(dirname(CACHE_FILE));
    const data = Array.from(cache.values());
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.debug('[FeishuUserCache] Failed to save cache:', err);
  }
}

function findSenderInObject(obj: Record<string, unknown>): { openId: string; name: string } | null {
  if (typeof obj.senderId === 'string' && obj.senderId) {
    const name = typeof obj.senderName === 'string' ? obj.senderName : obj.senderId.slice(0, 8);
    return { openId: obj.senderId, name };
  }
  if (typeof obj.requesterSenderId === 'string' && obj.requesterSenderId) {
    return { openId: obj.requesterSenderId, name: obj.requesterSenderId.slice(0, 8) };
  }
  if (typeof obj.userId === 'string' && obj.userId) {
    return { openId: obj.userId, name: obj.userId.slice(0, 8) };
  }
  if (obj.sender && typeof obj.sender === 'object' && obj.sender !== null) {
    const s = obj.sender as Record<string, unknown>;
    let openId: string | undefined;
    if (typeof s.open_id === 'string') openId = s.open_id;
    else if (typeof s.id === 'string') openId = s.id;
    else if (typeof s.openId === 'string') openId = s.openId;
    if (openId) {
      let name = '';
      if (typeof s.name === 'string') name = s.name;
      else if (typeof s.displayName === 'string') name = s.displayName;
      else if (typeof s.username === 'string') name = s.username;
      if (!name) name = openId.slice(0, 8);
      return { openId, name };
    }
  }
  if (obj.from && typeof obj.from === 'object' && obj.from !== null) {
    const f = obj.from as Record<string, unknown>;
    if (typeof f.id === 'string' && f.id) {
      return { openId: f.id, name: typeof f.name === 'string' ? f.name : f.id.slice(0, 8) };
    }
    if (typeof f.open_id === 'string' && f.open_id) {
      return { openId: f.open_id, name: typeof f.name === 'string' ? f.name : f.open_id.slice(0, 8) };
    }
  }
  if (obj.metadata && typeof obj.metadata === 'object' && obj.metadata !== null) {
    const m = obj.metadata as Record<string, unknown>;
    if (typeof m.senderId === 'string' && m.senderId) {
      return { openId: m.senderId, name: m.senderId.slice(0, 8) };
    }
    if (typeof m.openId === 'string' && m.openId) {
      return { openId: m.openId, name: m.openId.slice(0, 8) };
    }
    const nested = findSenderInObject(m);
    if (nested) return nested;
  }
  return null;
}

function extractMessagePreview(payload: Record<string, unknown>): string {
  let text = '';
  if (typeof payload.text === 'string') text = payload.text;
  else if (typeof payload.content === 'string') text = payload.content;
  else if (typeof payload.message === 'string') text = payload.message;
  else if (Array.isArray(payload.content)) {
    const texts = payload.content
      .filter((c: unknown) => c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text')
      .map((c: unknown) => (c as Record<string, unknown>).text)
      .filter((t: unknown): t is string => typeof t === 'string');
    text = texts.join(' ');
  } else if (payload.content && typeof payload.content === 'object') {
    const c = payload.content as Record<string, unknown>;
    if (typeof c.text === 'string') text = c.text;
  }
  return text.trim().slice(0, 100);
}

function tryExtractSender(data: unknown): { openId: string; name: string; messagePreview: string } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if ('message' in d && typeof d.message === 'object' && d.message !== null) {
    const payload = d.message as Record<string, unknown>;
    const sender = findSenderInObject(payload);
    if (sender) return { ...sender, messagePreview: extractMessagePreview(payload) };
    if (payload.message && typeof payload.message === 'object' && payload.message !== null) {
      const inner = payload.message as Record<string, unknown>;
      const innerSender = findSenderInObject(inner);
      if (innerSender) return { ...innerSender, messagePreview: extractMessagePreview(inner) };
    }
  }

  if ('params' in d && typeof d.params === 'object' && d.params !== null) {
    const params = d.params as Record<string, unknown>;
    const sender = findSenderInObject(params);
    if (sender) return { ...sender, messagePreview: extractMessagePreview(params) };
    const nested = params.data ?? params.message ?? params.payload;
    if (nested && typeof nested === 'object' && nested !== null) {
      const nestedObj = nested as Record<string, unknown>;
      const nestedSender = findSenderInObject(nestedObj);
      if (nestedSender) return { ...nestedSender, messagePreview: extractMessagePreview(nestedObj) };
    }
  }

  const sender = findSenderInObject(d);
  if (sender) return { ...sender, messagePreview: extractMessagePreview(d) };

  return null;
}

const FEISHU_PROMPT_RE = /Feishu\[[^\]]+\]\s+(?:DM|group\s+[^\s|]+)\s+\|\s+(ou_[a-f0-9]+)/g;
const FEISHU_NAME_RE = /"chat_id"\s*:\s*"user:([^"]+)"/;

function extractPromptText(record: Record<string, unknown>): string {
  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return '';
  return typeof data.prompt === 'string'
    ? data.prompt
    : typeof data.finalPromptText === 'string'
      ? data.finalPromptText
      : '';
}

function extractUserMessagePreview(prompt: string): string {
  // OpenClaw prompts have metadata blocks followed by '\n\n' then the user message.
  // Handle both '}\n\n' (3 chars) and '```\n\n' (5 chars) separators correctly.
  const braceEnd = prompt.lastIndexOf('}\n\n');
  const codeEnd = prompt.lastIndexOf('```\n\n');
  let content = '';
  if (codeEnd > braceEnd) {
    content = prompt.slice(codeEnd + 5).trim();
  } else if (braceEnd !== -1) {
    content = prompt.slice(braceEnd + 3).trim();
  }
  // Filter out session-start system prompts
  if (!content || content.startsWith('A new session was started')) {
    return '';
  }
  return content.split('\n---\n')[0].slice(0, 100);
}

async function scanTrajectoryFile(
  filePath: string,
  debug?: ScanDebugInfo
): Promise<Array<{ openId: string; name: string; preview: string; ts: number; agentId: string }>> {
  const users: Array<{ openId: string; name: string; preview: string; ts: number; agentId: string }> = [];
  const agentMatch = filePath.match(/agents\/([^/]+)\/sessions\//);
  const agentId = agentMatch ? agentMatch[1] : 'unknown';
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(-800);
    for (const line of lines) {
      try {
        // Fast path: skip lines that don't contain Feishu at all
        if (!line.includes('Feishu[')) continue;

        const record = JSON.parse(line);
        const prompt = extractPromptText(record);
        if (!prompt) continue;

        debug && (debug.totalPromptsChecked++);
        const ts = typeof record.ts === 'string'
          ? new Date(record.ts).getTime()
          : Date.now();

        // Extract all open_ids from Feishu DM lines in the prompt
        const matches = prompt.matchAll(FEISHU_PROMPT_RE);
        let matchCount = 0;
        for (const m of matches) {
          matchCount++;
          const openId = m[1];
          // Try to extract user name from conversation metadata JSON block
          const nameMatch = prompt.match(FEISHU_NAME_RE);
          const name = nameMatch ? nameMatch[1].slice(0, 16) : openId.slice(0, 8);
          const preview = extractUserMessagePreview(prompt);
          users.push({ openId, name, preview, ts, agentId });
        }
        if (matchCount > 0 && debug) {
          debug.totalFeishuPrompts += matchCount;
        }
      } catch {
        // skip invalid JSON lines
      }
    }
  } catch {
    // ignore unreadable files
  }
  return users;
}

async function listSessionFiles(agentId?: string): Promise<string[]> {
  const agentsDir = join(getOpenClawConfigDir(), 'agents');
  if (!existsSync(agentsDir)) return [];

  const files: string[] = [];
  try {
    const agentDirs = await readdir(agentsDir, { withFileTypes: true });
    for (const agentDir of agentDirs) {
      if (!agentDir.isDirectory()) continue;
      if (agentId && agentDir.name !== agentId) continue;
      const sessionsDir = join(agentsDir, agentDir.name, 'sessions');
      if (!existsSync(sessionsDir)) continue;
      const entries = await readdir(sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.trajectory.jsonl')) {
          files.push(join(sessionsDir, entry.name));
        }
      }
    }
  } catch {
    // ignore
  }
  return files;
}

export async function listAgentsWithSessions(): Promise<Array<{ id: string; name: string; fileCount: number }>> {
  const agentsDir = join(getOpenClawConfigDir(), 'agents');
  if (!existsSync(agentsDir)) return [];

  const result: Array<{ id: string; name: string; fileCount: number }> = [];
  try {
    const agentDirs = await readdir(agentsDir, { withFileTypes: true });
    for (const agentDir of agentDirs) {
      if (!agentDir.isDirectory()) continue;
      const sessionsDir = join(agentsDir, agentDir.name, 'sessions');
      if (!existsSync(sessionsDir)) continue;
      const entries = await readdir(sessionsDir, { withFileTypes: true });
      const fileCount = entries.filter((e) => e.isFile() && e.name.endsWith('.trajectory.jsonl')).length;
      if (fileCount === 0) continue;
      result.push({ id: agentDir.name, name: agentDir.name, fileCount });
    }
  } catch {
    // ignore
  }
  return result;
}

export interface ScanDebugInfo {
  totalFiles: number;
  scannedFiles: number;
  filesWithMatches: number;
  totalPromptsChecked: number;
  totalFeishuPrompts: number;
  recentFileNames: string[];
}

export async function scanOpenClawSessionsForFeishuUsers(agentId?: string): Promise<{
  users: FeishuKnownUser[];
  debug: ScanDebugInfo;
}> {
  const files = await listSessionFiles(agentId);
  const debug: ScanDebugInfo = {
    totalFiles: files.length,
    scannedFiles: 0,
    filesWithMatches: 0,
    totalPromptsChecked: 0,
    totalFeishuPrompts: 0,
    recentFileNames: [],
  };

  if (files.length === 0) {
    logger.info(`[FeishuUserCache] No trajectory files found${agentId ? ` for agent ${agentId}` : ''}`);
    return { users: [], debug };
  }

  const filesWithMtime: Array<{ path: string; mtime: number }> = [];
  for (const f of files) {
    try {
      const s = await stat(f);
      filesWithMtime.push({ path: f, mtime: s.mtimeMs });
    } catch {
      // ignore
    }
  }
  filesWithMtime.sort((a, b) => b.mtime - a.mtime);
  // When scoped to a specific agent, scan all of its files (agents typically have
  // 5-50 trajectory files). When scanning globally, cap per-agent so inactive
  // agents aren't drowned out by very active ones (e.g. knowledge-clipper).
  let recentFiles: string[];
  if (agentId) {
    recentFiles = filesWithMtime.map((f) => f.path);
  } else {
    const perAgent = new Map<string, Array<{ path: string; mtime: number }>>();
    for (const f of filesWithMtime) {
      const match = f.path.match(/agents\/([^/]+)\/sessions\//);
      const id = match ? match[1] : 'unknown';
      const arr = perAgent.get(id) ?? [];
      arr.push(f);
      perAgent.set(id, arr);
    }
    recentFiles = [];
    for (const arr of perAgent.values()) {
      recentFiles.push(...arr.slice(0, 30).map((f) => f.path));
    }
  }
  debug.scannedFiles = recentFiles.length;
  debug.recentFileNames = recentFiles.map((f) => basename(f));

  const allUsers = new Map<string, FeishuKnownUser>();
  for (const filePath of recentFiles) {
    const users = await scanTrajectoryFile(filePath, debug);
    if (users.length > 0) {
      debug.filesWithMatches++;
    }
    for (const u of users) {
      const existing = allUsers.get(u.openId);
      if (!existing || u.ts > existing.lastSeenAt) {
        allUsers.set(u.openId, {
          openId: u.openId,
          name: u.name,
          lastMessagePreview: u.preview,
          lastSeenAt: u.ts,
          agentId: u.agentId,
        });
      }
    }
  }

  const users = Array.from(allUsers.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  logger.info(
    `[FeishuUserCache] Scan complete${agentId ? ` (${agentId})` : ''}: ${users.length} users from ${debug.filesWithMatches}/${debug.scannedFiles} files (${debug.totalFeishuPrompts} Feishu prompts checked)`
  );
  return { users, debug };
}

export function extractAndCacheFeishuUser(data: unknown): void {
  loadCache();
  const sender = tryExtractSender(data);
  if (!sender) return;

  cache.set(sender.openId, {
    openId: sender.openId,
    name: sender.name,
    lastMessagePreview: sender.messagePreview,
    lastSeenAt: Date.now(),
  });

  if (cache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(cache.entries()).sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);
    const toDelete = sorted.slice(0, cache.size - MAX_CACHE_SIZE);
    for (const [key] of toDelete) cache.delete(key);
  }

  saveCache();
  logger.info(`[FeishuUserCache] Cached user from event: ${sender.name} (${sender.openId})`);
}

export async function getCachedFeishuUsers(): Promise<FeishuKnownUser[]> {
  loadCache();
  const cached = Array.from(cache.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  if (cached.length > 0) return cached;

  logger.info('[FeishuUserCache] Cache empty, scanning OpenClaw session files...');
  const { users: fromSessions } = await scanOpenClawSessionsForFeishuUsers();
  if (fromSessions.length > 0) {
    for (const u of fromSessions) {
      cache.set(u.openId, u);
    }
    saveCache();
    logger.info(`[FeishuUserCache] Scanned ${fromSessions.length} users from session files`);
  }
  return fromSessions;
}

export function clearFeishuUserCache(): void {
  cache.clear();
  try {
    if (existsSync(CACHE_FILE)) {
      writeFileSync(CACHE_FILE, '[]', 'utf-8');
    }
  } catch {
    // ignore
  }
}
