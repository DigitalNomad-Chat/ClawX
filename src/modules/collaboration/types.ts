/**
 * Collaboration Hall — Shared Types (Frontend)
 * Mirror of electron/modules/collaboration/types.ts
 */

export type HallMessageKind =
  | "chat"
  | "task"
  | "proposal"
  | "decision"
  | "handoff"
  | "status"
  | "review"
  | "result"
  | "system";

export type HallTaskStage = "discussion" | "execution" | "review" | "blocked" | "completed";

export type HallSemanticRole = "planner" | "coder" | "reviewer" | "manager" | "generalist";

export type TaskState = "todo" | "in_progress" | "blocked" | "done";

export interface MentionTarget {
  raw: string;
  participantId: string;
  displayName: string;
  semanticRole: HallSemanticRole;
}

export interface HallParticipant {
  participantId: string;
  agentId?: string;
  displayName: string;
  semanticRole: HallSemanticRole;
  active: boolean;
  aliases: string[];
  isHuman?: boolean;
}

export interface TaskDiscussionCycle {
  cycleId: string;
  openedAt: string;
  openedByParticipantId: string;
  expectedParticipantIds: string[];
  completedParticipantIds: string[];
  closedAt?: string;
}

export interface HallExecutionItem {
  itemId: string;
  participantId: string;
  task: string;
  handoffToParticipantId?: string;
  handoffWhen?: string;
}

export interface ExecutionLock {
  lockId: string;
  taskCardId: string;
  taskId?: string;
  projectId?: string;
  participantId: string;
  participantLabel: string;
  acquiredAt: string;
  expiresAt?: string;
  releasedAt?: string;
  releasedReason?: string;
  reason: "execution" | "discussion" | "review";
}

export interface TaskArtifact {
  artifactId: string;
  type: "code" | "doc" | "link" | "other";
  label: string;
  location: string;
}

export interface HallExecutionLogEntry {
  participantId: string;
  participantLabel: string;
  action: "assigned" | "started" | "handoff" | "completed" | "blocked";
  timestamp: string;
  note?: string;
}

export interface BudgetPolicy {
  policyId: string;
  name: string;
  dailyTokenLimit?: number;
  dailyCostLimit?: number;
  perTaskTokenLimit?: number;
  alertThreshold: number;
  createdAt: string;
}

export interface TaskBudgetAllocation {
  taskCardId: string;
  policyId: string;
  consumedTokens: number;
  consumedCost: number;
  lastUpdatedAt: string;
}

export interface StructuredHandoffPacket {
  goal: string;
  currentResult: string;
  doneWhen: string;
  blockers: string[];
  nextOwner: string;
  requiresInputFrom: string[];
}

export interface HallMessagePayload {
  projectId?: string;
  taskId?: string;
  taskCardId?: string;
  roomId?: string;
  proposal?: string;
  decision?: string;
  doneWhen?: string;
  executionOrder?: string[];
  executionItems?: HallExecutionItem[];
  nextOwnerParticipantId?: string;
  reviewOutcome?: "approved" | "rejected";
  taskStatus?: TaskState;
  taskStage?: HallTaskStage;
  status?: string;
  handoff?: StructuredHandoffPacket;
  sessionKey?: string;
  sourceSessionKey?: string;
  sourceTool?: string;
}

export interface HallMessage {
  hallId: string;
  messageId: string;
  kind: HallMessageKind;
  authorParticipantId: string;
  authorLabel: string;
  authorSemanticRole?: HallSemanticRole;
  content: string;
  targetParticipantIds: string[];
  mentionTargets: MentionTarget[];
  projectId?: string;
  taskId?: string;
  taskCardId?: string;
  roomId?: string;
  payload?: HallMessagePayload;
  createdAt: string;
}

export interface HallTaskCard {
  hallId: string;
  taskCardId: string;
  projectId: string;
  taskId: string;
  roomId?: string;
  title: string;
  description: string;
  stage: HallTaskStage;
  status: TaskState;
  createdByParticipantId: string;
  currentOwnerParticipantId?: string;
  currentOwnerLabel?: string;
  proposal?: string;
  decision?: string;
  doneWhen?: string;
  latestSummary?: string;
  blockers: string[];
  requiresInputFrom: string[];
  mentionedParticipantIds: string[];
  plannedExecutionOrder: string[];
  plannedExecutionItems: HallExecutionItem[];
  currentExecutionItem?: HallExecutionItem;
  sessionKeys: string[];
  discussionCycle?: TaskDiscussionCycle;
  executionLock?: ExecutionLock;
  executionLog?: HallExecutionLogEntry[];
  artifactRefs?: TaskArtifact[];
  rollbackPlan?: string;
  budgetLimit?: number;
  budgetAlertThreshold?: number;
  dueDate?: string;
  archivedAt?: string;
  archivedByParticipantId?: string;
  archivedByLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationHall {
  hallId: string;
  title: string;
  description?: string;
  participants: HallParticipant[];
  taskCardIds: string[];
  messageIds: string[];
  lastMessageId?: string | null;
  latestMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationHallSummary {
  hallId: string;
  headline: string;
  activeTaskCount: number;
  waitingReviewCount: number;
  blockedTaskCount: number;
  currentSpeakerLabel?: string;
  updatedAt: string;
}

export interface HallTaskSummary {
  taskCardId: string;
  projectId: string;
  taskId: string;
  headline: string;
  currentOwnerLabel?: string;
  updatedAt: string;
}

export interface CollaborationHallStoreSnapshot {
  halls: CollaborationHall[];
  executionLocks: ExecutionLock[];
  updatedAt: string;
}

export interface CollaborationHallMessageStoreSnapshot {
  messages: HallMessage[];
  updatedAt: string;
}

export interface CollaborationTaskCardStoreSnapshot {
  taskCards: HallTaskCard[];
  updatedAt: string;
}

export interface CollaborationOverview {
  hall: CollaborationHall;
  messages: HallMessage[];
  taskCards: HallTaskCard[];
}

export interface CreateMessageInput {
  content: string;
  kind?: HallMessageKind;
  taskCardId?: string;
  authorParticipantId: string;
  authorLabel: string;
}

export interface CreateTaskCardInput {
  title: string;
  description: string;
  createdByParticipantId: string;
}

export interface UpdateTaskCardInput {
  title?: string;
  description?: string;
  stage?: HallTaskStage;
  status?: TaskState;
  currentOwnerParticipantId?: string | null;
  currentOwnerLabel?: string | null;
  blockers?: string[];
  requiresInputFrom?: string[];
  plannedExecutionOrder?: string[];
  plannedExecutionItems?: HallExecutionItem[];
  doneWhen?: string | null;
  artifactRefs?: TaskArtifact[];
  rollbackPlan?: string | null;
  budgetLimit?: number | null;
  budgetAlertThreshold?: number | null;
  dueDate?: string | null;
}
