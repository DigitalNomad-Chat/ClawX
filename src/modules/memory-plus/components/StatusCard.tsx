import { Brain, AlertTriangle, XCircle, CheckCircle, Info } from "lucide-react";
import type { MemoryStatusSummary, MemoryAgentStatus } from "../types";
import { t } from "../i18n";

interface StatusCardProps {
  summary: MemoryStatusSummary | null;
  lang: "zh" | "en";
}

function statusIcon(status: MemoryAgentStatus["status"]) {
  if (status === "ok") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  if (status === "blocked") return <XCircle className="w-4 h-4 text-red-500" />;
  return <Info className="w-4 h-4 text-blue-500" />;
}

function statusBadgeClass(status: MemoryAgentStatus["status"]) {
  if (status === "ok") return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
  if (status === "warn") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
  if (status === "blocked") return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
}

export function StatusCard({ summary, lang }: StatusCardProps) {
  if (!summary) {
    return (
      <div className="bg-card border rounded-lg p-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Brain className="w-5 h-5" />{t("memoryStatus", lang)}</h2>
        <div className="text-sm text-muted-foreground mt-2">正在读取记忆状态...</div>
      </div>
    );
  }

  const headline = summary.status === "blocked" ? t("statusBlocked", lang)
    : summary.status === "warn" ? t("statusWarn", lang)
    : t("statusOk", lang);

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Brain className="w-5 h-5" />{t("memoryStatus", lang)}</h2>
          <div className="text-sm text-muted-foreground mt-1">{headline}</div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeClass(summary.status)}`}>
          {summary.status === "ok" ? t("healthy", lang) : summary.status === "warn" ? t("needsAttention", lang) : summary.status === "blocked" ? t("unavailable", lang) : "Loading"}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-secondary/50 rounded p-2 text-center"><div className="text-lg font-bold text-green-600">{summary.okCount}</div><div className="text-xs text-muted-foreground">{t("healthy", lang)}</div></div>
        <div className="bg-secondary/50 rounded p-2 text-center"><div className="text-lg font-bold text-yellow-600">{summary.warnCount}</div><div className="text-xs text-muted-foreground">{t("needsAttention", lang)}</div></div>
        <div className="bg-secondary/50 rounded p-2 text-center"><div className="text-lg font-bold text-red-600">{summary.blockedCount}</div><div className="text-xs text-muted-foreground">{t("unavailable", lang)}</div></div>
      </div>
      <div className="mt-3 space-y-2">
        {summary.agents.map((agent) => (
          <div key={agent.agentId} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
            <div className="flex items-center gap-2">
              {statusIcon(agent.status)}
              <div>
                <div className="text-sm font-medium">{agent.agentId}</div>
                <div className="text-xs text-muted-foreground">
                  {agent.files} {t("fileCount", lang)} · {agent.chunks} {t("chunkCount", lang)} · {agent.searchable ? t("searchable", lang) : t("searchNotReady", lang)}
                  {agent.issuesCount > 0 ? ` · ${agent.issuesCount} ${t("issues", lang)}` : agent.dirty ? ` · ${t("refreshPending", lang)}` : ""}
                  {agent.lastUpdateAt ? ` · ${new Date(agent.lastUpdateAt).toLocaleString()}` : ""}
                </div>
              </div>
            </div>
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(agent.status)}`}>
              {agent.searchable ? t("ready", lang) : t("check", lang)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
