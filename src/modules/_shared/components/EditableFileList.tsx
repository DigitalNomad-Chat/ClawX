import { useState, useMemo } from "react";
import { FileText, Search, FileX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FileEntry {
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

interface EditableFileListProps {
  entries: FileEntry[];
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
  facetKey?: string;
}

export function EditableFileList({ entries, selectedPath, onSelect, facetKey }: EditableFileListProps) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = entries;
    if (facetKey && facetKey !== "all") list = list.filter((e) => e.facetKey === facetKey);
    if (!needle) return list;
    return list.filter(
      (e) =>
        e.title.toLowerCase().includes(needle) ||
        e.excerpt.toLowerCase().includes(needle) ||
        e.category.toLowerCase().includes(needle),
    );
  }, [entries, search, facetKey]);

  const grouped = useMemo(() => {
    const groups: Record<string, FileEntry[]> = {};
    for (const entry of filtered) {
      const cat = entry.category || "其他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    }
    return groups;
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <FileX className="w-8 h-8 opacity-40" />
        <span className="text-sm">{search.trim() ? "无匹配结果" : "暂无文件"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索..."
          className="pl-7 h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-auto -mx-1 px-1">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-2">
            <div className="px-1 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {category}
            </div>
            <div className="space-y-0.5">
              {items.map((entry) => {
                const isSelected = selectedPath === entry.sourcePath;
                return (
                  <button
                    key={entry.sourcePath}
                    onClick={() => onSelect(entry)}
                    title={entry.title}
                    className={cn(
                      "w-full text-left px-2 py-1.5 flex items-center gap-2 rounded-md transition-all relative group",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary rounded-r-full" />
                    )}
                    <FileText className={cn(
                      "w-3.5 h-3.5 shrink-0",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className="text-xs truncate">{entry.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
