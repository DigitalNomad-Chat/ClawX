const translations = {
  zh: {
    pageTitle: "记忆管理",
    description:
      "管理记忆相关文件：根目录 MEMORY.md、memory/，以及各智能体的 MEMORY.md 与 memory/。",
    noFiles: "当前没有可编辑的记忆文件。",
    memoryWorkbench: "记忆文件",
    saveHint: "保存后写回原文件",
  },
  en: {
    pageTitle: "Memory Management",
    description:
      "Manage memory files: root MEMORY.md, memory/, and each agent's MEMORY.md and memory/.",
    noFiles: "No editable memory files right now.",
    memoryWorkbench: "Memory Files",
    saveHint: "Saving writes back to source files.",
  },
} as const;

export function t(
  key: keyof typeof translations.zh,
  lang: "zh" | "en",
): string {
  return translations[lang]?.[key] ?? translations.en[key];
}
