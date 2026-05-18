/**
 * Chat History Store - Persistent storage for AgentChat conversation history
 * Saves/loads chat sessions to/from JSON file in user's data directory
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { app } from 'electron';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    name: string;
    input: unknown;
    status: 'running' | 'completed' | 'error';
    duration?: number;
    startTime: number;
  }>;
  timestamp?: number;
}

export interface ChatSession {
  sessionId: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface HistoryStore {
  version: number;
  sessions: ChatSession[];
}

const STORE_VERSION = 1;
const MAX_SESSIONS = 100;

function getHistoryPath(): string {
  const userData = app.getPath('userData');
  return resolve(userData, 'chat-history.json');
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readStore(): HistoryStore {
  const path = getHistoryPath();
  if (!existsSync(path)) {
    return { version: STORE_VERSION, sessions: [] };
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as HistoryStore;
    if (!data.sessions || !Array.isArray(data.sessions)) {
      return { version: STORE_VERSION, sessions: [] };
    }
    return data;
  } catch {
    return { version: STORE_VERSION, sessions: [] };
  }
}

function writeStore(store: HistoryStore): void {
  const path = getHistoryPath();
  ensureDir(path);
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf8');
}

// ─── Public API ───────────────────────────────────────────────────────

export function listSessions(agentId?: string): ChatSession[] {
  const store = readStore();
  let sessions = store.sessions;
  if (agentId) {
    sessions = sessions.filter((s) => s.agentId === agentId);
  }
  // Sort by updatedAt desc
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(sessionId: string): ChatSession | null {
  const store = readStore();
  return store.sessions.find((s) => s.sessionId === sessionId) || null;
}

export function saveSession(session: ChatSession): void {
  const store = readStore();
  const idx = store.sessions.findIndex((s) => s.sessionId === session.sessionId);

  if (idx >= 0) {
    store.sessions[idx] = session;
  } else {
    store.sessions.push(session);
  }

  // Keep only most recent MAX_SESSIONS
  if (store.sessions.length > MAX_SESSIONS) {
    store.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    store.sessions = store.sessions.slice(0, MAX_SESSIONS);
  }

  writeStore(store);
}

export function deleteSession(sessionId: string): boolean {
  const store = readStore();
  const len = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.sessionId !== sessionId);
  if (store.sessions.length < len) {
    writeStore(store);
    return true;
  }
  return false;
}

export function clearAgentSessions(agentId: string): number {
  const store = readStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.agentId !== agentId);
  const removed = before - store.sessions.length;
  if (removed > 0) {
    writeStore(store);
  }
  return removed;
}
