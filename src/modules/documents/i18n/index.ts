const translations = {
  zh: {
    pageTitle: "文档中心",
    overview: "文档概览",
    mainDocuments: "Main 文档",
    files: "份",
    agentsFound: "已发现智能体",
    items: "个",
    availableViews: "可切换查看",
    description:
      "这里只保留 Main 文档，以及当前启用智能体最常用、最值得调整的那几份 Markdown。",
    noFiles: "当前没有发现可编辑的 Main 文档或智能体核心文档。",
    documentWorkbench: "文档工作台",
    saveHint: "保存后会直接写回源文件。",
  },
  en: {
    pageTitle: "Document Center",
    overview: "Document Overview",
    mainDocuments: "Main documents",
    files: "files",
    agentsFound: "Agents found",
    items: "items",
    availableViews: "Available views",
    description:
      "Keeps only Main documents plus the most useful Markdown files for each active agent.",
    noFiles: "No editable Main documents or core agent documents were found.",
    documentWorkbench: "Document Workbench",
    saveHint: "Edits write back to source files.",
  },
} as const;

export function t(
  key: keyof typeof translations.zh,
  lang: "zh" | "en"
): string {
  return translations[lang]?.[key] ?? translations.en[key];
}
