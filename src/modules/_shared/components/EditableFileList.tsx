import { useState, useMemo } from "react";
import { FileText, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

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

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜索文件..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="flex-1 overflow-auto border rounded-md">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">没有找到文件</div>
        ) : (
          <div className="divide-y">
            {filtered.map((entry) => (
              <button
                key={entry.sourcePath}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${selectedPath === entry.sourcePath ? "bg-accent" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{entry.title}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.excerpt}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="bg-secondary px-1.5 py-0.5 rounded">{entry.category}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.updatedAt).toLocaleString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
