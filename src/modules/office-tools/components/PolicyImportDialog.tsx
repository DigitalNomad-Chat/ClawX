/**
 * PolicyImportDialog — CSV import target selection dialog
 */
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { PolicyFamily } from '../types';

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

interface PolicyImportDialogProps {
  open: boolean;
  families: PolicyFamily[];
  onImport: (file: File, familyId: string) => Promise<ImportResult>;
  onClose: () => void;
}

export function PolicyImportDialog({
  open,
  families,
  onImport,
  onClose,
}: PolicyImportDialogProps) {
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedFamilyId('');
      setSelectedFile(null);
      setResult(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
  };

  const handleConfirm = async () => {
    if (!selectedFile || !selectedFamilyId || busy) return;
    setBusy(true);
    try {
      const res = await onImport(selectedFile, selectedFamilyId);
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className={cn('mx-4 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg')} tabIndex={-1}>
        <h2 id="import-dialog-title" className="text-lg font-semibold">导入 CSV</h2>
        <p className="mt-2 text-sm text-muted-foreground">选择目标家庭和 CSV 文件进行导入。若同一家庭下产品名+投保人+被保人重复，将覆盖更新。</p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="importFamily">目标家庭 *</Label>
            <Select
              id="importFamily"
              value={selectedFamilyId}
              onChange={(e) => {
                setSelectedFamilyId(e.target.value);
                setResult(null);
              }}
            >
              <option value="" disabled>请选择家庭</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="importFile">CSV 文件 *</Label>
            <input
              id="importFile"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            {selectedFile && (
              <p className="text-xs text-muted-foreground">已选择：{selectedFile.name}</p>
            )}
          </div>

          {result && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p>成功导入 {result.created} 条，更新 {result.updated} 条</p>
              {result.errors.length > 0 && (
                <p className="mt-1 text-xs text-destructive">{result.errors.join('; ')}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="outline" onClick={handleClose} disabled={busy}>
            {result ? '关闭' : '取消'}
          </Button>
          {!result && (
            <Button onClick={handleConfirm} disabled={!selectedFile || !selectedFamilyId || busy}>
              {busy ? '导入中…' : '导入'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
