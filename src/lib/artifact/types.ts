export type StreamArtifactType =
  | 'document'
  | 'code'
  | 'html'
  | 'svg'
  | 'mermaid';

export type StreamArtifactStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface StreamArtifactMeta {
  language?: string;
  filename?: string;
  [key: string]: unknown;
}

export interface StreamArtifact {
  id: string;
  type: StreamArtifactType;
  title: string;
  content: string;
  status: StreamArtifactStatus;
  meta: StreamArtifactMeta;
  // position 用于同一消息中多个 artifact 的去重和排序
  // start/end 是相对于原始流文本的字符偏移量
  position: { start: number; end: number };
  createdAt: number;
  updatedAt: number;
  error?: string;
  messageId?: string;
  runId?: string;
  sessionKey: string;
}

export interface StreamArtifactRendererProps {
  artifact: StreamArtifact;
  isStreaming?: boolean;
  viewMode?: 'source' | 'preview';
  onViewModeChange?: (mode: 'source' | 'preview') => void;
}

export interface RendererEntry {
  type: StreamArtifactType;
  displayName: string;
  icon: string;
  component: React.ComponentType<StreamArtifactRendererProps>;
  canEdit?: boolean;
  fileExtension?: string;
}

export const LIGHTWEIGHT_ARTIFACT_TYPES: StreamArtifactType[] = [
  'document',
  'code',
  'html',
  'svg',
  'mermaid',
];

export const DEFAULT_FILE_EXTENSIONS: Record<StreamArtifactType, string> = {
  document: 'md',
  code: 'txt',
  html: 'html',
  svg: 'svg',
  mermaid: 'mmd',
};

export function normalizeArtifactType(type: string): StreamArtifactType | null {
  const normalized = type.toLowerCase().trim() as StreamArtifactType;
  return LIGHTWEIGHT_ARTIFACT_TYPES.includes(normalized) ? normalized : null;
}
