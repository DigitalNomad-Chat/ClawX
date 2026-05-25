import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPlaceholderType, markSensitive } from '@/lib/desensitize';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizePreviewProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: SensitiveMap;
  onChange: (text: string, map: SensitiveMap) => void;
  onConfirm: () => void;
  onReset: () => void;
}

const SENSITIVE_TYPES = [
  { value: 'NAME', label: '姓名' },
  { value: 'PHONE', label: '手机号' },
  { value: 'ID_CARD', label: '身份证' },
  { value: 'HKID', label: '香港身份证' },
  { value: 'TAIWAN_ID', label: '台湾身份证' },
  { value: 'MACAU_ID', label: '澳门身份证' },
  { value: 'HOME_RETURN_PERMIT', label: '回乡证/台胞证' },
  { value: 'PASSPORT', label: '护照号' },
  { value: 'EMAIL', label: '邮箱' },
  { value: 'BANK_CARD', label: '银行卡号' },
  { value: 'CREDIT_CARD', label: '信用卡号' },
  { value: 'IBAN', label: 'IBAN' },
  { value: 'SWIFT', label: 'SWIFT' },
  { value: 'POLICY_NUMBER', label: '保单号' },
  { value: 'FUND_ACCOUNT', label: '基金账号' },
  { value: 'STOCK_ACCOUNT', label: '证券账号' },
  { value: 'SOCIAL_SECURITY', label: '社保/公积金' },
  { value: 'ADDRESS', label: '地址' },
];

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

  const readonlyContentRef = useRef<HTMLDivElement>(null);

  const [menu, setMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });

  const [isMarking, setIsMarking] = useState<string | null>(null);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(sensitiveMap)) {
      const match = key.match(/__PII_(\w+)_\d{8}__/);
      if (match) {
        const type = match[1];
        counts[type] = (counts[type] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([type, count]) => ({
      type,
      label: formatPlaceholderType(type),
      count,
    }));
  }, [sensitiveMap]);

  const highlightedParts = useMemo(() => {
    const parts: Array<{ text: string; isPlaceholder: boolean }> = [];
    const regex = /__PII_\w+_\d{8}__/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(desensitizedText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: desensitizedText.slice(lastIndex, match.index), isPlaceholder: false });
      }
      parts.push({ text: match[0], isPlaceholder: true });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < desensitizedText.length) {
      parts.push({ text: desensitizedText.slice(lastIndex), isPlaceholder: false });
    }

    return parts;
  }, [desensitizedText]);

  const hideMenu = useCallback(() => {
    setMenu({ visible: false, x: 0, y: 0, text: '' });
  }, []);

  const handleTextSelect = useCallback(
    (_e: React.MouseEvent) => {
      if (isEditing) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        hideMenu();
        return;
      }

      const selectedText = sel.toString().trim();

      if (
        readonlyContentRef.current &&
        !readonlyContentRef.current.contains(sel.anchorNode as Node)
      ) {
        hideMenu();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setMenu({
        visible: true,
        x: rect.left,
        y: rect.top - 8,
        text: selectedText,
      });
    },
    [isEditing, hideMenu],
  );

  const handleMark = useCallback(
    async (type: string) => {
      if (!menu.text) return;
      setIsMarking(type);
      try {
        const result = markSensitive(desensitizedText, sensitiveMap, menu.text, type);
        onChange(result.text, result.map);
        hideMenu();
        window.getSelection()?.removeAllRanges();
      } finally {
        setIsMarking(null);
      }
    },
    [menu.text, desensitizedText, sensitiveMap, onChange, hideMenu],
  );

  // Global click to close menu
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menu.visible) {
        const target = e.target as HTMLElement;
        if (!target.closest('.desensitize-float-menu')) {
          hideMenu();
        }
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menu.visible, hideMenu]);

  const enterEditMode = useCallback(() => {
    setEditText(desensitizedText);
    setIsEditing(true);
    hideMenu();
    window.getSelection()?.removeAllRanges();
  }, [desensitizedText, hideMenu]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText('');
  }, []);

  const saveEdit = useCallback(() => {
    onChange(editText, sensitiveMap);
    setIsEditing(false);
  }, [editText, sensitiveMap, onChange]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      {/* Stats */}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {stats.map(({ type, label, count }) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-2xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
            >
              {label}: {count}处
            </span>
          ))}
        </div>
      )}

      {/* Two-column view */}
      <div className="flex flex-row gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Original */}
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5 shrink-0 flex items-center justify-between">
            <span>原始内容</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">未脱敏</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {originalText}
          </div>
        </div>

        {/* Desensitized */}
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>脱敏后</span>
              {isEditing ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">编辑中</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">已脱敏</span>
              )}
            </div>
            {!isEditing && (
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={enterEditMode}>
                <Pencil className="h-3 w-3" />
                编辑内容
              </Button>
            )}
          </div>

          {isEditing ? (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <textarea
                className="flex-1 min-h-0 resize-none rounded-xl border border-border/60 bg-background p-3 text-sm leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  取消
                </Button>
                <Button size="sm" onClick={saveEdit}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <div
              ref={readonlyContentRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono cursor-text select-text"
              onMouseUp={handleTextSelect}
            >
              {highlightedParts.length > 0 ? (
                highlightedParts.map((part, idx) =>
                  part.isPlaceholder ? (
                    <span
                      key={idx}
                      className="rounded bg-red-100 px-1 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      title={sensitiveMap[part.text]}
                    >
                      {part.text}
                    </span>
                  ) : (
                    <span key={idx}>{part.text}</span>
                  ),
                )
              ) : (
                <span className="text-muted-foreground">暂无脱敏内容</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
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

      {/* Selection float menu */}
      {menu.visible && (
        <div
          className="desensitize-float-menu fixed z-50 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-border p-2 flex flex-col gap-1.5"
          style={{ top: menu.y, left: menu.x }}
        >
          <span className="text-[10px] text-muted-foreground font-medium select-none px-1">
            标记为敏感信息
          </span>
          <div className="flex flex-wrap gap-1 max-w-[320px]">
            {SENSITIVE_TYPES.map((opt) => (
              <Button
                key={opt.value}
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 py-0"
                disabled={isMarking === opt.value}
                onClick={() => void handleMark(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
