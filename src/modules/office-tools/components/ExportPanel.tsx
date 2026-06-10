/**
 * ExportPanel — Multi-format export panel for document processing results
 */
import { useState, useRef, useEffect } from 'react';
import { Download, Check, FileText, FileCode, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExportFormat } from '../utils/export';

interface ExportPanelProps {
  onExport: (format: ExportFormat) => void;
}

const formats: { id: ExportFormat; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'txt', label: '纯文本', icon: <FileText className="h-4 w-4" />, desc: '.txt' },
  { id: 'markdown', label: 'Markdown', icon: <FileCode className="h-4 w-4" />, desc: '.md' },
  { id: 'json', label: 'JSON', icon: <FileJson className="h-4 w-4" />, desc: '.json' },
];

export function ExportPanel({ onExport }: ExportPanelProps) {
  const [open, setOpen] = useState(false);
  const [exported, setExported] = useState<ExportFormat | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (format: ExportFormat) => {
    onExport(format);
    setExported(format);
    setTimeout(() => {
      setExported(null);
      setOpen(false);
    }, 1500);
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(!open)}
      >
        {exported ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {exported ? '已导出' : '下载'}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-48 rounded-lg border border-border/60 bg-popover shadow-lg overflow-hidden">
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleSelect(f.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {f.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              {exported === f.id && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
