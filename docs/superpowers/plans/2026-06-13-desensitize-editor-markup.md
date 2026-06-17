# 脱敏工具编辑模式与划词标记完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善 ClawX 脱敏工具的编辑模式与划词标记体验，修复标记替换不精确、编辑后 `sensitiveMap` 不同步、菜单边界遮挡等问题，并将相同能力扩展到文档解析流程的脱敏确认页。

**Architecture:** 纯文本级别的敏感信息处理。保留现有的 `__PII_TYPE_NNNNNNNN__` 占位符体系；新增 `DesensitizeDiffViewer` 公共组件承载双栏对比、编辑模式、划词标记；增强 `markSensitive` 防止误标记已有占位符；编辑保存时根据最终文本清理 `sensitiveMap`；新增单元测试覆盖核心函数。

**Tech Stack:** React + TypeScript + Tailwind CSS + shadcn/ui (frontend), Node.js 原生 HTTP 路由 (backend), Vitest (testing)

---

## File Structure

| 文件 | 职责 | 操作 |
|---|---|---|
| `src/components/desensitize/DesensitizeDiffViewer.tsx` | 公共双栏脱敏对比组件：统计标签、原文/脱敏双栏、编辑模式、划词标记菜单 | 创建 |
| `src/components/desensitize/DesensitizePreview.tsx` | Sheet 内的脱敏预览容器，复用 DiffViewer，保留底部操作按钮 | 修改 |
| `src/modules/office-tools/components/DesensitizeEditor.tsx` | 文档解析流程的脱敏确认页，复用 DiffViewer 替换旧预览，保留敏感信息列表 | 修改 |
| `src/lib/desensitize.ts` | 前端共享工具函数，增强 `markSensitive` | 修改 |
| `electron/api/services/desensitize.ts` | 后端脱敏服务，同步增强 `markSensitive` | 修改 |
| `tests/unit/desensitize.test.ts` | 脱敏核心逻辑单元测试，新增 `markSensitive` 用例 | 修改 |

---

## Task 1: 提取 DesensitizeDiffViewer 公共组件

**Files:**
- Create: `src/components/desensitize/DesensitizeDiffViewer.tsx`

**说明:** 将当前 `DesensitizePreview.tsx` 中负责双栏展示、编辑模式、划词标记的逻辑抽离为独立公共组件，去掉底部操作按钮，使其可被 `DesensitizePreview` 和 `DesensitizeEditor` 同时复用。

- [ ] **Step 1: 创建 `DesensitizeDiffViewer.tsx`**

```tsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPlaceholderType, markSensitive, hasPlaceholders, type SensitiveMap } from '@/lib/desensitize';

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

interface DesensitizeDiffViewerProps {
  originalText: string;
  desensitizedText: string;
  sensitiveMap: SensitiveMap;
  onChange: (text: string, map: SensitiveMap) => void;
  className?: string;
}

export function DesensitizeDiffViewer({
  originalText,
  desensitizedText,
  sensitiveMap,
  onChange,
  className,
}: DesensitizeDiffViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const readonlyContentRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ visible: boolean; x: number; y: number; text: string }>({
    visible: false,
    x: 0,
    y: 0,
    text: '',
  });
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

      if (hasPlaceholders(selectedText)) {
        hideMenu();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 320;
      const menuHeight = 120;

      let x = rect.left;
      let y = rect.top - 8;

      if (x + menuWidth > viewportWidth) {
        x = Math.max(8, viewportWidth - menuWidth - 8);
      }
      if (y < menuHeight) {
        y = rect.bottom + 8;
      }
      if (y + menuHeight > viewportHeight) {
        y = Math.max(8, viewportHeight - menuHeight - 8);
      }

      setMenu({
        visible: true,
        x,
        y,
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
    const usedPlaceholders = new Set<string>();
    const regex = /__PII_\w+_\d{8}__/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(editText)) !== null) {
      usedPlaceholders.add(match[0]);
    }

    const cleanedMap: SensitiveMap = {};
    for (const [placeholder, original] of Object.entries(sensitiveMap)) {
      if (usedPlaceholders.has(placeholder)) {
        cleanedMap[placeholder] = original;
      }
    }

    onChange(editText, cleanedMap);
    setIsEditing(false);
  }, [editText, sensitiveMap, onChange]);

  return (
    <div className={cn('flex flex-col gap-3 flex-1 min-h-0 overflow-hidden', className)}>
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

      <div className="flex flex-row gap-3 flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="text-2xs font-medium text-muted-foreground mb-1.5 shrink-0 flex items-center justify-between">
            <span>原始内容</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">未脱敏</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {originalText}
          </div>
        </div>

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
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误（可能有项目既有错误，需确认与本次改动无关）

- [ ] **Step 3: Commit**

```bash
git add src/components/desensitize/DesensitizeDiffViewer.tsx
git commit -m "refactor(desensitize): extract DesensitizeDiffViewer shared component"
```

---

## Task 2: 增强 markSensitive 安全性

**Files:**
- Modify: `src/lib/desensitize.ts`
- Modify: `electron/api/services/desensitize.ts`

**说明:** 当前 `markSensitive` 默认只替换第一个匹配项，且未阻止用户选中已包含占位符的文本进行标记。增强后增加 `replaceAll` 选项，并保护已有占位符不被再次标记；前后端实现保持同步。

- [ ] **Step 1: 修改 `src/lib/desensitize.ts` 中的 `markSensitive`**

将原函数替换为：

```typescript
export function markSensitive(
  text: string,
  existingMap: SensitiveMap,
  selection: string,
  type: string,
  options: { replaceAll?: boolean } = {},
): { text: string; map: SensitiveMap } {
  const trimmed = selection.trim();
  if (!trimmed) return { text, map: existingMap };

  // 防止用户选中已包含占位符的文本再次标记
  if (hasPlaceholders(trimmed)) {
    return { text, map: existingMap };
  }

  const existingCounters = Object.keys(existingMap)
    .map((k) => {
      const m = k.match(/__PII_\w+_(\d+)__/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;

  const placeholder = `__PII_${type}_${String(nextCounter).padStart(8, '0')}__`;

  if (options.replaceAll) {
    if (!text.includes(trimmed)) return { text, map: existingMap };
    const newText = text.split(trimmed).join(placeholder);
    const newMap = { ...existingMap, [placeholder]: trimmed };
    return { text: newText, map: newMap };
  }

  const idx = text.indexOf(trimmed);
  if (idx === -1) return { text, map: existingMap };

  const newText = text.slice(0, idx) + placeholder + text.slice(idx + trimmed.length);
  const newMap = { ...existingMap, [placeholder]: trimmed };
  return { text: newText, map: newMap };
}
```

- [ ] **Step 2: 同步修改后端 `electron/api/services/desensitize.ts` 中的 `markSensitive`**

将原函数替换为：

```typescript
export function markSensitive(
  text: string,
  existingMap: SensitiveMap,
  selection: string,
  type: string,
  options: { replaceAll?: boolean } = {},
): { text: string; map: SensitiveMap } {
  const trimmed = selection.trim();
  if (!trimmed) return { text, map: existingMap };

  // 防止用户选中已包含占位符的文本再次标记
  if (/__PII_\w+_\d{8}__/.test(trimmed)) {
    return { text, map: existingMap };
  }

  const existingCounters = Object.keys(existingMap)
    .map((k) => {
      const m = k.match(/__PII_\w+_(\d+)__/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;

  const placeholder = `__PII_${type}_${String(nextCounter).padStart(8, '0')}__`;

  if (options.replaceAll) {
    if (!text.includes(trimmed)) return { text, map: existingMap };
    const newText = text.split(trimmed).join(placeholder);
    const newMap = { ...existingMap, [placeholder]: trimmed };
    return { text: newText, map: newMap };
  }

  const newText = text.replace(trimmed, placeholder);
  const newMap = { ...existingMap, [placeholder]: trimmed };
  return { text: newText, map: newMap };
}
```

- [ ] **Step 3: 运行单元测试**

Run: `pnpm test tests/unit/desensitize.test.ts`
Expected: 现有用例全部通过

- [ ] **Step 4: Commit**

```bash
git add src/lib/desensitize.ts electron/api/services/desensitize.ts
git commit -m "feat(desensitize): harden markSensitive against placeholders and add replaceAll option"
```

---

## Task 3: 重构 DesensitizePreview 使用公共 DiffViewer

**Files:**
- Modify: `src/components/desensitize/DesensitizePreview.tsx`

**说明:** 让 `DesensitizePreview` 复用新的 `DesensitizeDiffViewer`，只保留 Sheet 场景下的底部操作按钮，保持原有 props 不变，外部调用方无感。

- [ ] **Step 1: 重写 `DesensitizePreview.tsx`**

```tsx
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
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      <DesensitizeDiffViewer
        originalText={originalText}
        desensitizedText={desensitizedText}
        sensitiveMap={sensitiveMap}
        onChange={onChange}
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
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/desensitize/DesensitizePreview.tsx
git commit -m "refactor(desensitize): reuse DesensitizeDiffViewer in DesensitizePreview"
```

---

## Task 4: 文档解析流程 DesensitizeEditor 支持编辑与划词

**Files:**
- Modify: `src/modules/office-tools/components/DesensitizeEditor.tsx`

**说明:** 文档解析流程的脱敏确认页当前仅支持列表查看和删除单条，无法整体编辑内容，也无法划词标记。通过引入 `DesensitizeDiffViewer` 替换旧的只读预览，并增加 `onChange` 回调让父组件同步状态。

- [ ] **Step 1: 重写 `DesensitizeEditor.tsx`**

```tsx
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
```

- [ ] **Step 2: 确认 `DocumentParser.tsx` 无需修改**

`DocumentParser.tsx` 调用 `<DesensitizeEditor onConfirm={handleConfirmDesensitize} onCancel={reset} />`，新组件的 `onConfirm` 签名仍为 `(map, text)`，因此父组件无需改动。新增的 `onChange` 是可选的，不传递也不影响现有行为。

- [ ] **Step 3: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 4: Commit**

```bash
git add src/modules/office-tools/components/DesensitizeEditor.tsx
git commit -m "feat(desensitize): add edit mode and text-selection markup to DesensitizeEditor"
```

---

## Task 5: 补充单元测试

**Files:**
- Modify: `tests/unit/desensitize.test.ts`

**说明:** 为 `markSensitive` 和 `hasPlaceholders` 增加测试，覆盖默认只替换第一个、全部替换、保护已有占位符、计数器递增等场景。

- [ ] **Step 1: 在测试文件中新增 `markSensitive` 用例**

在 `tests/unit/desensitize.test.ts` 顶部新增导入：

```typescript
import { describe, it, expect } from 'vitest';
import { desensitize, restore, markSensitive, hasPlaceholders } from '../../electron/api/services/desensitize';
```

在文件末尾新增：

```typescript
describe('markSensitive', () => {
  it('replaces first occurrence by default', () => {
    const result = markSensitive('张三 和李四，张三', {}, '张三', 'NAME');
    expect(result.text).toBe('__PII_NAME_00000001__ 和李四，张三');
    expect(result.map['__PII_NAME_00000001__']).toBe('张三');
  });

  it('can replace all occurrences', () => {
    const result = markSensitive('张三 和李四，张三', {}, '张三', 'NAME', { replaceAll: true });
    expect(result.text).toBe('__PII_NAME_00000001__ 和李四，__PII_NAME_00000001__');
    expect(result.map['__PII_NAME_00000001__']).toBe('张三');
  });

  it('does nothing when selection is empty', () => {
    const result = markSensitive('text', {}, '   ', 'NAME');
    expect(result.text).toBe('text');
    expect(Object.keys(result.map)).toHaveLength(0);
  });

  it('does nothing when selection contains a placeholder', () => {
    const map = { '__PII_NAME_00000001__': '张三' };
    const result = markSensitive('__PII_NAME_00000001__', map, '__PII_NAME_00000001__', 'NAME');
    expect(result.text).toBe('__PII_NAME_00000001__');
    expect(Object.keys(result.map)).toHaveLength(1);
  });

  it('increments counter based on existing map', () => {
    const existing = { '__PII_PHONE_00000005__': '13800138000' };
    const result = markSensitive('text', existing, 'text', 'NAME');
    expect(result.text).toBe('__PII_NAME_00000006__');
  });
});

describe('hasPlaceholders', () => {
  it('returns true when text contains placeholder', () => {
    expect(hasPlaceholders('请联系 __PII_PHONE_00000001__')).toBe(true);
  });

  it('returns false when text does not contain placeholder', () => {
    expect(hasPlaceholders('请联系 13800138000')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行单元测试**

Run: `pnpm test tests/unit/desensitize.test.ts`
Expected: 全部通过

- [ ] **Step 3: Commit**

```bash
git add tests/unit/desensitize.test.ts
git commit -m "test(desensitize): cover markSensitive and hasPlaceholders"
```

---

## Task 6: 类型检查、Lint 与回归验证

**Files:**
- 无新增文件

**说明:** 在所有改动完成后，统一执行类型检查、代码规范检查和单元测试，确保没有引入回归。

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误（若项目本身存在历史错误，需确认与本次改动无关）

- [ ] **Step 2: 代码规范检查**

Run: `pnpm lint:check`
Expected: 无新增 lint 错误

- [ ] **Step 3: 单元测试全量运行**

Run: `pnpm test`
Expected: 全部通过

- [ ] **Step 4: Commit（如 lint 自动修复产生变更）**

```bash
git add -A
git commit -m "chore(desensitize): lint and typecheck fixes"
```

---

## Self-Review

### 1. Spec coverage

| 需求 | 对应 Task |
|---|---|
| 编辑模式可修改脱敏后文本并保存 | Task 1 (`DesensitizeDiffViewer` 编辑模式), Task 4 (`DesensitizeEditor` 接入) |
| 划词标记敏感信息 | Task 1 (`DesensitizeDiffViewer` 划词菜单), Task 4 (`DesensitizeEditor` 接入) |
| 编辑后 sensitiveMap 同步清理 | Task 1 (`saveEdit` 清理逻辑) |
| 划词菜单边界检测，避免遮挡 | Task 1 (`handleTextSelect` 边界计算) |
| 防止误标记已有占位符 | Task 2 (`markSensitive` placeholder 保护) |
| 文档解析流程也具备编辑/划词能力 | Task 4 |
| 单元测试覆盖 | Task 5 |

### 2. Placeholder scan

- 无 `TBD` / `TODO` / `implement later`
- 无 "Add appropriate error handling" 等模糊描述
- 每处代码修改均给出完整代码
- 命令与预期输出明确

### 3. Type consistency

- `SensitiveMap` 类型在 `src/lib/desensitize.ts` 中定义，`DesensitizeDiffViewer`、`DesensitizePreview`、`DesensitizeEditor` 均通过 `@/lib/desensitize` 导入，类型一致。
- `DesensitizeEditorProps.onConfirm` 签名保持 `(map: Record<string, string>, text: string) => void`，与 `DocumentParser.tsx` 中 `handleConfirmDesensitize` 兼容。
- 后端 `markSensitive` 新增可选 `options` 参数，不影响 `/api/desensitize/mark` 路由调用。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-desensitize-editor-markup.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
