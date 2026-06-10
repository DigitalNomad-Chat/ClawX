/**
 * FamilyForm — Dialog form for creating / editing a family group
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FamilyFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function FamilyForm({ open, mode, initialName, onSubmit, onClose }: FamilyFormProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    setName(initialName || '');
  }, [initialName, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={cn('mx-4 w-full max-w-sm rounded-lg border bg-card shadow-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? '添加家庭' : '编辑家庭'}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="familyName">家庭名称 *</Label>
            <Input
              id="familyName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="如：张三家庭"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">
              {mode === 'create' ? '保存' : '更新'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
