import type { ChatRuntimeEvent } from '../../../shared/chat-runtime-events';
import {
  extractImagesAsAttachedFiles,
  extractMediaRefs,
  extractRawFilePaths,
  getMessageText,
  makeAttachedFile,
} from './helpers';
import type { AttachedFileMeta, ChatRuntimeRunState } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function cloneRunState(runId: string, event: ChatRuntimeEvent): ChatRuntimeRunState {
  return {
    runId,
    sessionKey: event.sessionKey,
    status: event.type === 'run.ended' ? event.status : 'running',
    startedAt: event.type === 'run.started' ? event.startedAt : undefined,
    endedAt: event.type === 'run.ended' ? event.endedAt : undefined,
    assistantText: '',
    thinkingText: '',
    events: [],
  };
}

function stableRuntimeFingerprint(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return `${typeof value}:${String(value)}`;
  if (Array.isArray(value)) return `[${value.map(stableRuntimeFingerprint).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableRuntimeFingerprint(child)}`)
    .join(',')}}`;
}

function sameRuntimeEvent(left: ChatRuntimeEvent | undefined, right: ChatRuntimeEvent): boolean {
  if (!left) return false;
  if (left.runId !== right.runId || left.type !== right.type) return false;
  if (typeof left.seq === 'number' && typeof right.seq === 'number') {
    return left.seq === right.seq;
  }
  if (left.type === 'tool.started') {
    return right.type === left.type && right.toolCallId === left.toolCallId;
  }
  if (left.type === 'tool.updated') {
    return right.type === left.type
      && right.toolCallId === left.toolCallId
      && stableRuntimeFingerprint(right.partialResult) === stableRuntimeFingerprint(left.partialResult);
  }
  if (left.type === 'tool.completed') {
    return right.type === left.type
      && right.toolCallId === left.toolCallId
      && right.isError === left.isError
      && stableRuntimeFingerprint(right.result) === stableRuntimeFingerprint(left.result)
      && stableRuntimeFingerprint(right.meta) === stableRuntimeFingerprint(left.meta);
  }
  if (left.type === 'command.output') {
    return right.type === left.type
      && right.toolCallId === left.toolCallId
      && right.itemId === left.itemId
      && right.phase === left.phase
      && right.output === left.output;
  }
  if (left.type === 'patch.completed') {
    return right.type === left.type && right.toolCallId === left.toolCallId && right.summary === left.summary;
  }
  if (left.type === 'approval.updated') {
    return right.type === left.type
      && right.toolCallId === left.toolCallId
      && right.status === left.status
      && right.phase === left.phase
      && right.message === left.message;
  }
  if (left.type === 'assistant.delta') {
    return right.type === left.type && right.text === left.text && right.delta === left.delta;
  }
  if (left.type === 'thinking.delta') {
    return right.type === left.type && right.text === left.text && right.delta === left.delta;
  }
  if (left.type === 'run.started') return right.type === left.type;
  if (left.type === 'run.ended') {
    return right.type === left.type && right.status === left.status && right.endedAt === left.endedAt;
  }
  return false;
}

/**
 * True when `candidate` carries more usable payload than `existing`
 * (e.g. tool stream args/result after a sparse item frame, or reverse order).
 */
function isRicherToolPayload(candidate: unknown, existing: unknown): boolean {
  if (candidate === undefined || candidate === null) return false;
  if (typeof candidate === 'string' && candidate.length === 0) return false;
  if (existing === undefined || existing === null) return true;
  if (typeof existing === 'string' && existing.length === 0) {
    return typeof candidate === 'string' ? candidate.length > 0 : true;
  }
  const existingFp = stableRuntimeFingerprint(existing);
  const candidateFp = stableRuntimeFingerprint(candidate);
  if (existingFp === candidateFp) return false;
  if (existingFp === '{}' || existingFp === '[]' || existingFp === 'string:') return true;
  // Both already have content: keep the first (do not thrash on dual-stream noise).
  return false;
}

function isToolLifecycleEvent(
  event: ChatRuntimeEvent,
): event is Extract<ChatRuntimeEvent, { type: 'tool.started' | 'tool.updated' | 'tool.completed' }> {
  return event.type === 'tool.started'
    || event.type === 'tool.updated'
    || event.type === 'tool.completed';
}

/**
 * Merge tool lifecycle events across stream=tool + stream=item dual sources.
 * - Same toolCallId started/completed: skip poorer duplicate; replace when the
 *   incoming event has richer args/result/meta (supports item-first reverse order).
 * - completed with different isError (error flip): always append.
 * - updated: skip only identical partialResult fingerprint; keep distinct updates.
 */
function mergeToolLifecycleEvent(
  events: ChatRuntimeEvent[],
  event: Extract<ChatRuntimeEvent, { type: 'tool.started' | 'tool.updated' | 'tool.completed' }>,
): ChatRuntimeEvent[] {
  if (event.type === 'tool.started') {
    const idx = events.findIndex(
      (existing) => existing.type === 'tool.started' && existing.toolCallId === event.toolCallId,
    );
    if (idx < 0) return [...events, event];
    const existing = events[idx] as Extract<ChatRuntimeEvent, { type: 'tool.started' }>;
    if (!isRicherToolPayload(event.args, existing.args)) return events;
    const next = events.slice();
    next[idx] = {
      ...existing,
      ...event,
      args: event.args !== undefined ? event.args : existing.args,
      name: event.name || existing.name,
    };
    return next;
  }

  if (event.type === 'tool.completed') {
    const idx = events.findIndex(
      (existing) => existing.type === 'tool.completed'
        && existing.toolCallId === event.toolCallId
        && existing.isError === event.isError,
    );
    if (idx < 0) return [...events, event];
    const existing = events[idx] as Extract<ChatRuntimeEvent, { type: 'tool.completed' }>;
    const richerResult = isRicherToolPayload(event.result, existing.result);
    const richerMeta = isRicherToolPayload(event.meta, existing.meta);
    if (!richerResult && !richerMeta) return events;
    const next = events.slice();
    next[idx] = {
      ...existing,
      ...event,
      result: richerResult ? event.result : existing.result,
      meta: richerMeta ? event.meta : existing.meta,
      name: event.name || existing.name,
      isError: event.isError ?? existing.isError,
    };
    return next;
  }

  // tool.updated — distinct fingerprints are real progress; identical ones are dual-stream noise.
  const duplicateUpdate = events.some(
    (existing) => existing.type === 'tool.updated'
      && existing.toolCallId === event.toolCallId
      && stableRuntimeFingerprint(existing.partialResult)
        === stableRuntimeFingerprint(event.partialResult),
  );
  return duplicateUpdate ? events : [...events, event];
}

/**
 * Pure reducer: apply one ChatRuntimeEvent into runtimeRuns.
 * Dedupes consecutive identical events (seq or fingerprint) and merges
 * cross-stream tool lifecycle duplicates (same toolCallId from stream=tool + item)
 * without dropping richer args/result when order is reversed.
 */
export function applyRuntimeEventToRuns(
  currentRuns: Record<string, ChatRuntimeRunState>,
  event: ChatRuntimeEvent,
): Record<string, ChatRuntimeRunState> {
  const existing = currentRuns[event.runId] ?? cloneRunState(event.runId, event);
  let nextEvents = existing.events;
  if (sameRuntimeEvent(existing.events.at(-1), event)) {
    nextEvents = existing.events;
  } else if (isToolLifecycleEvent(event)) {
    nextEvents = mergeToolLifecycleEvent(existing.events, event);
  } else {
    nextEvents = [...existing.events, event];
  }
  const nextRun: ChatRuntimeRunState = {
    ...existing,
    sessionKey: event.sessionKey ?? existing.sessionKey,
    events: nextEvents,
  };

  switch (event.type) {
    case 'run.started':
      nextRun.status = 'running';
      nextRun.startedAt = event.startedAt ?? nextRun.startedAt;
      nextRun.endedAt = undefined;
      break;
    case 'run.ended':
      nextRun.status = event.status;
      nextRun.endedAt = event.endedAt ?? event.ts ?? Date.now();
      break;
    case 'assistant.delta': {
      const incoming = event.text ?? event.delta ?? '';
      if (incoming) {
        if (event.replace) {
          nextRun.assistantText = incoming;
        } else if (event.text) {
          nextRun.assistantText = event.text.startsWith(nextRun.assistantText)
            ? event.text
            : event.text;
        } else {
          nextRun.assistantText = `${nextRun.assistantText}${event.delta ?? ''}`;
        }
      }
      break;
    }
    case 'thinking.delta': {
      const incoming = event.text ?? event.delta ?? '';
      if (incoming) {
        if (event.text) {
          nextRun.thinkingText = event.text.startsWith(nextRun.thinkingText)
            ? event.text
            : event.text;
        } else {
          nextRun.thinkingText = `${nextRun.thinkingText}${event.delta ?? ''}`;
        }
      }
      break;
    }
    default:
      break;
  }

  return {
    ...currentRuns,
    [event.runId]: nextRun,
  };
}

function collectRuntimeResultTexts(result: unknown): string[] {
  const texts: string[] = [];
  if (typeof result === 'string' && result.trim()) {
    texts.push(result);
  }
  if (Array.isArray(result)) {
    const text = getMessageText(result);
    if (text.trim()) texts.push(text);
  }
  const record = asRecord(result);
  if (!record) return texts;

  const candidates = [record.content, record.output, record.summary, record.error, record.stdout, record.stderr];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      texts.push(candidate);
      continue;
    }
    const text = getMessageText(candidate);
    if (text.trim()) texts.push(text);
  }

  return texts;
}

export function extractToolCompletedFiles(event: ChatRuntimeEvent): AttachedFileMeta[] {
  if (event.type !== 'tool.completed') return [];

  const files: AttachedFileMeta[] = extractImagesAsAttachedFiles(event.result)
    .filter((file) => !file.mimeType.startsWith('image/'))
    .map((file) => (file.source ? file : { ...file, source: 'tool-result' as const }));

  const seenPaths = new Set(files.map((file) => file.filePath).filter(Boolean));
  for (const text of collectRuntimeResultTexts(event.result)) {
    const mediaRefs = extractMediaRefs(text);
    const mediaRefPaths = new Set(mediaRefs.map((ref) => ref.filePath));
    for (const ref of mediaRefs) {
      if (seenPaths.has(ref.filePath)) continue;
      const file = makeAttachedFile(ref, 'tool-result');
      seenPaths.add(ref.filePath);
      files.push(file);
    }
    for (const ref of extractRawFilePaths(text)) {
      if (ref.mimeType.startsWith('image/')) continue;
      if (mediaRefPaths.has(ref.filePath) || seenPaths.has(ref.filePath)) continue;
      const file = makeAttachedFile(ref, 'tool-result');
      seenPaths.add(ref.filePath);
      files.push(file);
    }
  }

  return files;
}
