import type { ChatGet, ChatSet, SessionHistoryActions } from './store-api';
import { createHistoryActions } from './history-actions';
import { createSessionActions } from './session-actions';

export function createSessionHistoryActions(set: ChatSet, get: ChatGet): SessionHistoryActions {
  const sessionActions = createSessionActions(set, get);
  const historyActions = createHistoryActions(set, get);
  return {
    ...sessionActions,
    ...historyActions,
  } as SessionHistoryActions;
}
