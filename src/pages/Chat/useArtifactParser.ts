import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { ArtifactParser } from '@/lib/artifact/parser';
import type { StreamArtifact, StreamArtifactStatus } from '@/lib/artifact/types';

function extractTextDelta(
  current: unknown,
  previous: unknown,
): string | null {
  if (typeof current === 'string' && typeof previous === 'string') {
    return current.slice(previous.length);
  }
  // ContentBlock[] 格式处理
  if (Array.isArray(current) && Array.isArray(previous)) {
    const currentText = current
      .filter((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
      .map((b: unknown) => (b as Record<string, unknown>)?.text as string)
      .join('');
    const prevText = previous
      .filter((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
      .map((b: unknown) => (b as Record<string, unknown>)?.text as string)
      .join('');
    return currentText.slice(prevText.length);
  }
  if (typeof current === 'string') {
    return current;
  }
  return null;
}

export function useArtifactParser() {
  const parserRef = useRef<ArtifactParser | null>(null);
  const sessionKeyRef = useRef<string>('');

  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state, prevState) => {
      // 新流开始
      if (state.sending && !prevState.sending) {
        parserRef.current = new ArtifactParser({
          autoDetectLanguage: true,
          treatCodeBlockAsArtifact: true,
        });
        sessionKeyRef.current = state.currentSessionKey;
      }

      // Delta 更新
      if (
        state.streamingMessage &&
        state.streamingMessage !== prevState.streamingMessage
      ) {
        const textDelta = extractTextDelta(
          (state.streamingMessage as Record<string, unknown>)?.content,
          (prevState.streamingMessage as Record<string, unknown>)?.content,
        );

        if (parserRef.current && textDelta) {
          const result = parserRef.current.append(textDelta);
          syncArtifacts(result.artifacts, {
            runId: state.activeRunId,
            messageId: (state.streamingMessage as Record<string, unknown>)?.messageId as string | undefined,
            sessionKey: sessionKeyRef.current,
          });
        }
      }

      // 流结束
      if (!state.sending && prevState.sending && parserRef.current) {
        const result = parserRef.current.finalize();
        syncArtifacts(result.artifacts, {
          runId: state.activeRunId,
          status: 'complete',
          sessionKey: sessionKeyRef.current,
        });
        parserRef.current = null;
      }

      // Session 切换
      if (state.currentSessionKey !== prevState.currentSessionKey) {
        useStreamArtifactStore.getState().clearSessionArtifacts(prevState.currentSessionKey);
      }
    });

    return unsubscribe;
  }, []);
}

function syncArtifacts(
  parsedArtifacts: StreamArtifact[],
  ctx: {
    runId: string | null;
    messageId?: string;
    sessionKey: string;
    status?: StreamArtifactStatus;
  },
) {
  const { addArtifact, updateArtifact } = useStreamArtifactStore.getState();

  parsedArtifacts.forEach((art) => {
    const existing = useStreamArtifactStore
      .getState()
      .artifacts.find(
        (a) =>
          a.sessionKey === ctx.sessionKey &&
          a.position.start === art.position.start &&
          a.type === art.type,
      );

    if (existing) {
      updateArtifact(existing.id, {
        content: art.content,
        status: ctx.status ?? 'streaming',
        updatedAt: Date.now(),
      });
    } else {
      addArtifact({
        ...art,
        id: crypto.randomUUID(),
        runId: ctx.runId ?? '',
        messageId: ctx.messageId,
        sessionKey: ctx.sessionKey,
        status: ctx.status ?? 'streaming',
      });

      // 自动打开面板
      if (!useArtifactPanel.getState().open) {
        useArtifactPanel.getState().openContent();
      }
    }
  });
}
