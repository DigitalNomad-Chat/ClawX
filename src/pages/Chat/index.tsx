/**
 * Chat Page
 * Communicates with the host API and OpenClaw Gateway.
 * Session selector, thinking toggle, and refresh are in the toolbar;
 * messages render with markdown + streaming.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { buildBaselineRunKey, getBaseline } from '@/stores/baseline-cache';
import { useAgentsStore } from '@/stores/agents';
import { useGatewayStore } from '@/stores/gateway';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { hostApi, hostApiFetch } from '@/lib/host-api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ExecutionGraphCard } from './ExecutionGraphCard';
import { ChatToolbar } from './ChatToolbar';
import { extractImages, extractText, extractThinking, extractToolUse, normalizeMessageRole, stripProcessMessagePrefix } from './message-utils';
import {
  appendSubagentBranchSteps,
  buildRunSegmentMessageIndices,
  deriveRuntimeTaskSteps,
  deriveTaskSteps,
  findReplyMessageIndex,
  getRunSegmentMessages,
  getPostTriggerSegmentMessages,
  parseSubagentCompletionInfo,
  runtimeRunHasRunningTool,
  runtimeRunHasToolActivity,
  segmentHasFinalReply,
  type TaskStep,
} from './task-visualization';
import {
  hasDeliveredImageGenerationResult,
  isImageGenerationPending,
} from './image-generation-status';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useMinLoading } from '@/hooks/use-min-loading';
import { useArtifactParser } from './useArtifactParser';
import { extractGeneratedFiles, generatedFileHasDiffPayload, isHtmlPreviewExt, type GeneratedFile } from '@/lib/generated-files';
import { GeneratedFilesPanel } from '@/components/file-preview/GeneratedFilesPanel';
import type { FilePreviewTarget } from '@/components/file-preview/types';
import { buildPreviewTarget } from '@/components/file-preview/build-preview-target';
import type { AttachedFileMeta } from '@/stores/chat/types';
import { toast } from 'sonner';

const ArtifactPanelLazy = lazy(() =>
  import('@/components/file-preview/ArtifactPanel').then((m) => ({ default: m.ArtifactPanel })),
);
const PanelResizeDividerLazy = lazy(() =>
  import('@/components/file-preview/PanelResizeDivider').then((m) => ({ default: m.PanelResizeDivider })),
);

type GraphStepCacheEntry = {
  steps: ReturnType<typeof deriveTaskSteps>;
  agentLabel: string;
  sessionLabel: string;
  segmentEnd: number;
  replyIndex: number | null;
  triggerIndex: number;
};

type UserRunCard = {
  triggerIndex: number;
  replyIndex: number | null;
  active: boolean;
  agentLabel: string;
  sessionLabel: string;
  segmentEnd: number;
  steps: TaskStep[];
  messageStepTexts: string[];
  streamingReplyText: string | null;
  /**
   * Whether the trailing "Thinking..." indicator should be hidden for this
   * card. True only when the run's live stream is currently rendered AS a
   * streaming step inside the graph (the step itself already signals
   * liveness, so the extra indicator would be redundant). False in all
   * other cases — including when the stream is promoted to a bubble
   * below the graph, or when there is no streaming content at all (the
   * gap between tool rounds), because the graph has no visible activity
   * of its own in those windows and the indicator is what tells the user
   * "work is still in progress".
   */
  suppressThinking: boolean;
};

type QuestionDirectoryItem = {
  index: number;
  ordinal: number;
  title: string;
};

const QUESTION_DIRECTORY_RENDER_LIMIT = 300;

function buildQuestionDirectoryTitle(message: RawMessage, fallback: string): string {
  const normalized = extractText(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 64 ? `${normalized.slice(0, 64)}…` : normalized;
}

function getPrimaryMessageStepTexts(steps: TaskStep[]): string[] {
  return steps
    .filter((step) => step.kind === 'message' && step.parentId === 'agent-run' && !!step.detail)
    .map((step) => step.detail!);
}

function generatedFileToTarget(file: GeneratedFile): FilePreviewTarget {
  return {
    filePath: file.filePath,
    fileName: file.fileName,
    ext: file.ext,
    mimeType: file.mimeType,
    contentType: file.contentType,
    action: file.action,
    fullContent: file.fullContent,
    baseline: file.baseline,
    edits: file.edits,
  };
}

// Keep the last non-empty execution-graph snapshot per session/run outside
// React state so `loadHistory` refreshes can still fall back to the previous
// steps without tripping React's set-state-in-effect lint rule.
const graphStepCacheStore = new Map<string, Record<string, GraphStepCacheEntry>>();
const streamingTimestampStore = new Map<string, number>();

function isRealUserMessage(msg: RawMessage): boolean {
  if (normalizeMessageRole(msg.role) !== 'user') return false;
  const content = msg.content;
  if (!Array.isArray(content)) return true;
  const blocks = content as Array<{ type?: string }>;
  return blocks.length === 0 || !blocks.every((b) => b.type === 'tool_result' || b.type === 'toolResult');
}

export function Chat() {
  const { t } = useTranslation('chat');
  const messages = useChatStore((s) => s.messages);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const loading = useChatStore((s) => s.loading);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const runError = useChatStore((s) => s.runError);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const activeRunId = useChatStore((s) => s.activeRunId);
  const runtimeRuns = useChatStore((s) => s.runtimeRuns ?? {});
  const userAbortedRun = useChatStore((s) => s.userAbortedRun);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);
  const agents = useAgentsStore((s) => s.agents);

  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const cleanupEmptySession = useChatStore((s) => s.cleanupEmptySession);
  const lastUserMessageAt = useChatStore((s) => s.lastUserMessageAt);
  const hasMoreHistory = useChatStore((s) => s.hasMoreHistory);
  const loadingMoreHistory = useChatStore((s) => s.loadingMoreHistory);
  const loadMoreHistory = useChatStore((s) => s.loadMoreHistory);
  const agentsList = useAgentsStore((s) => s.agents);
  const currentAgent = useMemo(
    () => (agentsList ?? []).find((a) => a.id === currentAgentId) ?? null,
    [agentsList, currentAgentId],
  );
  const panelOpen = useArtifactPanel((s) => s.open);
  const panelWidthPct = useArtifactPanel((s) => s.widthPct);
  const openChanges = useArtifactPanel((s) => s.openChanges);
  const openPreview = useArtifactPanel((s) => s.openPreview);
  const closeArtifactPanel = useArtifactPanel((s) => s.close);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  useArtifactParser(); // 订阅流式事件，解析 artifact
  // Close the panel when the session changes — its contents would otherwise
  // be stale (file list belongs to the previous chat).
  useEffect(() => {
    closeArtifactPanel();
  }, [currentSessionKey, closeArtifactPanel]);
  const [childTranscripts, setChildTranscripts] = useState<Record<string, RawMessage[]>>({});
  const [questionDirectoryOpenSessionKey, setQuestionDirectoryOpenSessionKey] = useState<string | null>(null);

  // Track how long the current send has been waiting for a response so we can
  // show progressive status messages during long session initialization.
  const [sendElapsedMs, setSendElapsedMs] = useState(0);
  useEffect(() => {
    if (!sending || !lastUserMessageAt) {
      setSendElapsedMs(0);
      return undefined;
    }
    const update = () => setSendElapsedMs(Date.now() - lastUserMessageAt);
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [sending, lastUserMessageAt]);

  // Callback for file cards in chat messages — opens the in-app preview
  // panel instead of the system default editor.
  const handleOpenAttachedFile = useCallback((file: AttachedFileMeta) => {
    if (!file.filePath) return;
    if (file.mimeType === 'application/x-directory') {
      void hostApi.shell.openPath(file.filePath)
        .then((error) => {
          if (typeof error === 'string' && error) {
            toast.error(error);
          }
        })
        .catch(() => {
          toast.error(t('filePreview.errors.openInFinderFailed', '无法在文件管理器中显示'));
        });
      return;
    }
    const target = buildPreviewTarget(file.filePath, file.fileName, file.fileSize);
    openPreview(target);
  }, [openPreview, t]);
  // Persistent per-run override for the Execution Graph's expanded/collapsed
  // state. Keyed by a stable run id (trigger message id, or a fallback of
  // `${sessionKey}:${triggerIdx}`) so user toggles survive the `loadHistory`
  // refresh that runs after every final event — otherwise the card would
  // remount and reset. `undefined` values mean "user hasn't toggled, let the
  // card pick a default from its own `active` prop."
  const [graphExpandedOverrides, setGraphExpandedOverrides] = useState<Record<string, boolean>>({});
  const graphStepCache: Record<string, GraphStepCacheEntry> = graphStepCacheStore.get(currentSessionKey) ?? {};
  const minLoading = useMinLoading(loading && messages.length > 0);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const questionDirectoryItems = useMemo<QuestionDirectoryItem[]>(() => {
    const subagentCompletionInfos = messages.map((message) => parseSubagentCompletionInfo(message));
    const items: QuestionDirectoryItem[] = [];
    let questionOrdinal = 0;
    messages.forEach((message, index) => {
      if (!isRealUserMessage(message) || subagentCompletionInfos[index]) return;
      questionOrdinal += 1;
      items.push({
        index,
        ordinal: questionOrdinal,
        title: buildQuestionDirectoryTitle(message, t('questionDirectory.fallback', { number: questionOrdinal })),
      });
    });
    return items;
  }, [messages, t]);

  const questionDirectoryVisible = questionDirectoryOpenSessionKey === currentSessionKey && questionDirectoryItems.length > 1;

  const onToggleQuestionDirectory = useCallback(() => {
    setQuestionDirectoryOpenSessionKey((openSessionKey) =>
      openSessionKey === currentSessionKey ? null : currentSessionKey,
    );
  }, [currentSessionKey]);

  // Wrap sendMessage so that every user send forces a scroll-to-bottom,
  // even when the user had previously scrolled up to read older messages.
  const handleSend = useCallback((...args: Parameters<typeof sendMessage>) => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' });
    setQuestionDirectoryOpenSessionKey(currentSessionKey);
    return sendMessage(...args);
  }, [sendMessage, currentSessionKey]);

  // Force scroll to bottom after initial history load completes so the user
  // lands at the latest message instead of somewhere in the middle.
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (wasLoading && !loading && messages.length > 0) {
      // Small delay to let Virtuoso finish its initial layout
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, messages.length]);

  // When a new message arrives during an active send, force scroll to bottom
  // so the user sees the latest reply even if followOutput missed it.
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (sending && messages.length > prevCount) {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' });
    }
  }, [messages.length, sending]);

  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load data when gateway is running.
  // When the store already holds messages for this session (i.e. the user
  // is navigating *back* to Chat), use quiet mode so the existing messages
  // stay visible while fresh data loads in the background.  This avoids
  // an unnecessary messages → spinner → messages flicker.
  useEffect(() => {
    return () => {
      // If the user navigates away without sending any messages, remove the
      // empty session so it doesn't linger as a ghost entry in the sidebar.
      cleanupEmptySession();
    };
  }, [cleanupEmptySession]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    const completions = messages
      .map((message) => parseSubagentCompletionInfo(message))
      .filter((value): value is NonNullable<typeof value> => value != null);
    const missing = completions.filter((completion) => !childTranscripts[completion.sessionId]);
    if (missing.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missing.map(async (completion) => {
        try {
          const result = await hostApiFetch<{ success: boolean; messages?: RawMessage[] }>(
            `/api/sessions/transcript?agentId=${encodeURIComponent(completion.agentId)}&sessionId=${encodeURIComponent(completion.sessionId)}`,
          );
          if (!result.success) {
            console.warn('Failed to load child transcript:', {
              agentId: completion.agentId,
              sessionId: completion.sessionId,
              result,
            });
            return null;
          }
          return { sessionId: completion.sessionId, messages: result.messages || [] };
        } catch (error) {
          console.warn('Failed to load child transcript:', {
            agentId: completion.agentId,
            sessionId: completion.sessionId,
            error,
          });
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setChildTranscripts((current) => {
        const next = { ...current };
        for (const result of results) {
          if (!result) continue;
          next[result.sessionId] = result.messages;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [messages, childTranscripts]);

  const streamMsg = streamingMessage && typeof streamingMessage === 'object'
    ? streamingMessage as unknown as { role?: string; content?: unknown; timestamp?: number }
    : null;
  const streamTimestamp = typeof streamMsg?.timestamp === 'number' ? streamMsg.timestamp : 0;
  useEffect(() => {
    if (!sending) {
      streamingTimestampStore.delete(currentSessionKey);
      return;
    }
    if (!streamingTimestampStore.has(currentSessionKey)) {
      streamingTimestampStore.set(currentSessionKey, streamTimestamp || Date.now() / 1000);
    }
  }, [currentSessionKey, sending, streamTimestamp]);

  const streamingTimestamp = sending
    ? (streamingTimestampStore.get(currentSessionKey) ?? streamTimestamp)
    : 0;
  const streamText = streamMsg ? extractText(streamMsg) : (typeof streamingMessage === 'string' ? streamingMessage : '');
  const hasStreamText = streamText.trim().length > 0;
  // Whether the streaming chunk currently carries a `thinking` block. Used as
  // a liveness signal so the run stays "active" (and the ExecutionGraphCard
  // keeps showing its trailing "Thinking..." indicator) during the brief window
  // between a tool finishing and the next text/tool chunk arriving — that gap
  // is normally only filled by streamed thinking. NOT included in
  // `shouldRenderStreaming`: a thinking-only stream chunk should not produce
  // a chat bubble (thinking is rendered exclusively inside the ExecutionGraph).
  const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
  const hasStreamThinking = !!streamThinking && streamThinking.trim().length > 0;
  const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
  const hasStreamTools = streamTools.length > 0;
  const streamImages = streamMsg ? extractImages(streamMsg) : [];
  const hasStreamImages = streamImages.length > 0;
  const hasStreamToolStatus = streamingTools.length > 0;
  const hasRunningStreamToolStatus = streamingTools.some((tool) => tool.status === 'running');
  const shouldRenderStreaming = sending && (hasStreamText || hasStreamTools || hasStreamImages || hasStreamToolStatus);
  const hasAnyStreamContent = hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;
  // Thinking-only stale stream content must not keep image-generation runs open
  // after history already contains the final media (#1080).
  const hasHistoryCompletionBlockingStream = hasStreamText
    || hasStreamImages
    || hasRunningStreamToolStatus
    || streamTools.length > 0;

  // Progressive status label shown while waiting for the first response.
  // New sessions can take ~150s to initialize, so we give the user explicit
  // feedback instead of a silent bouncing-dots indicator.
  const sessionInitLabel = useMemo(() => {
    if (sendElapsedMs < 5000) return undefined;
    if (sendElapsedMs < 20000) return t('composer.preparingSession');
    if (sendElapsedMs < 60000) return t('composer.sessionInitTakingLong');
    return t('composer.sessionInitStillWorking');
  }, [sendElapsedMs, t]);

  const isEmpty = messages.length === 0 && !sending;
  const subagentCompletionInfos = messages.map((message) => parseSubagentCompletionInfo(message));
  // Build an index of the *next* real user message after each position.
  const nextUserMessageIndexes = useMemo(() => {
    const indexes = new Array<number>(messages.length).fill(-1);
    let nextUserMessageIndex = -1;
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      indexes[idx] = nextUserMessageIndex;
      if (isRealUserMessage(messages[idx]) && !subagentCompletionInfos[idx]) {
        nextUserMessageIndex = idx;
      }
    }
    return indexes;
  }, [messages, subagentCompletionInfos]);

  const isRunTrigger = useCallback(
    (message: RawMessage, index: number) => isRealUserMessage(message) && !subagentCompletionInfos[index],
    [subagentCompletionInfos],
  );

  const runSegmentMessageIndices = useMemo(
    () => buildRunSegmentMessageIndices(messages, nextUserMessageIndexes, isRunTrigger),
    [messages, nextUserMessageIndexes, isRunTrigger],
  );

  // Indices of intermediate assistant process messages that are represented
  // in the ExecutionGraphCard (narration text and/or thinking). We suppress
  // them from the chat stream so they don't appear duplicated below the graph.
  const { userRunCards, foldedNarrationIndices } = useMemo(() => {
    const foldedNarrationIndices = new Set<number>();

    const userRunCards: UserRunCard[] = messages.flatMap((message, idx) => {
    if (!isRealUserMessage(message) || subagentCompletionInfos[idx]) return [];

    const runKey = message.id
      ? `msg-${message.id}`
      : `${currentSessionKey}:trigger-${idx}`;
    const nextUserIndex = nextUserMessageIndexes[idx];
    const segmentEnd = nextUserIndex === -1 ? messages.length : nextUserIndex;
    const segmentMessages = getRunSegmentMessages(messages, idx, nextUserIndex, isRunTrigger);
    const completionInfos = subagentCompletionInfos
      .slice(idx + 1, segmentEnd)
      .filter((value): value is NonNullable<typeof value> => value != null);
    // A run is considered "open" (still active) when it's the last segment
    // AND at least one of:
    //  - sending/pendingFinal/streaming data (normal streaming path)
    //  - segment has tool calls but no pure-text final reply yet (server-side
    //    tool execution — Gateway fires phase "end" per tool round which
    //    briefly clears sending, but the run is still in progress)
    // Lifecycle checks use post-trigger messages only so paginated orphan
    // assistants from a prior turn cannot mark the current run complete/pending.
    const postTriggerMessages = getPostTriggerSegmentMessages(messages, idx, nextUserIndex);
    const isLatestRunSegment = nextUserIndex === -1;
    const historyHasToolActivity = postTriggerMessages.some((m) =>
      m.role === 'assistant' && extractToolUse(m).length > 0,
    );
    // Prefer runtimeRuns for the latest segment when:
    //  1) activeRunId matches a session-scoped run, or
    //  2) residual: activeRunId already cleared after run.ended but history
    //     has not yet produced tools — still project the latest matching run
    //     so terminal settle can clear unfinished command.output/approval.
    // SessionKey consistency guard rejects foreign-session runs.
    const sessionScopedRuntimeRun = (run: (typeof runtimeRuns)[string] | null | undefined) => {
      if (!run) return null;
      if (run.sessionKey && run.sessionKey !== currentSessionKey) return null;
      return run;
    };
    let candidateRuntimeRun = isLatestRunSegment && activeRunId
      ? sessionScopedRuntimeRun(runtimeRuns[activeRunId])
      : null;
    if (!candidateRuntimeRun && isLatestRunSegment && !activeRunId && !historyHasToolActivity) {
      let best: (typeof runtimeRuns)[string] | null = null;
      for (const run of Object.values(runtimeRuns)) {
        if (!sessionScopedRuntimeRun(run)) continue;
        if (!runtimeRunHasToolActivity(run)) continue;
        if (!best) {
          best = run;
          continue;
        }
        const bestTs = best.endedAt ?? best.startedAt ?? 0;
        const runTs = run.endedAt ?? run.startedAt ?? 0;
        if (runTs >= bestTs) best = run;
      }
      candidateRuntimeRun = best;
    }
    const activeRuntimeRun = candidateRuntimeRun;
    const runtimeHasToolActivity = runtimeRunHasToolActivity(activeRuntimeRun);
    const runtimeHasRunningTool = runtimeRunHasRunningTool(activeRuntimeRun);
    const hasToolActivity = runtimeHasToolActivity || historyHasToolActivity;
    const hasFinalReply = segmentHasFinalReply(postTriggerMessages);
    const runStillExecutingTools = hasToolActivity && !hasFinalReply;
    // runStillExecutingTools bridges the brief gap between tool rounds when
    // Gateway temporarily clears sending.  However, after an explicit abort
    // (which clears activeRunId), we must NOT keep the run "open" — so we
    // gate it on activeRunId being present. We also bail out as soon as a
    // terminal model error has been surfaced so the run doesn't appear active.
    // userAbortedRun provides an additional safety net for abort detection.
    // History-only image generation settle (#1098 subset): delivered media /
    // toolresult attachments clear pending without requiring ChatRuntimeEvent.
    const pendingImageGeneration = isLatestRunSegment
      && isImageGenerationPending(postTriggerMessages, streamingTools);
    const imageGenerationSettledInHistory = isLatestRunSegment
      && hasDeliveredImageGenerationResult(postTriggerMessages)
      && !pendingImageGeneration;
    // History may already contain the final answer while lifecycle flags are
    // still armed (missing Gateway terminal phase, blocked chat.send RPC, etc.).
    // Treat the run as closed for graph/input UI when the transcript is done
    // and no user-visible reply/tool stream is active. Require prior tool activity
    // so an early narration-only history snapshot does not collapse the graph
    // mid-chain. Thinking-only stale stream content should not keep image
    // generation runs open after history already contains the final media.
    const streamBlocksHistoryCompletion = hasHistoryCompletionBlockingStream
      && !imageGenerationSettledInHistory;
    const runCompletedInHistory = imageGenerationSettledInHistory || (hasFinalReply
      && !pendingImageGeneration
      && !streamBlocksHistoryCompletion
      && (hasToolActivity || !sending));
    const isLatestOpenRun = isLatestRunSegment
      && !runError
      && !userAbortedRun
      && !runCompletedInHistory
      && (sending || pendingFinal || pendingImageGeneration || hasAnyStreamContent || (runStillExecutingTools && !!activeRunId));
    const replyIndexOffset = findReplyMessageIndex(segmentMessages, isLatestOpenRun);
    const replyIndex = replyIndexOffset === -1 ? null : idx + 1 + replyIndexOffset;

    const buildSteps = (omitLastStreamingMessageSegment: boolean): TaskStep[] => {
      const builtSteps = deriveTaskSteps({
        messages: segmentMessages,
        streamingMessage: isLatestOpenRun ? streamingMessage : null,
        streamingTools: isLatestOpenRun ? streamingTools : [],
        omitLastStreamingMessageSegment: isLatestOpenRun ? omitLastStreamingMessageSegment : false,
      });
      return appendSubagentBranchSteps(builtSteps, completionInfos, childTranscripts);
    };

    // Show the streaming response as a separate bubble (not inside the
    // execution graph) once tool activity has happened and the CURRENT stream
    // chunk carries no tool_use block.
    //
    // We use an optimistic promotion strategy because the distinguishing
    // signal between "narration-before-next-tool" and "final reply" is not
    // available during early deltas — both are text-only, both arrive after
    // `hasToolActivity` has flipped true.  Any of these signals opens the
    // promotion gate:
    //   1. `pendingFinal`       — tool-result final just fired; next text is
    //      (almost always) the final reply.
    //   2. `allToolsCompleted`  — every client-tracked tool entry reached
    //      `completed` state.
    //   3. `hasToolActivity`    — at least one prior tool_use exists in the
    //      segment, i.e. we're past the first tool round.
    //
    // Demotion happens the moment a tool_use block appears in the streaming
    // message (`streamTools.length > 0`) OR a tool transitions back to
    // `running`.  When demoted, the stream re-renders inside the graph as a
    // narration step.  A brief flicker when narration turns into the next
    // tool round is inherent to optimistic promotion and is accepted.
    //
    // Earlier iterations tried restricting this gate to only
    // `pendingFinal || allToolsCompleted` to protect the trailing
    // "Thinking..." indicator.  That check is real, but belongs in the
    // `suppressThinking` coupling below — not here.  With the coupling
    // fixed, the three-signal gate gives the correct bubble placement for
    // both narration and final reply.
    const allToolsCompleted = streamingTools.length > 0 && !hasRunningStreamToolStatus && !runtimeHasRunningTool;
    const rawStreamingReplyCandidate = isLatestOpenRun
      && (pendingFinal || allToolsCompleted || hasToolActivity)
      && (hasStreamText || hasStreamImages)
      && streamTools.length === 0
      && !hasRunningStreamToolStatus
      && !runtimeHasRunningTool;

    // Active runtime tool stream wins for the latest segment; history fallback otherwise.
    // When runtime is preferred, merge (do not replace) history subagent branches so
    // completionInfos/childTranscripts remain visible in the Execution Graph.
    const preferRuntimeSteps = Boolean(activeRuntimeRun && runtimeHasToolActivity);
    const buildPreferredRuntimeSteps = (): TaskStep[] => appendSubagentBranchSteps(
      deriveRuntimeTaskSteps(activeRuntimeRun),
      completionInfos,
      childTranscripts,
    );
    let steps = preferRuntimeSteps
      ? buildPreferredRuntimeSteps()
      : buildSteps(rawStreamingReplyCandidate);
    let streamingReplyText: string | null = null;
    if (rawStreamingReplyCandidate) {
      const trimmedReplyText = stripProcessMessagePrefix(streamText, getPrimaryMessageStepTexts(steps));
      const hasReplyText = trimmedReplyText.trim().length > 0;
      if (hasReplyText || hasStreamImages) {
        streamingReplyText = trimmedReplyText;
      } else {
        steps = preferRuntimeSteps
          ? buildPreferredRuntimeSteps()
          : buildSteps(false);
      }
    }

    const segmentAgentId = currentAgentId;
    const segmentAgentLabel = agents.find((agent) => agent.id === segmentAgentId)?.name || segmentAgentId;
    const segmentSessionLabel = sessionLabels[currentSessionKey] || currentSessionKey;

    if (steps.length === 0) {
      if (isLatestOpenRun && streamingReplyText == null) {
        return [{
          triggerIndex: idx,
          replyIndex,
          active: true,
          agentLabel: segmentAgentLabel,
          sessionLabel: segmentSessionLabel,
          segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
          steps: [],
          messageStepTexts: [],
          streamingReplyText: null,
          suppressThinking: false,
        }];
      }
      const cached = graphStepCache[runKey];
      if (!cached) return [];
      // The cache was captured during streaming and may contain stream-
      // generated message steps that include accumulated narration + reply
      // text.  Strip these out — historical message steps (from messages[])
      // will be properly recomputed on the next render with fresh data.
      const cleanedSteps = cached.steps.filter(
        (s) => !(s.kind === 'message' && s.id.startsWith('stream-message')),
      );
      return [{
        triggerIndex: idx,
        replyIndex: cached.replyIndex,
        active: false,
        agentLabel: cached.agentLabel,
        sessionLabel: cached.sessionLabel,
        segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
        steps: cleanedSteps,
        messageStepTexts: getPrimaryMessageStepTexts(cleanedSteps),
        streamingReplyText: null,
        suppressThinking: false,
      }];
    }

    // Mark intermediate assistant messages whose process output should be folded into
    // the ExecutionGraphCard. We fold the text regardless of whether the
    // message ALSO carries tool calls (mixed `text + toolCall` messages are
    // common — e.g. "waiting for the page to load…" followed by a `wait`
    // tool call). This prevents orphan narration bubbles from leaking into
    // the chat stream once the graph is collapsed.
    //
    // When the run is still streaming (`isLatestOpenRun`) the final reply is
    // not yet part of `segmentMessages`, so every assistant message in the
    // segment counts as intermediate. For completed runs, we preserve the
    // final reply bubble by skipping the message that `findReplyMessageIndex`
    // identifies as the answer.
    const segmentReplyOffset = findReplyMessageIndex(segmentMessages, isLatestOpenRun);
    for (let offset = 0; offset < segmentMessages.length; offset += 1) {
      if (offset === segmentReplyOffset) continue;
      const candidate = segmentMessages[offset];
      if (!candidate || candidate.role !== 'assistant') continue;
      const hasNarrationText = extractText(candidate).trim().length > 0;
      const hasThinking = !!extractThinking(candidate);
      if (!hasNarrationText && !hasThinking) continue;
      foldedNarrationIndices.add(idx + 1 + offset);
    }

    // The graph should stay "active" (expanded, can show trailing thinking)
    // for the entire duration of the run — not just until a streaming reply
    // appears.  Tying active to streamingReplyText caused a flicker: a brief
    // active→false→true transition collapsed the graph via ExecutionGraphCard's
    // uncontrolled path before the controlled `expanded` override could kick in.
    const cardActive = isLatestOpenRun;

    // Suppress the trailing "Thinking..." indicator only when the live stream is
    // currently rendered AS a streaming step inside this card's graph. In
    // that case the streaming step itself is the activity signal, and the
    // separate trailing indicator would be redundant.
    //   - streamingReplyText != null: stream is promoted to a bubble → graph
    //     has no live step of its own → DO show the trailing indicator so the
    //     user still sees progress in the graph (indicator rendered above the
    //     bubble).
    //   - no stream content at all (the gap between tool rounds): graph also
    //     has no live step → DO show the indicator — this is the very case
    //     the indicator exists for.
    //   - tool execution is visible in the graph: still show the trailing
    //     indicator as a separate liveness signal (tool + thinking).
    //   - pure stream text/thinking/images in graph: suppress trailing indicator.
    const streamVisiblyActiveInGraph = hasStreamText
      || hasStreamThinking
      || hasStreamImages;
    const streamIsInGraph =
      isLatestOpenRun && streamingReplyText == null && streamVisiblyActiveInGraph;
    const suppressThinking = streamIsInGraph;

    return [{
      triggerIndex: idx,
      replyIndex,
      active: cardActive,
      agentLabel: segmentAgentLabel,
      sessionLabel: segmentSessionLabel,
      segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
      steps,
      messageStepTexts: getPrimaryMessageStepTexts(steps),
      streamingReplyText,
      suppressThinking,
    }];
  });
    return { userRunCards, foldedNarrationIndices };
  }, [messages, subagentCompletionInfos, currentSessionKey, streamingMessage, streamingTools, pendingFinal, sending, hasAnyStreamContent, hasStreamText, hasStreamThinking, hasStreamImages, streamText, streamTools, hasRunningStreamToolStatus, hasHistoryCompletionBlockingStream, childTranscripts, currentAgentId, agents, sessionLabels, graphStepCache, runError, isRunTrigger, activeRunId, runtimeRuns, userAbortedRun]);
  const hasActiveExecutionGraph = userRunCards.some((card) => card.active);
  let latestRunSegmentCompletion = { hasFinalReply: false, hasToolActivity: false };
  let hasDeliveredImageReply = false;
  let pendingImageGeneration = false;
  let imageGenerationSettledInHistory = false;
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    if (!isRealUserMessage(messages[idx]) || subagentCompletionInfos[idx]) continue;
    const nextUserIndex = nextUserMessageIndexes[idx];
    const postTrigger = getPostTriggerSegmentMessages(messages, idx, nextUserIndex);
    latestRunSegmentCompletion = {
      hasFinalReply: segmentHasFinalReply(postTrigger),
      hasToolActivity: postTrigger.some((m) =>
        m.role === 'assistant' && extractToolUse(m).length > 0,
      ),
    };
    hasDeliveredImageReply = postTrigger.some((m) =>
      m.role === 'assistant'
      && (m._attachedFiles ?? []).some((f) => f.mimeType.startsWith('image/')),
    ) || hasDeliveredImageGenerationResult(postTrigger);
    pendingImageGeneration = isImageGenerationPending(postTrigger, streamingTools);
    imageGenerationSettledInHistory = hasDeliveredImageGenerationResult(postTrigger)
      && !pendingImageGeneration;
    break;
  }
  const streamBlocksHistoryCompletion = hasHistoryCompletionBlockingStream
    && !imageGenerationSettledInHistory;
  const runSettledInHistory = imageGenerationSettledInHistory || ((latestRunSegmentCompletion.hasFinalReply || hasDeliveredImageReply)
    && !pendingImageGeneration
    && !streamBlocksHistoryCompletion
    && (latestRunSegmentCompletion.hasToolActivity || !sending));
  // History-only: keep input armed for pending image gen even if `sending`
  // briefly drops between tool rounds, but still collapse once history settle
  // is true (avoids stuck typing when sending remains true after final reply).
  // Full #1096 useEffect that clears store lifecycle needs runtimeRuns/#1094.
  const inputRunActive = (
    sending || pendingImageGeneration || hasActiveExecutionGraph
  ) && !runSettledInHistory;
  const replyTextOverrides = useMemo(() => {
    const map = new Map<number, string>();
    for (const card of userRunCards) {
      if (card.replyIndex == null) continue;
      const replyMessage = messages[card.replyIndex];
      if (!replyMessage || replyMessage.role !== 'assistant') continue;
      const fullReplyText = extractText(replyMessage);
      const trimmedReplyText = stripProcessMessagePrefix(fullReplyText, card.messageStepTexts);
      if (trimmedReplyText !== fullReplyText) {
        map.set(card.replyIndex, trimmedReplyText);
      }
    }
    return map;
  }, [userRunCards, messages]);
  const streamingReplyText = userRunCards.find((card) => card.streamingReplyText != null)?.streamingReplyText ?? null;

  // Rows visible to the virtual scroller. We exclude messages that would render
  // as a zero-height item in ChatMessage (folded narration, tool_result, or
  // completely empty messages). We also exclude tool_use-only messages that fall
  // inside a run segment, because `suppressToolCards` forces ChatMessage to hide
  // its tool cards and the message would otherwise collapse to nothing.
  const visibleRows = useMemo(() => {
    const rows: Array<{ msg: RawMessage; originalIdx: number }> = [];
    for (let idx = 0; idx < messages.length; idx += 1) {
      if (foldedNarrationIndices.has(idx)) continue;
      const msg = messages[idx];
      const role = typeof msg.role === 'string' ? msg.role.toLowerCase() : '';
      // Skip tool_result messages — ChatMessage renders them as null
      if (role === 'toolresult' || role === 'tool_result') continue;

      const hasText = extractText(msg).trim().length > 0;
      const hasImages = extractImages(msg).length > 0;
      const hasTools = extractToolUse(msg).length > 0;
      const hasAttachments = msg._attachedFiles && msg._attachedFiles.length > 0;
      const hasContent = hasText || hasImages || hasTools || hasAttachments;

      // Skip empty messages that ChatMessage would render as null
      if (!hasContent) continue;

      // Tool-use-only messages hidden by suppressToolCards collapse to zero height
      const isToolUseOnly = hasTools && !hasText && !hasImages && !hasAttachments;
      if (isToolUseOnly && runSegmentMessageIndices.has(idx)) continue;

      rows.push({ msg, originalIdx: idx });
    }
    return rows;
  }, [messages, foldedNarrationIndices, userRunCards]);

  // When the user scrolls to the top and triggers loadMoreHistory, we want to
  // keep the scroll position at the boundary between the newly-loaded older
  // messages and the previously-visible messages.  This avoids a jarring jump
  // to the very top of the history.  We record the first visible row before
  // loading and scroll back to it after the prepend.
  const scrollAnchorRef = useRef<{ id?: string; originalIdx: number } | null>(null);

  const handleAtTop = useCallback(async (atTop: boolean) => {
    if (!atTop || !hasMoreHistory || isLoadingMore) return;

    // Remember the first visible message so we can scroll back to it after
    // the prepend.
    const firstRow = visibleRows[0];
    if (firstRow) {
      scrollAnchorRef.current = { id: firstRow.msg.id, originalIdx: firstRow.originalIdx };
    }

    setIsLoadingMore(true);
    try {
      await loadMoreHistory();
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreHistory, isLoadingMore, loadMoreHistory, visibleRows]);

  // After loadMoreHistory completes, scroll to the old first-visible message
  // so the user sees the boundary between new and old content.
  useEffect(() => {
    if (isLoadingMore || !scrollAnchorRef.current) return;

    const anchor = scrollAnchorRef.current;
    scrollAnchorRef.current = null;

    const newIndex = visibleRows.findIndex(
      (r) => r.msg.id === anchor.id && r.originalIdx === anchor.originalIdx,
    );

    if (newIndex > 0) {
      // Delay until Virtuoso has laid out the new items
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: newIndex,
          behavior: 'auto',
          align: 'center',
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isLoadingMore, visibleRows]);

  // Derive the set of run keys that should be auto-collapsed (run finished
  // streaming or has a reply override) during render instead of in an effect,
  // so we don't violate react-hooks/set-state-in-effect. Explicit user toggles
  // still win via `graphExpandedOverrides` and are merged in at the call site.
  // Pre-compute generated files per run (memoised so the cards and the
  // ArtifactPanel can both read them without re-parsing tool calls every
  // render).
  const filesByRun = useMemo(() => {
    const map = new Map<number, GeneratedFile[]>();
    for (const card of userRunCards) {
      const userTurnOrdinal = messages
        .slice(0, card.triggerIndex + 1)
        .filter((msg) => msg.role === 'user' && (!Array.isArray(msg.content) || !(msg.content as Array<{ type?: string }>).every((b) => b.type === 'tool_result' || b.type === 'toolResult')))
        .length;
      const runKey = buildBaselineRunKey(currentSessionKey, userTurnOrdinal);
      const raw = extractGeneratedFiles(
        messages,
        card.triggerIndex,
        card.segmentEnd,
        runKey ? (filePath) => getBaseline(runKey, filePath) : undefined,
      );
      map.set(card.triggerIndex, raw.filter(generatedFileHasDiffPayload));
    }
    return map;
  }, [currentSessionKey, userRunCards, messages]);
  const allGeneratedFiles = useMemo(() => {
    const all: GeneratedFile[] = [];
    for (const files of filesByRun.values()) all.push(...files);
    return all;
  }, [filesByRun]);

  const refreshSignal = useMemo(() => {
    if (sending) return undefined;
    return lastUserMessageAt ?? 0;
  }, [sending, lastUserMessageAt]);

  const autoCollapsedRunKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const card of userRunCards) {
      // Auto-collapse once the run is complete and a final reply exists.
      // Don't collapse while the reply is still streaming.
      const isStillStreaming = card.streamingReplyText != null;
      const shouldCollapse = !isStillStreaming && !card.active && card.replyIndex != null;
      if (!shouldCollapse) continue;
      const triggerMsg = messages[card.triggerIndex];
      const runKey = triggerMsg?.id
        ? `msg-${triggerMsg.id}`
        : `${currentSessionKey}:trigger-${card.triggerIndex}`;
      keys.add(runKey);
    }
    return keys;
  }, [currentSessionKey, messages, userRunCards]);

  useEffect(() => {
    if (userRunCards.length === 0) return;
    const current = graphStepCacheStore.get(currentSessionKey) ?? {};
    let changed = false;
    const next = { ...current };
    for (const card of userRunCards) {
      if (card.steps.length === 0) continue;
      const triggerMsg = messages[card.triggerIndex];
      const runKey = triggerMsg?.id
        ? `msg-${triggerMsg.id}`
        : `${currentSessionKey}:trigger-${card.triggerIndex}`;
      const existing = current[runKey];
      const sameSteps = !!existing
        && existing.steps.length === card.steps.length
        && existing.steps.every((step, index) => {
          const nextStep = card.steps[index];
          return nextStep
            && step.id === nextStep.id
            && step.label === nextStep.label
            && step.status === nextStep.status
            && step.kind === nextStep.kind
            && step.detail === nextStep.detail
            && step.depth === nextStep.depth
            && step.parentId === nextStep.parentId;
        });
      if (
        sameSteps
        && existing?.agentLabel === card.agentLabel
        && existing?.sessionLabel === card.sessionLabel
        && existing?.segmentEnd === card.segmentEnd
        && existing?.replyIndex === card.replyIndex
        && existing?.triggerIndex === card.triggerIndex
      ) {
        continue;
      }
      next[runKey] = {
        steps: card.steps,
        agentLabel: card.agentLabel,
        sessionLabel: card.sessionLabel,
        segmentEnd: card.segmentEnd,
        replyIndex: card.replyIndex,
        triggerIndex: card.triggerIndex,
      };
      changed = true;
    }
    if (changed) {
      graphStepCacheStore.set(currentSessionKey, next);
    }
  }, [userRunCards, messages, currentSessionKey]);

  const platform = window.electron?.platform;
  const isMac = platform === 'darwin';
  const isWindows = platform === 'win32';

  return (
    <div
      ref={splitContainerRef}
      data-testid="chat-page"
      className={cn(
        'relative flex min-h-0 -m-6 overflow-hidden transition-colors duration-500',
        'bg-background',
        // Stack above MainLayout's mac-main-drag-region (z-10) so the right-hand
        // artifact/preview pane stays clickable; window drag is handled by the
        // sidebar + chat-toolbar drag strips instead.
        isMac && 'z-20 rounded-tl-2xl shadow-[inset_1px_1px_0_hsl(var(--border)/0.55)]',
        isWindows && 'rounded-tl-2xl',
      )}
      style={{ height: isMac ? '100vh' : 'calc(100vh - 2.5rem)' }}
    >
      {/* Left column: chat */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2">
        <ChatToolbar
          questionDirectoryOpen={questionDirectoryVisible}
          questionDirectoryCount={questionDirectoryItems.length}
          onToggleQuestionDirectory={onToggleQuestionDirectory}
        />
      </div>

      {/* Messages Area */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
        <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-4 lg:flex-row lg:items-stretch">
          {questionDirectoryVisible && (
            <QuestionDirectory items={questionDirectoryItems} />
          )}
          {isEmpty ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-4">
                <WelcomeScreen />
              </div>
            </div>
          ) : (
            <Virtuoso
              key={currentSessionKey}
              ref={virtuosoRef}
              className="min-h-0 min-w-0 flex-1"
              style={{ overflowY: 'auto' }}
              data={visibleRows}
              initialTopMostItemIndex={visibleRows.length - 1}
              followOutput={(isAtBottom) => (sending || isAtBottom ? 'auto' : false)}
              increaseViewportBy={{ top: 400, bottom: 400 }}
              atTopStateChange={handleAtTop}
              itemContent={(_index, row) => {
                const { msg, originalIdx } = row;
                const suppressToolCards = runSegmentMessageIndices.has(originalIdx);
                const isToolOnlyAssistant = normalizeMessageRole(msg.role) === 'assistant'
                  && extractToolUse(msg).length > 0
                  && extractText(msg).trim().length === 0
                  && !extractThinking(msg);
                if (suppressToolCards && isToolOnlyAssistant && !(msg._attachedFiles?.length)) {
                  return null;
                }
                return (
                  <div className="mx-auto max-w-4xl">
                    <div
                      className="space-y-3 animate-message-in"
                      id={`chat-message-${originalIdx}`}
                      data-testid={`chat-message-${originalIdx}`}
                    >
                      <ChatMessage
                        message={msg}
                        textOverride={replyTextOverrides.get(originalIdx)}
                        suppressToolCards={suppressToolCards}
                        suppressProcessAttachments={suppressToolCards}
                        onOpenFile={handleOpenAttachedFile}
                      />
                      {userRunCards
                        .filter((card) => card.triggerIndex === originalIdx)
                        .map((card) => {
                          const triggerMsg = messages[card.triggerIndex];
                          const runKey = triggerMsg?.id
                            ? `msg-${triggerMsg.id}`
                            : `${currentSessionKey}:trigger-${card.triggerIndex}`;
                          const userOverride = graphExpandedOverrides[runKey];
                          const expanded = userOverride != null
                            ? userOverride
                            : !autoCollapsedRunKeys.has(runKey);
                          const generatedFiles = filesByRun.get(card.triggerIndex) ?? [];
                          return (
                            <div key={`run-${currentSessionKey}:${card.triggerIndex}`} className="space-y-3">
                              <ExecutionGraphCard
                                key={`graph-${currentSessionKey}:${card.triggerIndex}`}
                                agentLabel={card.agentLabel}
                                steps={card.steps}
                                active={card.active}
                                suppressThinking={card.suppressThinking}
                                waitingLabel={sessionInitLabel}
                                expanded={expanded}
                                onExpandedChange={(next) =>
                                  setGraphExpandedOverrides((prev) => ({ ...prev, [runKey]: next }))
                                }
                              />
                              {generatedFiles.length > 0 && (
                                <GeneratedFilesPanel
                                  files={generatedFiles}
                                  onOpen={(file) => {
                                    const target = generatedFileToTarget(file);
                                    if (isHtmlPreviewExt(file.ext)) {
                                      openPreview(target);
                                      return;
                                    }
                                    openChanges(target);
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              }}
              components={{
                Header: () => {
                  if (!hasMoreHistory) return null;
                  return (
                    <div className="mx-auto max-w-4xl py-4 text-center">
                      <button
                        type="button"
                        onClick={() => void loadMoreHistory()}
                        disabled={loadingMoreHistory || isLoadingMore}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid="chat-load-more-history"
                      >
                        {(loadingMoreHistory || isLoadingMore) && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {(loadingMoreHistory || isLoadingMore)
                          ? t('loadingMoreHistory', '加载更多中...')
                          : t('loadMoreHistory', '加载更早的消息')}
                      </button>
                    </div>
                  );
                },
                Footer: () => {
                  const hasStreaming = shouldRenderStreaming && (streamingReplyText != null || !hasActiveExecutionGraph);
                  const hasActivity = inputRunActive && pendingFinal && !shouldRenderStreaming && !hasActiveExecutionGraph;
                  const hasTyping = inputRunActive && !pendingFinal && !hasAnyStreamContent && !hasActiveExecutionGraph;
                  if (!hasStreaming && !hasActivity && !hasTyping) return null;
                  return (
                    <div className="mx-auto max-w-4xl">
                      {/* Streaming message — render when reply text is separated from graph,
                          OR when there's streaming content without an active graph */}
                      {hasStreaming && (
                        <ChatMessage
                          message={(() => {
                            const base = streamMsg
                              ? {
                                  ...(streamMsg as Record<string, unknown>),
                                  role: (typeof streamMsg.role === 'string' ? streamMsg.role : 'assistant') as RawMessage['role'],
                                  content: streamMsg.content ?? streamText,
                                  timestamp: streamMsg.timestamp ?? streamingTimestamp,
                                }
                              : {
                                  role: 'assistant' as const,
                                  content: streamText,
                                  timestamp: streamingTimestamp,
                                };
                            if (streamingReplyText != null && Array.isArray(base.content)) {
                              return {
                                ...base,
                                content: (base.content as Array<{ type?: string }>).filter(
                                  (block) => block.type !== 'thinking',
                                ),
                              } as RawMessage;
                            }
                            return base as RawMessage;
                          })()}
                          textOverride={streamingReplyText ?? undefined}
                          isStreaming
                          streamingTools={streamingReplyText != null ? [] : streamingTools}
                          onOpenFile={handleOpenAttachedFile}
                          suppressToolCards={hasActiveExecutionGraph || runSegmentMessageIndices.size > 0}
                        />
                      )}

                      {/* Activity indicator: waiting for next AI turn after tool execution */}
                      {hasActivity && <ActivityIndicator phase="tool_processing" />}

                      {/* Typing indicator when sending but no stream content yet */}
                      {hasTyping && <TypingIndicator label={sessionInitLabel} />}
                    </div>
                  );
                },
              }}
            />
          )}

        </div>
      </div>

      {/* Run error callout */}
      {runError && (
        <div className="px-4 pt-2" data-testid="chat-run-error">
          <div className="max-w-4xl mx-auto rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {t('runError.title')}
            </p>
            <p className="mt-1 text-sm text-destructive/90 break-words">
              {runError}
            </p>
          </div>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
            <button
              onClick={clearError}
              className="text-xs text-destructive/60 hover:text-destructive underline"
            >
              {t('common:actions.dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <ChatInput
        onSend={handleSend}
        onStop={abortRun}
        disabled={!isGatewayRunning}
        sending={inputRunActive}
      />
      </div>

      {/* Right column: artifact / file preview panel (WorkBuddy-style) */}
      {panelOpen && (
        <>
          <Suspense fallback={null}>
            <PanelResizeDividerLazy containerRef={splitContainerRef} />
          </Suspense>
          <aside
            data-testid="artifact-panel-aside"
            className={cn(
              'relative z-20 hidden shrink-0 border-l border-black/5 dark:border-white/10 lg:flex lg:flex-col',
              isMac && 'no-drag',
            )}
            style={{ width: `${panelWidthPct}%` }}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <LoadingSpinner size="md" />
                </div>
              }
            >
              <ArtifactPanelLazy
                files={allGeneratedFiles}
                agent={currentAgent}
                runStartedAt={lastUserMessageAt ?? null}
                refreshSignal={refreshSignal}
              />
            </Suspense>
          </aside>
        </>
      )}

      {/* Transparent loading overlay */}
      {minLoading && !sending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm rounded-xl pointer-events-auto transition-all duration-300">
          <div className="glass-panel rounded-2xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <LoadingSpinner size="md" />
            <span className="text-sm font-medium text-foreground/70">Loading…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Welcome Screen ──────────────────────────────────────────────

function WelcomeScreen() {
  const { t } = useTranslation('chat');
  const quickActions = [
    { key: 'askQuestions', label: t('welcome.askQuestions'), icon: '❓' },
    { key: 'creativeTasks', label: t('welcome.creativeTasks'), icon: '✨' },
    { key: 'brainstorming', label: t('welcome.brainstorming'), icon: '💡' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] relative overflow-hidden">
      {/* Ambient background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-72 h-72 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-56 h-56 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center max-w-lg mx-auto">
        <h1 className="text-4xl md:text-5xl font-serif text-foreground/90 mb-3 font-normal tracking-tight">
          {t('welcome.subtitle')}
        </h1>
        <p className="text-subtitle text-foreground/50 mb-10 font-medium">
          你的智能桌面助手，随时待命
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map(({ key, label, icon }) => (
            <button
              key={key}
              className="group flex flex-col items-center gap-3 p-4 rounded-2xl
                         bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/8
                         hover:bg-white hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5
                         transition-all duration-300 hover:-translate-y-0.5"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{icon}</span>
              <span className="text-sm font-medium text-foreground/80">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Question Directory ─────────────────────────────────────────

function QuestionDirectory({ items }: { items: QuestionDirectoryItem[] }) {
  const { t } = useTranslation('chat');
  const scrollRef = useRef<HTMLElement | null>(null);
  const visibleItems = items.slice(0, QUESTION_DIRECTORY_RENDER_LIMIT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, [visibleItems.length]);

  const handleJumpToMessage = (index: number) => {
    document.getElementById(`chat-message-${index}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <aside
      data-testid="chat-question-directory"
      className="w-full shrink-0 lg:w-56 xl:w-64"
      aria-label={t('questionDirectory.title')}
    >
      <div className="sticky top-2 max-h-full overflow-hidden rounded-2xl border border-black/5 bg-black/[0.02] p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('questionDirectory.title')}
          </h2>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-2xs font-medium text-muted-foreground dark:bg-white/10">
            {items.length}
          </span>
        </div>
        <nav ref={scrollRef} className="max-h-[calc(100vh-13rem)] space-y-1 overflow-y-auto pr-1">
          {visibleItems.map((item) => (
            <button
              key={item.index}
              type="button"
              data-testid={`chat-question-directory-item-${item.index}`}
              onClick={() => handleJumpToMessage(item.index)}
              className={cn(
                'group flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors',
                'text-foreground/70 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
              )}
              title={item.title}
            >
              <span className="line-clamp-2 min-w-0 text-xs leading-5">
                {item.title}
              </span>
            </button>
          ))}
          {hiddenCount > 0 && (
            <div className="px-2 py-2 text-xs leading-5 text-muted-foreground">
              {t('questionDirectory.moreHint', { count: hiddenCount })}
            </div>
          )}
        </nav>
      </div>
    </aside>
  );

};

// ── Typing Indicator ────────────────────────────────────────────
function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex gap-3" data-testid="chat-typing-indicator">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-muted/60 dark:bg-white/5 text-foreground rounded-2xl px-4 py-3 border border-border/50">
        <div className="flex gap-1.5 items-center h-4">
          <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          {label && (
            <span className="ml-1.5 text-sm text-muted-foreground">{label}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Activity Indicator (shown between tool cycles) ─────────────

function ActivityIndicator({ phase }: { phase: 'tool_processing' }) {
  void phase;
  return (
    <div className="flex gap-3" data-testid="chat-activity-indicator">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-muted/60 dark:bg-white/5 text-foreground rounded-2xl px-4 py-3 border border-border/50">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Processing tool results…</span>
        </div>
      </div>
    </div>
  );
}


export default Chat;
