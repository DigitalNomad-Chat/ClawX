import type { AttachedFileMeta } from '@/stores/chat';

export interface ExtractedImage {
  url?: string;
  data?: string;
  mimeType: string;
}

export interface StreamingTool {
  id?: string;
  toolCallId?: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
  summary?: string;
}

export interface FileCardProps {
  file: AttachedFileMeta;
  onOpen?: (file: AttachedFileMeta) => void;
}

export interface ImagePreviewProps {
  src: string;
  fileName: string;
  filePath?: string;
  base64?: string;
  mimeType?: string;
  onPreview?: () => void;
}

export interface ImageLightboxProps {
  src: string;
  fileName: string;
  filePath?: string;
  base64?: string;
  mimeType?: string;
  onClose: () => void;
}

export interface MessageBubbleProps {
  text: string;
  isUser?: boolean;
  isStreaming?: boolean;
}
