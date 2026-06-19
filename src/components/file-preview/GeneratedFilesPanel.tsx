/**
 * Inline panel showing files the AI wrote/edited in the current run.
 * Lives directly under the ExecutionGraphCard for each user trigger
 * (see Chat/index.tsx).
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, MonitorPlay } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { invokeIpc, readTextFile } from '@/lib/api-client';
import {
  computeLineStats,
  supportsInlineDiff,
  supportsInlineDocumentPreview,
  supportsRichDocumentPreview,
  type GeneratedFile,
} from '@/lib/generated-files';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import type { StreamArtifact, StreamArtifactType } from '@/lib/artifact/types';

/** File extensions that can be rendered as stream artifacts. */
const RENDERABLE_EXTENSIONS = new Set<string>([
  '.html', '.htm', '.svg', '.md', '.markdown', '.mermaid', '.mmd',
]);

function extToArtifactType(ext: string): StreamArtifactType | null {
  switch (ext.toLowerCase()) {
    case '.html':
    case '.htm':
      return 'html';
    case '.svg':
      return 'svg';
    case '.md':
    case '.markdown':
      return 'document';
    case '.mermaid':
    case '.mmd':
      return 'mermaid';
    default:
      return null;
  }
}

function isRenderable(ext: string): boolean {
  return RENDERABLE_EXTENSIONS.has(ext.toLowerCase());
}

export interface GeneratedFilesPanelProps {
  files: GeneratedFile[];
  onOpen: (file: GeneratedFile) => void;
  onRevealInFileManager?: (file: GeneratedFile) => void;
  className?: string;
}

export function GeneratedFilesPanel({
  files,
  onOpen,
  onRevealInFileManager,
  className,
}: GeneratedFilesPanelProps) {
  const { t } = useTranslation('chat');
  const openContent = useArtifactPanel((s) => s.openContent);

  const handleRenderPreview = useCallback(async (file: GeneratedFile) => {
    const artifactType = extToArtifactType(file.ext);
    if (!artifactType) return;

    let content = file.fullContent ?? '';

    if (!content) {
      try {
        const res = await readTextFile(file.filePath);
        if (!res.ok) return;
        content = res.content ?? '';
      } catch {
        return;
      }
    }

    const artifact: StreamArtifact = {
      id: `file-card-${file.filePath}-${Date.now()}`,
      type: artifactType,
      title: file.fileName,
      content,
      status: 'complete',
      meta: { filename: file.fileName, language: file.ext },
      position: { start: 0, end: content.length },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionKey: `file-card-${Date.now()}`,
    };

    useStreamArtifactStore.getState().addArtifact(artifact);
    useStreamArtifactStore.getState().selectArtifact(artifact.id);
    openContent();
  }, [openContent]);

  if (!files.length) return null;

  const revealInFileManager = (file: GeneratedFile) => {
    if (onRevealInFileManager) {
      onRevealInFileManager(file);
      return;
    }
    void invokeIpc('shell:showItemInFolder', file.filePath);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="px-1">
        <p className="text-xs font-semibold text-foreground/75">
          {t('generatedFiles.title', { count: files.length, defaultValue: 'File changes ({{count}})' })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {files.map((file) => {
          const lineStats = computeLineStats(file);
          const clickable = supportsInlineDiff(file) || supportsInlineDocumentPreview(file.ext);
          const revealOnly = supportsRichDocumentPreview(file.ext);
          const renderable = isRenderable(file.ext);
          if (revealOnly) {
            return (
              <button
                key={`${file.filePath}-${file.lastSeenIndex}`}
                type="button"
                onClick={() => revealInFileManager(file)}
                className={cn(
                  'group inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-black/8 bg-black/[0.035] px-3.5 py-2 text-left transition-colors',
                  'hover:border-black/12 hover:bg-black/[0.055] dark:hover:bg-white/[0.07]',
                  'dark:border-white/10 dark:bg-white/[0.04]',
                )}
                title={file.filePath}
              >
                <div className="min-w-0 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] leading-none">
                  <span className="shrink-0 font-medium text-foreground">{file.fileName}</span>
                  <span className="truncate text-muted-foreground">{file.filePath}</span>
                </div>
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded-full border border-black/8 bg-black/[0.045] px-1.5 py-0.5 text-2xs text-foreground/70 dark:border-white/10 dark:bg-white/[0.06] dark:text-foreground/75"
                >
                  <FolderOpen className="mr-1 h-3 w-3" />
                  {t('generatedFiles.openFolder', 'Open folder')}
                </Badge>
              </button>
            );
          }
          return (
            <button
              key={`${file.filePath}-${file.lastSeenIndex}`}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (clickable) onOpen(file);
              }}
              className={cn(
                'group inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-black/8 bg-black/[0.035] px-3.5 py-2 text-left transition-colors disabled:opacity-100',
                clickable && 'hover:border-black/12 hover:bg-black/[0.055] dark:hover:bg-white/[0.07]',
                !clickable && 'cursor-default',
                'dark:border-white/10 dark:bg-white/[0.04]',
              )}
              title={file.filePath}
            >
              <div className="min-w-0 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] leading-none">
                <span className="shrink-0 font-medium text-foreground">{file.fileName}</span>
                <span className="truncate text-muted-foreground">{file.filePath}</span>
              </div>
              {lineStats && (
                <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs leading-none tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{lineStats.added}</span>
                  <span className="text-rose-600 dark:text-rose-400">-{lineStats.removed}</span>
                </div>
              )}
              <Badge
                variant="secondary"
                className="shrink-0 rounded-full border border-black/8 bg-black/[0.045] px-1.5 py-0.5 text-2xs text-foreground/70 dark:border-white/10 dark:bg-white/[0.06] dark:text-foreground/75"
              >
                {file.action === 'created'
                  ? t('generatedFiles.created', 'Created')
                  : t('generatedFiles.modified', 'Modified')}
              </Badge>
              {renderable && (
                <Badge
                  variant="secondary"
                  className="shrink-0 cursor-pointer rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-2xs text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400 dark:border-blue-400/20 dark:bg-blue-400/10 dark:hover:bg-blue-400/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRenderPreview(file);
                  }}
                >
                  <MonitorPlay className="mr-1 h-3 w-3" />
                  {t('generatedFiles.renderPreview', '渲染预览')}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GeneratedFilesPanel;
