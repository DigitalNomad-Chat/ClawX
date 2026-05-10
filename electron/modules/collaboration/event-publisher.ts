"use strict";

/**
 * Collaboration Hall — Event Publisher
 * Publishes change events via HostEventBus and SSE for real-time frontend updates.
 */
import type { HostEventBus } from "../../api/event-bus";
import { broadcastToHall } from "./stream-manager";

export interface CollabInvalidateEvent {
  type: "invalidate";
  hallId: string;
  taskCardId?: string;
  messageId?: string;
  projectId?: string;
  taskId?: string;
  roomId?: string;
  reason:
    | "message_created"
    | "task_created"
    | "task_updated"
    | "task_deleted"
    | "task_messages_deleted"
    | "discussion_opened"
    | "assigned"
    | "handoff"
    | "review_submitted"
    | "draft_chunk"
    | "draft_finalize"
    | "draft_abort"
    | "orchestrator_state_change"
    | "task_structured_update"
    | "discussion_cycle_open"
    | "discussion_cycle_close"
    | "lock_acquired"
    | "lock_released";
  payload?: Record<string, unknown>;
}

let eventBus: HostEventBus | null = null;

export function setCollabEventBus(bus: HostEventBus): void {
  eventBus = bus;
}

export function publishCollabEvent(event: CollabInvalidateEvent): void {
  if (!eventBus) {
    console.warn("[collaboration] EventBus not set; skipping event publish");
    return;
  }
  eventBus.emit("collab:invalidate", event);

  // Also push to SSE connections
  broadcastToHall(event.hallId, event.reason, {
    ...event.payload,
    taskCardId: event.taskCardId,
    messageId: event.messageId,
    projectId: event.projectId,
    taskId: event.taskId,
    roomId: event.roomId,
  });
}
