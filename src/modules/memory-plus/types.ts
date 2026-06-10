export interface MemoryAgent {
  key: string;
  label: string;
}

export interface MemoryFile {
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

export interface MemoryState {
  files: MemoryFile[];
  agents: MemoryAgent[];
  selectedFile: MemoryFile | null;
  selectedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  activeFacet: string;
}
