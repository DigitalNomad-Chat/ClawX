# Stream Artifact 功能设计文档

> 在 ClawX 现有 ArtifactPanel（文件变更面板）基础上，新增从 LLM 流式输出中解析结构化内容块（Claude 式 Artifacts）的能力。
>
> 参考实现：guada_ai `frontend/src/lib/artifact/` 系统
>
> 制定日期：2026-05-24
>
> 状态：设计已确认，待实施

---

## 一、目标与约束

### 1.1 目标

- 支持从 Agent 流式回复中自动检测并解析 ` ```artifact ` 围栏块
- 支持 5 种内容类型渲染：document、code、html、svg、mermaid
- 在现有 ArtifactPanel 右侧分栏中以独立 tab 展示，与"变更"tab 共存
- 流式生成过程中实时更新 artifact 内容（streaming → complete）

### 1.2 约束

- **不破坏现有功能**：文件变更 diff/预览/工作空间浏览器完全保留
- **数据隔离**：流式 artifact 与文件变更使用独立 store，避免模型耦合
- **渐进交付**：分阶段实现（P1 基础框架 → P2 渲染器 → P3 集成 → P4 UI → P5 安全优化）
- **复用现有基础设施**：复用现有 Markdown 渲染管道、Zustand 持久化、SSE 事件流
- **新增依赖**：`dompurify`（HTML/SVG 安全消毒）、`mermaid`（图表渲染，懒加载）、`prismjs` 或复用现有 Monaco Editor（语法高亮）

---

## 二、总体架构

### 2.1 系统定位

新增系统与现有文件变更面板**共存**，用户在同一右侧面板中看到：

- **变更** tab（现有）：`GeneratedFile[]`，文件 diff / 预览
- **内容** tab（新增）：`StreamArtifact[]`，流式解析的内容块渲染
- **浏览器** tab（现有）：工作空间文件树

### 2.2 架构图

```
Gateway SSE Stream
    |
    v
+-----------------------------------------------------------+
|  Chat Store (src/stores/chat.ts)                          |
|  handleChatEvent('delta')                                 |
|  |                                                        |
|  +-> ArtifactParser.append(textDelta)                     |
|       |                                                    |
|       +-> ParseResult { artifacts, plainText }            |
|            |                                               |
|            +-> syncArtifactsToStore()                     |
|                 |                                          |
|                 v                                          |
|            StreamArtifactStore (Zustand)                  |
|            { artifacts[], selectedId, streamingId }       |
|                 |                                          |
|                 v                                          |
|            ArtifactPanel (扩展)                           |
|            +-- tab: 'changes'                             |
|            |   +-- ChangesTab (现有)                      |
|            +-- tab: 'content'                             |
|            |   +-- StreamArtifactView (新增)              |
|            |       +-- StreamArtifactHeader               |
|            |       +-- StreamArtifactContent              |
|            |       |   +-- Renderer (动态选择)            |
|            |       +-- StreamArtifactFooter               |
|            +-- tab: 'browser'                             |
|                +-- BrowserTab (现有)                      |
+-----------------------------------------------------------+
```

---

## 三、数据模型

### 3.1 核心类型

```typescript
// src/lib/artifact/types.ts
export type StreamArtifactType =
  | 'document'
  | 'code'
  | 'html'
  | 'svg'
  | 'mermaid';

export type StreamArtifactStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface StreamArtifact {
  id: string;
  type: StreamArtifactType;
  title: string;
  content: string;
  status: StreamArtifactStatus;
  meta: {
    language?: string;
    filename?: string;
    [key: string]: unknown;
  };
  // position 用于同一消息中多个 artifact 的去重和排序
  // start/end 是相对于原始流文本的字符偏移量
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
```

### 3.2 Store 状态

```typescript
// src/stores/stream-artifact.ts
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
  getArtifactsByType: (type: StreamArtifactType) => StreamArtifact[];
}
```

### 3.3 现有 Store 扩展

```typescript
// src/stores/artifact-panel.ts
// 现有：'changes' | 'preview' | 'browser'
// 扩展为：'changes' | 'preview' | 'content' | 'browser'
export type ArtifactTab = 'changes' | 'preview' | 'content' | 'browser';
// 新增方法：一步打开面板并切换到 content tab，避免中间状态闪烁
openContent: () => void;
// 增加：当检测到新 stream artifact 且面板关闭时，自动打开并切换到 'content' tab
// 注意：'preview' tab（文件预览）完全保留，不受影响
```

---

## 四、流式解析集成

### 4.1 集成点

在 `src/stores/chat.ts` 的 `handleChatEvent` 中注入解析器。由于 `handleChatEvent` 已有 2600+ 行，采用**事件发布模式**最小化侵入：

```typescript
// src/pages/Chat/useArtifactParser.ts
// Hook 封装：订阅 chat store 的流式事件，独立管理 parser 生命周期

export function useArtifactParser() {
  const { addArtifact, updateArtifact, setStreamingArtifact, clearSessionArtifacts } = useStreamArtifactStore();
  const { openContent } = useArtifactPanel();
  const parserRef = useRef<ArtifactParser | null>(null);
  const sessionKeyRef = useRef<string>('');
  
  useEffect(() => {
    // 订阅 chat store 的内部事件
    const unsubscribe = useChatStore.subscribe((state, prevState) => {
      // 检测新流开始
      if (state.sending && !prevState.sending) {
        parserRef.current = new ArtifactParser({
          autoDetectLanguage: true,
          treatCodeBlockAsArtifact: true,
        });
        sessionKeyRef.current = state.currentSessionKey;
      }
      
      // 检测 delta 更新
      if (state.streamingMessage && state.streamingMessage !== prevState.streamingMessage) {
        const textDelta = extractTextDelta(state.streamingMessage, prevState.streamingMessage);
        if (parserRef.current && textDelta) {
          const result = parserRef.current.append(textDelta);
          syncArtifacts(result.artifacts, {
            runId: state.activeRunId,
            messageId: state.streamingMessage.messageId,
            sessionKey: sessionKeyRef.current,
          });
        }
      }
      
      // 检测流结束
      if (!state.sending && prevState.sending && parserRef.current) {
        const result = parserRef.current.finalize();
        syncArtifacts(result.artifacts, {
          runId: state.activeRunId,
          status: 'complete',
          sessionKey: sessionKeyRef.current,
        });
        parserRef.current = null;
      }
      
      // 检测 session 切换
      if (state.currentSessionKey !== prevState.currentSessionKey) {
        clearSessionArtifacts(prevState.currentSessionKey);
      }
    });
    
    return unsubscribe;
  }, []);
  
  function syncArtifacts(
    artifacts: StreamArtifact[],
    ctx: { runId: string | null; messageId?: string; sessionKey: string; status?: StreamArtifactStatus }
  ) {
    artifacts.forEach((art) => {
      // 去重键：使用 position.start + type（同一消息中同位置的同类型视为同一 artifact）
      const key = `${ctx.sessionKey}:${art.position.start}:${art.type}`;
      const existing = useStreamArtifactStore.getState().artifacts.find(
        a => a.messageId === ctx.messageId && a.position.start === art.position.start && a.type === art.type
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
        
        // 自动打开面板并切换到 content tab（仅当面板关闭时）
        if (!useArtifactPanel.getState().open) {
          useArtifactPanel.getState().openContent();
        }
      }
    });
  }
}
```

**对 `chat.ts` 的修改**：仅需在 `handleChatEvent` 中发布一个内部事件（或利用 Zustand 的订阅机制），无需直接嵌入 parser 逻辑。`useArtifactParser` hook 在 `Chat` 页面 mount 时注册，独立处理所有 artifact 相关逻辑。

**数据格式处理**：
- `extractTextDelta` 负责从 `ContentBlock[]` 或 `string` 格式的 `streamingMessage.content` 中提取新增文本片段
- 如果 content 是 `ContentBlock[]`，只处理 `type === 'text'` 的 block，忽略 `thinking`/`tool_use`/`image` 等
- 返回的纯文本（去除 artifact fence 后）不反向写回 chat store，chat store 保留原始内容用于历史记录，UI 层自行过滤 artifact fence

### 4.2 同步策略

```typescript
function syncArtifactsToStore(
  parsedArtifacts: StreamArtifact[],
  ctx: { runId: string; messageId?: string; status?: StreamArtifactStatus }
) {
  parsedArtifacts.forEach((art) => {
    const existing = state.artifacts.find(
      a => a.messageId === ctx.messageId && a.type === art.type
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
        runId: ctx.runId,
        messageId: ctx.messageId,
        status: ctx.status ?? 'streaming',
      });
      
      // 自动打开面板并切换到 content tab（一步到位避免闪烁）
      if (!useArtifactPanel.getState().open) {
        useArtifactPanel.getState().openContent();
      }
    }
  });
}
```

### 4.3 Parser 设计（移植 guada_ai）

基于 guada_ai 的 `ArtifactParser`，适配 ClawX 的 React/Zustand 生态：

```typescript
class ArtifactParser {
  private buffer = '';
  private fenceState: FenceState = { type: 'none' };
  private artifacts: StreamArtifact[] = [];
  private plainTextParts: string[] = [];
  private currentPlainTextStart = 0;
  
  append(chunk: string): ParseResult { ... }
  finalize(): ParseResult { ... }
  reset(): void { ... }
}
```

**状态机**：
- `'none'` → 匹配 `^```artifact\s*(.*)` → `'artifact'`
- `'none'` → 匹配 `^```(\w+)?`（当 treatCodeBlockAsArtifact=true）→ `'code'`
- `'artifact'/'code'` → 匹配 `^```\s*$` → `'none'`（创建 artifact）

**边界处理**：
- 不完整行：`lineEnd === -1` 且 `'none'` 时 break，等待更多 chunk
- 未闭合 fence：`finalize()` 强制关闭并创建 artifact
- 无效 type：`normalizeArtifactType` 返回 null 时 fallback 到 `'document'`

---

## 五、渲染器架构

### 5.1 注册表

```typescript
// src/lib/artifact/registry.ts
class StreamArtifactRendererRegistry {
  private entries = new Map<StreamArtifactType, RendererEntry>();
  register(entry: RendererEntry): void;
  get(type: StreamArtifactType): RendererEntry | undefined;
  has(type: StreamArtifactType): boolean;
}

export const streamArtifactRegistry = new StreamArtifactRendererRegistry();
```

### 5.2 注册时机

在应用启动时（`src/main.tsx` 或 `src/App.tsx`）：

```typescript
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
```

### 5.3 渲染器错误边界

每个渲染器组件包裹独立的 React Error Boundary，防止单个渲染器崩溃导致整个 ArtifactPanel 不可用：

```tsx
// src/components/artifact/renderers/RendererErrorBoundary.tsx
class RendererErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500">
          <h4>渲染失败</h4>
          <pre>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false })}重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 5.4 各渲染器实现

| 渲染器 | 技术 | 安全 |
|--------|------|------|
| **DocumentRenderer** | `ReactMarkdown` + `remarkGfm` | 复用现有 markdown 管道，无 raw HTML |
| **CodeRenderer** | `<pre><code>` + PrismJS 语法高亮 | 纯文本，无 XSS |
| **HtmlRenderer** | `<iframe sandbox="allow-scripts allow-popups">`（无 allow-same-origin） | 沙箱隔离 + DOMPurify 白名单 + CSP meta，1MB 大小限制 |
| **SvgRenderer** | `dangerouslySetInnerHTML`（经过 DOMPurify 消毒后） | 使用 DOMPurify 移除 script/foreignObject/事件处理器，SVG 命名空间安全 |
| **MermaidRenderer** | 运行时 `import('mermaid')` + `mermaid.render()` | 仅 `status='complete'` 时渲染，加载失败显示 fallback |

---

## 六、UI 布局

### 6.1 ArtifactPanel 扩展

```tsx
export function ArtifactPanel({ files, agent, runStartedAt, refreshSignal }) {
  const { tab, open, widthPct } = useArtifactPanel();
  
  if (!open) return null;
  
  return (
    <div className="artifact-panel" style={{ width: `${widthPct}%` }}>
      <TabBar activeTab={tab} onTabChange={setTab} />
      
      {tab === 'changes' && <ChangesTab files={files} ... />}
      {tab === 'content' && <StreamArtifactView />}
      {tab === 'browser' && <BrowserTab agent={agent} ... />}
    </div>
  );
}
```

### 6.2 StreamArtifactView 结构

```tsx
export function StreamArtifactView() {
  const { artifacts, selectedArtifactId } = useStreamArtifactStore();
  const selected = artifacts.find(a => a.id === selectedArtifactId);
  
  if (artifacts.length === 0) {
    return <EmptyState message="暂无内容" />;
  }
  
  return (
    <div className="flex flex-col h-full">
      {selected && <StreamArtifactHeader artifact={selected} />}
      <div className="flex-1 overflow-auto">
        {selected && <StreamArtifactContent artifact={selected} />}
      </div>
      {artifacts.length > 1 && <StreamArtifactFooter artifacts={artifacts} />}
    </div>
  );
}

function StreamArtifactContent({ artifact }) {
  const entry = streamArtifactRegistry.get(artifact.type);
  if (!entry) return <UnsupportedTypeFallback type={artifact.type} />;
  
  const Renderer = entry.component;
  return <Renderer
    artifact={artifact}
    isStreaming={artifact.status === 'streaming'}
  />;
}
```

---

## 七、错误处理

### 7.1 解析错误

| 错误 | 处理 |
|------|------|
| 未闭合 fence | `finalize()` 强制关闭，status='complete' |
| 无效 type | fallback 到 `'document'` |
| 空 content | 不创建 artifact，保留 ``` 标记在纯文本中 |
| 嵌套 fence | 精确匹配 `^```\s*$` 结束行 |

### 7.2 渲染错误

| 错误 | 处理 |
|------|------|
| Mermaid 语法错误 | catch 后显示原始文本 + 错误提示 |
| HTML iframe 加载失败 | 显示"预览加载失败"fallback，提供源码查看 |
| SVG 不含 `<svg>` 标签 | 回退到 CodeRenderer |
| 语法高亮失败 | 无高亮，保留 `<pre><code>` 结构 |

### 7.3 Store 错误

所有 `updateArtifact` / `addArtifact` 操作包裹 try-catch，异常时 `artifact.status = 'error'`，不阻塞其他 artifact。

---

## 八、安全策略

| 渲染器 | 策略 |
|--------|------|
| HTML | `iframe sandbox="allow-scripts allow-popups"`（**移除 allow-same-origin**），DOMPurify 白名单清洗（ALLOWED_TAGS / ALLOWED_ATTR），CSP meta 标签注入，1MB 大小限制 |
| SVG | DOMPurify 清洗后 `dangerouslySetInnerHTML`，移除 script/foreignObject/事件处理器 |
| Markdown | 复用现有 ReactMarkdown 配置，禁用 raw HTML |
| Code | 纯文本展示 |
| Mermaid | 依赖 mermaid 库自身的安全策略，加载失败显示 fallback |

---

## 九、测试策略

### 9.1 单元测试

| 测试文件 | 覆盖范围 |
|----------|----------|
| `tests/unit/artifact-parser.test.ts` | ArtifactParser 状态机、边界情况、增量解析、finalize |
| `tests/unit/stream-artifact-store.test.ts` | Store 的 CRUD、去重、自动 tab 切换 |
| `tests/unit/artifact-renderers.test.tsx` | 各渲染器的渲染输出、错误 fallback |

### 9.2 集成测试

| 场景 | 验证 |
|------|------|
| 流式 delta → 解析 → Store 更新 | artifact 生命周期 streaming → complete |
| ArtifactPanel tab 切换 | 三 tab 渲染和状态保持 |
| 渲染器注册/选择 | 未知类型显示 fallback |

### 9.3 E2E 测试

| 场景 | 验证 |
|------|------|
| 触发 LLM 输出 HTML artifact | 面板自动打开、content tab 激活、iframe 渲染 |
| 多轮对话 artifact 隔离 | 切换 session 后旧 artifact 清除 |

---

## 十、工作量与里程碑

### 10.1 工作量估算

| 阶段 | 内容 | 后端/解析 | 前端渲染/UI | 测试 | 总计 |
|------|------|----------|------------|------|------|
| P1 | 基础框架：types + parser + registry + store | ~200 行 | ~100 行 | ~150 行 | ~450 行 |
| P2 | 渲染器：Document + Code + Html + Svg + Mermaid | — | ~400 行 | ~100 行 | ~500 行 |
| P3 | Chat 集成：handleChatEvent 注入 + hook | ~100 行 | ~80 行 | ~80 行 | ~260 行 |
| P4 | ArtifactPanel 扩展：tab 路由 + StreamArtifactView | — | ~250 行 | ~60 行 | ~310 行 |
| P5 | 安全加固 + 错误处理 + 边界优化 | ~50 行 | ~100 行 | ~100 行 | ~250 行 |
| **合计** | | **~350 行** | **~930 行** | **~490 行** | **~1770 行** |

### 10.2 里程碑

| 里程碑 | 完成标志 | 预计时间 |
|--------|----------|----------|
| M1：解析器就绪 | P1 完成，ArtifactParser 通过全部单元测试 | 第 1 天 |
| M2：渲染器就绪 | P2 完成，5 种渲染器可独立渲染测试数据 | 第 2-3 天 |
| M3：集成完成 | P3 + P4 完成，Chat 流中可自动检测并展示 artifact | 第 4-5 天 |
| M4：安全与优化 | P5 完成，通过安全 review + 边界测试 | 第 6 天 |
| M5：验收 | E2E 通过，用户可实际触发 LLM 输出 artifact | 第 7 天 |

---

## 十一、文件变更清单

### 新增文件（17 个）

```
src/lib/artifact/types.ts
src/lib/artifact/parser.ts
src/lib/artifact/registry.ts
src/stores/stream-artifact.ts
src/components/artifact/StreamArtifactView.tsx
src/components/artifact/StreamArtifactHeader.tsx
src/components/artifact/StreamArtifactFooter.tsx
src/components/artifact/renderers/CodeRenderer.tsx
src/components/artifact/renderers/DocumentRenderer.tsx
src/components/artifact/renderers/HtmlRenderer.tsx
src/components/artifact/renderers/SvgRenderer.tsx
src/components/artifact/renderers/MermaidRenderer.tsx
src/pages/Chat/useArtifactParser.ts
tests/unit/artifact-parser.test.ts
tests/unit/stream-artifact-store.test.ts
tests/unit/artifact-renderers.test.tsx
```

### 修改文件（5 个）

```
src/stores/artifact-panel.ts      # 扩展 tab 类型
src/stores/chat.ts                # handleChatEvent 注入 ArtifactParser
src/components/file-preview/ArtifactPanel.tsx  # 增加 tab 路由 + StreamArtifactView
src/main.tsx 或 App.tsx           # 注册渲染器
```

---

## 十二、参考实现

| 来源 | 文件 | 用途 |
|------|------|------|
| guada_ai | `frontend/src/lib/artifact/parser.ts` | ArtifactParser 状态机算法 |
| guada_ai | `frontend/src/lib/artifact/types.ts` | 类型定义 |
| guada_ai | `frontend/src/lib/artifact/registry.ts` | 渲染器注册表模式 |
| guada_ai | `frontend/src/stores/artifact.ts` | Store 状态管理模式 |
| guada_ai | `frontend/src/composables/useArtifacts.ts` | Parser + Store 桥接模式 |
| guada_ai | `frontend/src/components/artifact/*.vue` | UI 结构和交互参考 |

---

*设计文档完成，等待实现计划。*
