import { useEffect, useMemo } from "react";
import { ModulePageLayout } from "../_shared/ModulePageLayout";
import { useDocumentStore } from "./store";
import { t } from "./i18n";
import { MarkdownEditor } from "../_shared/components/MarkdownEditor";
import { EditableFileList } from "../_shared/components/EditableFileList";
import { AgentSidebar } from "../_shared/components/AgentSidebar";
import { FileText, FileEdit } from "lucide-react";

export function DocumentsPage() {
  const lang = "zh" as const;
  const store = useDocumentStore();
  const files = useDocumentStore((s) => s.files);
  const agents = useDocumentStore((s) => s.agents);
  const selectedFile = useDocumentStore((s) => s.selectedFile);
  const selectedContent = useDocumentStore((s) => s.selectedContent);
  const loading = useDocumentStore((s) => s.loading);
  const activeFacet = useDocumentStore((s) => s.activeFacet);

  useEffect(() => {
    store.loadFiles();
    store.loadAgents();
  }, []);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => f.facetKey === activeFacet);
  }, [files, activeFacet]);

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of files) {
      counts[f.facetKey ?? "main"] = (counts[f.facetKey ?? "main"] ?? 0) + 1;
    }
    return counts;
  }, [files]);

  return (
    <ModulePageLayout>
      <div className="flex h-full flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">{t("pageTitle", lang)}</h1>
              <p className="text-sm text-muted-foreground">{t("description", lang)}</p>
            </div>
          </div>
        </div>

        {/* Three-column layout */}
        <div className="flex-1 flex min-h-0 border rounded-xl overflow-hidden shadow-sm">
          {/* Agent Sidebar */}
          <AgentSidebar
            agents={agents}
            activeKey={activeFacet}
            onChange={store.setActiveFacet}
            fileCounts={fileCounts}
          />

          {/* File List */}
          <div className="w-[240px] border-r flex flex-col min-h-0 bg-card">
            <div className="px-3 py-2 border-b bg-muted/50 text-sm font-medium flex items-center justify-between">
              <span>{t("documentWorkbench", lang)}</span>
              <span className="text-xs text-muted-foreground">{filteredFiles.length} 份</span>
            </div>
            <div className="flex-1 p-2 overflow-y-auto min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">加载中...</div>
              ) : (
                <EditableFileList
                  entries={filteredFiles}
                  selectedPath={selectedFile?.sourcePath ?? null}
                  onSelect={store.selectFile}
                />
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col min-h-0 bg-card">
            <div className="px-3 py-2 border-b bg-muted/50 text-sm font-medium flex justify-between items-center">
              <span className="truncate">{selectedFile ? selectedFile.title : "请选择一个文件"}</span>
              {selectedFile && (
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{t("saveHint", lang)}</span>
              )}
            </div>
            <div className="flex-1 p-3 overflow-y-auto min-h-0">
              {selectedFile ? (
                <MarkdownEditor
                  initialContent={selectedContent}
                  onSave={(c) => store.saveFile(selectedFile.relativePath, c)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <FileEdit className="w-10 h-10 opacity-20" />
                  <span className="text-sm">{t("noFiles", lang)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
