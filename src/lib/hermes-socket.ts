import { io, Socket } from 'socket.io-client';
import { getHermesApiToken } from './hermes-api';

/**
 * ContentBlock shape expected by Hermes Server /chat-run `run` event.
 * Hermes reads image/file content from disk using the `path` field.
 */
export type HermesContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; name: string; path: string; media_type: string }
  | { type: 'file'; name: string; path: string; media_type?: string };

export type HermesRunInput = string | HermesContentBlock[];

export type HermesRunPayload = {
  input: HermesRunInput;
  session_id?: string;
  model?: string;
  provider?: string;
  instructions?: string;
  source?: string;
  queue_id?: string;
};

export type HermesRunEvent =
  | { event: 'run.started'; run_id?: string; session_id?: string; response_id?: string; status?: string; queue_length?: number; message?: unknown }
  | { event: 'message.delta'; run_id?: string; session_id?: string; response_id?: string; delta?: string; message?: unknown }
  | { event: 'run.completed'; run_id?: string; session_id?: string; response_id?: string; output?: string; usage?: unknown; error?: unknown; queue_remaining?: number; message?: unknown }
  | { event: 'run.failed'; run_id?: string; session_id?: string; response_id?: string; error?: string; queue_remaining?: number; message?: unknown }
  | { event: 'run.aborted'; run_id?: string; session_id?: string; message?: unknown }
  | { event: 'run.queued'; session_id?: string; queue_length?: number; message?: unknown }
  | { event: 'tool.started'; run_id?: string; session_id?: string; response_id?: string; tool_call_id?: string; tool?: string; name?: string; arguments?: string; preview?: string; message?: unknown }
  | { event: 'tool.completed'; run_id?: string; session_id?: string; response_id?: string; tool_call_id?: string; tool?: string; name?: string; output?: string; duration?: number; error?: boolean; message?: unknown }
  | { event: string; [key: string]: unknown };

export type HermesRunEventHandler = (event: HermesRunEvent) => void;

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

function getNamespaceUrl(): string {
  return 'http://127.0.0.1:8648/chat-run';
}

export async function connectHermesSocket(profile?: string): Promise<Socket> {
  if (socket?.connected) {
    return socket;
  }
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    socket = io(getNamespaceUrl(), {
      auth: (cb: (data: object) => void) => {
        getHermesApiToken().then((token) => cb({ token }));
      },
      query: profile ? { profile } : {},
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });

    return new Promise<Socket>((resolve, reject) => {
      socket!.once('connect', () => {
        console.log('[hermes-socket] connected to /chat-run');
        resolve(socket!);
      });
      socket!.once('connect_error', (err) => {
        console.error('[hermes-socket] connection failed:', err.message);
        reject(err);
      });
    });
  })();

  try {
    const s = await connectPromise;
    return s;
  } finally {
    connectPromise = null;
  }
}

export function disconnectHermesSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getHermesSocket(): Socket | null {
  return socket;
}

export function isHermesSocketConnected(): boolean {
  return socket?.connected ?? false;
}

// --- Run operations ---

export function emitHermesRun(payload: HermesRunPayload): void {
  if (!socket?.connected) {
    throw new Error('Hermes socket not connected');
  }
  socket.emit('run', payload);
}

export function emitHermesAbort(sessionId?: string): void {
  if (!socket?.connected) {
    throw new Error('Hermes socket not connected');
  }
  socket.emit('abort', { session_id: sessionId });
}

export function emitHermesCancelQueuedRun(sessionId?: string, queueId?: string): void {
  socket?.emit('cancel_queued_run', { session_id: sessionId, queue_id: queueId });
}

export function emitHermesResume(sessionId?: string): void {
  socket?.emit('resume', { session_id: sessionId });
}

export function emitHermesApprovalResponse(
  sessionId: string,
  approvalId: string,
  choice: string,
): void {
  socket?.emit('approval.respond', { session_id: sessionId, approval_id: approvalId, choice });
}

// --- Event subscription ---

export function onHermesRunEvent(event: string, handler: HermesRunEventHandler): () => void {
  const wrapped = (data: unknown) => {
    handler(data as HermesRunEvent);
  };
  socket?.on(event, wrapped);
  return () => {
    socket?.off(event, wrapped);
  };
}

export function offHermesRunEvent(event: string, handler?: (...args: unknown[]) => void): void {
  if (handler) {
    socket?.off(event, handler);
  } else {
    socket?.off(event);
  }
}

// --- Convenience: subscribe to all run lifecycle events ---

export type HermesRunLifecycleCallbacks = {
  onStarted?: (e: Extract<HermesRunEvent, { event: 'run.started' }>) => void;
  onDelta?: (e: Extract<HermesRunEvent, { event: 'message.delta' }>) => void;
  onCompleted?: (e: Extract<HermesRunEvent, { event: 'run.completed' }>) => void;
  onError?: (e: Extract<HermesRunEvent, { event: 'run.error' | 'run.failed' }>) => void;
  onAborted?: (e: Extract<HermesRunEvent, { event: 'run.aborted' }>) => void;
  onQueued?: (e: Extract<HermesRunEvent, { event: 'run.queued' }>) => void;
  onToolStarted?: (e: Extract<HermesRunEvent, { event: 'tool.started' }>) => void;
  onToolCompleted?: (e: Extract<HermesRunEvent, { event: 'tool.completed' }>) => void;
};

export function subscribeHermesRunLifecycle(callbacks: HermesRunLifecycleCallbacks): () => void {
  const cleaners: Array<() => void> = [];

  if (callbacks.onStarted) {
    cleaners.push(
      onHermesRunEvent('run.started', (e) => {
        if (e.event === 'run.started') callbacks.onStarted!(e as Extract<HermesRunEvent, { event: 'run.started' }>);
      }),
    );
  }
  if (callbacks.onDelta) {
    cleaners.push(
      onHermesRunEvent('message.delta', (e) => {
        if (e.event === 'message.delta') callbacks.onDelta!(e as Extract<HermesRunEvent, { event: 'message.delta' }>);
      }),
    );
  }
  if (callbacks.onCompleted) {
    cleaners.push(
      onHermesRunEvent('run.completed', (e) => {
        if (e.event === 'run.completed') callbacks.onCompleted!(e as Extract<HermesRunEvent, { event: 'run.completed' }>);
      }),
    );
  }
  if (callbacks.onError) {
    cleaners.push(
      onHermesRunEvent('run.error', (e) => {
        if (e.event === 'run.error' || e.event === 'run.failed') callbacks.onError!(e as Extract<HermesRunEvent, { event: 'run.error' | 'run.failed' }>);
      }),
    );
    cleaners.push(
      onHermesRunEvent('run.failed', (e) => {
        if (e.event === 'run.error' || e.event === 'run.failed') callbacks.onError!(e as Extract<HermesRunEvent, { event: 'run.error' | 'run.failed' }>);
      }),
    );
  }
  if (callbacks.onAborted) {
    cleaners.push(
      onHermesRunEvent('run.aborted', (e) => {
        if (e.event === 'run.aborted') callbacks.onAborted!(e as Extract<HermesRunEvent, { event: 'run.aborted' }>);
      }),
    );
  }
  if (callbacks.onQueued) {
    cleaners.push(
      onHermesRunEvent('run.queued', (e) => {
        if (e.event === 'run.queued') callbacks.onQueued!(e as Extract<HermesRunEvent, { event: 'run.queued' }>);
      }),
    );
  }
  if (callbacks.onToolStarted) {
    cleaners.push(
      onHermesRunEvent('tool.started', (e) => {
        if (e.event === 'tool.started') callbacks.onToolStarted!(e as Extract<HermesRunEvent, { event: 'tool.started' }>);
      }),
    );
  }
  if (callbacks.onToolCompleted) {
    cleaners.push(
      onHermesRunEvent('tool.completed', (e) => {
        if (e.event === 'tool.completed') callbacks.onToolCompleted!(e as Extract<HermesRunEvent, { event: 'tool.completed' }>);
      }),
    );
  }

  return () => {
    for (const clean of cleaners) {
      clean();
    }
  };
}
