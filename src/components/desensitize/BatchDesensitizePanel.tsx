import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { batchMarkSensitive, formatPlaceholderType, type SensitiveMap } from '@/lib/desensitize';

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

interface BatchDesensitizePanelProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: SensitiveMap;
  onChange: (text: string, map: SensitiveMap) => void;
  onBack: () => void;
}

interface HistoryState {
  text: string;
  map: SensitiveMap;
}

export function BatchDesensitizePanel({
  originalText,
  desensitizedText,
  sensitiveMap,
  onChange,
  onBack,
}: BatchDesensitizePanelProps) {
  const [text, setText] = useState(desensitizedText);
  const [map, setMap] = useState<SensitiveMap>({ ...sensitiveMap });
  const [history, setHistory] = useState<HistoryState[]>([{ text: desensitizedText, map: { ...sensitiveMap } }]);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('NAME');
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const entries = useMemo(() => Object.entries(map), [map]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(map)) {
      const match = key.match(/__PII_(\w+)_\d{8}__/);
      if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => ({
      type,
      label: formatPlaceholderType(type),
      count,
    }));
  }, [map]);

  const applyChange = useCallback((newText: string, newMap: SensitiveMap) => {
    setText(newText);
    setMap(newMap);
    setHistory((prev) => [...prev, { text: newText, map: newMap }]);
    setPreviewText(null);
    onChange(newText, newMap);
  }, [onChange]);

  const handlePreview = useCallback(() => {
    if (!keyword.trim()) return;
    const result = batchMarkSensitive(text, map, [{ keyword, type }]);
    setPreviewText(result.text);
  }, [keyword, type, text, map]);

  const handleApply = useCallback(() => {
    if (!keyword.trim()) return;
    const result = batchMarkSensitive(text, map, [{ keyword, type }]);
    applyChange(result.text, result.map);
    setKeyword('');
  }, [keyword, type, text, map, applyChange]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      const last = next[next.length - 1];
      setText(last.text);
      setMap(last.map);
      setPreviewText(null);
      onChange(last.text, last.map);
      return next;
    });
  }, [onChange]);

  const handleRemoveEntry = useCallback((placeholder: string) => {
    const original = map[placeholder];
    if (original == null) return;
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newText = text.replace(new RegExp(escaped, 'g'), original);
    const newMap = { ...map };
    delete newMap[placeholder];
    applyChange(newText, newMap);
  }, [map, text, applyChange]);

  const displayText = previewText ?? text;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-medium text-foreground">脱敏词管理</div>
            <div className="text-xs text-muted-foreground">已标记 {entries.length} 处</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOriginal((v) => !v)}
            className="gap-1"
          >
            {showOriginal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showOriginal ? '隐藏原文' : '查看原文'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={history.length <= 1} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" />
            撤销
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {/* Stats */}
            {stats.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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

            {/* Preview */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">
                  {previewText != null ? '预览效果' : showOriginal ? '原始内容' : '当前脱敏文本'}
                </div>
                {previewText != null && (
                  <Badge variant="secondary" className="text-[10px]">预览中</Badge>
                )}
              </div>
              <pre className="max-h-48 overflow-y-auto rounded-md bg-card p-3 text-sm whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">
                {showOriginal ? originalText : displayText}
              </pre>
            </div>

            {/* Batch Add Form */}
            <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground">批量新增脱敏</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="输入需要脱敏的关键词"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="flex-1"
                />
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="flex h-10 w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat"
                >
                  {SENSITIVE_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handlePreview} disabled={!keyword.trim()}>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  预览
                </Button>
                <Button size="sm" onClick={handleApply} disabled={!keyword.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  应用
                </Button>
              </div>
            </div>

            {/* Existing Mark List */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">脱敏标记列表</div>
              {entries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-card/30 py-8 text-center text-sm text-muted-foreground">
                  暂无脱敏标记
                </div>
              ) : (
                <div className="space-y-1.5">
                  {entries.map(([placeholder, original]) => {
                    const typeMatch = placeholder.match(/__PII_(\w+)_\d+__/);
                    const t = typeMatch ? typeMatch[1] : 'UNKNOWN';
                    const label = formatPlaceholderType(t);
                    return (
                      <div
                        key={placeholder}
                        className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
                      >
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                          {label}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground font-mono truncate">{placeholder}</div>
                          <div className="text-xs text-destructive font-mono break-all">原始值: {original}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveEntry(placeholder)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
