/**
 * Collaboration Hall — Zustand Store (Frontend)
 */
import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';
import type {
  CollaborationHall,
  HallMessage,
  HallTaskCard,
  TaskArtifact,
  CreateMessageInput,
  CreateTaskCardInput,
  UpdateTaskCardInput,
} from './types';

interface CollaborationOverview {
  success: boolean;
  hall: CollaborationHall | null;
  messages: HallMessage[];
  taskCards: HallTaskCard[];
  stats: {
    totalMessages: number;
    activeTasks: number;
    completedTasks: number;
    blockedTasks: number;
  };
}

interface CollaborationState {
  hall: CollaborationHall | null;
  messages: HallMessage[];
  taskCards: HallTaskCard[];
  selectedTaskCardId: string | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number;

  // Actions
  fetchOverview: () => Promise<void>;
  fetchMessages: (options?: { taskCardId?: string; limit?: number }) => Promise<void>;
  fetchTaskCards: () => Promise<void>;
  sendMessage: (input: CreateMessageInput) => Promise<HallMessage | null>;
  createTaskCard: (input: CreateTaskCardInput) => Promise<HallTaskCard | null>;
  updateTaskCard: (taskCardId: string, input: UpdateTaskCardInput) => Promise<HallTaskCard | null>;
  archiveTaskCard: (taskCardId: string, archivedByParticipantId?: string) => Promise<HallTaskCard | null>;
  deleteTaskCard: (taskCardId: string) => Promise<boolean>;
  assignTask: (
    taskCardId: string,
    participantId: string,
    label: string,
    options?: { note?: string; dispatch?: boolean }
  ) => Promise<HallTaskCard | null>;
  handoffTask: (
    taskCardId: string,
    nextParticipantId: string,
    nextLabel: string,
    options?: { note?: string; dispatch?: boolean }
  ) => Promise<HallTaskCard | null>;
  submitReview: (
    taskCardId: string,
    participantId: string,
    outcome: 'approved' | 'rejected',
    note?: string
  ) => Promise<HallTaskCard | null>;
  openDiscussion: (taskCardId: string, openedByParticipantId: string) => Promise<HallTaskCard | null>;
  selectTaskCard: (taskCardId: string | null) => void;
  dispatchTask: (taskCardId: string, participantId: string) => Promise<void>;
  autoAssignTask: (taskCardId: string) => Promise<void>;
  autoAdvanceTask: (taskCardId: string) => Promise<void>;
  stopTask: (taskCardId: string) => Promise<HallTaskCard | null>;
  setExecutionOrder: (taskCardId: string, plannedExecutionOrder: string[], plannedExecutionItems: import('./types').HallExecutionItem[]) => Promise<HallTaskCard | null>;
  continueDiscussion: (taskCardId: string, openedByParticipantId: string) => Promise<HallTaskCard | null>;

  // Artifacts
  fetchArtifacts: (taskCardId: string) => Promise<TaskArtifact[]>;
  addArtifact: (taskCardId: string, input: { type: TaskArtifact['type']; label: string; location: string }) => Promise<TaskArtifact | null>;
  removeArtifact: (taskCardId: string, artifactId: string) => Promise<boolean>;
}

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  hall: null,
  messages: [],
  taskCards: [],
  selectedTaskCardId: null,
  loading: false,
  error: null,
  lastUpdated: 0,

  fetchOverview: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<CollaborationOverview>('/api/collaboration/overview');
      if (data.success) {
        set({
          hall: data.hall,
          messages: data.messages,
          taskCards: data.taskCards,
          lastUpdated: Date.now(),
        });
      } else {
        set({ error: 'Failed to load collaboration overview' });
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },

  fetchMessages: async (options) => {
    const params = new URLSearchParams();
    if (options?.taskCardId) params.set('taskCardId', options.taskCardId);
    if (options?.limit) params.set('limit', String(options.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    try {
      const data = await hostApiFetch<{ success: boolean; messages: HallMessage[] }>(
        `/api/collaboration/messages${query}`
      );
      if (data.success) {
        set({ messages: data.messages });
      }
    } catch (err) {
      console.warn('[collaboration] fetchMessages failed:', err);
    }
  },

  fetchTaskCards: async () => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCards: HallTaskCard[] }>(
        '/api/collaboration/task-cards'
      );
      if (data.success) {
        set({ taskCards: data.taskCards });
      }
    } catch (err) {
      console.warn('[collaboration] fetchTaskCards failed:', err);
    }
  },

  sendMessage: async (input) => {
    try {
      const data = await hostApiFetch<{ success: boolean; message: HallMessage }>(
        '/api/collaboration/messages',
        {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            kind: input.kind || 'chat',
          }),
        }
      );
      if (data.success && data.message) {
        const currentMessages = get().messages;
        set({ messages: [...currentMessages, data.message] });
        return data.message;
      }
    } catch (err) {
      console.warn('[collaboration] sendMessage failed:', err);
    }
    return null;
  },

  createTaskCard: async (input) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        '/api/collaboration/task-cards',
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      if (data.success) {
        const current = get().taskCards;
        set({ taskCards: [data.taskCard, ...current] });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] createTaskCard failed:', err);
    }
    return null;
  },

  updateTaskCard: async (taskCardId, input) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] updateTaskCard failed:', err);
    }
    return null;
  },

  archiveTaskCard: async (taskCardId, archivedByParticipantId) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/archive`,
        {
          method: 'POST',
          body: JSON.stringify({ archivedByParticipantId }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] archiveTaskCard failed:', err);
    }
    return null;
  },

  deleteTaskCard: async (taskCardId) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}`,
        { method: 'DELETE' }
      );
      if (data.success) {
        const current = get().taskCards.filter((t) => t.taskCardId !== taskCardId);
        set({ taskCards: current });
        return true;
      }
    } catch (err) {
      console.warn('[collaboration] deleteTaskCard failed:', err);
    }
    return false;
  },

  assignTask: async (taskCardId, participantId, label, options) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/assign`,
        {
          method: 'POST',
          body: JSON.stringify({
            participantId,
            label,
            note: options?.note,
            dispatch: options?.dispatch,
          }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] assignTask failed:', err);
    }
    return null;
  },

  handoffTask: async (taskCardId, nextParticipantId, nextLabel, options) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/handoff`,
        {
          method: 'POST',
          body: JSON.stringify({
            nextParticipantId,
            nextLabel,
            note: options?.note,
            dispatch: options?.dispatch,
          }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] handoffTask failed:', err);
    }
    return null;
  },

  submitReview: async (taskCardId, participantId, outcome, note) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ participantId, outcome, note }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] submitReview failed:', err);
    }
    return null;
  },

  openDiscussion: async (taskCardId, openedByParticipantId) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/open-discussion`,
        {
          method: 'POST',
          body: JSON.stringify({ openedByParticipantId }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] openDiscussion failed:', err);
    }
    return null;
  },

  stopTask: async (taskCardId: string) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/stop`,
        { method: 'POST' }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] stopTask failed:', err);
    }
    return null;
  },

  setExecutionOrder: async (taskCardId: string, plannedExecutionOrder: string[], plannedExecutionItems: import('./types').HallExecutionItem[]) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/execution-order`,
        {
          method: 'POST',
          body: JSON.stringify({ plannedExecutionOrder, plannedExecutionItems }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] setExecutionOrder failed:', err);
    }
    return null;
  },

  continueDiscussion: async (taskCardId: string, openedByParticipantId: string) => {
    try {
      const data = await hostApiFetch<{ success: boolean; taskCard: HallTaskCard }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/continue-discussion`,
        {
          method: 'POST',
          body: JSON.stringify({ openedByParticipantId }),
        }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
        return data.taskCard;
      }
    } catch (err) {
      console.warn('[collaboration] continueDiscussion failed:', err);
    }
    return null;
  },

  selectTaskCard: (taskCardId) => {
    set({ selectedTaskCardId: taskCardId });
  },

  dispatchTask: async (taskCardId, participantId) => {
    try {
      const data = await hostApiFetch<{
        success: boolean;
        result: { success: boolean; message?: HallMessage; error?: string };
      }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/dispatch`,
        {
          method: 'POST',
          body: JSON.stringify({ participantId }),
        }
      );
      if (data.success && data.result.success) {
        // Refresh messages if a message was created
        if (data.result.message) {
          const currentMessages = get().messages;
          set({ messages: [...currentMessages, data.result.message] });
        }
      }
    } catch (err) {
      console.warn('[collaboration] dispatchTask failed:', err);
    }
  },

  autoAssignTask: async (taskCardId) => {
    try {
      const data = await hostApiFetch<{
        success: boolean;
        taskCard: HallTaskCard;
      }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/auto-assign`,
        { method: 'POST' }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
      }
    } catch (err) {
      console.warn('[collaboration] autoAssignTask failed:', err);
    }
  },

  autoAdvanceTask: async (taskCardId) => {
    try {
      const data = await hostApiFetch<{
        success: boolean;
        taskCard: HallTaskCard;
      }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/auto-advance`,
        { method: 'POST' }
      );
      if (data.success) {
        const current = get().taskCards.map((t) =>
          t.taskCardId === taskCardId ? data.taskCard : t
        );
        set({ taskCards: current });
      }
    } catch (err) {
      console.warn('[collaboration] autoAdvanceTask failed:', err);
    }
  },

  fetchArtifacts: async (taskCardId) => {
    try {
      const data = await hostApiFetch<{ success: boolean; artifacts: TaskArtifact[] }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/artifacts`
      );
      if (data.success) return data.artifacts;
    } catch (err) {
      console.warn('[collaboration] fetchArtifacts failed:', err);
    }
    return [];
  },

  addArtifact: async (taskCardId, input) => {
    try {
      const data = await hostApiFetch<{ success: boolean; artifact: TaskArtifact }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/artifacts`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      if (data.success) {
        // Optimistically update local task card
        const current = get().taskCards.map((t) => {
          if (t.taskCardId !== taskCardId) return t;
          const refs = t.artifactRefs ?? [];
          return { ...t, artifactRefs: [...refs, data.artifact] };
        });
        set({ taskCards: current });
        return data.artifact;
      }
    } catch (err) {
      console.warn('[collaboration] addArtifact failed:', err);
    }
    return null;
  },

  removeArtifact: async (taskCardId, artifactId) => {
    try {
      const data = await hostApiFetch<{ success: boolean }>(
        `/api/collaboration/task-cards/${encodeURIComponent(taskCardId)}/artifacts/${encodeURIComponent(artifactId)}`,
        { method: 'DELETE' }
      );
      if (data.success) {
        const current = get().taskCards.map((t) => {
          if (t.taskCardId !== taskCardId) return t;
          const refs = t.artifactRefs ?? [];
          return { ...t, artifactRefs: refs.filter((a) => a.artifactId !== artifactId) };
        });
        set({ taskCards: current });
        return true;
      }
    } catch (err) {
      console.warn('[collaboration] removeArtifact failed:', err);
    }
    return false;
  },
}));
