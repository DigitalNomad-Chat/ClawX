import { invokeIpc } from '@/lib/api-client';
import { normalizeAppError } from './error-model';

const HERMES_API_PORT = 8648;
const HERMES_API_BASE = `http://127.0.0.1:${HERMES_API_PORT}`;

/** Cached Hermes Server auth token, fetched once from the main process via IPC. */
let cachedHermesToken: string | null = null;

export async function getHermesApiToken(): Promise<string> {
  if (cachedHermesToken) return cachedHermesToken;
  try {
    const token = await invokeIpc<string>('hermesapi:token');
    if (token) {
      cachedHermesToken = token;
    }
  } catch {
    // ignore IPC errors; will retry next call
  }
  return cachedHermesToken ?? '';
}

export function invalidateHermesToken(): void {
  cachedHermesToken = null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // ignore body parse failure
    }
    throw normalizeAppError(new Error(message), {
      source: 'hermes-api',
      status: response.status,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return await response.json() as T;
}

export async function hermesApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const startedAt = Date.now();
  const method = init?.method || 'GET';

  async function doFetch(retryOn401: boolean): Promise<T> {
    const token = await getHermesApiToken();
    const response = await fetch(`${HERMES_API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });

    if (response.status === 401 && retryOn401) {
      invalidateHermesToken();
      return doFetch(false);
    }

    return parseResponse<T>(response);
  }

  try {
    return await doFetch(true);
  } catch (error) {
    throw normalizeAppError(error, {
      source: 'hermes-api',
      path,
      method,
      durationMs: Date.now() - startedAt,
    });
  }
}

export function createHermesEventSource(path = '/api/events'): EventSource {
  const separator = path.includes('?') ? '&' : '?';
  const tokenParam = `token=${encodeURIComponent(cachedHermesToken ?? '')}`;
  return new EventSource(`${HERMES_API_BASE}${path}${separator}${tokenParam}`);
}

export function getHermesApiBase(): string {
  return HERMES_API_BASE;
}
