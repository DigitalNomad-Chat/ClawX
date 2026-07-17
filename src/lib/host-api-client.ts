/**
 * v0.4.9 P4a — typed host:invoke client with HTTP/IPC fallback.
 *
 * Prefer window.clawx.hostInvoke (Main HostApiRegistry). Fallback only when:
 * - bridge is missing, or
 * - response / thrown error carries an explicit transport code (UNSUPPORTED,
 *   BRIDGE_UNAVAILABLE, CHANNEL_UNAVAILABLE).
 * Never infer fallback from error message substrings (e.g. "channel"/"bridge").
 */
import type { HostInvokeRequest, HostInvokeResponse } from '@/types/electron';
import { invokeIpc } from '@/lib/api-client';

export type HostApiModule = 'app' | 'openclaw' | 'usage';
export type HostApiActionMap = {
  app: 'openClawDoctor';
  openclaw: 'status';
  usage: 'recentTokenHistory';
};

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
