import { invokeIpc } from '@/lib/api-client';
import { trackUiEvent } from './telemetry';
import { normalizeAppError } from './error-model';
import { invokeHost } from './host-api-client';
import { normalizeUsageHistoryEntries } from './usage-history-entries';
const HOST_API_PORT = 13210;
const HOST_API_BASE = `http://127.0.0.1:${HOST_API_PORT}`;

/**
 * Typed hostApi facade (P4a–P4b-B5).
 * Uses host:invoke first; falls back to hostApiFetch / legacy IPC via invokeHost.
 * Intentionally omits updates service, skills/providers writes, chat/sessions/media,
 * full settings CRUD, cron list/create/update, gateway control.
 */
export const hostApi = {
  app: {
    openClawDoctor: (mode?: 'fix' | string) =>
      invokeHost('app', 'openClawDoctor', mode ? { mode } : undefined),
  },
  /**
   * OpenClaw package path/CLI read helpers (registered on Main).
   * status since P4a; dir/CLI helpers added in P4b-B4.
   */
  openclaw: {
    status: () => invokeHost('openclaw', 'status'),
    getDir: () => invokeHost<string>('openclaw', 'getDir'),
    getConfigDir: () => invokeHost<string>('openclaw', 'getConfigDir'),
    getSkillsDir: () => invokeHost<string>('openclaw', 'getSkillsDir'),
    getCliCommand: () =>
      invokeHost<{ success: boolean; command?: string; error?: string }>(
        'openclaw',
        'getCliCommand',
      ),
  },
  usage: {
    /**
     * Always returns an array. Host/HTTP payloads that wrap entries under
     * `{ entries|items|data|... }` are unwrapped; non-list values become [].
     * Prevents Models page `.map` crashes (TypeError: a.map is not a function).
     */
    recentTokenHistory: async (limit?: number) => {
      const raw = await invokeHost(
        'usage',
        'recentTokenHistory',
        limit !== undefined ? { limit } : undefined,
      );
      return normalizeUsageHistoryEntries(raw);
    },
  },
  /** P4b-B1 — window chrome controls (legacy window:* IPC fallback). */
  window: {
    minimize: () => invokeHost('window', 'minimize'),
    maximize: () => invokeHost('window', 'maximize'),
    close: () => invokeHost('window', 'close'),
    isMaximized: () => invokeHost<boolean>('window', 'isMaximized'),
    syncTrafficLightPosition: (sidebarCollapsed?: boolean) =>
      invokeHost('window', 'syncTrafficLightPosition', {
        sidebarCollapsed: Boolean(sidebarCollapsed),
      }),
  },
  /** P4b-B1 — shell open/reveal (legacy shell:* IPC fallback). */
  shell: {
    openExternal: (url: string) => invokeHost('shell', 'openExternal', { url }),
    showItemInFolder: (path: string) => invokeHost('shell', 'showItemInFolder', { path }),
    openPath: (path: string) => invokeHost<string>('shell', 'openPath', { path }),
  },
  /** P4b-B1 — native dialogs (legacy dialog:* IPC fallback). */
  dialog: {
    open: (options?: Record<string, unknown>) =>
      invokeHost('dialog', 'open', options ?? {}),
    save: (options?: Record<string, unknown>) =>
      invokeHost('dialog', 'save', options ?? {}),
    message: (options: Record<string, unknown>) =>
      invokeHost<{ response?: number }>('dialog', 'message', options),
  },
  /**
   * P4b-B2 — batch settings write only.
   * Payload/return match legacy `settings:setMany(patch)` → `{ success: true }`.
   * Main preserves proxy restart + launchAtStartup OS sync (settings-api).
   */
  settings: {
    setMany: (patch: Record<string, unknown>) =>
      invokeHost<{ success: boolean }>('settings', 'setMany', patch),
  },
  /**
   * P4b-B3 — cron write surface registered on Main only.
   * delete → cron.remove { id }
   * toggle → cron.update { id, patch: { enabled } }
   * trigger → cron.run { id, mode: 'force' }
   * list/create/update stay on hostApiFetch (complex transform/repair/delivery).
   */
  cron: {
    delete: (id: string) => invokeHost('cron', 'delete', { id }),
    toggle: (id: string, enabled: boolean) =>
      invokeHost('cron', 'toggle', { id, enabled }),
    trigger: (id: string) => invokeHost('cron', 'trigger', { id }),
  },
  /**
   * P4b-B4 — logs read-only.
   * readFile/getDir shapes match prior HTTP helpers used by Settings/Setup
   * ({ content } / { dir }) so UI call sites stay stable.
   */
  logs: {
    getRecent: (count?: number) =>
      invokeHost<string[]>('logs', 'getRecent', count !== undefined ? { count } : undefined),
    readFile: async (tailLines = 100) => {
      const content = await invokeHost<string>('logs', 'readFile', { tailLines });
      return { content: typeof content === 'string' ? content : String(content ?? '') };
    },
    getFilePath: () => invokeHost<string | null>('logs', 'getFilePath'),
    getDir: async () => {
      const dir = await invokeHost<string | null>('logs', 'getDir');
      return { dir: dir ?? null };
    },
    listFiles: () => invokeHost<unknown[]>('logs', 'listFiles'),
  },
  /**
   * P4b-B5 — Setup UV helpers (Main createUvApi already registered).
   * check → boolean; installAll → { success, error? } (does not throw on setup failure).
   * Legacy fallback: uv:check / uv:install-all.
   */
  uv: {
    check: () => invokeHost<boolean>('uv', 'check'),
    installAll: () =>
      invokeHost<{ success: boolean; error?: string }>('uv', 'installAll'),
  },
};

export type HostApi = typeof hostApi;

/** Cached Host API auth token, fetched once from the main process via IPC. */
let cachedHostApiToken: string | null = null;

export async function getHostApiToken(): Promise<string> {
  if (cachedHostApiToken) return cachedHostApiToken;
  try {
    cachedHostApiToken = await invokeIpc<string>('hostapi:token');
  } catch {
    cachedHostApiToken = '';
  }
  return cachedHostApiToken ?? '';
}

type HostApiProxyResponse = {
  ok?: boolean;
  data?: {
    status?: number;
    ok?: boolean;
    json?: unknown;
    text?: string;
  };
  error?: { message?: string } | string;
  // backward compatibility fields
  success: boolean;
  status?: number;
  json?: unknown;
  text?: string;
};

type HostApiProxyData = {
  status?: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
};

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
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
      source: 'browser-fallback',
      status: response.status,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return await response.json() as T;
}

function resolveProxyErrorMessage(error: HostApiProxyResponse['error']): string {
  return typeof error === 'string'
    ? error
    : (error?.message || 'Host API proxy request failed');
}

function parseUnifiedProxyResponse<T>(
  response: HostApiProxyResponse,
  path: string,
  method: string,
  startedAt: number,
): T {
  if (!response.ok) {
    throw new Error(resolveProxyErrorMessage(response.error));
  }

  const data: HostApiProxyData = response.data ?? {};
  trackUiEvent('hostapi.fetch', {
    path,
    method,
    source: 'ipc-proxy',
    durationMs: Date.now() - startedAt,
    status: data.status ?? 200,
  });

  if (data.status === 204) return undefined as T;
  if (data.json !== undefined) return data.json as T;
  return data.text as T;
}

function parseLegacyProxyResponse<T>(
  response: HostApiProxyResponse,
  path: string,
  method: string,
  startedAt: number,
): T {
  if (!response.success) {
    throw new Error(resolveProxyErrorMessage(response.error));
  }

  if (!response.ok) {
    const message = response.text
      || (typeof response.json === 'object' && response.json != null && 'error' in (response.json as Record<string, unknown>)
        ? String((response.json as Record<string, unknown>).error)
        : `HTTP ${response.status ?? 'unknown'}`);
    throw new Error(message);
  }

  trackUiEvent('hostapi.fetch', {
    path,
    method,
    source: 'ipc-proxy-legacy',
    durationMs: Date.now() - startedAt,
    status: response.status ?? 200,
  });

  if (response.status === 204) return undefined as T;
  if (response.json !== undefined) return response.json as T;
  return response.text as T;
}

function shouldFallbackToBrowser(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('invalid ipc channel: hostapi:fetch')
    || normalized.includes("no handler registered for 'hostapi:fetch'")
    || normalized.includes('no handler registered for "hostapi:fetch"')
    || normalized.includes('no handler registered for hostapi:fetch')
    || normalized.includes('window is not defined');
}

function allowLocalhostFallback(): boolean {
  try {
    return window.localStorage.getItem('clawdock:allow-localhost-fallback') === '1';
  } catch {
    return false;
  }
}

export async function hostApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const startedAt = Date.now();
  const method = init?.method || 'GET';
  // In Electron renderer, always proxy through main process to avoid CORS.
  try {
    const response = await invokeIpc<HostApiProxyResponse>('hostapi:fetch', {
      path,
      method,
      headers: headersToRecord(init?.headers),
      body: init?.body ?? null,
    });

    if (typeof response?.ok === 'boolean' && 'data' in response) {
      return parseUnifiedProxyResponse<T>(response, path, method, startedAt);
    }

    return parseLegacyProxyResponse<T>(response, path, method, startedAt);
  } catch (error) {
    const normalized = normalizeAppError(error, { source: 'ipc-proxy', path, method });
    const message = normalized.message;
    trackUiEvent('hostapi.fetch_error', {
      path,
      method,
      source: 'ipc-proxy',
      durationMs: Date.now() - startedAt,
      message,
      code: normalized.code,
    });
    if (!shouldFallbackToBrowser(message)) {
      throw normalized;
    }
    if (!allowLocalhostFallback()) {
      trackUiEvent('hostapi.fetch_error', {
        path,
        method,
        source: 'ipc-proxy',
        durationMs: Date.now() - startedAt,
        message: 'localhost fallback blocked by policy',
        code: 'CHANNEL_UNAVAILABLE',
      });
      throw normalized;
    }
  }

  // Browser-only fallback (non-Electron environments).
  const token = await getHostApiToken();
  const response = await fetch(`${HOST_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  trackUiEvent('hostapi.fetch', {
    path,
    method,
    source: 'browser-fallback',
    durationMs: Date.now() - startedAt,
    status: response.status,
  });
  try {
    return await parseResponse<T>(response);
  } catch (error) {
    throw normalizeAppError(error, { source: 'browser-fallback', path, method });
  }
}

export function createHostEventSource(path = '/api/events'): EventSource {
  // EventSource does not support custom headers, so pass the auth token
  // as a query parameter. The server accepts both mechanisms.
  const separator = path.includes('?') ? '&' : '?';
  const tokenParam = `token=${encodeURIComponent(cachedHostApiToken ?? '')}`;
  return new EventSource(`${HOST_API_BASE}${path}${separator}${tokenParam}`);
}

export function getHostApiBase(): string {
  return HOST_API_BASE;
}
