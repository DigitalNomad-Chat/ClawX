/**
 * v0.4.9 P4a/P4b-B1 — typed host:invoke client with HTTP/IPC fallback.
 *
 * Prefer window.clawx.hostInvoke (Main HostApiRegistry). Fallback only when:
 * - bridge is missing, or
 * - response / thrown error carries an explicit transport code (UNSUPPORTED,
 *   BRIDGE_UNAVAILABLE, CHANNEL_UNAVAILABLE).
 * Never infer fallback from error message substrings (e.g. "channel"/"bridge").
 *
 * P4b-B1: window / shell / dialog. P4b-B2: settings.setMany.
 * P4b-B3: cron delete/toggle/trigger only (list/create/update stay legacy/HTTP).
 * P4b-B4: logs read-only + openclaw dir/CLI read helpers.
 * P4b-B5: uv.check + uv.installAll only (no updates service).
 */
import type { HostInvokeRequest, HostInvokeResponse } from '@/types/electron';
import { invokeIpc } from '@/lib/api-client';

export type HostApiModule =
  | 'app'
  | 'openclaw'
  | 'usage'
  | 'window'
  | 'shell'
  | 'dialog'
  | 'settings'
  | 'cron'
  | 'logs'
  | 'uv';
export type HostApiActionMap = {
  app: 'openClawDoctor';
  openclaw: 'status' | 'getDir' | 'getConfigDir' | 'getSkillsDir' | 'getCliCommand';
  usage: 'recentTokenHistory';
  window: 'minimize' | 'maximize' | 'close' | 'isMaximized' | 'syncTrafficLightPosition';
  shell: 'openExternal' | 'showItemInFolder' | 'openPath';
  dialog: 'open' | 'save' | 'message';
  /** P4b-B2 — only setMany; get/set/reset stay on legacy/HTTP for now. */
  settings: 'setMany';
  /** P4b-B3 — registered write surface only. */
  cron: 'delete' | 'toggle' | 'trigger';
  /** P4b-B4 — logs read-only surface (registered on Main). */
  logs: 'getRecent' | 'readFile' | 'getFilePath' | 'getDir' | 'listFiles';
  /** P4b-B5 — Setup uv check/install only. */
  uv: 'check' | 'installAll';
};

function resolveLogTailArg(payload?: unknown, fallback = 100): number {
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return Math.max(Math.floor(payload), 1);
  }
  if (payload && typeof payload === 'object') {
    const record = payload as { tailLines?: unknown; count?: unknown };
    if (typeof record.tailLines === 'number' && Number.isFinite(record.tailLines)) {
      return Math.max(Math.floor(record.tailLines), 1);
    }
    if (typeof record.count === 'number' && Number.isFinite(record.count)) {
      return Math.max(Math.floor(record.count), 1);
    }
  }
  return fallback;
}

function resolveCronIdArg(payload?: unknown): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (payload && typeof payload === 'object' && 'id' in payload) {
    const id = (payload as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  throw new Error('cron job id is required');
}

function resolveShellPathArg(payload?: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'path' in payload) {
    const path = (payload as { path: unknown }).path;
    if (typeof path === 'string') return path;
  }
  throw new Error('path is required');
}

function resolveShellUrlArg(payload?: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'url' in payload) {
    const url = (payload as { url: unknown }).url;
    if (typeof url === 'string') return url;
  }
  throw new Error('url is required');
}

/** Explicit transport failure codes that allow dual-path fallback. */
export type HostTransportCode =
  | 'UNSUPPORTED'
  | 'BRIDGE_UNAVAILABLE'
  | 'CHANNEL_UNAVAILABLE';

const TRANSPORT_CODES = new Set<string>([
  'UNSUPPORTED',
  'BRIDGE_UNAVAILABLE',
  'CHANNEL_UNAVAILABLE',
]);

export class HostTransportError extends Error {
  readonly code: HostTransportCode;

  constructor(code: HostTransportCode, message: string) {
    super(message);
    this.name = 'HostTransportError';
    this.code = code;
  }
}

export function isHostTransportError(error: unknown): error is HostTransportError {
  return error instanceof HostTransportError;
}

/** True when error exposes an explicit transport code (class or { code }). */
export function isFallbackableTransportFailure(error: unknown): boolean {
  if (error instanceof HostTransportError) {
    return TRANSPORT_CODES.has(error.code);
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' && TRANSPORT_CODES.has(code);
  }
  return false;
}

type FallbackHandler = (payload?: unknown) => Promise<unknown>;

/** Lazy import avoids circular dependency with host-api.ts (hostApiFetch lives there). */
async function hostApiFetchFallback<T>(path: string, init?: RequestInit): Promise<T> {
  const { hostApiFetch } = await import('./host-api');
  return hostApiFetch<T>(path, init);
}

const FALLBACKS: {
  [M in HostApiModule]: {
    [A in HostApiActionMap[M]]: FallbackHandler;
  };
} = {
  app: {
    openClawDoctor: async (payload) => {
      const mode =
        payload && typeof payload === 'object' && 'mode' in payload
          ? (payload as { mode?: string }).mode
          : undefined;
      return await hostApiFetchFallback('/api/app/openclaw-doctor', {
        method: 'POST',
        body: JSON.stringify(mode ? { mode } : {}),
      });
    },
  },
  openclaw: {
    status: async () => await invokeIpc('openclaw:status'),
    getDir: async () => await invokeIpc('openclaw:getDir'),
    getConfigDir: async () => await invokeIpc('openclaw:getConfigDir'),
    getSkillsDir: async () => await invokeIpc('openclaw:getSkillsDir'),
    getCliCommand: async () => await invokeIpc('openclaw:getCliCommand'),
  },
  usage: {
    recentTokenHistory: async (payload) => {
      const limit =
        typeof payload === 'number'
          ? payload
          : payload && typeof payload === 'object' && 'limit' in payload
            ? (payload as { limit?: number | string | null }).limit
            : undefined;
      const qs =
        limit !== undefined && limit !== null && String(limit).length > 0
          ? `?limit=${encodeURIComponent(String(limit))}`
          : '';
      return await hostApiFetchFallback(`/api/usage/recent-token-history${qs}`);
    },
  },
  // P4b-B1: legacy IPC channels remain registered; bare-string args preserved.
  window: {
    minimize: async () => await invokeIpc('window:minimize'),
    maximize: async () => await invokeIpc('window:maximize'),
    close: async () => await invokeIpc('window:close'),
    isMaximized: async () => await invokeIpc('window:isMaximized'),
    syncTrafficLightPosition: async (payload) => {
      // No dedicated legacy channel; no-op fallback keeps dual-path safe.
      void payload;
      return undefined;
    },
  },
  shell: {
    openExternal: async (payload) => {
      await invokeIpc('shell:openExternal', resolveShellUrlArg(payload));
    },
    showItemInFolder: async (payload) => {
      await invokeIpc('shell:showItemInFolder', resolveShellPathArg(payload));
    },
    openPath: async (payload) => await invokeIpc('shell:openPath', resolveShellPathArg(payload)),
  },
  dialog: {
    open: async (payload) => await invokeIpc('dialog:open', payload ?? {}),
    save: async (payload) => await invokeIpc('dialog:save', payload ?? {}),
    message: async (payload) => await invokeIpc('dialog:message', payload ?? {}),
  },
  // P4b-B2: same patch object as legacy settings:setMany (proxy/launch side effects on Main).
  settings: {
    setMany: async (payload) => await invokeIpc('settings:setMany', payload ?? {}),
  },
  // P4b-B3: legacy IPC uses bare id (+ enabled for toggle), same as ipc-handlers thin wrappers.
  cron: {
    delete: async (payload) => await invokeIpc('cron:delete', resolveCronIdArg(payload)),
    toggle: async (payload) => {
      if (!payload || typeof payload !== 'object' || typeof (payload as { enabled?: unknown }).enabled !== 'boolean') {
        throw new Error('toggle requires { id, enabled }');
      }
      const id = resolveCronIdArg(payload);
      const enabled = (payload as { enabled: boolean }).enabled;
      return await invokeIpc('cron:toggle', id, enabled);
    },
    trigger: async (payload) => await invokeIpc('cron:trigger', resolveCronIdArg(payload)),
  },
  // P4b-B4: legacy log:* IPC (bare count/tail args) — same as ipc-handlers thin wrappers.
  logs: {
    getRecent: async (payload) => await invokeIpc('log:getRecent', resolveLogTailArg(payload, 50)),
    readFile: async (payload) => await invokeIpc('log:readFile', resolveLogTailArg(payload, 100)),
    getFilePath: async () => await invokeIpc('log:getFilePath'),
    getDir: async () => await invokeIpc('log:getDir'),
    listFiles: async () => await invokeIpc('log:listFiles'),
  },
  // P4b-B5: legacy uv:check + uv:install-all (hyphenated channel for installAll).
  uv: {
    check: async () => await invokeIpc('uv:check'),
    installAll: async () => await invokeIpc('uv:install-all'),
  },
};

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `host-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isUnsupportedResponse(response: HostInvokeResponse): boolean {
  return !response.ok && response.error?.code === 'UNSUPPORTED';
}

/**
 * Invoke a P4a low-risk host action via host:invoke, with hostapi/IPC fallback.
 */
export async function invokeHost<T = unknown>(
  module: HostApiModule,
  action: string,
  payload?: unknown,
): Promise<T> {
  const bridge = typeof window !== 'undefined' ? window.clawx?.hostInvoke : undefined;

  if (bridge) {
    const request: HostInvokeRequest = {
      id: createRequestId(),
      module,
      action,
    };
    if (payload !== undefined) {
      request.payload = payload;
    }

    try {
      const response = await bridge<T>(request);
      if (response.ok) {
        return response.data as T;
      }
      if (isUnsupportedResponse(response)) {
        // Explicit UNSUPPORTED envelope → dual-path fallback (exit try)
      } else {
        const code = response.error?.code;
        const message = response.error?.message || `Host request failed: ${module}.${action}`;
        if (typeof code === 'string' && TRANSPORT_CODES.has(code)) {
          throw new HostTransportError(code as HostTransportCode, message);
        }
        throw new Error(message);
      }
    } catch (error) {
      // Only explicit transport failures fall through; business errors rethrow.
      // Never inspect error.message for "channel"/"bridge" substrings.
      if (!isFallbackableTransportFailure(error)) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const moduleFallbacks = FALLBACKS[module] as Record<string, FallbackHandler> | undefined;
  const fallback = moduleFallbacks?.[action];
  if (!fallback) {
    throw new HostTransportError(
      'BRIDGE_UNAVAILABLE',
      `Host invoke bridge unavailable and no fallback for ${module}.${action}`,
    );
  }
  return (await fallback(payload)) as T;
}
