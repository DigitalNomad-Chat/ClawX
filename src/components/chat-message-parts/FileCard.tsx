import { useCallback } from 'react';
import { FileText, Film, Music, FileArchive, File, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { invokeIpc } from '@/lib/api-client';
import type { AttachedFileMeta } from '@/stores/chat';
import { DIRECTORY_MIME_TYPE, formatFileSize } from './utils';

interface FileIconProps {
  mimeType: string;
  className?: string;
}

function FileIcon({ mimeType, className }: FileIconProps) {
  if (mimeType === DIRECTORY_MIME_TYPE) return <FolderOpen className={className} />;
  if (mimeType.startsWith('video/')) return <Film className={className} />;
  if (mimeType.startsWith('audio/')) return <Music className={className} />;
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') return <FileText className={className} />;
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive') || mimeType.includes('tar') || mimeType.includes('rar') || mimeType.includes('7z')) return <FileArchive className={className} />;
  if (mimeType === 'application/pdf') return <FileText className={className} />;
  return <File className={className} />;
}

interface FileCardProps {
  file: AttachedFileMeta;
  onOpen?: (file: AttachedFileMeta) => void;
}

export function FileCard({ file, onOpen }: FileCardProps) {
  const handleOpen = useCallback(() => {
    if (!file.filePath) return;
    if (onOpen) {
      onOpen(file);
    } else {
      void invokeIpc('shell:openPath', file.filePath);
    }
  }, [file, onOpen]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 bg-surface-input max-w-[220px]",
        file.filePath && "cursor-pointer hover:bg-muted transition-all duration-200 hover:shadow-sm hover:border-primary/20"
      )}
      onClick={handleOpen}
      title={file.filePath ? "Open file" : undefined}
    >
      <FileIcon mimeType={file.mimeType} className="h-5 w-5 shrink-0 text-primary/70" />
      <div className="min-w-0 overflow-hidden">
        <p className="text-xs font-medium truncate">{file.fileName}</p>
        <p className="text-2xs text-muted-foreground">
          {file.mimeType === DIRECTORY_MIME_TYPE ? '文件夹' : file.fileSize > 0 ? formatFileSize(file.fileSize) : 'File'}
        </p>
      </div>
    </div>
  );
}
