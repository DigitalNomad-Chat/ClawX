"use strict";

/**
 * Collaboration Hall — Store Layer
 * Wraps 3 JsonStore instances with CRUD, validation, and normalization.
 */
import { randomUUID } from "node:crypto";
import { JsonStore } from "../_shared/json-store";
import { getModuleFilePath } from "../_shared/runtime-path";
import { publishCollabEvent } from "./event-publisher";
import type {
  CollaborationHall,
  CollaborationHallMessageStoreSnapshot,
  CollaborationHallStoreSnapshot,
  CollaborationTaskCardStoreSnapshot,
  HallExecutionItem,
  HallMessage,
  HallMessageKind,
  HallParticipant,
  HallTaskCard,
  HallTaskStage,
  TaskDiscussionCycle,
} from "./types";

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

export const DEFAULT_COLLABORATION_HALL_ID = "main";

const HALL_MESSAGE_KINDS: HallMessageKind[] = [
  "chat",
  "task",
  "proposal",
  "decision",
  "handoff",
  "status",
  "review",
  "result",
  "system",
];

const HALL_TASK_STAGES: HallTaskStage[] = [
  "discussion",
  "execution",
  "review",
  "blocked",
  "completed",
];

// ---------------------------------------------------------------------------
//  JsonStore instances
// ---------------------------------------------------------------------------

function createCollaborationStore(): JsonStore<CollaborationHallStoreSnapshot> {
  return new JsonStore<CollaborationHallStoreSnapshot>({
    filePath: getModuleFilePath("collaboration", "halls.json"),
    defaultValue: {
      halls: [],
      executionLocks: [],
      updatedAt: new Date(0).toISOString(),
    },
    schemaVersion: 1,
  });
}

function createMessageStore(): JsonStore<CollaborationHallMessageStoreSnapshot> {
  return new JsonStore<CollaborationHallMessageStoreSnapshot>({
    filePath: getModuleFilePath("collaboration", "messages.json"),
    defaultValue: {
      messages: [],
      updatedAt: new Date(0).toISOString(),
    },
    schemaVersion: 1,
  });
}

function createTaskCardStore(): JsonStore<CollaborationTaskCardStoreSnapshot> {
  return new JsonStore<CollaborationTaskCardStoreSnapshot>({
    filePath: getModuleFilePath("collaboration", "task-cards.json"),
    defaultValue: {
      taskCards: [],
      updatedAt: new Date(0).toISOString(),
    },
    schemaVersion: 1,
  });
}

// Lazily instantiate stores to avoid side-effects during module load
// (e.g. app.getPath('userData') may not be ready in all bootstrap paths).
let hallStore: JsonStore<CollaborationHallStoreSnapshot> | null = null;
let messageStore: JsonStore<CollaborationHallMessageStoreSnapshot> | null = null;
let taskCardStore: JsonStore<CollaborationTaskCardStoreSnapshot> | null = null;

function getHallStore(): JsonStore<CollaborationHallStoreSnapshot> {
  if (!hallStore) hallStore = createCollaborationStore();
  return hallStore;
}

function getMessageStore(): JsonStore<CollaborationHallMessageStoreSnapshot> {
  if (!messageStore) messageStore = createMessageStore();
  return messageStore;
}

function getTaskCardStore(): JsonStore<CollaborationTaskCardStoreSnapshot> {
  if (!taskCardStore) taskCardStore = createTaskCardStore();
  return taskCardStore;
}

// ---------------------------------------------------------------------------
//  Load helpers
// ---------------------------------------------------------------------------

export async function loadHallStore(): Promise<CollaborationHallStoreSnapshot> {
  return getHallStore().read();
}

export async function loadMessageStore(): Promise<CollaborationHallMessageStoreSnapshot> {
  return getMessageStore().read();
}

export async function loadTaskCardStore(): Promise<CollaborationTaskCardStoreSnapshot> {
  return getTaskCardStore().read();
}

// ---------------------------------------------------------------------------
//  Hall operations
// ---------------------------------------------------------------------------

export function getHall(
  store: CollaborationHallStoreSnapshot,
  hallId = DEFAULT_COLLABORATION_HALL_ID,
): CollaborationHall | undefined {
  return store.halls.find((h) => h.hallId === hallId);
}

export async function ensureDefaultHall(
  participants: HallParticipant[],
): Promise<CollaborationHall> {
  const store = await loadHallStore();
  const existing = getHall(store);
  const now = new Date().toISOString();

  if (existing) {
    existing.participants = normalizeParticipants(participants);
    existing.updatedAt = now;
    store.updatedAt = now;
    await getHallStore().write(store);
    return existing;
  }

  const hall: CollaborationHall = {
    hallId: DEFAULT_COLLABORATION_HALL_ID,
    title: "协作大厅",
    description: "多智能体群聊大厅，用于任务讨论、指派、执行与评审。",
    participants: normalizeParticipants(participants),
    taskCardIds: [],
    messageIds: [],
    lastMessageId: null,
    createdAt: now,
    updatedAt: now,
  };

  store.halls.push(hall);
  store.updatedAt = now;
  await getHallStore().write(store);
  return hall;
}

// ---------------------------------------------------------------------------
//  Message operations
// ---------------------------------------------------------------------------

export interface AppendMessageInput {
  hallId?: string;
  kind?: HallMessageKind;
  authorParticipantId: string;
  authorLabel: string;
  authorSemanticRole?: HallParticipant["semanticRole"];
  content: string;
  targetParticipantIds?: string[];
  mentionTargets?: HallMessage["mentionTargets"];
  taskCardId?: string;
  taskId?: string;
  roomId?: string;
  payload?: HallMessage["payload"];
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<HallMessage> {
  const hallId = input.hallId?.trim() || DEFAULT_COLLABORATION_HALL_ID;
  const [hStore, mStore] = await Promise.all([
    loadHallStore(),
    loadMessageStore(),
  ]);

  const hall = getHall(hStore, hallId);
  if (!hall) {
    throw new Error(`Hall '${hallId}' not found`);
  }

  const now = new Date().toISOString();
  const message: HallMessage = {
    hallId,
    messageId: randomUUID(),
    kind: input.kind && HALL_MESSAGE_KINDS.includes(input.kind) ? input.kind : "chat",
    authorParticipantId: input.authorParticipantId.trim(),
    authorLabel: input.authorLabel.trim(),
    authorSemanticRole: input.authorSemanticRole,
    content: input.content.trim(),
    targetParticipantIds: input.targetParticipantIds ?? [],
    mentionTargets: input.mentionTargets ?? [],
    taskCardId: input.taskCardId?.trim(),
    taskId: input.taskId?.trim(),
    roomId: input.roomId?.trim(),
    payload: input.payload,
    createdAt: now,
  };

  mStore.messages.push(message);
  mStore.updatedAt = now;

  hall.messageIds = [...new Set([...hall.messageIds, message.messageId])];
  hall.lastMessageId = message.messageId;
  hall.latestMessageAt = now;
  hall.updatedAt = now;
  hStore.updatedAt = now;

  await Promise.all([getHallStore().write(hStore), getMessageStore().write(mStore)]);

  publishCollabEvent({
    type: "invalidate",
    hallId,
    messageId: message.messageId,
    taskCardId: message.taskCardId,
    taskId: message.taskId,
    roomId: message.roomId,
    reason: "message_created",
  });

  return message;
}

export function listMessages(
  store: CollaborationHallMessageStoreSnapshot,
  options?: { hallId?: string; taskCardId?: string; limit?: number },
): HallMessage[] {
  const filtered = store.messages
    .filter((m) => !options?.hallId || m.hallId === options.hallId)
    .filter((m) => !options?.taskCardId || m.taskCardId === options.taskCardId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return options?.limit ? filtered.slice(-options.limit) : filtered;
}

export async function deleteMessagesForTaskCard(
  taskCardId: string,
  hallId?: string,
): Promise<number> {
  const resolvedHallId = hallId?.trim() || DEFAULT_COLLABORATION_HALL_ID;
  const [hStore, mStore] = await Promise.all([
    loadHallStore(),
    loadMessageStore(),
  ]);

  const hall = getHall(hStore, resolvedHallId);
  if (!hall) return 0;

  const beforeCount = mStore.messages.length;
  mStore.messages = mStore.messages.filter((m) => {
    if (m.hallId !== resolvedHallId) return true;
    return m.taskCardId !== taskCardId;
  });
  const removed = beforeCount - mStore.messages.length;
  if (removed === 0) return 0;

  const now = new Date().toISOString();
  mStore.updatedAt = now;

  const remainingHallMessages = mStore.messages
    .filter((m) => m.hallId === resolvedHallId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const lastMessage = remainingHallMessages.at(-1);

  hall.messageIds = remainingHallMessages.map((m) => m.messageId);
  hall.lastMessageId = lastMessage?.messageId ?? null;
  hall.latestMessageAt = lastMessage?.createdAt;
  hall.updatedAt = now;
  hStore.updatedAt = now;

  await Promise.all([getHallStore().write(hStore), getMessageStore().write(mStore)]);

  publishCollabEvent({
    type: "invalidate",
    hallId: resolvedHallId,
    taskCardId,
    reason: "task_messages_deleted",
  });

  return removed;
}

// ---------------------------------------------------------------------------
//  TaskCard operations
// ---------------------------------------------------------------------------

export interface CreateTaskCardInput {
  hallId?: string;
  title: string;
  description: string;
  createdByParticipantId: string;
  stage?: HallTaskStage;
  status?: HallTaskCard["status"];
  currentOwnerParticipantId?: string;
  currentOwnerLabel?: string;
  plannedExecutionItems?: HallExecutionItem[];
  doneWhen?: string;
}

export async function createTaskCard(
  input: CreateTaskCardInput,
): Promise<HallTaskCard> {
  const hallId = input.hallId?.trim() || DEFAULT_COLLABORATION_HALL_ID;
  const [hStore, tStore] = await Promise.all([
    loadHallStore(),
    loadTaskCardStore(),
  ]);

  const hall = getHall(hStore, hallId);
  if (!hall) {
    throw new Error(`Hall '${hallId}' not found`);
  }

  const now = new Date().toISOString();
  const projectId = "collab-hall";
  const taskId = randomUUID();
  const taskCardId = `${projectId}:${taskId}`;

  const taskCard: HallTaskCard = {
    hallId,
    taskCardId,
    projectId,
    taskId,
    title: input.title.trim(),
    description: input.description.trim(),
    stage: input.stage && HALL_TASK_STAGES.includes(input.stage) ? input.stage : "discussion",
    status: input.status && ["todo", "in_progress", "blocked", "done"].includes(input.status)
      ? input.status
      : "todo",
    createdByParticipantId: input.createdByParticipantId.trim(),
    currentOwnerParticipantId: input.currentOwnerParticipantId?.trim(),
    currentOwnerLabel: input.currentOwnerLabel?.trim(),
    blockers: [],
    requiresInputFrom: [],
    mentionedParticipantIds: [],
    plannedExecutionOrder: input.plannedExecutionItems?.map((i) => i.participantId) ?? [],
    plannedExecutionItems: input.plannedExecutionItems ?? [],
    sessionKeys: [],
    doneWhen: input.doneWhen?.trim(),
    executionLog: [],
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };

  tStore.taskCards.push(taskCard);
  tStore.updatedAt = now;

  hall.taskCardIds = [...new Set([...hall.taskCardIds, taskCard.taskCardId])];
  hall.updatedAt = now;
  hStore.updatedAt = now;

  await Promise.all([getHallStore().write(hStore), getTaskCardStore().write(tStore)]);

  publishCollabEvent({
    type: "invalidate",
    hallId,
    taskCardId: taskCard.taskCardId,
    projectId: taskCard.projectId,
    taskId: taskCard.taskId,
    reason: "task_created",
  });

  return taskCard;
}

export interface UpdateTaskCardInput {
  title?: string;
  description?: string;
  stage?: HallTaskStage;
  status?: HallTaskCard["status"];
  currentOwnerParticipantId?: string | null;
  currentOwnerLabel?: string | null;
  blockers?: string[];
  requiresInputFrom?: string[];
  plannedExecutionOrder?: string[];
  plannedExecutionItems?: HallExecutionItem[];
  currentExecutionItem?: HallExecutionItem | null;
  doneWhen?: string | null;
  latestSummary?: string | null;
  discussionCycle?: TaskDiscussionCycle | null;
  proposal?: string | null;
  decision?: string | null;
  sessionKeys?: string[];
  artifactRefs?: import("./types").TaskArtifact[];
  rollbackPlan?: string | null;
  budgetLimit?: number | null;
  budgetAlertThreshold?: number | null;
  dueDate?: string | null;
  archivedAt?: string | null;
  archivedByParticipantId?: string | null;
  archivedByLabel?: string | null;
}

export async function updateTaskCard(
  taskCardId: string,
  input: UpdateTaskCardInput,
): Promise<HallTaskCard> {
  const store = await loadTaskCardStore();
  const taskCard = store.taskCards.find((c) => c.taskCardId === taskCardId);
  if (!taskCard) {
    throw new Error(`Task card '${taskCardId}' not found`);
  }

  const now = new Date().toISOString();

  const prevStage = taskCard.stage;
  const prevStatus = taskCard.status;
  const prevOwner = taskCard.currentOwnerParticipantId;

  if (input.title !== undefined) taskCard.title = input.title.trim();
  if (input.description !== undefined) taskCard.description = input.description.trim();
  if (input.stage !== undefined && HALL_TASK_STAGES.includes(input.stage)) taskCard.stage = input.stage;
  if (input.status !== undefined) taskCard.status = input.status;
  if (input.currentOwnerParticipantId !== undefined)
    taskCard.currentOwnerParticipantId = input.currentOwnerParticipantId?.trim() ?? undefined;
  if (input.currentOwnerLabel !== undefined)
    taskCard.currentOwnerLabel = input.currentOwnerLabel?.trim() ?? undefined;
  if (input.blockers !== undefined) taskCard.blockers = input.blockers;
  if (input.requiresInputFrom !== undefined) taskCard.requiresInputFrom = input.requiresInputFrom;
  if (input.plannedExecutionOrder !== undefined) taskCard.plannedExecutionOrder = input.plannedExecutionOrder;
  if (input.plannedExecutionItems !== undefined) taskCard.plannedExecutionItems = input.plannedExecutionItems;
  if (input.currentExecutionItem !== undefined)
    taskCard.currentExecutionItem = input.currentExecutionItem ?? undefined;
  if (input.doneWhen !== undefined) taskCard.doneWhen = input.doneWhen?.trim() ?? undefined;
  if (input.latestSummary !== undefined) taskCard.latestSummary = input.latestSummary?.trim() ?? undefined;
  if (input.discussionCycle !== undefined) taskCard.discussionCycle = input.discussionCycle ?? undefined;
  if (input.proposal !== undefined) taskCard.proposal = input.proposal?.trim() ?? undefined;
  if (input.decision !== undefined) taskCard.decision = input.decision?.trim() ?? undefined;
  if (input.sessionKeys !== undefined) taskCard.sessionKeys = input.sessionKeys;
  if (input.archivedAt !== undefined) taskCard.archivedAt = input.archivedAt ?? undefined;
  if (input.archivedByParticipantId !== undefined)
    taskCard.archivedByParticipantId = input.archivedByParticipantId?.trim() ?? undefined;
  if (input.archivedByLabel !== undefined)
    taskCard.archivedByLabel = input.archivedByLabel?.trim() ?? undefined;
  if (input.artifactRefs !== undefined) taskCard.artifactRefs = input.artifactRefs;
  if (input.rollbackPlan !== undefined) taskCard.rollbackPlan = input.rollbackPlan?.trim() ?? undefined;
  if (input.budgetLimit !== undefined) taskCard.budgetLimit = input.budgetLimit ?? undefined;
  if (input.budgetAlertThreshold !== undefined) taskCard.budgetAlertThreshold = input.budgetAlertThreshold ?? undefined;
  if (input.dueDate !== undefined) taskCard.dueDate = input.dueDate ?? undefined;

  // Auto-append execution log when stage/status/owner changes
  const log = taskCard.executionLog ?? [];
  if (input.stage !== undefined && input.stage !== prevStage) {
    const action: import("./types").HallExecutionLogEntry["action"] =
      input.stage === "completed" ? "completed" :
      input.stage === "blocked" ? "blocked" :
      input.stage === "execution" ? "started" : "assigned";
    log.push({
      participantId: taskCard.currentOwnerParticipantId ?? "system",
      participantLabel: taskCard.currentOwnerLabel ?? "system",
      action,
      timestamp: now,
      note: `stage: ${prevStage} → ${input.stage}`,
    });
  }
  if (input.status !== undefined && input.status !== prevStatus && input.status === "blocked") {
    log.push({
      participantId: taskCard.currentOwnerParticipantId ?? "system",
      participantLabel: taskCard.currentOwnerLabel ?? "system",
      action: "blocked",
      timestamp: now,
      note: `status: ${prevStatus} → blocked`,
    });
  }
  if (input.currentOwnerParticipantId !== undefined && input.currentOwnerParticipantId?.trim() !== prevOwner) {
    log.push({
      participantId: input.currentOwnerParticipantId?.trim() ?? "system",
      participantLabel: input.currentOwnerLabel?.trim() ?? input.currentOwnerParticipantId?.trim() ?? "system",
      action: input.currentOwnerParticipantId ? "assigned" : "handoff",
      timestamp: now,
      note: prevOwner ? `owner: ${prevOwner} → ${input.currentOwnerParticipantId}` : `assigned to ${input.currentOwnerParticipantId}`,
    });
  }
  if (log.length > (taskCard.executionLog?.length ?? 0)) {
    taskCard.executionLog = log;
  }

  taskCard.updatedAt = now;
  store.updatedAt = now;

  await getTaskCardStore().write(store);

  publishCollabEvent({
    type: "invalidate",
    hallId: taskCard.hallId,
    taskCardId: taskCard.taskCardId,
    projectId: taskCard.projectId,
    taskId: taskCard.taskId,
    reason: "task_updated",
  });

  return taskCard;
}

export async function archiveTaskCard(
  taskCardId: string,
  archivedByParticipantId?: string,
  archivedByLabel?: string,
): Promise<HallTaskCard> {
  return updateTaskCard(taskCardId, {
    archivedAt: new Date().toISOString(),
    archivedByParticipantId: archivedByParticipantId ?? null,
    archivedByLabel: archivedByLabel ?? null,
  });
}

export async function deleteTaskCard(taskCardId: string): Promise<HallTaskCard> {
  const [hStore, tStore] = await Promise.all([
    loadHallStore(),
    loadTaskCardStore(),
  ]);

  const index = tStore.taskCards.findIndex((c) => c.taskCardId === taskCardId);
  if (index === -1) {
    throw new Error(`Task card '${taskCardId}' not found`);
  }

  const taskCard = tStore.taskCards[index];
  tStore.taskCards.splice(index, 1);
  const now = new Date().toISOString();
  tStore.updatedAt = now;

  const hall = getHall(hStore, taskCard.hallId);
  if (hall) {
    hall.taskCardIds = hall.taskCardIds.filter((id) => id !== taskCardId);
    hall.updatedAt = now;
    hStore.updatedAt = now;
  }

  await Promise.all([
    hall ? getHallStore().write(hStore) : Promise.resolve(),
    getTaskCardStore().write(tStore),
  ]);

  // Also delete associated messages
  await deleteMessagesForTaskCard(taskCardId, taskCard.hallId);

  publishCollabEvent({
    type: "invalidate",
    hallId: taskCard.hallId,
    taskCardId: taskCard.taskCardId,
    projectId: taskCard.projectId,
    taskId: taskCard.taskId,
    reason: "task_deleted",
  });

  return taskCard;
}

export function listTaskCards(
  store: CollaborationTaskCardStoreSnapshot,
  options?: { hallId?: string; stage?: HallTaskStage; includeArchived?: boolean },
): HallTaskCard[] {
  return store.taskCards
    .filter((c) => !options?.hallId || c.hallId === options.hallId)
    .filter((c) => !options?.stage || c.stage === options.stage)
    .filter((c) => options?.includeArchived === true || !c.archivedAt)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function getTaskCard(
  store: CollaborationTaskCardStoreSnapshot,
  taskCardId: string,
): HallTaskCard | undefined {
  return store.taskCards.find((c) => c.taskCardId === taskCardId);
}

// ---------------------------------------------------------------------------
//  Execution Lock operations
// ---------------------------------------------------------------------------

export async function acquireExecutionLock(
  taskCardId: string,
  participantId: string,
  participantLabel: string,
  reason: "execution" | "discussion" | "review" = "execution",
  ttlMs: number = 600_000,
): Promise<import("./types").ExecutionLock> {
  const store = await loadTaskCardStore();
  const taskCard = getTaskCard(store, taskCardId);
  if (!taskCard) {
    throw new Error(`Task card '${taskCardId}' not found`);
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  // Release existing lock if any
  if (taskCard.executionLock && !taskCard.executionLock.releasedAt) {
    taskCard.executionLock.releasedAt = now;
    taskCard.executionLock.releasedReason = "superseded";
  }

  const lock: import("./types").ExecutionLock = {
    lockId: `${taskCardId}:${participantId}:${Date.now()}`,
    taskCardId,
    taskId: taskCard.taskId,
    projectId: taskCard.projectId,
    participantId,
    participantLabel,
    acquiredAt: now,
    expiresAt,
    reason,
  };

  taskCard.executionLock = lock;
  taskCard.updatedAt = now;
  store.updatedAt = now;

  await getTaskCardStore().write(store);
  return lock;
}

export async function releaseExecutionLock(
  taskCardId: string,
  releasedReason?: string,
): Promise<void> {
  const store = await loadTaskCardStore();
  const taskCard = getTaskCard(store, taskCardId);
  if (!taskCard || !taskCard.executionLock) return;

  const now = new Date().toISOString();
  taskCard.executionLock.releasedAt = now;
  taskCard.executionLock.releasedReason = releasedReason ?? "released";
  taskCard.updatedAt = now;
  store.updatedAt = now;

  await getTaskCardStore().write(store);
}

export async function getActiveLock(taskCardId: string): Promise<import("./types").ExecutionLock | undefined> {
  const store = await loadTaskCardStore();
  const taskCard = getTaskCard(store, taskCardId);
  if (!taskCard?.executionLock) return undefined;

  const lock = taskCard.executionLock;
  if (lock.releasedAt) return undefined;
  if (lock.expiresAt && new Date(lock.expiresAt) < new Date()) return undefined;

  return lock;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function normalizeParticipants(participants: HallParticipant[]): HallParticipant[] {
  const seen = new Set<string>();
  const normalized: HallParticipant[] = [];

  for (const p of participants) {
    const id = p.participantId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const displayName = p.displayName.trim() || id;
    normalized.push({
      ...p,
      participantId: id,
      displayName,
      aliases: [
        ...new Set(
          (p.aliases ?? [])
            .map((a) => a.trim())
            .filter((a) => a.length > 0)
            .concat([displayName, id]),
        ),
      ],
    });
  }

  return normalized.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
