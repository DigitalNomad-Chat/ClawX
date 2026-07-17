/**
 * v0.4.9 P4a — typed host:invoke client with HTTP/IPC fallback.
 *
 * Prefer window.clawx.hostInvoke (Main HostApiRegistry). When the bridge is
 * missing or returns UNSUPPORTED, fall back to hostApiFetch / invokeIpc so
 * legacy dual-path continues to work. Does not delete any old transport.
 */
import type { HostInvokeRequest, HostInvokeResponse } from '@/types/electron';
import { invokeIpc } from '@/lib/api-client';

export type HostApiModule = 'app' | 'openclaw' | 'usage';
export type HostApiActionMap = {
  app: 'openClawDoctor';
  openclaw: 'status';
  usage: 'recentTokenHistory';
};

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

function isUnsupported(response: HostInvokeResponse): boolean {
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
      if (!isUnsupported(response)) {
        throw new Error(response.error?.message || `Host request failed: ${module}.${action}`);
      }
      // UNSUPPORTED → fall through to dual-path fallback
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Missing channel / bridge errors also fall back
      if (
        !message.toLowerCase().includes('unsupported')
        && !message.toLowerCase().includes('no handler')
        && !message.toLowerCase().includes('invalid ipc channel')
        && !message.toLowerCase().includes('host invoke bridge')
      ) {
        // Real application errors (e.g. doctor failed) should surface
        // unless this was a transport-level failure.
        const isTransport =
          message.toLowerCase().includes('channel')
          || message.toLowerCase().includes('bridge');
        if (!isTransport) {
          throw error instanceof Error ? error : new Error(message);
        }
      }
    }
  }

  const moduleFallbacks = FALLBACKS[module] as Record<string, FallbackHandler> | undefined;
  const fallback = moduleFallbacks?.[action];
  if (!fallback) {
    throw new Error(`Host invoke bridge unavailable and no fallback for ${module}.${action}`);
  }
  return (await fallback(payload)) as T;
}
