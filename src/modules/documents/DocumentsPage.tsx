import { useEffect } from "react";
import { ModulePageLayout } from "../_shared/ModulePageLayout";
import { useDocumentStore } from "./store";
import { t } from "./i18n";
import { MarkdownEditor } from "../_shared/components/MarkdownEditor";
import { EditableFileList } from "../_shared/components/EditableFileList";
import { AgentFacetTabs } from "../_shared/components/AgentFacetTabs";

export function DocumentsPage() {
  const lang = "zh" as const;
  const store = useDocumentStore();
  const files = useDocumentStore((s) => s.files);
  const agents = useDocumentStore((s) => s.agents);
  const selectedFile = useDocumentStore((s) => s.selectedFile);
  const selectedContent = useDocumentStore((s) => s.selectedContent);
  const loading = useDocumentStore((s) => s.loading);
  const activeFacet = useDocumentStore((s) => s.activeFacet);
  const mainCount = files.filter((f) => f.facetKey === "main").length;

  useEffect(() => {
    store.loadFiles();
    store.loadAgents();
  }, []);

  return (
    <ModulePageLayout title={t("pageTitle", lang)}>
      <div className="space-y-4">
        {/* Overview Card */}
        <div className="bg-card border rounded-lg p-4">
          <h2 className="text-lg font-semibold">{t("overview", lang)}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            {t("mainDocuments", lang)} {mainCount} {t("files", lang)} ·{" "}
            {t("agentsFound", lang)}{" "}
            {Math.max(0, agents.filter((a) => a.key !== "main").length)}{" "}
            {t("items", lang)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {t("description", lang)}
          </div>
        </div>

        {/* Agent Tabs */}
        <AgentFacetTabs
          agents={agents}
          activeKey={activeFacet}
          onChange={store.setActiveFacet}
        />

        {/* Split Layout */}
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          style={{ minHeight: "500px" }}
        >
          <div className="lg:col-span-1 border rounded-lg overflow-hidden bg-card">
            <div className="p-2 border-b bg-muted/50 text-sm font-medium">
              {t("documentWorkbench", lang)}
            </div>
            <div className="p-2 h-[calc(500px-40px)]">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">加载中...</div>
              ) : (
                <EditableFileList
                  entries={files}
                  selectedPath={selectedFile?.sourcePath ?? null}
                  onSelect={store.selectFile}
                  facetKey={activeFacet}
                />
              )}
            </div>
          </div>
          <div className="lg:col-span-2 border rounded-lg overflow-hidden bg-card flex flex-col">
            <div className="p-2 border-b bg-muted/50 text-sm font-medium flex justify-between items-center">
              <span>{selectedFile ? selectedFile.title : "请选择一个文件"}</span>
              {selectedFile && (
                <span className="text-xs text-muted-foreground">
                  {t("saveHint", lang)}
                </span>
              )}
            </div>
            <div className="flex-1 p-2 overflow-auto">
              {selectedFile ? (
                <MarkdownEditor
                  initialContent={selectedContent}
                  onSave={(c) => store.saveFile(selectedFile.relativePath, c)}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  {t("noFiles", lang)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
