/**
 * DesensitizeEditor — Review and manually adjust sensitive info masking
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Shield,
  Check,
  Trash2,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DesensitizeDiffViewer } from '@/components/desensitize/DesensitizeDiffViewer';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizeEditorProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: Record<string, string>;
  onConfirm: (map: Record<string, string>, text: string) => void;
  onCancel: () => void;
  onChange?: (text: string, map: Record<string, string>) => void;
}

const typeLabels: Record<string, string> = {
  ID_CARD: '身份证',
  HKID: '香港身份证',
  TAIWAN_ID: '台湾身份证',
  MACAU_ID: '澳门身份证',
  HOME_RETURN_PERMIT: '回乡证',
  TAIWAN_COMPATRIOT_PERMIT: '台胞证',
  PHONE: '手机号',
  PHONE_HK: '香港手机号',
  PHONE_TW: '台湾手机号',
  PHONE_MO: '澳门手机号',
  EMAIL: '邮箱',
  PASSPORT: '护照号',
  NAME: '姓名',
  BANK_CARD: '银行卡号',
  IBAN: 'IBAN',
  SWIFT: 'SWIFT',
  CREDIT_CARD: '信用卡号',
  POLICY_NUMBER: '保单号',
  FUND_ACCOUNT: '基金账号',
  STOCK_ACCOUNT: '证券账号',
  SOCIAL_SECURITY: '社保/公积金',
  ADDRESS: '地址',
};

export function DesensitizeEditor({
  originalText,
  desensitizedText,
  sensitiveMap,
  onConfirm,
  onCancel,
  onChange,
}: DesensitizeEditorProps) {
  const [map, setMap] = useState<Record<string, string>>({ ...sensitiveMap });
  const [text, setText] = useState(desensitizedText);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    setMap({ ...sensitiveMap });
    setText(desensitizedText);
  }, [sensitiveMap, desensitizedText]);

  const handleChange = useCallback((newText: string, newMap: SensitiveMap) => {
    setText(newText);
    setMap(newMap);
    onChange?.(newText, newMap);
  }, [onChange]);

  const toggleExpand = useCallback((placeholder: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(placeholder)) {
        next.delete(placeholder);
      } else {
        next.add(placeholder);
      }
      return next;
    });
  }, []);

  const handleRemove = useCallback((placeholder: string) => {
    const original = map[placeholder] || sensitiveMap[placeholder] || placeholder;
    const nextMap = { ...map };
    delete nextMap[placeholder];
    const nextText = text.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      original,
    );
    setMap(nextMap);
    setText(nextText);
    onChange?.(nextText, nextMap);
  }, [map, text, sensitiveMap, onChange]);

  const entries = Object.entries(map);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">脱敏确认</span>
            <span className="text-xs text-muted-foreground ml-2">
              已识别 {entries.length} 处敏感信息
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => { setEditText(text); setIsEditing(true); }}>
              <Pencil className="h-3.5 w-3.5" />
              编辑内容
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCancel}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            重新处理
          </Button>
          <Button size="sm" onClick={() => onConfirm(map, text)}>
            <Check className="h-3.5 w-3.5 mr-1.5" />
            确认并继续
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Preview */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2 h-[calc(100vh-360px)] min-h-[320px] flex flex-col">
            <div className="text-xs font-medium text-muted-foreground">脱敏预览</div>
            <DesensitizeDiffViewer
              originalText={originalText}
              desensitizedText={text}
              sensitiveMap={map}
              onChange={handleChange}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={() => {
                const usedPlaceholders = new Set<string>();
                const regex = /__PII_\w+_\d{8}__/g;
                let match: RegExpExecArray | null;
                while ((match = regex.exec(editText)) !== null) {
                  usedPlaceholders.add(match[0]);
                }
                const cleanedMap: Record<string, string> = {};
                for (const [placeholder, original] of Object.entries(map)) {
                  if (usedPlaceholders.has(placeholder)) {
                    cleanedMap[placeholder] = original;
                  }
                }
                handleChange(editText, cleanedMap);
                setIsEditing(false);
              }}
              onCancelEdit={() => {
                setEditText('');
                setIsEditing(false);
              }}
            />
          </div>

          {/* Sensitive Items List */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">敏感信息列表</div>
            {entries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-card/30 py-8 text-center text-sm text-muted-foreground">
                未识别到敏感信息
              </div>
            ) : (
              <div className="space-y-1.5">
                {entries.map(([placeholder, original]) => {
                  const typeMatch = placeholder.match(/__PII_(\w+)_\d+__/);
                  const type = typeMatch ? typeMatch[1] : 'UNKNOWN';
                  const label = typeLabels[type] || type;
                  const isExpanded = expandedItems.has(placeholder);
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
                        {isExpanded && (
                          <div className="mt-1 text-sm text-destructive font-mono break-all">
                            原始值: {original}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleExpand(placeholder)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(placeholder)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
