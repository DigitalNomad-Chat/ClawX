import { useEffect, useRef, useState, useCallback } from 'react';
import { getHostApiBase, getHostApiToken } from '@/lib/host-api';
import type { HallMessage, HallTaskCard } from '../types';

export interface CollabStreamEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface UseCollabStreamOptions {
  hallId?: string;
  onDraftChunk?: (draftId: string, chunk: string) => void;
  onDraftFinalize?: (draftId: string, message: HallMessage) => void;
  onDraftAbort?: (draftId: string, reason: string) => void;
  onMessageCreated?: (message: HallMessage) => void;
  onTaskUpdated?: (taskCard: HallTaskCard) => void;
  onOrchestratorStateChange?: (taskCardId: string, state: string) => void;
}

export function useCollabStream(options?: UseCollabStreamOptions): {
  connected: boolean;
  error: Error | null;
} {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(async () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const hallId = optionsRef.current?.hallId || 'main';

    // Fetch auth token before creating EventSource
    // (EventSource cannot set custom headers, so we pass token via query param)
    let token: string;
    try {
      token = await getHostApiToken();
    } catch {
      token = '';
    }

    const baseUrl = `${getHostApiBase()}/api/collaboration/stream`;
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}hallId=${encodeURIComponent(hallId)}&token=${encodeURIComponent(token)}`;

    try {
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onerror = (_err) => {
        setConnected(false);
        const state = es.readyState;
        const stateLabel = state === 0 ? 'CONNECTING' : state === 1 ? 'OPEN' : 'CLOSED';
        setError(new Error(`SSE connection error (readyState=${stateLabel}, url=${url.replace(/token=[^&]*/, 'token=***')})`));
        es.close();
        esRef.current = null;

        // Auto-reconnect after 3s
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          void connect();
        }, 3000);
      };

      es.addEventListener('connected', (_e) => {
        setConnected(true);
        setError(null);
      });

      // Generic message handler for debugging unknown events
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[collab-stream] Generic event:', e.type, data);
        } catch {
          console.log('[collab-stream] Generic raw event:', e.type, e.data);
        }
      };

      es.addEventListener('draft_chunk', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onDraftChunk?.(data.draftId as string, data.chunk as string);
      });

      es.addEventListener('draft_finalize', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onDraftFinalize?.(data.draftId as string, data.message as HallMessage);
      });

      es.addEventListener('draft_abort', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onDraftAbort?.(data.draftId as string, data.abortReason as string);
      });

      es.addEventListener('message_created', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onMessageCreated?.(data.message as HallMessage);
      });

      es.addEventListener('task_updated', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onTaskUpdated?.(data.taskCard as HallTaskCard);
      });

      es.addEventListener('orchestrator_state_change', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onOrchestratorStateChange?.(
          data.taskCardId as string,
          data.state as string,
        );
      });

      // Catch-all for legacy collab:invalidate events (also handles draft diagnostic)
      es.addEventListener('invalidate', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.draftId && data.abortReason) {
          optionsRef.current?.onDraftAbort?.(data.draftId as string, data.abortReason as string);
        }
        if (data.message) {
          optionsRef.current?.onMessageCreated?.(data.message as HallMessage);
        }
        if (data.taskCard) {
          optionsRef.current?.onTaskUpdated?.(data.taskCard as HallTaskCard);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    void connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect, options?.hallId]);

  return { connected, error };
}
