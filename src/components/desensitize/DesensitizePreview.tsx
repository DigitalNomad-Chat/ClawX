import { useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesensitizeDiffViewer } from './DesensitizeDiffViewer';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizePreviewProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: SensitiveMap;
  onChange: (text: string, map: SensitiveMap) => void;
  onConfirm: () => void;
  onReset: () => void;
}

export function DesensitizePreview({
  originalText,
  desensitizedText,
  sensitiveMap,
  onChange,
  onConfirm,
  onReset,
}: DesensitizePreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const saveEdit = useCallback(() => {
    onChange(editText, sensitiveMap);
    setIsEditing(false);
  }, [editText, sensitiveMap, onChange]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText('');
  }, []);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      <DesensitizeDiffViewer
        originalText={originalText}
        desensitizedText={desensitizedText}
        sensitiveMap={sensitiveMap}
        onChange={onChange}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        editText={editText}
        setEditText={setEditText}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
      />
      <div className="flex items-center justify-between shrink-0 pt-2 border-t border-border/30">
        <Button variant="outline" size="sm" onClick={onReset}>
          <X className="h-3.5 w-3.5 mr-1" />
          重新上传
        </Button>
        <Button size="sm" onClick={onConfirm}>
          <Check className="h-3.5 w-3.5 mr-1" />
          填入输入框
        </Button>
      </div>
    </div>
  );
}
