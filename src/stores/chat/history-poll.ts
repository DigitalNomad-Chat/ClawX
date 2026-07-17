/**
 * History poll tick decision helpers for M4.2 restricted convergence.
 * Pure functions — no store mutation — so unit tests can lock skip vs load
 * without spinning timers.
 */
import type { RuntimePollGateDecision } from './runtime-evidence';
import {
  shouldSkipHistoryPollForRuntimeEvidence,
} from './runtime-evidence';

export type HistoryPollTickInput = {
  sending: boolean;
  hasStreamingMessage: boolean;
  /** Wall clock of last useful chat/runtime activity (ms). */
  lastChatEventAtMs: number;
  nowMs: number;
  silenceWindowMs: number;
  gate: RuntimePollGateDecision;
};

export type HistoryPollTickAction =
  | 'stop'
  | 'defer-streaming'
  | 'defer-silence'
  | 'skip-runtime'
  | 'load';

/**
 * Decide what one history-poll timer fire should do.
 * Order matches production pollHistory: stop → streaming defer → silence defer
 * → runtime skip → loadHistory.
 */
export function decideHistoryPollTick(input: HistoryPollTickInput): HistoryPollTickAction {
  if (!input.sending) return 'stop';
  if (input.hasStreamingMessage) return 'defer-streaming';
  if (input.nowMs - input.lastChatEventAtMs < input.silenceWindowMs) {
    return 'defer-silence';
  }
  if (shouldSkipHistoryPollForRuntimeEvidence(input.gate)) {
    return 'skip-runtime';
  }
  return 'load';
}
