import { useEffect } from "react";
import { ModulePageLayout } from "../_shared/ModulePageLayout";
import { useMemoryStore } from "./store";
import { t } from "./i18n";
import { MarkdownEditor } from "../_shared/components/MarkdownEditor";
import { EditableFileList } from "../_shared/components/EditableFileList";
import { AgentFacetTabs } from "../_shared/components/AgentFacetTabs";
import { StatusCard } from "./components/StatusCard";
import { Brain } from "lucide-react";

export function MemoryPage() {
  const lang = "zh" as const;
  const store = useMemoryStore();
  const files = useMemoryStore((s) => s.files);
  const agents = useMemoryStore((s) => s.agents);
  const status = useMemoryStore((s) => s.status);
  const selectedFile = useMemoryStore((s) => s.selectedFile);
  const selectedContent = useMemoryStore((s) => s.selectedContent);
  const loading = useMemoryStore((s) => s.loading);
  const activeFacet = useMemoryStore((s) => s.activeFacet);
  const mainCount = files.filter((f) => f.facetKey === "main").length;

  useEffect(() => {
    store.loadFiles();
    store.loadAgents();
    store.loadStatus();
    const interval = setInterval(() => store.loadStatus(), 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ModulePageLayout>
      <div className="flex h-full flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3 shrink-0">
          <Brain className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t("pageTitle", lang)}</h1>
            <p className="text-sm text-muted-foreground">{t("description", lang)}</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Overview Card */}
          <div className="bg-card border rounded-xl p-4 shadow-sm">
            <h2 className="text-lg font-semibold">{t("overview", lang)}</h2>
            <div className="text-sm text-muted-foreground mt-1">
              Main {t("mainMemories", lang)} {mainCount} {t("files", lang)} · {t("agentsFound", lang)} {Math.max(0, agents.filter((a) => a.key !== "main").length)} {t("items", lang)}
            </div>
          </div>

          {/* Agent Tabs */}
          <AgentFacetTabs agents={agents} activeKey={activeFacet} onChange={store.setActiveFacet} />

          {/* Status Card */}
          <StatusCard summary={status} lang={lang} />

          {/* Split Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: "500px" }}>
            <div className="lg:col-span-1 border rounded-xl overflow-hidden bg-card shadow-sm">
              <div className="p-2 border-b bg-muted/50 text-sm font-medium">{t("memoryWorkbench", lang)}</div>
              <div className="p-2 h-[calc(500px-40px)]">
                {loading ? (
                  <div className="p-4 text-sm text-muted-foreground">加载中...</div>
                ) : (
                  <EditableFileList entries={files} selectedPath={selectedFile?.sourcePath ?? null} onSelect={store.selectFile} facetKey={activeFacet} />
                )}
              </div>
            </div>
            <div className="lg:col-span-2 border rounded-xl overflow-hidden bg-card shadow-sm flex flex-col">
              <div className="p-2 border-b bg-muted/50 text-sm font-medium flex justify-between items-center">
                <span>{selectedFile ? selectedFile.title : "请选择一个文件"}</span>
                {selectedFile && <span className="text-xs text-muted-foreground">{t("saveHint", lang)}</span>}
              </div>
              <div className="flex-1 p-2 overflow-auto">
                {selectedFile ? (
                  <MarkdownEditor initialContent={selectedContent} onSave={(c) => store.saveFile(selectedFile.relativePath, c)} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{t("noFiles", lang)}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
