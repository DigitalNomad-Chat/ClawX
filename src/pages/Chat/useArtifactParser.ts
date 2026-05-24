import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { ArtifactParser } from '@/lib/artifact/parser';
import type { StreamArtifact, StreamArtifactStatus } from '@/lib/artifact/types';

function extractAllText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .filter((b) => b.type === 'text')
      .map((b) => (b.text as string) ?? '')
      .join('');
  }
  return '';
}

function extractTextDelta(
  current: unknown,
  previous: unknown,
): string | null {
  const currentText = extractAllText(current);
  const prevText = extractAllText(previous);

  console.log('[ArtifactParser] extractTextDelta current:', JSON.stringify(currentText).slice(0, 200), 'prev:', JSON.stringify(prevText).slice(0, 200));

  if (!currentText) {
    console.log('[ArtifactParser] currentText empty, returning null');
    return null;
  }
  if (!prevText) {
    console.log('[ArtifactParser] prevText empty, returning currentText');
    return currentText;
  }

  // 累积格式: current 包含 previous
  if (currentText.startsWith(prevText)) {
    const delta = currentText.slice(prevText.length);
    console.log('[ArtifactParser] cumulative format, delta:', JSON.stringify(delta).slice(0, 200));
    return delta;
  }

  // previous 包含 current（无新内容）
  if (prevText.startsWith(currentText)) {
    console.log('[ArtifactParser] retraction detected, returning null');
    return null;
  }

  // 增量格式: current 是全新的文本
  console.log('[ArtifactParser] incremental format, returning currentText');
  return currentText;
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

        console.log('[ArtifactParser] delta extracted:', JSON.stringify(textDelta)?.slice(0, 200));

        if (parserRef.current && textDelta) {
          const result = parserRef.current.append(textDelta);
          console.log('[ArtifactParser] parsed artifacts:', result.artifacts.length, 'plainText length:', result.plainText.length);
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
        console.log('[ArtifactParser] finalize artifacts:', result.artifacts.length);
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
