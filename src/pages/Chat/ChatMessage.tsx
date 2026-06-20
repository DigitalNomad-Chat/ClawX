/**
 * Chat Message Component
 * Renders user / assistant / system / toolresult messages
 * with markdown and images. Tool steps render in ExecutionGraphCard;
 * streaming runs may show a compact ToolStatusBar. Thinking output is
 * surfaced via ExecutionGraphCard, not inside message bubbles.
 */
import { useState, useCallback, useEffect, memo } from 'react';
import { Sparkles, Copy, Check, File, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { statFile } from '@/lib/api-client';
import type { RawMessage, AttachedFileMeta } from '@/stores/chat';
import { extractText, extractImages, extractToolUse, formatTimestamp } from './message-utils';
import { restoreText } from '@/lib/desensitize';
import { useDesensitizeViewStore } from '@/stores/desensitize-view';
import {
  ToolStatusBar,
  FileCard,
  ImageThumbnail,
  ImagePreviewCard,
  ImageLightbox,
  MessageBubble,
  DIRECTORY_MIME_TYPE,
  fileNameFromPath,
  trimPathTerminators,
  imageSrc,
} from '@/components/chat-message-parts';

interface ChatMessageProps {
  message: RawMessage;
  textOverride?: string;
  suppressToolCards?: boolean;
  suppressProcessAttachments?: boolean;
  /**
   * When true, hides the assistant text bubble (and any thinking block that
   * would be shown above it). Used when the message's text is being folded
   * into an ExecutionGraphCard as a narration step, to prevent the same text
   * from appearing both inside the graph and as an orphan bubble in the chat
   * stream.
   */
  suppressAssistantText?: boolean;
  isStreaming?: boolean;
  streamingTools?: Array<{
    id?: string;
    toolCallId?: string;
    name: string;
    status: 'running' | 'completed' | 'error';
    durationMs?: number;
    summary?: string;
  }>;
  /**
   * Optional callback invoked when a non-image file card is clicked.
   * When provided, the file opens in the in-app preview panel instead of
   * the system default editor.
   */
  onOpenFile?: (file: AttachedFileMeta) => void;
}

function isChatPreviewDocument(file: AttachedFileMeta): boolean {
  const name = file.fileName.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  return (
    mime === 'application/pdf'
    || mime === 'application/vnd.ms-excel'
    || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || name.endsWith('.pdf')
    || name.endsWith('.xls')
    || name.endsWith('.xlsx')
  );
}

function isDirectoryAttachment(file: AttachedFileMeta): boolean {
  return file.mimeType === DIRECTORY_MIME_TYPE;
}

function isSkillFileAttachment(file: AttachedFileMeta): boolean {
  const path = file.filePath ?? '';
  return (
    /(?:^|[\\/])\.(?:openclaw|clawdock)[\\/]skills[\\/][^\\/]+[\\/].+\.[A-Za-z0-9]+$/i.test(path)
    || /(?:^|[\\/])skills[\\/][^\\/]+[\\/]SKILL\.md$/i.test(path)
  );
}

function isHtmlOrMarkdownPreview(file: AttachedFileMeta): boolean {
  const name = file.fileName.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  return (
    mime === 'text/html'
    || mime === 'text/markdown'
    || name.endsWith('.html')
    || name.endsWith('.htm')
    || name.endsWith('.md')
    || name.endsWith('.markdown')
  );
}

/** User-facing artifacts that must stay visible when process output is folded into the graph. */
function isUserFacingAttachmentWhenFolded(file: AttachedFileMeta): boolean {
  if (file.mimeType.startsWith('image/')) return true;
  if (isDirectoryAttachment(file)) return true;
  if (isSkillFileAttachment(file)) return true;
  if (isChatPreviewDocument(file)) return true;
  // Paths parsed from the assistant reply (e.g. "/workspace/demo.html") are
  // intentional user-facing links. Generic tool-result markdown attachments
  // (e.g. CHECKLIST.md emitted mid-run) stay folded into the execution graph.
  if (file.source === 'message-ref' && isHtmlOrMarkdownPreview(file)) return true;
  return false;
}

function validationKindForAttachment(file: AttachedFileMeta): 'file' | 'dir' | null {
  if (!file.filePath) return null;
  // User-selected uploads and already enriched attachments are trusted enough
  // for immediate display. Regex-derived message refs start at size 0/null and
  // are validated through main-process stat before becoming clickable cards.
  if (file.source !== 'message-ref' && file.source !== 'tool-result') return null;
  if (file.fileSize > 0 || file.preview) return null;
  return isDirectoryAttachment(file) ? 'dir' : 'file';
}

function previewMimeFromPath(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return null;
}

function extractPreviewDocumentPaths(text: string): AttachedFileMeta[] {
  if (!text) return [];
  const refs: AttachedFileMeta[] = [];
  const seen = new Set<string>();
  const pushRef = (filePath: string, mimeType: string) => {
    const normalizedPath = trimPathTerminators(filePath);
    if (!normalizedPath || seen.has(normalizedPath)) return;
    seen.add(normalizedPath);
    refs.push({
      fileName: fileNameFromPath(normalizedPath),
      mimeType,
      fileSize: 0,
      preview: null,
      filePath: normalizedPath,
      source: 'message-ref',
    });
  };
  // Deliberately narrow this render-layer fallback to user-facing artifacts:
  // PDF / spreadsheet previews and OpenClaw skill directories. The store-level
  // extractor still handles broad file categories; this keeps visible outputs
  // clickable even before history enrichment runs.
  const exts = 'pdf|xlsx?|PDF|XLSX?';
  const taggedRegex = new RegExp(`(?:^|[\\s(\\[{>])(?:MEDIA|media):((?:\\/|~\\/)[^\\s\\n"'()\\[\\],<>]*?\\.(?:${exts}))`, 'g');
  const unixRegex = new RegExp('(?<![\\w./:])((?:\\/|~\\/)[^\\s\\n"\'`()\\[\\],<>]*?\\.(?:' + exts + '))', 'g');
  const skillPathBoundary = '(?=$|\\s|[\\x5b\\x5d"\'`(),<>，。；;,.!?])';
  const skillPathPart = '[^\\\\/\\s\\n"\'`()\\x5b\\x5d,<>]+';
  const skillPathTail = '[^\\s\\n"\'`()\\x5b\\x5d,<>]*?';
  const skillDirRegex = new RegExp(
    `(?<![\\w./:])((?:~[\\\\/]\\.(?:openclaw|clawdock)[\\\\/]skills[\\\\/]${skillPathPart})|(?:(?:\\/|[A-Za-z]:\\\\)${skillPathTail}[\\\\/]\\.(?:openclaw|clawdock)[\\\\/]skills[\\\\/]${skillPathPart}))${skillPathBoundary}`,
    'gi',
  );
  const skillMarkdownRegex = new RegExp(
    `(?<![\\w./:])((?:~[\\\\/]\\.(?:openclaw|clawdock)[\\\\/]skills[\\\\/]${skillPathTail}\\.md)|(?:(?:\\/|[A-Za-z]:\\\\)${skillPathTail}[\\\\/]\\.(?:openclaw|clawdock)[\\\\/]skills[\\\\/]${skillPathTail}\\.md))${skillPathBoundary}`,
    'gi',
  );

  let workingText = text;
  let taggedMatch: RegExpExecArray | null;
  while ((taggedMatch = taggedRegex.exec(text)) !== null) {
    const filePath = taggedMatch[1];
    const mimeType = previewMimeFromPath(filePath);
    if (mimeType) pushRef(filePath, mimeType);
    const start = taggedMatch.index;
    const end = start + taggedMatch[0].length;
    workingText = workingText.slice(0, start) + ' '.repeat(end - start) + workingText.slice(end);
  }

  for (const regex of [unixRegex, skillMarkdownRegex, skillDirRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(workingText)) !== null) {
      const filePath = match[1];
      const mimeType = regex === skillDirRegex ? DIRECTORY_MIME_TYPE : previewMimeFromPath(filePath);
      if (mimeType) pushRef(filePath, mimeType);
    }
  }

  return refs;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  textOverride,
  suppressToolCards = false,
  suppressProcessAttachments = false,
  suppressAssistantText = false,
  isStreaming = false,
  streamingTools = [],
  onOpenFile,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const role = typeof message.role === 'string' ? message.role.toLowerCase() : '';
  const isToolResult = role === 'toolresult' || role === 'tool_result';
  const text = textOverride ?? extractText(message);
  const [showOriginal, setShowOriginal] = useState(false);
  const globalShowOriginal = useDesensitizeViewStore((s) => s.globalShowOriginal);
  const messageMap = (message as unknown as Record<string, unknown>)._desensitizeMap as Record<string, string> | undefined;
  const hasDesensitized = !!messageMap && Object.keys(messageMap).length > 0;
  const effectiveShowOriginal = showOriginal || globalShowOriginal;
  const displayText = effectiveShowOriginal && hasDesensitized && messageMap
    ? restoreText(text, messageMap)
    : text;
  // When text is folded into an ExecutionGraphCard, treat the message as
  // having no text for rendering purposes. Keeping this behind a flag (vs
  // blanking `text` outright) lets future hover affordances still read the
  // original content without surfacing the bubble.
  const hideAssistantText = suppressAssistantText && !isUser;
  const hasText = !hideAssistantText && text.trim().length > 0;
  const images = extractImages(message);
  const tools = extractToolUse(message);
  const visibleTools = suppressToolCards ? [] : tools;
  const [validatedPaths, setValidatedPaths] = useState<Record<string, boolean>>({});
  const rawAttachedFiles = message._attachedFiles || [];
  const textPreviewFiles = isUser ? [] : extractPreviewDocumentPaths(text);
  const rawAttachedPaths = new Set(rawAttachedFiles.map((file) => file.filePath).filter(Boolean));
  const derivedAttachedFiles = [
    ...rawAttachedFiles,
    ...textPreviewFiles.filter((file) => !file.filePath || !rawAttachedPaths.has(file.filePath)),
  ];
  const validationTargets = derivedAttachedFiles
    .map((file) => {
      const kind = validationKindForAttachment(file);
      return kind && file.filePath ? { filePath: file.filePath, kind } : null;
    })
    .filter((target): target is { filePath: string; kind: 'file' | 'dir' } => !!target);
  const validationKey = validationTargets
    .map((target) => `${target.kind}:${target.filePath}`)
    .sort()
    .join('\n');
  useEffect(() => {
    if (!validationKey) return;
    const pendingTargets = validationTargets.filter((target) => validatedPaths[target.filePath] === undefined);
    if (pendingTargets.length === 0) return;

    let cancelled = false;
    void Promise.all(
      pendingTargets.map(async (target) => {
        try {
          const stat = await statFile(target.filePath);
          return {
            filePath: target.filePath,
            exists: !!stat.ok && (target.kind === 'dir' ? !!stat.isDir : !!stat.isFile),
          };
        } catch {
          return { filePath: target.filePath, exists: false };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setValidatedPaths((current) => {
        const next = { ...current };
        for (const result of results) next[result.filePath] = result.exists;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [validationKey, validationTargets, validatedPaths]);
  const existingDerivedAttachedFiles = derivedAttachedFiles.filter((file) => {
    const kind = validationKindForAttachment(file);
    if (!kind || !file.filePath) return true;
    return validatedPaths[file.filePath] === true;
  });
  const filteredProcessAttachments = derivedAttachedFiles.filter((file) => {
    if (file.source !== 'tool-result' && file.source !== 'message-ref') return true;
    // Runtime-produced user-facing artifacts (images, HTML/Markdown/PDF/XLSX,
    // skill directories, ...) must remain visible in the reply bubble even
    // when generic process attachments are folded into the execution graph.
    // The graph card itself does not render `_attachedFiles`, so dropping
    // them here would leave the user with no way to open previews from chat.
    return isUserFacingAttachmentWhenFolded(file);
  });
  // When a message is attachment-only, keep those attachments visible even if
  // process attachments are generally suppressed for this run segment —
  // otherwise the reply disappears entirely.
  const processVisibleAttachments = filteredProcessAttachments.filter((file) => {
    const kind = validationKindForAttachment(file);
    if (!kind || !file.filePath) return true;
    return validatedPaths[file.filePath] === true;
  });
  const attachedFiles = suppressProcessAttachments && (hasText || images.length > 0 || visibleTools.length > 0)
    ? processVisibleAttachments
    : existingDerivedAttachedFiles;
  const [lightboxImg, setLightboxImg] = useState<{ src: string; fileName: string; filePath?: string; base64?: string; mimeType?: string } | null>(null);

  // Never render tool result messages in chat UI
  if (isToolResult) return null;

  const hasStreamingToolStatus = isStreaming && streamingTools.length > 0;
  if (!hasText && images.length === 0 && visibleTools.length === 0 && attachedFiles.length === 0 && !hasStreamingToolStatus) return null;

  return (
    <div
      className={cn(
        'flex gap-3 group',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar — vertical center aligned with the first line of the reply.
          The outer slot is sized to one prose-sm line (h-6 = 24px) so its
          midpoint coincides with the first text line's midpoint; the 32px
          avatar inside is centered within that slot and intentionally
          overflows ±4px above/below the line, which mirrors how chat avatars
          sit alongside a single line of text. */}
      {!isUser && (
        <div className="flex h-6 shrink-0 items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          'flex flex-col w-full min-w-0 max-w-[80%] space-y-2',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {isStreaming && !isUser && streamingTools.length > 0 && (
          <ToolStatusBar tools={streamingTools} />
        )}

        {/* Images — rendered ABOVE text bubble for user messages */}
        {/* Images from content blocks (Gateway session data / channel push photos) */}
        {isUser && images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => {
              const src = imageSrc(img);
              if (!src) return null;
              return (
                <ImageThumbnail
                  key={`content-${i}`}
                  src={src}
                  fileName="image"
                  base64={img.data}
                  mimeType={img.mimeType}
                  onPreview={() => setLightboxImg({ src, fileName: 'image', base64: img.data, mimeType: img.mimeType })}
                />
              );
            })}
          </div>
        )}

        {/* File attachments — images above text for user, file cards below */}
        {isUser && attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file, i) => {
              const isImage = file.mimeType.startsWith('image/');
              // Skip image attachments if we already have images from content blocks
              if (isImage && images.length > 0) return null;
              if (isImage) {
                return file.preview ? (
                  <ImageThumbnail
                    key={`local-${i}`}
                    src={file.preview}
                    fileName={file.fileName}
                    filePath={file.filePath}
                    mimeType={file.mimeType}
                    onPreview={() => setLightboxImg({ src: file.preview!, fileName: file.fileName, filePath: file.filePath, mimeType: file.mimeType })}
                  />
                ) : (
                  <div
                    key={`local-${i}`}
                    className="w-36 h-36 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-center text-muted-foreground"
                  >
                    <File className="h-8 w-8" />
                  </div>
                );
              }
              // Non-image files → file card
              return <FileCard key={`local-${i}`} file={file} onOpen={onOpenFile} />;
            })}
          </div>
        )}

        {/* Main text bubble */}
        {hasText && (
          <MessageBubble
            text={displayText}
            isUser={isUser}
            isStreaming={isStreaming}
          />
        )}

        {/* Images from content blocks — assistant messages (below text) */}
        {!isUser && images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => {
              const src = imageSrc(img);
              if (!src) return null;
              return (
                <ImagePreviewCard
                  key={`content-${i}`}
                  src={src}
                  fileName="image"
                  base64={img.data}
                  mimeType={img.mimeType}
                  onPreview={() => setLightboxImg({ src, fileName: 'image', base64: img.data, mimeType: img.mimeType })}
                />
              );
            })}
          </div>
        )}

        {/* File attachments — assistant messages (below text) */}
        {!isUser && attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file, i) => {
              const isImage = file.mimeType.startsWith('image/');
              if (isImage && images.length > 0) return null;
              if (isImage && file.preview) {
                return (
                  <ImagePreviewCard
                    key={`local-${i}`}
                    src={file.preview}
                    fileName={file.fileName}
                    filePath={file.filePath}
                    mimeType={file.mimeType}
                    onPreview={() => setLightboxImg({ src: file.preview!, fileName: file.fileName, filePath: file.filePath, mimeType: file.mimeType })}
                  />
                );
              }
              if (isImage && !file.preview) {
                return (
                  <div key={`local-${i}`} className="w-36 h-36 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-center text-muted-foreground">
                    <File className="h-8 w-8" />
                  </div>
                );
              }
              return <FileCard key={`local-${i}`} file={file} onOpen={onOpenFile} />;
            })}
          </div>
        )}

        {/* Hover row for user messages — timestamp + desensitize toggle */}
        {isUser && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
            {hasDesensitized && (
              <button
                onClick={() => setShowOriginal((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title={showOriginal ? '显示脱敏文本' : '显示原文'}
              >
                {showOriginal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showOriginal ? '脱敏' : '原文'}
              </button>
            )}
            {message.timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(message.timestamp)}
              </span>
            )}
          </div>
        )}

        {/* Hover row for assistant messages — only when there is real text content */}
        {!isUser && hasText && (
          <AssistantHoverBar text={displayText} timestamp={message.timestamp} />
        )}
      </div>

      {/* Image lightbox portal */}
      {lightboxImg && (
        <ImageLightbox
          src={lightboxImg.src}
          fileName={lightboxImg.fileName}
          filePath={lightboxImg.filePath}
          base64={lightboxImg.base64}
          mimeType={lightboxImg.mimeType}
          onClose={() => setLightboxImg(null)}
        />
      )}
    </div>
  );
});

// ── Assistant hover bar (timestamp + copy, shown on group hover) ─

function AssistantHoverBar({ text, timestamp }: { text: string; timestamp?: number }) {
  const [copied, setCopied] = useState(false);

  const copyContent = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <div className="flex items-center justify-between w-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none px-1">
      <span className="text-xs text-muted-foreground">
        {timestamp ? formatTimestamp(timestamp) : ''}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copyContent}
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

