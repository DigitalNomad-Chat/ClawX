import type { ChatRuntimeEvent } from '../../../shared/chat-runtime-events';
import { applyRuntimeEventToRuns, extractToolCompletedFiles } from './runtime-graph';
import {
  noteLiveProviderToolChainEvidenceFromEvent,
  noteRuntimeEventActivity,
} from './runtime-evidence';
import type { AttachedFileMeta, ChatState, ToolStatus } from './types';
import type { ChatGet, ChatSet } from './store-api';

function dedupeAttachedFiles(files: AttachedFileMeta[]): AttachedFileMeta[] {
  const seen = new Set<string>();
  const next: AttachedFileMeta[] = [];
  for (const file of files) {
    const key = file.filePath || `${file.fileName}|${file.mimeType}|${file.preview || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

function runtimeToolEventToStatus(event: ChatRuntimeEvent): ToolStatus | null {
  if (event.type === 'tool.started') {
    return {
      id: event.toolCallId,
      toolCallId: event.toolCallId,
      name: event.name,
      status: 'running',
      summary: typeof event.args === 'string' ? event.args : undefined,
      updatedAt: event.ts ?? Date.now(),
    };
  }
  if (event.type === 'tool.updated') {
    return {
      id: event.toolCallId,
      toolCallId: event.toolCallId,
      name: event.name,
      status: 'running',
      summary: typeof event.partialResult === 'string' ? event.partialResult : undefined,
      updatedAt: event.ts ?? Date.now(),
    };
  }
  if (event.type === 'tool.completed') {
    return {
      id: event.toolCallId,
      toolCallId: event.toolCallId,
      name: event.name,
      status: event.isError ? 'error' : 'completed',
      summary: typeof event.result === 'string' ? event.result : undefined,
      updatedAt: event.ts ?? Date.now(),
    };
  }
  return null;
}

export type RuntimeLifecycleTracker = (
  state: Pick<ChatState, 'lastUserMessageAt' | 'sending' | 'activeRunId' | 'pendingFinal'>,
  sessionKey?: string,
) => boolean;

/**
 * Create handleRuntimeEvent for dual-track ChatRuntimeEvent consumption.
 * Updates runtimeRuns; selectively touches sending/activeRunId only for matching runs.
 * Does not remove or replace handleChatEvent / history poll.
 */
export function createHandleRuntimeEvent(
  set: ChatSet,
  get: ChatGet,
  options: {
    shouldTrackInboundRunLifecycle: RuntimeLifecycleTracker;
    touchLastChatEventAt?: () => void;
  },
): (event: ChatRuntimeEvent) => void {
  const { shouldTrackInboundRunLifecycle, touchLastChatEventAt } = options;

  return (event: ChatRuntimeEvent) => {
    const eventSessionKey = event.sessionKey ?? null;
    const initialState = get();
    const { activeRunId, currentSessionKey } = initialState;
    const matchesCurrentSession = eventSessionKey != null && eventSessionKey === currentSessionKey;
    const matchesActiveRun = activeRunId != null && event.runId === activeRunId;

    // Session-less runtime events are only safe when they match the active run.
    // Treating them as "current session" lets stale terminals clear an unrelated send.
    if (!matchesCurrentSession && !matchesActiveRun) {
      return;
    }

    touchLastChatEventAt?.();
    // Single-authority run-scoped activity stamp (not a process-global clock).
    noteRuntimeEventActivity({
      runId: event.runId,
      sessionKey: event.sessionKey,
      eventTs: event.ts,
      receivedAtMs: Date.now(),
    });
    // M4.2: latch live provider tool-chain evidence from real tool-like runtime events
    // (includes item→tool dual-emit). Skip remains gated by evaluateRuntimePollGate.
    noteLiveProviderToolChainEvidenceFromEvent(event);

    const runtimeRuns = applyRuntimeEventToRuns(initialState.runtimeRuns, event);
    const nextPatch: Partial<ChatState> = { runtimeRuns };
    const appliesToActiveUi = matchesActiveRun || (activeRunId == null && matchesCurrentSession);

    if (event.type === 'run.started') {
      if (matchesCurrentSession && (activeRunId == null || matchesActiveRun)) {
        nextPatch.activeRunId = event.runId;
        nextPatch.error = null;
        nextPatch.runError = null;
        if (!initialState.sending && shouldTrackInboundRunLifecycle(initialState, currentSessionKey)) {
          nextPatch.sending = true;
        }
      }
      set(nextPatch);
      return;
    }

    if (event.type === 'assistant.delta' || event.type === 'thinking.delta') {
      if (appliesToActiveUi && (initialState.error || initialState.runError)) {
        nextPatch.error = null;
        nextPatch.runError = null;
      }
      set(nextPatch);
      return;
    }

    const toolStatus = runtimeToolEventToStatus(event);
    if (toolStatus && appliesToActiveUi && (initialState.error || initialState.runError)) {
      nextPatch.error = null;
      nextPatch.runError = null;
    }

    if (event.type === 'tool.completed' && appliesToActiveUi) {
      const files = extractToolCompletedFiles(event);
      if (files.length > 0) {
        nextPatch.pendingToolImages = dedupeAttachedFiles([
          ...initialState.pendingToolImages,
          ...files,
        ]);
      }
    }

    if (event.type === 'run.ended') {
      const latestState = get();
      const terminalMatchesActiveRun = latestState.activeRunId != null && event.runId === latestState.activeRunId;
      const terminalIsForCurrentUntrackedSend = latestState.activeRunId == null
        && matchesCurrentSession
        && latestState.sending
        && (
          typeof event.ts !== 'number'
          || latestState.lastUserMessageAt == null
          || event.ts >= latestState.lastUserMessageAt - 1_000
        );
      const shouldClearActiveRun = terminalMatchesActiveRun || terminalIsForCurrentUntrackedSend;

      if (shouldClearActiveRun) {
        nextPatch.sending = false;
        nextPatch.activeRunId = null;
        nextPatch.pendingFinal = false;
        nextPatch.lastUserMessageAt = null;
        nextPatch.streamingTools = [];
        if (event.status === 'error' && event.error) {
          nextPatch.error = null;
          nextPatch.runError = event.error;
        }
        if (event.status === 'aborted') {
          nextPatch.streamingMessage = null;
          nextPatch.streamingText = '';
          nextPatch.pendingToolImages = [];
        }
      }
    }

    set(nextPatch);
  };
}
