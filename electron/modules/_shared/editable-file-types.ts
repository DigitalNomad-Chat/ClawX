export interface EditableFileEntry {
  scope: "memory" | "workspace";
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

export interface EditableAgentScope {
  agentId: string;
  facetKey: string;
  facetLabel: string;
  workspaceRoot: string;
}

export type EditableFileScope = "memory" | "workspace";
export type EditableAgentScopeConfigStatus = "configured" | "config_invalid" | "config_missing";
