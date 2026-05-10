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
  onDraftChunk?: (draftId: string, chunk: string, extra?: Record<string, unknown>) => void;
  onDraftFinalize?: (draftId: string, message: HallMessage, extra?: Record<string, unknown>) => void;
  onDraftAbort?: (draftId: string, reason: string, extra?: Record<string, unknown>) => void;
  onMessageCreated?: (message: HallMessage) => void;
  onTaskUpdated?: (taskCard: HallTaskCard) => void;
  onOrchestratorStateChange?: (taskCardId: string, state: string) => void;
  /** Fired when proposal/decision/latestSummary fields change on a task card */
  onStructuredUpdate?: (taskCardId: string, fields: Record<string, unknown>) => void;
  /** Fired when a discussion cycle opens or closes */
  onDiscussionCycleChange?: (taskCardId: string, cycle: Record<string, unknown> | null, action: 'open' | 'close') => void;
  /** Fired when an execution lock is acquired or released */
  onLockChange?: (taskCardId: string, lock: { lockId: string; participantId: string; releasedReason?: string }, action: 'acquired' | 'released') => void;
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
        const { draftId, chunk, ...extra } = data;
        optionsRef.current?.onDraftChunk?.(draftId as string, chunk as string, extra);
      });

      es.addEventListener('draft_finalize', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        const { draftId, message, ...extra } = data;
        optionsRef.current?.onDraftFinalize?.(draftId as string, message as HallMessage, extra);
      });

      es.addEventListener('draft_abort', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        const { draftId, abortReason, ...extra } = data;
        optionsRef.current?.onDraftAbort?.(draftId as string, abortReason as string, extra);
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

      es.addEventListener('task_structured_update', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        const { taskCardId, ...fields } = data;
        optionsRef.current?.onStructuredUpdate?.(
          taskCardId as string,
          fields as Record<string, unknown>,
        );
      });

      es.addEventListener('discussion_cycle_open', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onDiscussionCycleChange?.(
          data.taskCardId as string,
          data.discussionCycle as Record<string, unknown> ?? null,
          'open',
        );
      });

      es.addEventListener('discussion_cycle_close', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onDiscussionCycleChange?.(
          data.taskCardId as string,
          data.discussionCycle as Record<string, unknown> ?? null,
          'close',
        );
      });

      es.addEventListener('lock_acquired', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onLockChange?.(
          data.taskCardId as string,
          { lockId: data.lockId as string, participantId: data.participantId as string },
          'acquired',
        );
      });

      es.addEventListener('lock_released', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        optionsRef.current?.onLockChange?.(
          data.taskCardId as string,
          { lockId: data.lockId as string, participantId: data.participantId as string, releasedReason: data.releasedReason as string },
          'released',
        );
      });

      // Catch-all for legacy collab:invalidate events (also handles draft diagnostic)
      es.addEventListener('invalidate', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.draftId && data.abortReason) {
          const { draftId, abortReason, ...extra } = data;
          optionsRef.current?.onDraftAbort?.(draftId as string, abortReason as string, extra);
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
