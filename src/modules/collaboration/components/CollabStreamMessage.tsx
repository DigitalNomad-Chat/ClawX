import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RawMessage, AttachedFileMeta, ToolStatus } from '@/stores/chat';
import { collectToolUpdates, upsertToolStatuses, extractImagesAsAttachedFiles } from '@/stores/chat/helpers';
import { extractText, extractImages, extractToolUse, extractThinking } from '@/pages/Chat/message-utils';
import {
  ToolStatusBar,
  ToolCard,
  FileCard,
  ImagePreviewCard,
  MessageBubble,
  imageSrc,
} from '@/components/chat-message-parts';

export interface CollabStreamMessageProps {
  rawMessage: RawMessage | null;
  streamingTools?: ToolStatus[];
  isStreaming?: boolean;
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!thinking.trim()) return null;
  return (
    <div className="rounded-lg border border-primary/10 bg-primary/[0.03] text-xs">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>思考过程</span>
      </button>
      {expanded && (
        <pre className="px-3 pb-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground leading-relaxed">
          {thinking}
        </pre>
      )}
    </div>
  );
}

export function CollabStreamMessage({
  rawMessage,
  streamingTools = [],
  isStreaming = false,
}: CollabStreamMessageProps) {
  const isUser = useMemo(() => rawMessage?.role === 'user', [rawMessage]);
  const text = useMemo(() => (rawMessage ? extractText(rawMessage) : ''), [rawMessage]);
  const thinking = useMemo(() => (rawMessage ? extractThinking(rawMessage) : null), [rawMessage]);
  const tools = useMemo(() => (rawMessage ? extractToolUse(rawMessage) : []), [rawMessage]);
  const contentImages = useMemo(() => (rawMessage ? extractImages(rawMessage) : []), [rawMessage]);
  const imageFiles = useMemo(() => {
    if (!rawMessage) return [];
    return extractImagesAsAttachedFiles(rawMessage.content);
  }, [rawMessage]);

  const attachedFiles = useMemo(() => {
    const files: AttachedFileMeta[] = [];
    const seen = new Set<string>();
    const push = (file: AttachedFileMeta) => {
      const key = file.filePath || file.fileName;
      if (!key || seen.has(key)) return;
      seen.add(key);
      files.push(file);
    };
    const rawFiles = (rawMessage as unknown as { _attachedFiles?: AttachedFileMeta[] } | null)?._attachedFiles ?? [];
    for (const file of rawFiles) push(file);
    for (const file of imageFiles) push(file);
    return files;
  }, [rawMessage, imageFiles]);

  const liveTools = useMemo(() => {
    if (!rawMessage || !isStreaming) return streamingTools;
    const updates = collectToolUpdates(rawMessage, 'delta');
    if (updates.length === 0) return streamingTools;
    return upsertToolStatuses(streamingTools, updates);
  }, [rawMessage, isStreaming, streamingTools]);

  const hasText = text.trim().length > 0;

  return (
    <div className="space-y-2 w-full">
      {isStreaming && liveTools.length > 0 && <ToolStatusBar tools={liveTools} />}

      {tools.length > 0 && (
        <div className="space-y-1">
          {tools.map((tool) => (
            <ToolCard key={tool.id || tool.name} name={tool.name} input={tool.input} />
          ))}
        </div>
      )}

      {thinking && <ThinkingBlock thinking={thinking} />}

      {hasText && <MessageBubble text={text} isUser={isUser} isStreaming={isStreaming} />}

      {contentImages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {contentImages.map((img, i) => {
            const src = imageSrc(img);
            if (!src) return null;
            return (
              <ImagePreviewCard
                key={`img-${i}`}
                src={src}
                fileName="image"
                base64={img.data}
                mimeType={img.mimeType}
              />
            );
          })}
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedFiles.map((file, i) => {
            if (file.mimeType.startsWith('image/')) return null;
            return <FileCard key={`file-${i}`} file={file} />;
          })}
        </div>
      )}
    </div>
  );
}
