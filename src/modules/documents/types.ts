export interface DocumentAgent {
  key: string;
  label: string;
}

export interface DocumentFile {
  title: string;
  excerpt: string;
  category: string;
  sourcePath: string;
  relativePath: string;
  updatedAt: string;
  size: number;
  facetKey?: string;
  facetLabel?: string;
}

export interface DocumentState {
  files: DocumentFile[];
  agents: DocumentAgent[];
  selectedFile: DocumentFile | null;
  selectedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  activeFacet: string;
}
