const translations = {
  zh: {
    pageTitle: "人设管理",
    description:
      "管理文档：根目录核心文档，以及当前智能体的 Markdown 文档。",
    noFiles: "当前没有发现可编辑的文档。",
    documentWorkbench: "文档列表",
    saveHint: "保存后写回原文件",
  },
  en: {
    pageTitle: "Persona Management",
    description:
      "Manage documents: root core documents and active agent Markdown files.",
    noFiles: "No editable documents were found.",
    documentWorkbench: "Documents",
    saveHint: "Edits write back to source files.",
  },
} as const;

export function t(
  key: keyof typeof translations.zh,
  lang: "zh" | "en",
): string {
  return translations[lang]?.[key] ?? translations.en[key];
}
