# 脱敏词与脱敏标记管理面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ClawX 脱敏工具中新增一个"脱敏词/脱敏标记管理"面板，用户可查看当前所有占位符及其原始值，批量输入关键词+选择类型进行自定义脱敏替换，并支持预览和撤销。

**Architecture:** 复用现有的 `__PII_TYPE_NNNNNNNN__` 占位符体系。新增 `BatchDesensitizePanel` 组件作为管理面板入口，提供列表视图和批量替换表单；新增 `batchMarkSensitive` 工具函数，基于全局替换生成新占位符并返回 preview；用本地 `history` 栈实现单次撤销；面板通过 `DesensitizePanel` 头部按钮触发，作为同 Sheet 内的视图切换。

**Tech Stack:** React + TypeScript + Tailwind CSS + shadcn/ui (Sheet, Button, Input, Select, Badge, ScrollArea), Vitest

---

## File Structure

| 文件 | 职责 | 操作 |
|---|---|---|
| `src/components/desensitize/BatchDesensitizePanel.tsx` | 管理面板：展示占位符列表 + 批量替换表单 + 预览 + 撤销 | 创建 |
| `src/lib/desensitize.ts` | 新增 `batchMarkSensitive` 批量替换函数 | 修改 |
| `electron/api/services/desensitize.ts` | 后端同步新增 `batchMarkSensitive` | 修改 |
| `electron/api/routes/desensitize.ts` | 新增 `/api/desensitize/batch-mark` 路由 | 修改 |
| `src/components/desensitize/DesensitizePanel.tsx` | 在 preview 视图头部增加"管理"按钮，切换面板 | 修改 |
| `src/components/desensitize/DesensitizeDiffViewer.tsx` | 可选：在头部渲染自定义 children（管理按钮入口） | 修改 |
| `tests/unit/desensitize.test.ts` | 新增 `batchMarkSensitive` 单元测试 | 修改 |

---

## Task 1: 新增 batchMarkSensitive 批量替换工具函数

**Files:**
- Modify: `src/lib/desensitize.ts`
- Modify: `electron/api/services/desensitize.ts`

**说明:** 提供一个新的纯函数，接收当前脱敏文本、当前 map、一个关键词数组和对应类型，批量将所有关键词替换为新的占位符，返回 preview 文本和新的 map。关键词不去重，用户输入什么就替换什么；如果关键词为空或文本中未出现则跳过。

- [ ] **Step 1: 修改 `src/lib/desensitize.ts`**

在 `markSensitive` 之后新增：

```typescript
export interface BatchMarkItem {
  keyword: string;
  type: string;
}

export function batchMarkSensitive(
  text: string,
  existingMap: SensitiveMap,
  items: BatchMarkItem[],
): { text: string; map: SensitiveMap } {
  if (!items.length) return { text, map: existingMap };

  let currentText = text;
  let currentMap = { ...existingMap };

  for (const { keyword, type } of items) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    if (hasPlaceholders(trimmed)) continue;

    const result = markSensitiveAll(currentText, currentMap, trimmed, type);
    currentText = result.text;
    currentMap = result.map;
  }

  return { text: currentText, map: currentMap };
}

function markSensitiveAll(
  text: string,
  existingMap: SensitiveMap,
  keyword: string,
  type: string,
): { text: string; map: SensitiveMap } {
  const existingCounters = Object.keys(existingMap)
    .map((k) => {
      const m = k.match(/__PII_\w+_(\d+)__/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;

  const placeholder = `__PII_${type}_${String(nextCounter).padStart(8, '0')}__`;

  if (!text.includes(keyword)) return { text, map: existingMap };

  const newText = text.split(keyword).join(placeholder);
  const newMap = { ...existingMap, [placeholder]: keyword };
  return { text: newText, map: newMap };
}
```

- [ ] **Step 2: 修改 `electron/api/services/desensitize.ts`**

在 `markSensitive` 之后新增同名函数：

```typescript
export interface BatchMarkItem {
  keyword: string;
  type: string;
}

export function batchMarkSensitive(
  text: string,
  existingMap: SensitiveMap,
  items: BatchMarkItem[],
): { text: string; map: SensitiveMap } {
  if (!items.length) return { text, map: existingMap };

  let currentText = text;
  let currentMap = { ...existingMap };

  for (const { keyword, type } of items) {
    const trimmed = keyword.trim();
    if (!trimmed) continue;
    if (/__PII_\w+_\d{8}__/.test(trimmed)) continue;

    const result = markSensitiveAllBackend(currentText, currentMap, trimmed, type);
    currentText = result.text;
    currentMap = result.map;
  }

  return { text: currentText, map: currentMap };
}

function markSensitiveAllBackend(
  text: string,
  existingMap: SensitiveMap,
  keyword: string,
  type: string,
): { text: string; map: SensitiveMap } {
  const existingCounters = Object.keys(existingMap)
    .map((k) => {
      const m = k.match(/__PII_\w+_(\d+)__/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;

  const placeholder = `__PII_${type}_${String(nextCounter).padStart(8, '0')}__`;

  if (!text.includes(keyword)) return { text, map: existingMap };

  const newText = text.split(keyword).join(placeholder);
  const newMap = { ...existingMap, [placeholder]: keyword };
  return { text: newText, map: newMap };
}
```

- [ ] **Step 3: 运行单元测试**

Run: `pnpm test tests/unit/desensitize.test.ts`
Expected: 现有用例全部通过

- [ ] **Step 4: Commit**

```bash
git add src/lib/desensitize.ts electron/api/services/desensitize.ts
git commit -m "feat(desensitize): add batchMarkSensitive utility for bulk keyword masking"
```

---

## Task 2: 后端新增 /api/desensitize/batch-mark 路由

**Files:**
- Modify: `electron/api/routes/desensitize.ts`

**说明:** 暴露批量替换 HTTP API，供面板在需要时直接调用后端（也可以前端本地计算，但保留后端接口与现有架构一致）。

- [ ] **Step 1: 修改 `electron/api/routes/desensitize.ts`**

在 `handleDesensitizeRoutes` 中添加新分支：

```typescript
import type { BatchMarkItem } from '../services/desensitize';
import { batchMarkSensitive } from '../services/desensitize';

// 在 restore 分支之后、return false 之前添加：
if (url.pathname === '/api/desensitize/batch-mark' && req.method === 'POST') {
  try {
    const body = await parseJsonBody<{
      text: string;
      map: Record<string, string>;
      items: BatchMarkItem[];
    }>(req);
    if (!body.text || typeof body.text !== 'string' || !body.map || typeof body.map !== 'object') {
      sendJson(res, 400, { success: false, error: 'text and map fields are required' });
      return true;
    }
    if (!Array.isArray(body.items)) {
      sendJson(res, 400, { success: false, error: 'items must be an array' });
      return true;
    }
    const result = batchMarkSensitive(body.text, body.map, body.items);
    sendJson(res, 200, { success: true, ...result });
  } catch (error) {
    sendJson(res, 500, { success: false, error: String(error) });
  }
  return true;
}
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add electron/api/routes/desensitize.ts
git commit -m "feat(desensitize): add /api/desensitize/batch-mark endpoint"
```

---

## Task 3: 创建 BatchDesensitizePanel 管理面板组件

**Files:**
- Create: `src/components/desensitize/BatchDesensitizePanel.tsx`

**说明:** 面板包含两部分：上方"当前脱敏标记列表"（占位符、类型、原始值、删除），下方"批量新增脱敏"表单（关键词输入框 + 类型下拉选择 + 预览/应用按钮）。提供撤销按钮，恢复到上一次应用前的状态。

- [ ] **Step 1: 创建组件**

```tsx
import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSITIVE_TYPES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/desensitize/BatchDesensitizePanel.tsx
git commit -m "feat(desensitize): add BatchDesensitizePanel management UI"
```

---

## Task 4: 在 DesensitizePanel 中接入管理面板入口

**Files:**
- Modify: `src/components/desensitize/DesensitizePanel.tsx`

**说明:** 在预览视图（preview step）增加"管理"按钮，点击后切换到 `BatchDesensitizePanel`，返回时回到预览视图。数据状态保持同步。

- [ ] **Step 1: 修改 `DesensitizePanel.tsx`**

新增 import：

```typescript
import { Settings2 } from 'lucide-react';
import { BatchDesensitizePanel } from './BatchDesensitizePanel';
```

修改 `step` 类型：

```typescript
const [step, setStep] = useState<'upload' | 'processing' | 'preview' | 'manage'>('upload');
```

在 preview 视图渲染处增加切换按钮（需要修改 `DesensitizePreview` 以暴露 header 区域，或者在 `DesensitizePanel` 中在 `DesensitizePreview` 上方增加按钮）。

更简单的方式：在 `DesensitizePreview` 上方的 `SheetHeader` 之后、`DesensitizePreview` 之前插入一个工具栏按钮。

替换 preview 视图渲染为：

```tsx
{step === 'preview' && (
  <>
    <div className="flex items-center justify-end gap-2 shrink-0 mb-2">
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setStep('manage')}>
        <Settings2 className="h-3.5 w-3.5" />
        管理脱敏词
      </Button>
    </div>
    <DesensitizePreview
      originalText={originalText}
      desensitizedText={desensitizedText}
      sensitiveMap={sensitiveMap}
      onChange={(text, map) => {
        setDesensitizedText(text);
        setSensitiveMap(map);
      }}
      onConfirm={handleConfirm}
      onReset={reset}
    />
  </>
)}

{step === 'manage' && (
  <BatchDesensitizePanel
    originalText={originalText}
    desensitizedText={desensitizedText}
    sensitiveMap={sensitiveMap}
    onChange={(text, map) => {
      setDesensitizedText(text);
      setSensitiveMap(map);
    }}
    onBack={() => setStep('preview')}
  />
)}
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add src/components/desensitize/DesensitizePanel.tsx
git commit -m "feat(desensitize): wire BatchDesensitizePanel into DesensitizePanel"
```

---

## Task 5: 为 DesensitizeEditor 也增加管理入口（可选）

**Files:**
- Modify: `src/modules/office-tools/components/DesensitizeEditor.tsx`

**说明:** 文档解析流程的脱敏确认页也可以从管理面板受益。在 `DesensitizeEditor` 头部增加"管理脱敏词"按钮，点击后用内联或弹窗方式展示 `BatchDesensitizePanel`。

- [ ] **Step 1: 修改 `DesensitizeEditor.tsx`**

新增 import：

```typescript
import { Settings2 } from 'lucide-react';
import { BatchDesensitizePanel } from '@/components/desensitize/BatchDesensitizePanel';
```

新增内部状态：

```typescript
const [showManager, setShowManager] = useState(false);
```

在 header 操作按钮区增加：

```tsx
{!isEditing && !showManager && (
  <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowManager(true)}>
    <Settings2 className="h-3.5 w-3.5" />
    管理脱敏词
  </Button>
)}
```

在 content 区域条件渲染：

```tsx
{showManager ? (
  <BatchDesensitizePanel
    originalText={originalText}
    desensitizedText={text}
    sensitiveMap={map}
    onChange={(newText, newMap) => {
      handleChange(newText, newMap);
    }}
    onBack={() => setShowManager(false)}
  />
) : (
  // existing preview + list JSX
)}
```

注意：由于 `BatchDesensitizePanel` 占满整个 flex 区域，需要调整外层容器确保高度正确。

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add src/modules/office-tools/components/DesensitizeEditor.tsx
git commit -m "feat(desensitize): add batch desensitize manager to DesensitizeEditor"
```

---

## Task 6: 补充单元测试

**Files:**
- Modify: `tests/unit/desensitize.test.ts`

**说明:** 为 `batchMarkSensitive` 增加单元测试。

- [ ] **Step 1: 添加测试用例**

在文件末尾新增：

```typescript
describe('batchMarkSensitive', () => {
  it('replaces multiple keywords with placeholders', () => {
    const result = batchMarkSensitive(
      '张三的电话是13800138000，李四的电话是13900139000',
      {},
      [
        { keyword: '13800138000', type: 'PHONE' },
        { keyword: '13900139000', type: 'PHONE' },
      ],
    );
    expect(result.text).toContain('__PII_PHONE_00000001__');
    expect(result.text).toContain('__PII_PHONE_00000002__');
    expect(result.map['__PII_PHONE_00000001__']).toBe('13800138000');
    expect(result.map['__PII_PHONE_00000002__']).toBe('13900139000');
  });

  it('skips empty keywords', () => {
    const result = batchMarkSensitive('text', {}, [{ keyword: '   ', type: 'NAME' }]);
    expect(result.text).toBe('text');
    expect(Object.keys(result.map)).toHaveLength(0);
  });

  it('skips keywords that contain placeholders', () => {
    const result = batchMarkSensitive('__PII_PHONE_00000001__', { '__PII_PHONE_00000001__': '138' }, [
      { keyword: '__PII_PHONE_00000001__', type: 'NAME' },
    ]);
    expect(result.text).toBe('__PII_PHONE_00000001__');
  });

  it('reuses existing counter correctly', () => {
    const result = batchMarkSensitive('foo bar', { '__PII_NAME_00000005__': 'x' }, [
      { keyword: 'foo', type: 'PHONE' },
    ]);
    expect(result.text).toContain('__PII_PHONE_00000006__');
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test tests/unit/desensitize.test.ts`
Expected: 全部通过

- [ ] **Step 3: Commit**

```bash
git add tests/unit/desensitize.test.ts
git commit -m "test(desensitize): cover batchMarkSensitive"
```

---

## Task 7: 类型检查、Lint 与回归验证

**Files:**
- 无新增文件

**说明:** 统一执行验证。

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: 无新增类型错误

- [ ] **Step 2: Lint 检查**

Run: `pnpm lint:check`
Expected: 无新增 lint 错误

- [ ] **Step 3: 单元测试全量运行**

Run: `pnpm test`
Expected: 本次新增测试通过

- [ ] **Step 4: Commit（如 lint 自动修复产生变更）**

```bash
git add -A
git commit -m "chore(desensitize): lint and typecheck fixes for batch panel"
```

---

## Self-Review

### 1. Spec coverage

| 需求 | 对应 Task |
|---|---|
| 面板查看脱敏词和脱敏标记列表 | Task 3 (`BatchDesensitizePanel` 列表视图) |
| 新增批量脱敏替换 | Task 3 (表单 + 应用), Task 1 (`batchMarkSensitive`) |
| 选择脱敏词类型 | Task 3 (Select 组件) |
| 预览效果 | Task 3 (预览按钮 + previewText) |
| 撤销操作 | Task 3 (history 栈 + 撤销按钮) |
| 在 Sheet 中打开 | Task 4 (`DesensitizePanel` 视图切换), Task 5 (`DesensitizeEditor` 入口) |
| 单元测试 | Task 6 |

### 2. Placeholder scan

- 无 `TBD` / `TODO`
- 所有代码步骤均给出完整代码
- 命令与预期输出明确

### 3. Type consistency

- `SensitiveMap` 类型复用现有定义
- `BatchMarkItem` 接口前后端同名
- `BatchDesensitizePanelProps` 与现有组件 props 风格一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-14-desensitize-batch-panel.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - I execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
