/**
 * Document Session Store — Electron-store backed persistence for document processing sessions
 */

import type { DocumentSession } from '../../../src/modules/office-tools/types';

let sessionStoreInstance: any = null;

async function getSessionStore() {
  if (!sessionStoreInstance) {
    const Store = (await import('electron-store')).default;
    sessionStoreInstance = new Store({
      name: 'clawdock-document-sessions',
      defaults: {
        schemaVersion: 1,
        sessions: [] as DocumentSession[],
      },
    });
  }
  return sessionStoreInstance;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listSessions(): Promise<DocumentSession[]> {
  const store = await getSessionStore();
  const sessions = (store.get('sessions') ?? []) as DocumentSession[];
  return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getSession(id: string): Promise<DocumentSession | null> {
  const sessions = await listSessions();
  return sessions.find((s) => s.id === id) ?? null;
}

export async function createSession(data: Omit<DocumentSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<DocumentSession> {
  const store = await getSessionStore();
  const sessions = (store.get('sessions') ?? []) as DocumentSession[];
  const session: DocumentSession = {
    ...data,
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  sessions.push(session);
  store.set('sessions', sessions);
  return session;
}

export async function updateSession(id: string, patch: Partial<Omit<DocumentSession, 'id' | 'createdAt'>>): Promise<DocumentSession | null> {
  const store = await getSessionStore();
  const sessions = (store.get('sessions') ?? []) as DocumentSession[];
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  sessions[idx] = { ...sessions[idx], ...patch, updatedAt: nowIso() };
  store.set('sessions', sessions);
  return sessions[idx];
}

export async function deleteSession(id: string): Promise<boolean> {
  const store = await getSessionStore();
  const sessions = (store.get('sessions') ?? []) as DocumentSession[];
  const filtered = sessions.filter((s) => s.id !== id);
  if (filtered.length === sessions.length) return false;
  store.set('sessions', filtered);
  return true;
}

export async function deleteAllSessions(): Promise<void> {
  const store = await getSessionStore();
  store.set('sessions', []);
}
