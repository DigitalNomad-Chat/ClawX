/**
 * Agent Chat Page
 * Dedicated chat interface for a specific hired agent
 * Communicates with the independent kernel via kernelClient
 *
 * Features:
 * - ReactMarkdown rendering (GFM, math, code blocks)
 * - Syntax-highlighted code blocks with copy button
 * - Tool call visualization (expandable cards + status bar)
 * - Streaming cursor animation
 * - Auto-resize textarea input
 * - Welcome screen with quick prompts
 * - Message hover actions (copy, timestamp)
 */
import { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Loader2, Wrench, Copy, Check,
  ChevronDown, ChevronRight, Send, Shield,
  Paperclip, X, FileText, Sparkles, Search,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { kernelClient, type KernelEvent } from '@/lib/kernel-client';
import { repairMarkdown } from '@/lib/markdown-repair';

// ── Types ──────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
}

interface ToolCallInfo {
  name: string;
  input: unknown;
  status: 'running' | 'completed' | 'error';
  duration?: number;
  startTime: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallInfo[];
  streaming?: boolean;
  timestamp?: number;
}

interface FileAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64: string;
  status: 'ready' | 'error';
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        reject(new Error(`Empty base64 data for ${file.name}`));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ── Utility: copy to clipboard ─────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Sub-component: Copy Button ─────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={handleCopy}
      title="复制"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

// ── Sub-component: Code Block with copy ────────────────────────────

interface CodeBlockProps {
  language?: string;
  children: React.ReactNode;
}

function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const codeText = typeof children === 'string' ? children : '';

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(codeText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [codeText]);

  return (
    <div className="relative my-2 rounded-lg border bg-muted/50 overflow-hidden">
      {language && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b">
          <span className="text-[11px] font-mono text-muted-foreground uppercase">{language}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} title="复制代码">
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      )}
      <pre className={cn('overflow-x-auto p-3 text-sm', !language && 'pt-3')}>
        <code className="font-mono text-sm">{children}</code>
      </pre>
    </div>
  );
}

// ── Sub-component: Tool Card ───────────────────────────────────────

function ToolCard({ tool }: { tool: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tool.status === 'running';
  const isError = tool.status === 'error';

  return (
    <div className={cn(
      'my-2 rounded-lg border overflow-hidden',
      isRunning && 'border-primary/30 bg-primary/5',
      isError && 'border-destructive/30 bg-destructive/5',
      !isRunning && !isError && 'border-border bg-muted/30',
    )}>
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-muted-foreground hover:text-foreground transition-colors hover:bg-muted/40"
        onClick={() => setExpanded(!expanded)}
      >
        {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
        {!isRunning && !isError && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
        {isError && <Wrench className="h-3.5 w-3.5 text-destructive shrink-0" />}
        <Wrench className="h-3 w-3 shrink-0 opacity-60" />
        <span className="font-mono text-xs font-medium">{tool.name}</span>
        {tool.duration !== undefined && (
          <span className="ml-auto text-[10px] text-muted-foreground">{tool.duration}ms</span>
        )}
        {expanded ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <pre className="rounded-md bg-muted p-2 text-[11px] font-mono overflow-x-auto">
            {tool.input && Object.keys(tool.input).length > 0
              ? JSON.stringify(tool.input, null, 2)
              : '// 无参数'}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: Tool Status Bar ─────────────────────────────────

function ToolStatusBar({ tools }: { tools: ToolCallInfo[] }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 my-1">
      {tools.map((tool, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono border',
            tool.status === 'running' && 'border-primary/30 bg-primary/5 text-primary',
            tool.status === 'completed' && 'border-green-500/30 bg-green-500/5 text-green-600',
            tool.status === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
          )}
        >
          {tool.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
          {tool.status === 'completed' && <Check className="h-3 w-3" />}
          {tool.status === 'error' && <Wrench className="h-3 w-3" />}
          {tool.name}
        </span>
      ))}
    </div>
  );
}

// ── Sub-component: Message Bubble ──────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  agentEmoji: string;
  isStreaming: boolean;
}

const MessageBubble = memo(function MessageBubble({ message, agentEmoji, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isLastAssistant = !isUser && message.streaming && isStreaming;

  // Repair markdown for streaming messages to avoid broken syntax
  const displayContent = (!isUser && message.streaming)
    ? repairMarkdown(message.content)
    : message.content;

  return (
    <div
      className={cn(
        'flex gap-3 group',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-primary/10'
        )}
      >
        {isUser ? '我' : agentEmoji}
      </div>

      {/* Bubble + Tools */}
      <div className={cn('flex flex-col max-w-[80%]', isUser ? 'items-end' : 'items-start')}>
        {/* Tool calls — shown ABOVE text for assistant */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="w-full mb-1">
            <ToolStatusBar tools={message.toolCalls} />
            {message.toolCalls.map((tool, i) => (
              <ToolCard key={i} tool={tool} />
            ))}
          </div>
        )}

        <div
          className={cn(
            'relative rounded-xl px-4 py-2.5 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted border'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: 'html' }]]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !className;
                    if (isInline) {
                      return (
                        <code className="rounded bg-muted-foreground/10 px-1 py-0.5 text-[13px] font-mono" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return <CodeBlock language={match?.[1]}>{children}</CodeBlock>;
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-words"
                      >
                        {children}
                      </a>
                    );
                  },
                  img({ src, alt }) {
                    return (
                      <img
                        src={src}
                        alt={alt || ''}
                        className="max-w-full rounded-lg border max-h-[300px] object-contain my-2"
                        loading="lazy"
                      />
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
              {isLastAssistant && (
                <span className="inline-block h-4 w-0.5 ml-0.5 animate-pulse bg-primary align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Hover actions + timestamp (assistant only) */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={message.content} />
            {message.timestamp && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Sub-component: Welcome Screen ──────────────────────────────────

function WelcomeScreen({ agent, onQuickPrompt }: { agent: AgentInfo; onQuickPrompt: (text: string) => void }) {
  // Pick up to 3 scenarios as quick prompts
  const quickPrompts = agent.scenarios.slice(0, 3);
  // Fallback prompts if no scenarios
  const fallbackPrompts = [
    `介绍一下你自己`,
    `你能帮我做什么？`,
    `开始工作吧`,
  ];
  const prompts = quickPrompts.length > 0 ? quickPrompts : fallbackPrompts;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-4xl">
        {agent.emoji}
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">{agent.name}</h2>
        <p className="text-sm mt-1">{agent.creature} · {agent.vibe}</p>
        <p className="text-xs mt-2 max-w-sm mx-auto">{agent.description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onQuickPrompt(prompt)}
            className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sub-component: Auto-resize Textarea ────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onPaste,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart?: (e: React.CompositionEvent<HTMLTextAreaElement>) => void;
  onCompositionEnd?: (e: React.CompositionEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onPaste={onPaste}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
    />
  );
}

// ── Permission Mode Options ─────────────────────────────────────────

const PERMISSION_MODES = [
  { value: 'default' as const, label: '默认', desc: '读文件等自动通过，执行命令/写文件需审批' },
  { value: 'full_auto' as const, label: '自动', desc: '所有工具自动允许，无需审批' },
  { value: 'plan' as const, label: '计划', desc: '只允许读取操作，禁止执行和写入' },
];

// ── Main Component ─────────────────────────────────────────────────

export function AgentChat() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = (location.state as { from?: string } | null)?.from ?? '/goclaw/marketplace';
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsProviderSetup, setNeedsProviderSetup] = useState(false);
  const [providerInfo, setProviderInfo] = useState<{ name: string; model: string } | null>(null);
  const [initPhase, setInitPhase] = useState<'idle' | 'initializing' | 'ready' | 'error'>('idle');
  const [approvalRequest, setApprovalRequest] = useState<{
    requestId: string;
    tool: string;
    input: unknown;
  } | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [skills, setSkills] = useState<Array<{ id: string; name: string; description: string; category: string }>>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [permissionMode, setPermissionMode] = useState<'default' | 'plan' | 'full_auto'>('default');
  const [permMenuOpen, setPermMenuOpen] = useState(false);
  const { t } = useTranslation('chat');

  // Track how long the current send has been waiting for a response so we can
  // show progressive status messages during long session initialization.
  const [lastUserMessageAt, setLastUserMessageAt] = useState<number | null>(null);
  const [sendElapsedMs, setSendElapsedMs] = useState(0);
  useEffect(() => {
    if (!streaming || !lastUserMessageAt) {
      setSendElapsedMs(0);
      return undefined;
    }
    const update = () => setSendElapsedMs(Date.now() - lastUserMessageAt);
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [streaming, lastUserMessageAt]);

  // Progressive status label shown while waiting for the first response.
  const sessionInitLabel = useMemo(() => {
    if (sendElapsedMs < 5000) return undefined;
    if (sendElapsedMs < 20000) return t('composer.preparingSession');
    if (sendElapsedMs < 60000) return t('composer.sessionInitTakingLong');
    return t('composer.sessionInitStillWorking');
  }, [sendElapsedMs, t]);

  // History states
  const [historySessions, setHistorySessions] = useState<Array<{
    sessionId: string;
    agentId: string;
    agentName: string;
    agentEmoji: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
  }>>([]);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [persistenceSessionId, setPersistenceSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeToolRef = useRef<string | undefined>(undefined);
  const toolStartTimes = useRef<Map<string, number>>(new Map());

  /**
   * 从已加载的历史会话恢复对话
   * 提取到组件级别，供初始化 effect 和侧边栏切换 effect 共用
   */
  const restoreFromSession = useCallback(async (session: typeof historySessions[0]) => {
    setLoading(true);
    setShowHistoryDialog(false);
    setPersistenceSessionId(session.sessionId);
    const restoredMessages: ChatMessage[] = (session.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      timestamp: m.timestamp,
    }));
    setMessages(restoredMessages);

    // Prepare messages for kernel restore (strip extra fields)
    const kernelMessages = restoredMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const result = await kernelClient.restoreSession(agentId!, kernelMessages);
      if (result.success && result.sessionId) {
        setSessionId(result.sessionId);
        setSessionReady(true);
        setInitPhase('ready');
      } else {
        setError(result.error || '恢复会话失败');
        setInitPhase('error');
      }
    } catch (err) {
      setError((err as Error).message || '恢复会话失败');
      setInitPhase('error');
    } finally {
      setLoading(false);
    }
  }, [agentId]);
  const isComposingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-save history when messages change (debounced)
  useEffect(() => {
    if (!persistenceSessionId || !agentId || !agentInfo) return;
    if (messages.length === 0) return;

    const timeout = setTimeout(() => {
      const title = messages.find((m) => m.role === 'user')?.content.slice(0, 30) || `${agentInfo.name} 的对话`;
      kernelClient.saveHistory({
        sessionId: persistenceSessionId,
        agentId,
        agentName: agentInfo.name,
        agentEmoji: agentInfo.emoji,
        title,
        messages,
        createdAt: historySessions.find((s) => s.sessionId === persistenceSessionId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }).catch((err) => console.error('[AgentChat] Auto-save failed:', err));
    }, 2000);

    return () => clearTimeout(timeout);
  }, [messages, persistenceSessionId, agentId, agentInfo]);

  // Load skills list
  useEffect(() => {
    async function loadSkills() {
      try {
        const result = await kernelClient.listSkills();
        if (result.success && result.skills) {
          setSkills(result.skills);
        }
      } catch (err) {
        console.error('[AgentChat] Failed to load skills:', err);
      }
    }
    void loadSkills();
  }, []);

  // Subscribe/unsubscribe kernel events when sessionId changes
  useEffect(() => {
    if (!sessionId) return;

    const handler = (event: KernelEvent) => {
      if (event.sessionId !== sessionId) return;

      switch (event.type) {
        case 'delta.text': {
          const content = event.content as string;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [...prev.slice(0, -1), { ...last, content: last.content + content }];
            }
            return [...prev, {
              role: 'assistant',
              content,
              streaming: true,
              timestamp: Date.now(),
              toolCalls: activeToolRef.current
                ? [{
                    name: activeToolRef.current,
                    input: {},
                    status: 'running',
                    startTime: toolStartTimes.current.get(activeToolRef.current) || Date.now(),
                  }]
                : undefined,
            }];
          });
          break;
        }

        case 'tool.started': {
          const toolName = event.tool as string;
          activeToolRef.current = toolName;
          toolStartTimes.current.set(toolName, Date.now());
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              const existing = last.toolCalls || [];
              const already = existing.find((t) => t.name === toolName && t.status === 'running');
              if (already) return prev;
              return [...prev.slice(0, -1), {
                ...last,
                toolCalls: [...existing, {
                  name: toolName,
                  input: event.input || {},
                  status: 'running',
                  startTime: Date.now(),
                }],
              }];
            }
            // No streaming assistant message exists (e.g. tool call without preceding text)
            // Create a new assistant message to hold the tool call
            return [...prev, {
              role: 'assistant',
              content: '',
              streaming: true,
              timestamp: Date.now(),
              toolCalls: [{
                name: toolName,
                input: event.input || {},
                status: 'running',
                startTime: Date.now(),
              }],
            }];
          });
          break;
        }

        case 'tool.completed': {
          const completedTool = event.tool as string;
          const startTime = toolStartTimes.current.get(completedTool);
          activeToolRef.current = undefined;
          setMessages((prev) => {
            // Find the last assistant message (streaming or not) that has this tool
            for (let i = prev.length - 1; i >= 0; i--) {
              const msg = prev[i];
              if (msg.role === 'assistant' && msg.toolCalls) {
                const hasTool = msg.toolCalls.some((t) => t.name === completedTool && t.status === 'running');
                if (hasTool) {
                  const updatedTools = msg.toolCalls.map((t) => {
                    if (t.name === completedTool && t.status === 'running') {
                      return {
                        ...t,
                        status: 'completed' as const,
                        duration: startTime ? Date.now() - startTime : undefined,
                      };
                    }
                    return t;
                  });
                  const updated = { ...msg, toolCalls: updatedTools };
                  return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
                }
              }
            }
            // Tool completed without a matching started message — create a completed entry
            return [...prev, {
              role: 'assistant',
              content: '',
              streaming: true,
              timestamp: Date.now(),
              toolCalls: [{
                name: completedTool,
                input: {},
                status: 'completed',
                startTime: startTime || Date.now(),
                duration: startTime ? Date.now() - startTime : undefined,
              }],
            }];
          });
          break;
        }

        case 'turn.complete':
        case 'session.completed': {
          activeToolRef.current = undefined;
          toolStartTimes.current.clear();
          setStreaming(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              // Mark all running tools as completed
              const finalizedTools = (last.toolCalls || []).map((t) =>
                t.status === 'running'
                  ? { ...t, status: 'completed' as const, duration: Date.now() - t.startTime }
                  : t
              );
              return [...prev.slice(0, -1), { ...last, streaming: false, toolCalls: finalizedTools }];
            }
            // If the last assistant message is already non-streaming but has running tools,
            // also finalize them (handles fast tool calls that completed before turn.complete)
            if (last && last.role === 'assistant' && last.toolCalls) {
              const hasRunning = last.toolCalls.some((t) => t.status === 'running');
              if (hasRunning) {
                const finalizedTools = last.toolCalls.map((t) =>
                  t.status === 'running'
                    ? { ...t, status: 'completed' as const, duration: Date.now() - t.startTime }
                    : t
                );
                return [...prev.slice(0, -1), { ...last, toolCalls: finalizedTools }];
              }
            }
            return prev;
          });
          break;
        }

        case 'error': {
          const errorMsg = (event.message as string) || '未知错误';
          setStreaming(false);
          activeToolRef.current = undefined;
          toolStartTimes.current.clear();
          const isAuthError = /No API key|401|authentication|invalid.*key|unauthorized/i.test(errorMsg);
          if (isAuthError) setNeedsProviderSetup(true);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, streaming: false },
                { role: 'assistant', content: isAuthError ? `[错误] ${errorMsg}\n\n请前往「应用广场」配置您的API密钥。` : `[错误] ${errorMsg}`, timestamp: Date.now() },
              ];
            }
            return [
              ...prev,
              { role: 'assistant', content: isAuthError ? `[错误] ${errorMsg}\n\n请前往「应用广场」配置您的API密钥。` : `[错误] ${errorMsg}`, timestamp: Date.now() },
            ];
          });
          break;
        }

        case 'approval.request': {
          setApprovalRequest({
            requestId: event.requestId as string,
            tool: event.tool as string,
            input: event.input,
          });
          break;
        }

        default:
          break;
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on('kernel:event', handler as (...args: unknown[]) => void);
    window.electron.ipcRenderer.invoke('kernel:subscribe', sessionId).catch(console.error);
    setSessionReady(true);
    setInitPhase('ready');

    return () => {
      (unsubscribe as () => void)();
      window.electron.ipcRenderer.invoke('kernel:unsubscribe', sessionId).catch(() => {});
    };
  }, [sessionId]);

  // Initialize: load agent info, check provider, handle history restore
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        const infoResult = await window.electron.ipcRenderer.invoke(
          'marketplace:getAgent',
          agentId
        ) as { success: boolean; agent?: AgentInfo; error?: string };

        if (cancelled) return;

        if (infoResult.success && infoResult.agent) {
          setAgentInfo(infoResult.agent);
        } else {
          setError(infoResult.error || 'Agent 未找到');
          return;
        }

        const checkResult = await window.electron.ipcRenderer.invoke(
          'kernel-llm:checkActive'
        ) as { success: boolean; error?: string; providerName?: string; model?: string; needsSetup?: boolean };

        if (cancelled) return;

        if (!checkResult.success) {
          setError(checkResult.error || 'AI服务商未配置');
          setNeedsProviderSetup(!!checkResult.needsSetup);
          return;
        }

        setProviderInfo({ name: checkResult.providerName || '', model: checkResult.model || '' });

        // Query history for this agent
        const histResult = await kernelClient.listHistory(agentId);
        if (cancelled) return;

        if (histResult.success && histResult.sessions && histResult.sessions.length > 0) {
          setHistorySessions(histResult.sessions as typeof historySessions);

          // If navigated with a specific restoreSessionId, restore it directly
          const restoreId = (location.state as { restoreSessionId?: string } | null)?.restoreSessionId;
          if (restoreId) {
            const session = histResult.sessions.find((s) => s.sessionId === restoreId);
            if (session) {
              await restoreFromSession(session as typeof historySessions[0]);
              return;
            }
          }

          // Show history choice dialog
          setShowHistoryDialog(true);
        } else {
          // No history — start fresh
          await startNewSession();
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[AgentChat] Init failed:', err);
          setError((err as Error).message || '初始化失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function startNewSession() {
      setInitPhase('initializing');
      try {
        const hireResult = await window.electron.ipcRenderer.invoke('marketplace:hireAgent', agentId) as {
          success: boolean; sessionId?: string; error?: string;
        };
        if (cancelled) return;
        if (hireResult.success && hireResult.sessionId) {
          setSessionId(hireResult.sessionId);
          setPersistenceSessionId(hireResult.sessionId);
        } else {
          setInitPhase('idle');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[AgentChat] Pre-hire failed:', err);
          setInitPhase('idle');
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [agentId]);

  /**
   * 监听侧边栏历史会话切换
   * 同一 Agent 下切换不同历史会话时 URL 不变（/goclaw/chat/:agentId），
   * 仅 location.state 变化，因此需要单独监听
   */
  useEffect(() => {
    if (!agentId) return;
    const restoreId = (location.state as { restoreSessionId?: string } | null)?.restoreSessionId;
    if (!restoreId || historySessions.length === 0) return;

    // 如果当前 persistenceSessionId 已经是目标 session，则无需重复恢复
    if (persistenceSessionId === restoreId) return;

    const session = historySessions.find((s) => s.sessionId === restoreId);
    if (session) {
      restoreFromSession(session);
    }
  }, [location.state, historySessions, agentId, persistenceSessionId, restoreFromSession]);

  async function respondApproval(approved: boolean, autoApprove = false) {
    if (!approvalRequest) return;
    const reqId = approvalRequest.requestId;
    setApprovalRequest(null);
    try {
      await window.electron.ipcRenderer.invoke('kernel:approvalRespond', reqId, approved, autoApprove);
    } catch (err) {
      console.error('[AgentChat] approval respond failed:', err);
    }
  }

  async function sendMessage(textOverride?: string) {
    const text = textOverride ?? input.trim();
    const readyAttachments = attachments.filter((a) => a.status === 'ready');
    if ((!text && readyAttachments.length === 0) || !agentId || streaming) return;

    if (needsProviderSetup) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text || '[文件附件]', timestamp: Date.now() },
        { role: 'assistant', content: '⚠️ 请先配置AI服务商的API密钥，然后再发送消息。', timestamp: Date.now() },
      ]);
      if (!textOverride) setInput('');
      return;
    }

    if (!textOverride) setInput('');
    setStreaming(true);
    setLastUserMessageAt(Date.now());
    setError(null);

    setMessages((prev) => [...prev, { role: 'user', content: text || '[文件附件]', timestamp: Date.now() }]);

    try {
      let sid = sessionId;
      if (!sid) {
        const hireResult = await window.electron.ipcRenderer.invoke(
          'marketplace:hireAgent',
          agentId
        ) as { success: boolean; sessionId?: string; error?: string };

        if (!hireResult.success || !hireResult.sessionId) {
          setStreaming(false);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `[激活失败] ${hireResult.error || '未知错误'}`, timestamp: Date.now() },
          ]);
          return;
        }

        sid = hireResult.sessionId;
        setSessionId(sid);
        setPersistenceSessionId(sid);
      }

      // Stage attachments to session workspace
      let stagedAttachments: Array<{ fileName: string; stagedPath: string; mimeType: string; fileSize: number }> | undefined;
      if (readyAttachments.length > 0) {
        const stageResult = await kernelClient.stageFiles(
          sid,
          readyAttachments.map((a) => ({ fileName: a.fileName, mimeType: a.mimeType, base64: a.base64 }))
        );
        if (stageResult.success && stageResult.staged) {
          stagedAttachments = stageResult.staged;
        } else {
          console.error('[AgentChat] Stage files failed:', stageResult.error);
        }
      }

      setAttachments([]);

      const result = await kernelClient.sendChat(sid, agentId, text, stagedAttachments, selectedSkill || undefined, permissionMode);

      if (!result.success) {
        setStreaming(false);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `[发送失败] ${result.error || '未知错误'}`, timestamp: Date.now() },
        ]);
      }
    } catch (err) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `[通信错误] ${(err as Error).message}`, timestamp: Date.now() },
      ]);
    }
  }

  // ── File attachment handlers ───────────────────────────────────────

  const stageBufferFiles = useCallback(async (files: globalThis.File[]) => {
    for (const file of files) {
      try {
        const base64 = await readFileAsBase64(file);
        setAttachments((prev) => [...prev, {
          id: crypto.randomUUID(),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          base64,
          status: 'ready',
        }]);
      } catch (err) {
        console.error('[AgentChat] stageBuffer error:', err);
        setAttachments((prev) => [...prev, {
          id: crypto.randomUUID(),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          base64: '',
          status: 'error',
          error: String(err),
        }]);
      }
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: globalThis.File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      void stageBufferFiles(pastedFiles);
    }
  }, [stageBufferFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      void stageBufferFiles(Array.from(e.dataTransfer.files));
    }
  }, [stageBufferFiles]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      sendMessage();
    }
  }, [input, streaming, agentId, needsProviderSetup, sessionId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">正在初始化 Agent...</span>
      </div>
    );
  }

  if (error && !agentInfo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate(returnPath)}>
          返回广场
        </Button>
      </div>
    );
  }

  if (!agentInfo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Agent 未找到</p>
        <Button variant="outline" onClick={() => navigate(returnPath)}>
          返回广场
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn('relative flex h-full flex-col', dragOver && 'ring-2 ring-primary/30')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(returnPath)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xl">
          {agentInfo.emoji}
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold truncate">{agentInfo.name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {agentInfo.creature} · {agentInfo.nickname}
          </p>
        </div>
        {sessionReady && initPhase === 'ready' ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-600 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            已连接{providerInfo ? ` · ${providerInfo.model}` : ''}
          </span>
        ) : needsProviderSetup ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-red-500 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            未配置服务商
          </span>
        ) : initPhase === 'initializing' ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-600 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            正在初始化...
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-xs text-yellow-600 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            待激活
          </span>
        )}
      </div>

      {/* History restore dialog */}
      {showHistoryDialog && historySessions.length > 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">发现历史对话</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              您与 {agentInfo.name} 有过以下对话，请选择：
            </p>
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {historySessions.slice(0, 3).map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => {
                    setShowHistoryDialog(false);
                    const restoredMessages: ChatMessage[] = (session.messages || []).map((m) => ({
                      role: m.role,
                      content: m.content,
                      toolCalls: m.toolCalls,
                      timestamp: m.timestamp,
                    }));
                    setMessages(restoredMessages);
                    setPersistenceSessionId(session.sessionId);
                    const kernelMessages = restoredMessages.map((m) => ({
                      role: m.role,
                      content: m.content,
                    }));
                    setLoading(true);
                    kernelClient.restoreSession(agentId!, kernelMessages)
                      .then((result) => {
                        if (result.success && result.sessionId) {
                          setSessionId(result.sessionId);
                          setSessionReady(true);
                          setInitPhase('ready');
                        } else {
                          setError(result.error || '恢复会话失败');
                          setInitPhase('error');
                        }
                      })
                      .catch((err) => {
                        setError((err as Error).message || '恢复会话失败');
                        setInitPhase('error');
                      })
                      .finally(() => setLoading(false));
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <span className="text-xl">{session.agentEmoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{session.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleDateString('zh-CN')} · {session.messages.length} 条消息
                    </p>
                  </div>
                  <span className="text-xs text-primary font-medium">继续</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                setShowHistoryDialog(false);
                // Start new session
                setInitPhase('initializing');
                window.electron.ipcRenderer.invoke('marketplace:hireAgent', agentId)
                  .then((hireResult) => {
                    const hr = hireResult as { success: boolean; sessionId?: string; error?: string };
                    if (hr.success && hr.sessionId) {
                      setSessionId(hr.sessionId);
                      setPersistenceSessionId(hr.sessionId);
                    } else {
                      setInitPhase('idle');
                    }
                  })
                  .catch((err) => {
                    console.error('[AgentChat] Pre-hire failed:', err);
                    setInitPhase('idle');
                  });
              }}>
                开始新对话
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && !showHistoryDialog && (
          <WelcomeScreen
            agent={agentInfo}
            onQuickPrompt={(text) => sendMessage(text)}
          />
        )}
        {messages.map((msg, index) => (
          <MessageBubble
            key={index}
            message={msg}
            agentEmoji={agentInfo.emoji}
            isStreaming={streaming}
          />
        ))}
        {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">
              {sessionInitLabel ?? `${agentInfo.name} ${t('executionGraph.thinkingLabel')}...`}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Approval Dialog */}
      {approvalRequest && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">需要您的确认</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Agent 请求执行以下操作：
            </p>
            <div className="mt-3 rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">工具：{approvalRequest.tool}</p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground font-mono">
                {JSON.stringify(approvalRequest.input, null, 2)}
              </pre>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span>此工具需要您的确认后才能执行。您可以选择仅允许本次，或在本会话中始终允许此工具。</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => respondApproval(false)}>
                  拒绝
                </Button>
                <Button variant="secondary" size="sm" onClick={() => respondApproval(true, true)}>
                  始终允许
                </Button>
                <Button size="sm" onClick={() => respondApproval(true)}>
                  允许
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provider setup guidance */}
      {needsProviderSetup && (
        <div className="border-t bg-blue-50 px-4 py-3 text-sm dark:bg-blue-950/30 shrink-0">
          <p className="font-medium text-blue-800 dark:text-blue-200">AI服务商未配置</p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            请先配置API密钥后再与Agent对话
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => navigate(returnPath)}
          >
            前往配置
          </Button>
        </div>
      )}

      {/* Error bar */}
      {error && agentInfo && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive shrink-0">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t px-4 py-3 shrink-0">
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachments.map((att) => (
              <div
                key={att.id}
                className={cn(
                  'group relative flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                  att.status === 'error' ? 'border-destructive bg-destructive/5' : 'border-border bg-muted/50'
                )}
              >
                {att.mimeType.startsWith('image/') ? (
                  <img src={`data:${att.mimeType};base64,${att.base64}`} alt={att.fileName} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium max-w-[120px]">{att.fileName}</p>
                  <p className="text-[10px] text-muted-foreground">{formatFileSize(att.fileSize)}</p>
                </div>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="rounded-full p-0.5 hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Permission mode & Skill selector */}
        <div className="flex items-start gap-2 mb-2">
          {/* Permission mode selector */}
          <div className="relative">
            <button
              onClick={() => { setPermMenuOpen((v) => !v); setSkillMenuOpen(false); }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                permissionMode !== 'default'
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <Shield className="h-3 w-3" />
              {PERMISSION_MODES.find((m) => m.value === permissionMode)?.label || '默认'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', permMenuOpen && 'rotate-180')} />
            </button>
            {permMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPermMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-1 z-50 w-64 rounded-lg border bg-background shadow-lg p-1.5">
                  {PERMISSION_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => { setPermissionMode(mode.value); setPermMenuOpen(false); }}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                        permissionMode === mode.value ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex-1 text-left">
                        <div className="font-medium">{mode.label}</div>
                        <div className="text-[10px] text-muted-foreground">{mode.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Skill selector */}
          {skills.length > 0 && (
          <div className="relative">
            <button
              onClick={() => { setSkillMenuOpen((v) => !v); setPermMenuOpen(false); }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                selectedSkill
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <Sparkles className="h-3 w-3" />
              {selectedSkill
                ? skills.find((s) => s.id === selectedSkill)?.name || '技能'
                : '选择技能'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', skillMenuOpen && 'rotate-180')} />
            </button>
            {skillMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setSkillMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-1 z-50 w-72 rounded-lg border bg-background shadow-lg p-2 max-h-80 overflow-y-auto">
                  {/* Search input */}
                  <div className="sticky top-0 bg-background pb-1.5 mb-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={skillSearch}
                        onChange={(e) => setSkillSearch(e.target.value)}
                        placeholder="搜索技能..."
                        className="w-full rounded-md border bg-muted/50 pl-7 pr-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      {skillSearch && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSkillSearch(''); }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedSkill(null); setSkillMenuOpen(false); setSkillSearch(''); }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                      !selectedSkill ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <span className="flex-1 text-left">无技能</span>
                  </button>
                  {(() => {
                    const q = skillSearch.trim().toLowerCase();
                    const filtered = q
                      ? skills.filter((s) =>
                          s.name.toLowerCase().includes(q) ||
                          s.description.toLowerCase().includes(q) ||
                          s.category.toLowerCase().includes(q)
                        )
                      : skills;
                    if (filtered.length === 0) {
                      return (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">
                          未找到匹配的技能
                        </div>
                      );
                    }
                    return filtered.map((skill) => (
                      <button
                        key={skill.id}
                        onClick={() => { setSelectedSkill(skill.id); setSkillMenuOpen(false); setSkillSearch(''); }}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                          selectedSkill === skill.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                        )}
                      >
                        <div className="flex-1 text-left">
                          <div className="font-medium">{skill.name}</div>
                          <div className="text-[10px] text-muted-foreground line-clamp-1">{skill.description}</div>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{skill.category}</span>
                      </button>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <AutoResizeTextarea
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onPaste={handlePaste}
            placeholder={dragOver ? '释放文件以上传' : `向 ${agentInfo.name} 发送消息...`}
            disabled={streaming}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void stageBufferFiles(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            title="上传文件"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            disabled={(!input.trim() && attachments.length === 0) || streaming}
            onClick={() => sendMessage()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
