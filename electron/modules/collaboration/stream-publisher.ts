"use strict";

/**
 * Collaboration Hall — Stream Publisher
 *
 * Publishes draft/finalize/abort events via HostEventBus so that
 * the StreamManager (SSE) can push them to connected clients.
 */
import { publishCollabEvent } from "./event-publisher";
import type { ParsedStructuredBlock } from "./content-sanitizer";

export interface StreamPublishInput {
  draftId: string;
  taskCardId: string;
  participantId: string;
  participantLabel: string;
  hallId: string;
}

export function publishDraftChunk(input: StreamPublishInput, chunk: string): void {
  publishCollabEvent({
    type: "invalidate",
    hallId: input.hallId,
    taskCardId: input.taskCardId,
    reason: "draft_chunk",
    payload: {
      draftId: input.draftId,
      chunk,
      participantId: input.participantId,
      participantLabel: input.participantLabel,
      timestamp: new Date().toISOString(),
    },
  });
}

export function finalizeDraft(
  input: StreamPublishInput,
  finalContent: string,
  structured?: ParsedStructuredBlock,
): void {
  publishCollabEvent({
    type: "invalidate",
    hallId: input.hallId,
    taskCardId: input.taskCardId,
    reason: "draft_finalize",
    payload: {
      draftId: input.draftId,
      finalContent,
      structured,
      participantId: input.participantId,
      participantLabel: input.participantLabel,
      timestamp: new Date().toISOString(),
    },
  });
}

export function abortDraft(input: StreamPublishInput, reason: string): void {
  publishCollabEvent({
    type: "invalidate",
    hallId: input.hallId,
    taskCardId: input.taskCardId,
    reason: "draft_abort",
    payload: {
      draftId: input.draftId,
      abortReason: reason,
      participantId: input.participantId,
      participantLabel: input.participantLabel,
      timestamp: new Date().toISOString(),
    },
  });
}
