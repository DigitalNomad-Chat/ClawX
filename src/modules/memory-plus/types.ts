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

export interface MemoryAgentStatus {
  agentId: string;
  status: "ok" | "warn" | "blocked" | "info" | "unknown";
  files: number;
  chunks: number;
  issuesCount: number;
  dirty: boolean;
  vectorAvailable: boolean;
  searchable: boolean;
  lastUpdateAt?: string;
}

export interface MemoryStatusSummary {
  generatedAt: string;
  status: "ok" | "warn" | "blocked" | "info" | "unknown";
  okCount: number;
  warnCount: number;
  blockedCount: number;
  agents: MemoryAgentStatus[];
}

export interface MemoryState {
  files: MemoryFile[];
  agents: MemoryAgent[];
  status: MemoryStatusSummary | null;
  selectedFile: MemoryFile | null;
  selectedContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  activeFacet: string;
}
