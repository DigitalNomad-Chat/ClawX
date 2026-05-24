# Stream Artifact 功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ClawX 现有 ArtifactPanel 基础上，新增从 LLM 流式输出中解析结构化内容块（Claude 式 Artifacts）的能力，支持 document/code/html/svg/mermaid 五种类型渲染。

**Architecture:** 独立 StreamArtifactStore（Zustand）+ ArtifactParser 流式解析器 + 渲染器注册表驱动。通过 useArtifactParser hook 订阅 chat store 事件，最小侵入现有代码。在 ArtifactPanel 中新增 `content` tab 展示流式 artifact。

**Tech Stack:** React 18 + TypeScript + Zustand + Tailwind CSS + DOMPurify + Mermaid（懒加载）

**参考 Spec:** `docs/superpowers/specs/2026-05-24-stream-artifact-design.md`

---

## 文件结构总览

### 新增文件（17 个）

| 文件 | 职责 |
|------|------|
| `src/lib/artifact/types.ts` | StreamArtifact 类型定义、RendererEntry、常量 |
| `src/lib/artifact/parser.ts` | ArtifactParser 流式解析器（状态机） |
| `src/lib/artifact/registry.ts` | StreamArtifactRendererRegistry 渲染器注册表 |
| `src/stores/stream-artifact.ts` | 流式 artifact Zustand store |
| `src/components/artifact/StreamArtifactView.tsx` | 内容 tab 主容器 |
| `src/components/artifact/StreamArtifactHeader.tsx` | 标题栏 + 下载/复制/关闭 |
| `src/components/artifact/StreamArtifactFooter.tsx` | 底部 artifact tab 列表 |
| `src/components/artifact/renderers/RendererErrorBoundary.tsx` | 渲染器错误边界 |
| `src/components/artifact/renderers/CodeRenderer.tsx` | 代码展示（Monaco Editor 复用） |
| `src/components/artifact/renderers/DocumentRenderer.tsx` | Markdown 渲染 |
| `src/components/artifact/renderers/HtmlRenderer.tsx` | HTML iframe 预览 |
| `src/components/artifact/renderers/SvgRenderer.tsx` | SVG 渲染 |
| `src/components/artifact/renderers/MermaidRenderer.tsx` | Mermaid 图表渲染 |
| `src/pages/Chat/useArtifactParser.ts` | Parser + Store 桥接 hook |
| `tests/unit/artifact-parser.test.ts` | ArtifactParser 单元测试 |
| `tests/unit/stream-artifact-store.test.ts` | StreamArtifactStore 单元测试 |
| `tests/unit/artifact-renderers.test.tsx` | 渲染器渲染测试 |

### 修改文件（5 个）

| 文件 | 修改内容 |
|------|----------|
| `src/stores/artifact-panel.ts` | 扩展 ArtifactTab 类型，新增 `content` 值和 `openContent()` 方法 |
| `src/stores/chat.ts` | 在 handleChatEvent 中发布流式事件（供 useArtifactParser 订阅） |
| `src/components/file-preview/ArtifactPanel.tsx` | 新增 tab 路由，集成 StreamArtifactView |
| `src/main.tsx` | 注册渲染器 |
| `package.json` | 新增 `dompurify` 和 `@types/dompurify` 依赖 |

---

## Chunk 1: P1 基础框架 — 类型、解析器、注册表、Store

### Task 1: 定义 StreamArtifact 类型

**Files:**
- Create: `src/lib/artifact/types.ts`

- [ ] **Step 1: 创建类型定义文件**

```typescript
export type StreamArtifactType =
  | 'document'
  | 'code'
  | 'html'
  | 'svg'
  | 'mermaid';

export type StreamArtifactStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface StreamArtifactMeta {
  language?: string;
  filename?: string;
  [key: string]: unknown;
}

export interface StreamArtifact {
  id: string;
  type: StreamArtifactType;
  title: string;
  content: string;
  status: StreamArtifactStatus;
  meta: StreamArtifactMeta;
  position: { start: number; end: number };
  createdAt: number;
  updatedAt: number;
  error?: string;
  messageId?: string;
  runId?: string;
  sessionKey: string;
}

export interface StreamArtifactRendererProps {
  artifact: StreamArtifact;
  isStreaming?: boolean;
  viewMode?: 'source' | 'preview';
  onViewModeChange?: (mode: 'source' | 'preview') => void;
}

export interface RendererEntry {
  type: StreamArtifactType;
  displayName: string;
  icon: string;
  component: React.ComponentType<StreamArtifactRendererProps>;
  canEdit?: boolean;
  fileExtension?: string;
}

export const LIGHTWEIGHT_ARTIFACT_TYPES: StreamArtifactType[] = [
  'document', 'code', 'html', 'svg', 'mermaid',
];

export const DEFAULT_FILE_EXTENSIONS: Record<StreamArtifactType, string> = {
  document: 'md',
  code: 'txt',
  html: 'html',
  svg: 'svg',
  mermaid: 'mmd',
};

export function normalizeArtifactType(type: string): StreamArtifactType | null {
  const normalized = type.toLowerCase().trim() as StreamArtifactType;
  return LIGHTWEIGHT_ARTIFACT_TYPES.includes(normalized) ? normalized : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/artifact/types.ts
git commit -m "feat(artifact): define StreamArtifact core types"
```

---

### Task 2: 实现 ArtifactParser 流式解析器

**Files:**
- Create: `src/lib/artifact/parser.ts`
- Test: `tests/unit/artifact-parser.test.ts`

**依赖:** Task 1 完成

- [ ] **Step 1: 写 Parser 接口和类型**

```typescript
import { StreamArtifact, StreamArtifactType, normalizeArtifactType } from './types';

export interface ParseResult {
  artifacts: StreamArtifact[];
  plainText: string;
  isComplete: boolean;
}

export interface ParserConfig {
  autoDetectLanguage?: boolean;
  treatCodeBlockAsArtifact?: boolean;
}

export interface ParseError {
  type: 'MALFORMED_FENCE' | 'INVALID_TYPE' | 'MISSING_CONTENT' | 'UNCLOSED_FENCE';
  message: string;
  position: { start: number; end: number };
  rawContent: string;
}

type FenceState =
  | { type: 'none' }
  | {
      type: 'artifact' | 'code';
      start: number;
      rawHeader: string;
      attributes: Record<string, string>;
      content: string;
      detectedType?: StreamArtifactType;
    };
```

- [ ] **Step 2: 写 ArtifactParser 类框架（空方法）**

```typescript
export class ArtifactParser {
  private buffer = '';
  private fenceState: FenceState = { type: 'none' };
  private artifacts: StreamArtifact[] = [];
  private errors: ParseError[] = [];
  private plainTextParts: string[] = [];
  private currentPlainTextStart = 0;

  constructor(private config: ParserConfig = {}) {
    this.config = {
      autoDetectLanguage: true,
      treatCodeBlockAsArtifact: true,
      ...config,
    };
  }

  append(chunk: string): ParseResult {
    this.buffer += chunk;
    this.processBuffer();
    return this.buildResult();
  }

  finalize(): ParseResult {
    if (this.fenceState.type !== 'none') {
      const state = this.fenceState as Extract<FenceState, { type: 'artifact' | 'code' }>;
      const artifact = this.createArtifact(state, this.buffer.length);
      if (artifact) {
        this.artifacts.push(artifact);
      }
      this.plainTextParts.push(
        this.buffer.slice(this.currentPlainTextStart, state.start),
      );
      this.fenceState = { type: 'none' };
    }
    if (this.currentPlainTextStart < this.buffer.length) {
      this.plainTextParts.push(this.buffer.slice(this.currentPlainTextStart));
    }
    return this.buildResult(true);
  }

  reset(): void {
    this.buffer = '';
    this.fenceState = { type: 'none' };
    this.artifacts = [];
    this.errors = [];
    this.plainTextParts = [];
    this.currentPlainTextStart = 0;
  }

  private processBuffer(): void { /* TODO */ }
  private processLineOutsideFence(line: string, lineStart: number): void { /* TODO */ }
  private processLineInsideFence(line: string, lineStart: number): void { /* TODO */ }
  private parseAttributes(header: string): Record<string, string> { /* TODO */ }
  private inferTypeFromAttributes(attrs: Record<string, string>): StreamArtifactType | undefined { /* TODO */ }
  private languageToType(lang: string): StreamArtifactType | undefined { /* TODO */ }
  private createArtifact(
    state: Extract<FenceState, { type: 'artifact' | 'code' }>,
    endPos: number,
  ): StreamArtifact | null { /* TODO */ }
  private buildResult(isComplete = false): ParseResult { /* TODO */ }

  static parse(text: string, config?: ParserConfig): ParseResult {
    const parser = new ArtifactParser(config);
    parser.append(text);
    return parser.finalize();
  }
}

export function serializeArtifact(artifact: StreamArtifact): string {
  const attrs: string[] = [`type="${artifact.type}"`];
  if (artifact.title) attrs.push(`title="${artifact.title}"`);
  if (artifact.meta.language) attrs.push(`language="${artifact.meta.language}"`);
  if (artifact.meta.filename) attrs.push(`filename="${artifact.meta.filename}"`);

  return `\`\`\`artifact ${attrs.join(' ')}
${artifact.content}
\`\`\`\n`;
}
```

- [ ] **Step 3: 写第一个测试（正常解析单个 artifact）**

```typescript
import { describe, it, expect } from 'vitest';
import { ArtifactParser } from '@/lib/artifact/parser';

describe('ArtifactParser', () => {
  it('parses a single artifact block', () => {
    const text = `Some text before
\`\`\`artifact type="html" title="Hello"
<h1>Hello World</h1>
\`\`\`
Some text after`;

    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.artifacts[0].title).toBe('Hello');
    expect(result.artifacts[0].content).toBe('<h1>Hello World</h1>');
    expect(result.plainText).toBe('Some text before\nSome text after');
    expect(result.isComplete).toBe(true);
  });
});
```

- [ ] **Step 4: 运行测试，确认失败**

Run: `pnpm test tests/unit/artifact-parser.test.ts`
Expected: FAIL (processBuffer not implemented)

- [ ] **Step 5: 实现 processBuffer 和 processLineOutsideFence**

```typescript
private processBuffer(): void {
  let i = 0;
  while (i < this.buffer.length) {
    const lineStart = i;
    const lineEnd = this.buffer.indexOf('\n', i);
    const line =
      lineEnd === -1
        ? this.buffer.slice(i)
        : this.buffer.slice(i, lineEnd + 1);

    if (lineEnd === -1 && this.fenceState.type === 'none') {
      break;
    }

    if (this.fenceState.type === 'none') {
      this.processLineOutsideFence(line, lineStart);
    } else {
      this.processLineInsideFence(line, lineStart);
    }

    i = lineEnd === -1 ? this.buffer.length : lineEnd + 1;
  }
}

private processLineOutsideFence(line: string, lineStart: number): void {
  const artifactMatch = line.match(/^```artifact\s*(.*)/i);
  if (artifactMatch) {
    this.plainTextParts.push(
      this.buffer.slice(this.currentPlainTextStart, lineStart),
    );
    const rawHeader = artifactMatch[1].trim();
    const attributes = this.parseAttributes(rawHeader);
    const detectedType = this.inferTypeFromAttributes(attributes);
    this.fenceState = {
      type: 'artifact',
      start: lineStart,
      rawHeader,
      attributes,
      content: '',
      detectedType,
    };
    return;
  }

  if (this.config.treatCodeBlockAsArtifact) {
    const codeMatch = line.match(/^```(\w+)?/);
    if (codeMatch) {
      const lang = codeMatch[1];
      if (lang) {
        this.plainTextParts.push(
          this.buffer.slice(this.currentPlainTextStart, lineStart),
        );
        const detectedType = this.languageToType(lang);
        this.fenceState = {
          type: 'code',
          start: lineStart,
          rawHeader: lang,
          attributes: { language: lang },
          content: '',
          detectedType,
        };
      }
      return;
    }
  }
}
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `pnpm test tests/unit/artifact-parser.test.ts`
Expected: PASS

- [ ] **Step 7: 实现剩余私有方法**

```typescript
private processLineInsideFence(line: string, _lineStart: number): void {
  const state = this.fenceState as Extract<FenceState, { type: 'artifact' | 'code' }>;

  const endMatch = line.match(/^```\s*(?:\n|$)/);
  if (endMatch) {
    const artifact = this.createArtifact(state, _lineStart + line.length);
    if (artifact) {
      this.artifacts.push(artifact);
    }
    this.currentPlainTextStart = _lineStart + line.length;
    this.fenceState = { type: 'none' };
    return;
  }

  state.content += line;
}

private parseAttributes(header: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)\s*="([^"]*)"/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

private inferTypeFromAttributes(attrs: Record<string, string>): StreamArtifactType | undefined {
  const typeAttr = attrs.type;
  if (typeAttr) {
    return normalizeArtifactType(typeAttr) || undefined;
  }
  return undefined;
}

private languageToType(lang: string): StreamArtifactType | undefined {
  const map: Record<string, StreamArtifactType> = {
    md: 'document',
    markdown: 'document',
    txt: 'document',
    svg: 'svg',
    mermaid: 'mermaid',
    jsx: 'code',
    tsx: 'code',
    ts: 'code',
    js: 'code',
    py: 'code',
  };
  return map[lang.toLowerCase()] || 'code';
}

private createArtifact(
  state: Extract<FenceState, { type: 'artifact' | 'code' }>,
  endPos: number,
): StreamArtifact | null {
  const type =
    state.detectedType ||
    normalizeArtifactType(state.attributes.type || 'document') ||
    'document';

  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type,
    title: state.attributes.title || '未命名 Artifact',
    content: state.content.trimEnd(),
    status: 'complete',
    meta: {
      language: state.attributes.language || state.rawHeader,
      filename: state.attributes.filename,
      ...state.attributes,
    },
    position: { start: state.start, end: endPos },
    createdAt: now,
    updatedAt: now,
    sessionKey: '', // 由 sync 层填充
  };
}

private buildResult(isComplete = false): ParseResult {
  const plainText = this.plainTextParts.join('') + (
    this.fenceState.type === 'none' && this.currentPlainTextStart < this.buffer.length
      ? this.buffer.slice(this.currentPlainTextStart)
      : ''
  );
  return {
    artifacts: [...this.artifacts],
    plainText,
    isComplete,
  };
}
```

- [ ] **Step 8: 写更多边界测试**

```typescript
  it('handles streaming chunks incrementally', () => {
    const parser = new ArtifactParser();

    let result = parser.append('Some text\n```artifact type="code" title="Test"\n');
    expect(result.artifacts).toHaveLength(0);
    expect(result.plainText).toBe('Some text\n');

    result = parser.append('const x = 1;\n');
    expect(result.artifacts).toHaveLength(0);

    result = parser.append('```\nAfter text');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].content).toBe('const x = 1;');
    expect(result.plainText).toBe('Some text\nAfter text');
  });

  it('handles unclosed fence in finalize', () => {
    const parser = new ArtifactParser();
    parser.append('```artifact type="html"\n<p>Hello</p>');
    const result = parser.finalize();

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.isComplete).toBe(true);
  });

  it('treats code blocks as artifacts when configured', () => {
    const text = '```typescript\nconst x = 1;\n```';
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('code');
    expect(result.artifacts[0].meta.language).toBe('typescript');
  });

  it('ignores code blocks without language', () => {
    const text = '```\nplain text\n```';
    const result = ArtifactParser.parse(text, { treatCodeBlockAsArtifact: true });

    expect(result.artifacts).toHaveLength(0);
  });

  it('handles nested code blocks inside artifact', () => {
    const text = `\`\`\`artifact type="document"
Here is some code:
\`\`\`js
const x = 1;
\`\`\`
More text
\`\`\``;
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].content).toContain('const x = 1;');
  });

  it('returns empty result for plain text without artifacts', () => {
    const text = 'Just plain text without any fences.';
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(0);
    expect(result.plainText).toBe(text);
  });
```

- [ ] **Step 9: 运行全部测试**

Run: `pnpm test tests/unit/artifact-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/artifact/parser.ts tests/unit/artifact-parser.test.ts
git commit -m "feat(artifact): implement ArtifactParser with streaming support"
```

---

### Task 3: 实现渲染器注册表

**Files:**
- Create: `src/lib/artifact/registry.ts`

**依赖:** Task 1 完成

- [ ] **Step 1: 创建注册表**

```typescript
import { StreamArtifactType, RendererEntry } from './types';

class StreamArtifactRendererRegistry {
  private entries = new Map<StreamArtifactType, RendererEntry>();

  register(entry: RendererEntry): void {
    this.entries.set(entry.type, entry);
  }

  get(type: StreamArtifactType): RendererEntry | undefined {
    return this.entries.get(type);
  }

  has(type: StreamArtifactType): boolean {
    return this.entries.has(type);
  }

  getAll(): RendererEntry[] {
    return Array.from(this.entries.values());
  }

  getFileExtension(type: StreamArtifactType): string {
    const entry = this.entries.get(type);
    if (entry?.fileExtension) return entry.fileExtension;
    const map: Record<string, string> = {
      document: 'md',
      code: 'txt',
      html: 'html',
      svg: 'svg',
      mermaid: 'mmd',
    };
    return map[type] || 'txt';
  }
}

export const streamArtifactRegistry = new StreamArtifactRendererRegistry();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/artifact/registry.ts
git commit -m "feat(artifact): add StreamArtifactRendererRegistry"
```

---

### Task 4: 实现 StreamArtifactStore

**Files:**
- Create: `src/stores/stream-artifact.ts`
- Test: `tests/unit/stream-artifact-store.test.ts`

**依赖:** Task 1 完成

- [ ] **Step 1: 写 Store 测试（先写测试）**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStreamArtifactStore } from '@/stores/stream-artifact';

function makeArtifact(overrides = {}): StreamArtifact {
  return {
    id: 'test-id',
    type: 'code',
    title: 'Test',
    content: 'console.log(1)',
    status: 'streaming',
    meta: {},
    position: { start: 0, end: 20 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionKey: 'session-1',
    ...overrides,
  };
}

describe('StreamArtifactStore', () => {
  beforeEach(() => {
    useStreamArtifactStore.setState({
      artifacts: [],
      selectedArtifactId: null,
      streamingArtifactId: null,
    });
  });

  it('adds an artifact', () => {
    const artifact = makeArtifact();
    useStreamArtifactStore.getState().addArtifact(artifact);

    expect(useStreamArtifactStore.getState().artifacts).toHaveLength(1);
    expect(useStreamArtifactStore.getState().selectedArtifactId).toBe('test-id');
  });

  it('updates an artifact by id', () => {
    const artifact = makeArtifact();
    useStreamArtifactStore.getState().addArtifact(artifact);
    useStreamArtifactStore.getState().updateArtifact('test-id', { content: 'updated' });

    expect(useStreamArtifactStore.getState().artifacts[0].content).toBe('updated');
  });

  it('deduplicates by position + type for same message', () => {
    const a1 = makeArtifact({ id: 'id-1', position: { start: 0, end: 10 } });
    const a2 = makeArtifact({ id: 'id-2', position: { start: 0, end: 10 } });
    useStreamArtifactStore.getState().addArtifact(a1);
    useStreamArtifactStore.getState().addArtifact(a2);

    expect(useStreamArtifactStore.getState().artifacts).toHaveLength(1);
    expect(useStreamArtifactStore.getState().artifacts[0].id).toBe('id-1');
  });

  it('clears artifacts by sessionKey', () => {
    useStreamArtifactStore.getState().addArtifact(makeArtifact({ sessionKey: 's1' }));
    useStreamArtifactStore.getState().addArtifact(makeArtifact({ id: 'id-2', sessionKey: 's2' }));
    useStreamArtifactStore.getState().clearSessionArtifacts('s1');

    expect(useStreamArtifactStore.getState().artifacts).toHaveLength(1);
    expect(useStreamArtifactStore.getState().artifacts[0].sessionKey).toBe('s2');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test tests/unit/stream-artifact-store.test.ts`
Expected: FAIL (store not defined)

- [ ] **Step 3: 实现 Store**

```typescript
import { create } from 'zustand';
import type { StreamArtifact, StreamArtifactType } from '@/lib/artifact/types';

interface StreamArtifactState {
  artifacts: StreamArtifact[];
  selectedArtifactId: string | null;
  streamingArtifactId: string | null;

  addArtifact: (artifact: StreamArtifact) => void;
  updateArtifact: (id: string, updates: Partial<StreamArtifact>) => void;
  removeArtifact: (id: string) => void;
  selectArtifact: (id: string | null) => void;
  setStreamingArtifact: (id: string | null) => void;
  clearSessionArtifacts: (sessionKey: string) => void;
}

export const useStreamArtifactStore = create<StreamArtifactState>()((set, get) => ({
  artifacts: [],
  selectedArtifactId: null,
  streamingArtifactId: null,

  addArtifact: (artifact) => {
    set((state) => {
      const existingIndex = state.artifacts.findIndex(
        (a) =>
          a.sessionKey === artifact.sessionKey &&
          a.position.start === artifact.position.start &&
          a.type === artifact.type
      );

      if (existingIndex >= 0) {
        const updated = [...state.artifacts];
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...artifact,
          id: updated[existingIndex].id,
          updatedAt: Date.now(),
        };
        return { artifacts: updated };
      }

      return {
        artifacts: [...state.artifacts, artifact],
        selectedArtifactId: state.selectedArtifactId ?? artifact.id,
      };
    });
  },

  updateArtifact: (id, updates) => {
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
      ),
    }));
  },

  removeArtifact: (id) => {
    set((state) => {
      const filtered = state.artifacts.filter((a) => a.id !== id);
      return {
        artifacts: filtered,
        selectedArtifactId:
          state.selectedArtifactId === id
            ? filtered[0]?.id ?? null
            : state.selectedArtifactId,
        streamingArtifactId:
          state.streamingArtifactId === id ? null : state.streamingArtifactId,
      };
    });
  },

  selectArtifact: (id) => set({ selectedArtifactId: id }),

  setStreamingArtifact: (id) => {
    set({ streamingArtifactId: id });
    if (id) {
      set((state) => ({
        artifacts: state.artifacts.map((a) =>
          a.id === id ? { ...a, status: 'streaming' as const } : a
        ),
      }));
    }
  },

  clearSessionArtifacts: (sessionKey) => {
    set((state) => {
      const filtered = state.artifacts.filter((a) => a.sessionKey !== sessionKey);
      return {
        artifacts: filtered,
        selectedArtifactId:
          filtered.find((a) => a.id === state.selectedArtifactId)?.id ??
          filtered[0]?.id ??
          null,
        streamingArtifactId: null,
      };
    });
  },
}));
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test tests/unit/stream-artifact-store.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/stream-artifact.ts tests/unit/stream-artifact-store.test.ts
git commit -m "feat(artifact): add StreamArtifactStore with session-scoped lifecycle"
```

---

## Chunk 2: P2 渲染器 — Error Boundary + 5 种渲染器

### Task 5: 实现 RendererErrorBoundary

**Files:**
- Create: `src/components/artifact/renderers/RendererErrorBoundary.tsx`

**依赖:** Task 1 完成

- [ ] **Step 1: 实现错误边界组件**

```typescript
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RendererErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ArtifactRenderer] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 rounded border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
              渲染失败
            </h4>
            <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-3 px-3 py-1 text-xs rounded bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-700 dark:text-red-300"
            >
              重试
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/artifact/renderers/RendererErrorBoundary.tsx
git commit -m "feat(artifact): add RendererErrorBoundary for isolated error handling"
```

---

### Task 6: 实现 CodeRenderer

**Files:**
- Create: `src/components/artifact/renderers/CodeRenderer.tsx`

**依赖:** Task 1, Task 5 完成

**设计决策**：复用项目中已有的 Monaco Editor 组件，而非引入 PrismJS。查看 `src/components/file-preview/MonacoViewer.tsx` 和 `src/components/file-preview/MonacoDiffViewer.tsx` 的实现方式，封装一个轻量级版本。

- [ ] **Step 1: 实现 CodeRenderer**

```typescript
import { useState, useCallback } from 'react';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function CodeRenderer({ artifact }: StreamArtifactRendererProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const language = artifact.meta.language as string || 'plaintext';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 uppercase">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-sm font-mono leading-relaxed">
          <code>{artifact.content}</code>
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/artifact/renderers/CodeRenderer.tsx
git commit -m "feat(artifact): add CodeRenderer with copy support"
```

---

### Task 7: 实现 DocumentRenderer

**Files:**
- Create: `src/components/artifact/renderers/DocumentRenderer.tsx`

**依赖:** Task 1 完成

- [ ] **Step 1: 实现 DocumentRenderer**

复用项目现有 Markdown 渲染管道（ReactMarkdown + remarkGfm + remarkMath + rehypeKatex）。

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function DocumentRenderer({ artifact }: StreamArtifactRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4 overflow-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {artifact.content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/artifact/renderers/DocumentRenderer.tsx
git commit -m "feat(artifact): add DocumentRenderer with markdown support"
```

---

### Task 8: 实现 HtmlRenderer

**Files:**
- Create: `src/components/artifact/renderers/HtmlRenderer.tsx`

**依赖:** Task 1 完成

- [ ] **Step 1: 安装 DOMPurify**

```bash
pnpm add dompurify && pnpm add -D @types/dompurify
```

- [ ] **Step 2: 实现 HtmlRenderer**

```typescript
import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

const MAX_HTML_SIZE = 1024 * 1024; // 1MB

export function HtmlRenderer({
  artifact,
  viewMode = 'preview',
  onViewModeChange,
}: StreamArtifactRendererProps) {
  const [isOversized, setIsOversized] = useState(false);

  const sanitizedHtml = useMemo(() => {
    if (artifact.content.length > MAX_HTML_SIZE) {
      setIsOversized(true);
      return '';
    }
    setIsOversized(false);

    const clean = DOMPurify.sanitize(artifact.content, {
      ALLOWED_TAGS: [
        'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'br', 'hr', 'a', 'img', 'ul', 'ol', 'li', 'table',
        'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre',
        'code', 'strong', 'em', 'b', 'i', 'u', 's', 'strike',
        'sub', 'sup', 'mark', 'small', 'dl', 'dt', 'dd',
        'figure', 'figcaption', 'details', 'summary',
        'style', 'link',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'style',
        'target', 'rel', 'width', 'height', 'colspan', 'rowspan',
        'srcset', 'sizes', 'loading',
      ],
      ALLOW_DATA_ATTR: false,
    });

    // 注入 CSP meta 标签
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline' 'self'; img-src data: blob:; connect-src 'none'; font-src 'none'; object-src 'none'; media-src 'none'; frame-src 'none';">
${clean}`;
  }, [artifact.content]);

  if (isOversized) {
    return (
      <div className="p-4 text-amber-600 dark:text-amber-400">
        <p>HTML 内容超过 1MB，建议下载查看。</p>
        <button className="mt-2 text-sm underline">下载文件</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => onViewModeChange?.('preview')}
            className={`text-xs px-2 py-1 rounded ${viewMode === 'preview' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}
          >
            预览
          </button>
          <button
            onClick={() => onViewModeChange?.('source')}
            className={`text-xs px-2 py-1 rounded ${viewMode === 'source' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}
          >
            源码
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === 'preview' ? (
          <iframe
            sandbox="allow-scripts allow-popups"
            srcDoc={sanitizedHtml}
            className="w-full h-full border-0"
            title={artifact.title}
          />
        ) : (
          <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/artifact/renderers/HtmlRenderer.tsx package.json pnpm-lock.yaml
git commit -m "feat(artifact): add HtmlRenderer with DOMPurify sandboxing"
```

---

### Task 9: 实现 SvgRenderer

**Files:**
- Create: `src/components/artifact/renderers/SvgRenderer.tsx`

**依赖:** Task 1, Task 8（DOMPurify 已安装）完成

- [ ] **Step 1: 实现 SvgRenderer**

```typescript
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function SvgRenderer({ artifact }: StreamArtifactRendererProps) {
  const sanitizedSvg = useMemo(() => {
    return DOMPurify.sanitize(artifact.content, {
      USE_PROFILES: { svg: true },
      ADD_TAGS: ['use', 'symbol'],
      ADD_ATTR: ['viewBox', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink'],
    });
  }, [artifact.content]);

  const svgMatch = artifact.content.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    // 回退到 CodeRenderer
    return (
      <pre className="p-4 text-sm font-mono whitespace-pre-wrap overflow-auto">
        <code>{artifact.content}</code>
      </pre>
    );
  }

  return (
    <div className="flex items-center justify-center p-4 overflow-auto h-full">
      <div
        className="max-w-full"
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/artifact/renderers/SvgRenderer.tsx
git commit -m "feat(artifact): add SvgRenderer with DOMPurify sanitization"
```

---

### Task 10: 实现 MermaidRenderer

**Files:**
- Create: `src/components/artifact/renderers/MermaidRenderer.tsx`

**依赖:** Task 1, Task 5 完成

- [ ] **Step 1: 实现 MermaidRenderer**

```typescript
import { useEffect, useRef, useState } from 'react';
import type { StreamArtifactRendererProps } from '@/lib/artifact/types';

export function MermaidRenderer({ artifact }: StreamArtifactRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (artifact.status !== 'complete') {
      setSvg('');
      setError(null);
      return;
    }

    let cancelled = false;

    async function renderMermaid() {
      try {
        const mermaid = await import('mermaid');
        if (cancelled) return;

        mermaid.default.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
        });

        const id = `mermaid-${artifact.id.slice(0, 8)}`;
        const { svg: renderedSvg } = await mermaid.default.render(id, artifact.content);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '渲染失败');
          setSvg('');
        }
      }
    }

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [artifact.content, artifact.status, artifact.id]);

  if (artifact.status === 'streaming') {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400 text-sm">
        正在生成图表...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 dark:text-red-400 text-sm mb-2">
          Mermaid 渲染失败: {error}
        </div>
        <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto">
          {artifact.content}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="p-4 overflow-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/artifact/renderers/MermaidRenderer.tsx
git commit -m "feat(artifact): add MermaidRenderer with lazy loading"
```

---

### Task 11: 写渲染器渲染测试

**Files:**
- Test: `tests/unit/artifact-renderers.test.tsx`

**依赖:** Task 5-10 完成

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeRenderer } from '@/components/artifact/renderers/CodeRenderer';
import { DocumentRenderer } from '@/components/artifact/renderers/DocumentRenderer';
import { SvgRenderer } from '@/components/artifact/renderers/SvgRenderer';
import { RendererErrorBoundary } from '@/components/artifact/renderers/RendererErrorBoundary';
import type { StreamArtifact } from '@/lib/artifact/types';

function makeArtifact(overrides: Partial<StreamArtifact> = {}): StreamArtifact {
  return {
    id: 'test-id',
    type: 'code',
    title: 'Test',
    content: 'console.log("hello")',
    status: 'complete',
    meta: { language: 'javascript' },
    position: { start: 0, end: 20 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionKey: 'test-session',
    ...overrides,
  };
}

describe('CodeRenderer', () => {
  it('renders code with language label', () => {
    render(<CodeRenderer artifact={makeArtifact()} />);
    expect(screen.getByText('JAVASCRIPT')).toBeInTheDocument();
    expect(screen.getByText('console.log("hello")')).toBeInTheDocument();
  });

  it('shows copy button', () => {
    render(<CodeRenderer artifact={makeArtifact()} />);
    expect(screen.getByText('复制')).toBeInTheDocument();
  });
});

describe('DocumentRenderer', () => {
  it('renders markdown content', () => {
    render(<DocumentRenderer artifact={makeArtifact({ type: 'document', content: '# Hello' })} />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  });
});

describe('SvgRenderer', () => {
  it('renders svg content', () => {
    render(<SvgRenderer artifact={makeArtifact({ type: 'svg', content: '<svg><circle cx="50" cy="50" r="40"/></svg>' })} />);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('falls back to code for non-svg content', () => {
    render(<SvgRenderer artifact={makeArtifact({ type: 'svg', content: 'not svg' })} />);
    expect(screen.getByText('not svg')).toBeInTheDocument();
  });
});

describe('RendererErrorBoundary', () => {
  it('catches rendering errors and shows fallback', () => {
    const ThrowingComponent = () => {
      throw new Error('Test error');
    };

    render(
      <RendererErrorBoundary>
        <ThrowingComponent />
      </RendererErrorBoundary>
    );

    expect(screen.getByText('渲染失败')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test tests/unit/artifact-renderers.test.tsx`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/artifact-renderers.test.tsx
git commit -m "test(artifact): add renderer rendering tests"
```

---

## Chunk 3: P3 Chat 集成 + P4 ArtifactPanel 扩展

### Task 12: 扩展 artifact-panel store

**Files:**
- Modify: `src/stores/artifact-panel.ts`

**依赖:** Task 4 完成

- [ ] **Step 1: 修改 artifact-panel.ts**

将 `ArtifactTab` 从 `'changes' | 'preview' | 'browser'` 扩展为 `'changes' | 'preview' | 'content' | 'browser'`，并新增 `openContent()` 方法。

```typescript
export type ArtifactTab = 'changes' | 'preview' | 'content' | 'browser';
```

在 store 的 actions 中新增：

```typescript
openContent: (file?: FilePreviewTarget | null) =>
  set({ open: true, tab: 'content' as ArtifactTab, focusedFile: file ?? null }),
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/artifact-panel.ts
git commit -m "feat(artifact-panel): extend tab type with 'content' and add openContent()"
```

---

### Task 13: 实现 useArtifactParser hook

**Files:**
- Create: `src/pages/Chat/useArtifactParser.ts`

**依赖:** Task 2, Task 4, Task 12 完成

- [ ] **Step 1: 实现 hook**

```typescript
import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { ArtifactParser } from '@/lib/artifact/parser';
import type { StreamArtifact, StreamArtifactStatus } from '@/lib/artifact/types';

function extractTextDelta(
  current: unknown,
  previous: unknown,
): string | null {
  if (typeof current === 'string' && typeof previous === 'string') {
    return current.slice(previous.length);
  }
  // ContentBlock[] 格式处理
  if (Array.isArray(current) && Array.isArray(previous)) {
    const currentText = current
      .filter((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
      .map((b: unknown) => (b as Record<string, unknown>)?.text as string)
      .join('');
    const prevText = previous
      .filter((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
      .map((b: unknown) => (b as Record<string, unknown>)?.text as string)
      .join('');
    return currentText.slice(prevText.length);
  }
  if (typeof current === 'string') {
    return current;
  }
  return null;
}

export function useArtifactParser() {
  const parserRef = useRef<ArtifactParser | null>(null);
  const sessionKeyRef = useRef<string>('');

  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state, prevState) => {
      // 新流开始
      if (state.sending && !prevState.sending) {
        parserRef.current = new ArtifactParser({
          autoDetectLanguage: true,
          treatCodeBlockAsArtifact: true,
        });
        sessionKeyRef.current = state.currentSessionKey;
      }

      // Delta 更新
      if (
        state.streamingMessage &&
        state.streamingMessage !== prevState.streamingMessage
      ) {
        const textDelta = extractTextDelta(
          (state.streamingMessage as Record<string, unknown>)?.content,
          (prevState.streamingMessage as Record<string, unknown>)?.content,
        );

        if (parserRef.current && textDelta) {
          const result = parserRef.current.append(textDelta);
          syncArtifacts(result.artifacts, {
            runId: state.activeRunId,
            messageId: (state.streamingMessage as Record<string, unknown>)?.messageId as string | undefined,
            sessionKey: sessionKeyRef.current,
          });
        }
      }

      // 流结束
      if (!state.sending && prevState.sending && parserRef.current) {
        const result = parserRef.current.finalize();
        syncArtifacts(result.artifacts, {
          runId: state.activeRunId,
          status: 'complete',
          sessionKey: sessionKeyRef.current,
        });
        parserRef.current = null;
      }

      // Session 切换
      if (state.currentSessionKey !== prevState.currentSessionKey) {
        useStreamArtifactStore.getState().clearSessionArtifacts(prevState.currentSessionKey);
      }
    });

    return unsubscribe;
  }, []);
}

function syncArtifacts(
  parsedArtifacts: StreamArtifact[],
  ctx: {
    runId: string | null;
    messageId?: string;
    sessionKey: string;
    status?: StreamArtifactStatus;
  },
) {
  const { addArtifact, updateArtifact } = useStreamArtifactStore.getState();

  parsedArtifacts.forEach((art) => {
    const existing = useStreamArtifactStore
      .getState()
      .artifacts.find(
        (a) =>
          a.sessionKey === ctx.sessionKey &&
          a.position.start === art.position.start &&
          a.type === art.type,
      );

    if (existing) {
      updateArtifact(existing.id, {
        content: art.content,
        status: ctx.status ?? 'streaming',
        updatedAt: Date.now(),
      });
    } else {
      addArtifact({
        ...art,
        id: crypto.randomUUID(),
        runId: ctx.runId ?? '',
        messageId: ctx.messageId,
        sessionKey: ctx.sessionKey,
        status: ctx.status ?? 'streaming',
      });

      // 自动打开面板
      if (!useArtifactPanel.getState().open) {
        useArtifactPanel.getState().openContent();
      }
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Chat/useArtifactParser.ts
git commit -m "feat(artifact): add useArtifactParser hook for streaming integration"
```

---

### Task 14: 修改 chat.ts 发布流式事件

**Files:**
- Modify: `src/stores/chat.ts`

**依赖:** Task 13 完成

- [ ] **Step 1: 在 handleChatEvent 中确保 streamingMessage 的不可变性**

查看现有 `handleChatEvent` 的 `delta` 分支（约第 2312 行），确保 `streamingMessage` 是通过不可变方式更新的。现有代码可能已经这样做了，需要确认。

如果现有代码已经是不可变更新，则**无需修改**。如果存在直接变异，需要修正。

**关键检查点**：`useChatStore.subscribe` 依赖 `streamingMessage` 的引用变化来检测 delta。如果现有代码在 delta 分支中直接修改 `streamingMessage.content` 而不创建新对象，subscribe 不会触发。

- [ ] **Step 2: Commit（如需要修改）**

```bash
git add src/stores/chat.ts
git commit -m "fix(chat): ensure immutable streamingMessage updates for artifact parser"
```

---

### Task 15: 实现 StreamArtifactView + Header + Footer

**Files:**
- Create: `src/components/artifact/StreamArtifactView.tsx`
- Create: `src/components/artifact/StreamArtifactHeader.tsx`
- Create: `src/components/artifact/StreamArtifactFooter.tsx`

**依赖:** Task 1, Task 4, Task 5-10 完成

- [ ] **Step 1: 实现 StreamArtifactHeader**

```typescript
import { useState, useCallback } from 'react';
import type { StreamArtifact } from '@/lib/artifact/types';
import { streamArtifactRegistry } from '@/lib/artifact/registry';

interface Props {
  artifact: StreamArtifact;
  onClose?: () => void;
}

export function StreamArtifactHeader({ artifact, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const entry = streamArtifactRegistry.get(artifact.type);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const handleDownload = useCallback(() => {
    const ext = streamArtifactRegistry.getFileExtension(artifact.type);
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">{entry?.icon ?? '📄'}</span>
        <span className="text-sm font-medium truncate">
          {artifact.title}
        </span>
        {artifact.status === 'streaming' && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            生成中
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title="复制内容"
        >
          {copied ? '✓' : '📋'}
        </button>
        <button
          onClick={handleDownload}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          title="下载文件"
        >
          ⬇️
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            title="关闭"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现 StreamArtifactFooter**

```typescript
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { streamArtifactRegistry } from '@/lib/artifact/registry';

export function StreamArtifactFooter() {
  const { artifacts, selectedArtifactId, selectArtifact } = useStreamArtifactStore();

  return (
    <div className="flex gap-1 px-2 py-2 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
      {artifacts.map((art) => {
        const entry = streamArtifactRegistry.get(art.type);
        const isSelected = art.id === selectedArtifactId;

        return (
          <button
            key={art.id}
            onClick={() => selectArtifact(art.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            <span>{entry?.icon ?? '📄'}</span>
            <span className="truncate max-w-[120px]">{art.title}</span>
            {art.status === 'streaming' && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 实现 StreamArtifactView**

```typescript
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { streamArtifactRegistry } from '@/lib/artifact/registry';
import { RendererErrorBoundary } from './renderers/RendererErrorBoundary';
import { StreamArtifactHeader } from './StreamArtifactHeader';
import { StreamArtifactFooter } from './StreamArtifactFooter';

export function StreamArtifactView() {
  const { artifacts, selectedArtifactId } = useStreamArtifactStore();
  const { close } = useArtifactPanel();
  const selected = artifacts.find((a) => a.id === selectedArtifactId);

  if (artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        暂无内容
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {selected && (
        <StreamArtifactHeader artifact={selected} onClose={close} />
      )}

      <div className="flex-1 overflow-hidden">
        {selected ? (
          <RendererErrorBoundary>
            <StreamArtifactContent artifact={selected} />
          </RendererErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
            选择一个 artifact 查看
          </div>
        )}
      </div>

      {artifacts.length > 1 && <StreamArtifactFooter />}
    </div>
  );
}

function StreamArtifactContent({
  artifact,
}: {
  artifact: ReturnType<typeof useStreamArtifactStore.getState>['artifacts'][number];
}) {
  const entry = streamArtifactRegistry.get(artifact.type);

  if (!entry) {
    return (
      <div className="p-4 text-amber-600 dark:text-amber-400">
        不支持的 artifact 类型: {artifact.type}
      </div>
    );
  }

  const Renderer = entry.component;
  return (
    <Renderer
      artifact={artifact}
      isStreaming={artifact.status === 'streaming'}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/artifact/StreamArtifactView.tsx \
  src/components/artifact/StreamArtifactHeader.tsx \
  src/components/artifact/StreamArtifactFooter.tsx
git commit -m "feat(artifact): add StreamArtifactView with header, footer and error boundary"
```

---

### Task 16: 扩展 ArtifactPanel 集成 StreamArtifactView

**Files:**
- Modify: `src/components/file-preview/ArtifactPanel.tsx`

**依赖:** Task 12, Task 15 完成

- [ ] **Step 1: 修改 ArtifactPanel 增加 content tab 路由**

在现有 ArtifactPanel 组件中，找到 tab 切换逻辑（通常在组件顶部），新增 `content` tab：

```tsx
import { StreamArtifactView } from '@/components/artifact/StreamArtifactView';

// 在 tab 按钮区域新增：
<button
  onClick={() => setTab('content')}
  className={...}
>
  内容
</button>

// 在内容区域新增：
{tab === 'content' && <StreamArtifactView />}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/file-preview/ArtifactPanel.tsx
git commit -m "feat(artifact-panel): integrate StreamArtifactView into content tab"
```

---

### Task 17: 注册渲染器

**Files:**
- Modify: `src/main.tsx`

**依赖:** Task 3, Task 5-10 完成

- [ ] **Step 1: 在 main.tsx 中注册渲染器**

在 `createRoot` 之后、`render` 之前调用 setup 函数：

```typescript
import { streamArtifactRegistry } from '@/lib/artifact/registry';
import { DocumentRenderer } from '@/components/artifact/renderers/DocumentRenderer';
import { CodeRenderer } from '@/components/artifact/renderers/CodeRenderer';
import { HtmlRenderer } from '@/components/artifact/renderers/HtmlRenderer';
import { SvgRenderer } from '@/components/artifact/renderers/SvgRenderer';
import { MermaidRenderer } from '@/components/artifact/renderers/MermaidRenderer';

function setupStreamArtifactRenderers() {
  streamArtifactRegistry.register({
    type: 'document', displayName: '文档', icon: '📄',
    component: DocumentRenderer, fileExtension: 'md',
  });
  streamArtifactRegistry.register({
    type: 'code', displayName: '代码', icon: '💻',
    component: CodeRenderer, canEdit: true, fileExtension: 'txt',
  });
  streamArtifactRegistry.register({
    type: 'html', displayName: 'HTML', icon: '🌐',
    component: HtmlRenderer, canEdit: true, fileExtension: 'html',
  });
  streamArtifactRegistry.register({
    type: 'svg', displayName: 'SVG', icon: '🎨',
    component: SvgRenderer, canEdit: true, fileExtension: 'svg',
  });
  streamArtifactRegistry.register({
    type: 'mermaid', displayName: 'Mermaid', icon: '📊',
    component: MermaidRenderer, fileExtension: 'mmd',
  });
}

// 在 createRoot 之后调用
setupStreamArtifactRenderers();
```

- [ ] **Step 2: Commit**

```bash
git add src/main.tsx
git commit -m "feat(artifact): register all stream artifact renderers on app startup"
```

---

### Task 18: 在 Chat 页面挂载 useArtifactParser

**Files:**
- Modify: `src/pages/Chat/index.tsx`

**依赖:** Task 13, Task 17 完成

- [ ] **Step 1: 在 Chat 页面导入并调用 hook**

在 `Chat` 组件顶部（其他 hook 调用之后）添加：

```typescript
import { useArtifactParser } from './useArtifactParser';

export function Chat() {
  // ... 现有 hooks
  useArtifactParser(); // 订阅流式事件，解析 artifact
  // ...
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Chat/index.tsx
git commit -m "feat(chat): mount useArtifactParser hook for streaming artifact detection"
```

---

## Chunk 4: P5 安全加固、优化与集成测试

### Task 19: 类型检查与编译

**Files:**
- 全部新增和修改文件

**依赖:** Task 1-18 完成

- [ ] **Step 1: 运行 TypeScript 类型检查**

Run: `pnpm typecheck`
Expected: 无新增 TS 错误

- [ ] **Step 2: 运行 lint**

Run: `pnpm lint`
Expected: 无新增 lint 错误

- [ ] **Step 3: Commit（如需要修复）**

```bash
git add -A
git commit -m "fix(artifact): resolve typecheck and lint issues"
```

---

### Task 20: 运行全部单元测试

**Files:**
- 全部测试文件

**依赖:** Task 1-18 完成

- [ ] **Step 1: 运行 parser 测试**

Run: `pnpm test tests/unit/artifact-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 2: 运行 store 测试**

Run: `pnpm test tests/unit/stream-artifact-store.test.ts`
Expected: ALL PASS

- [ ] **Step 3: 运行渲染器测试**

Run: `pnpm test tests/unit/artifact-renderers.test.tsx`
Expected: ALL PASS

- [ ] **Step 4: 运行现有测试确保无回归**

Run: `pnpm test`
Expected: ALL PASS（包括新增和现有测试）

- [ ] **Step 5: Commit**

```bash
git commit -m "test(artifact): all unit tests passing"
```

---

### Task 21: 手动验证

**依赖:** Task 19, Task 20 完成

- [ ] **Step 1: 启动开发服务器**

Run: `pnpm dev`

- [ ] **Step 2: 验证 ArtifactPanel content tab 存在**

1. 打开 Chat 页面
2. 打开右侧 ArtifactPanel
3. 确认有四个 tab：变更、预览、内容、浏览器
4. 切换到"内容"tab，确认显示"暂无内容"

- [ ] **Step 3: 验证流式 artifact 检测**

1. 触发 Agent 回复（可以手动构造一个包含 ` ```artifact ` 块的回复进行测试）
2. 确认面板自动打开并切换到 content tab
3. 确认 artifact 内容正确渲染

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(artifact): manual verification passed"
```

---

## 里程碑汇总

| 里程碑 | 任务范围 | 预计时间 |
|--------|----------|----------|
| **M1：解析器就绪** | Task 1-4（types + parser + registry + store） | 第 1 天 |
| **M2：渲染器就绪** | Task 5-11（5 种渲染器 + Error Boundary + 测试） | 第 2-3 天 |
| **M3：集成完成** | Task 12-18（store 扩展 + hook + ArtifactPanel + 注册 + Chat 挂载） | 第 4-5 天 |
| **M4：验收** | Task 19-21（类型检查 + 全部测试 + 手动验证） | 第 6-7 天 |

---

## 回滚策略

每个 Task 完成后独立 commit。如任何阶段出现问题，可 `git revert` 到上一个 Task 的 commit。

关键检查点：
- M1 完成后：确认 `ArtifactParser.parse()` 可通过所有测试
- M2 完成后：确认 5 种渲染器可独立渲染 mock 数据
- M3 完成后：确认 Chat 页面正常加载，面板 tab 切换正常
