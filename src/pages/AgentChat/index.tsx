/**
 * Agent Chat Page
 * Dedicated chat interface for a specific hired agent
 * Communicates with the independent kernel via kernelClient
 */
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { kernelClient, type KernelEvent } from '@/lib/kernel-client';

interface AgentInfo {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Active tool call (if any) */
  activeTool?: string;
  /** Whether the message is still streaming */
  streaming?: boolean;
}

export function AgentChat() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeToolRef = useRef<string | undefined>(undefined);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // DEBUG: log messages state changes
  useEffect(() => {
    console.log('[AgentChat] messages updated, count=', messages.length, messages.map(m => ({ role: m.role, content: m.content.slice(0, 30), streaming: m.streaming })));
  }, [messages]);

  // Subscribe/unsubscribe kernel events when sessionId changes
  // NOTE: Directly use window.electron.ipcRenderer.on/off instead of kernelClient
  // to avoid the subscription wrapper mismatch bug in kernelClient.teardownIpc()
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
            return [...prev, { role: 'assistant', content, streaming: true, activeTool: activeToolRef.current }];
          });
          break;
        }

        case 'tool.started': {
          const toolName = event.tool as string;
          activeToolRef.current = toolName;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [...prev.slice(0, -1), { ...last, activeTool: toolName }];
            }
            return prev;
          });
          break;
        }

        case 'tool.completed': {
          activeToolRef.current = undefined;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [...prev.slice(0, -1), { ...last, activeTool: undefined }];
            }
            return prev;
          });
          break;
        }

        case 'turn.complete':
        case 'session.completed': {
          activeToolRef.current = undefined;
          setStreaming(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [...prev.slice(0, -1), { ...last, streaming: false, activeTool: undefined }];
            }
            return prev;
          });
          break;
        }

        case 'error': {
          const errorMsg = (event.message as string) || '未知错误';
          setStreaming(false);
          const isAuthError = /No API key|401|authentication|invalid.*key|unauthorized/i.test(errorMsg);
          if (isAuthError) setNeedsProviderSetup(true);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, streaming: false, activeTool: undefined },
                { role: 'assistant', content: isAuthError ? `[错误] ${errorMsg}\n\n请前往「Agent 广场」配置您的API密钥。` : `[错误] ${errorMsg}` },
              ];
            }
            return [
              ...prev,
              { role: 'assistant', content: isAuthError ? `[错误] ${errorMsg}\n\n请前往「Agent 广场」配置您的API密钥。` : `[错误] ${errorMsg}` },
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

  // Initialize: 只加载 agent info，不创建 session（延迟到首次发送）
  useEffect(() => {
    if (!agentId) return;

    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // 只加载 agent 信息（manifest 数据，内核仅需快速启动）
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

        // Pre-check: verify AI provider is configured (independent kernel LLM store)
        const checkResult = await window.electron.ipcRenderer.invoke(
          'kernel-llm:checkActive'
        ) as { success: boolean; error?: string; providerName?: string; model?: string; needsSetup?: boolean };

        if (cancelled) return;

        if (!checkResult.success) {
          setError(checkResult.error || 'AI服务商未配置');
          setNeedsProviderSetup(!!checkResult.needsSetup);
        } else {
          setProviderInfo({ name: checkResult.providerName || '', model: checkResult.model || '' });
          setInitPhase('initializing');

          // 后台预启动内核并 hire agent（将冷启动成本从"发送时"转移到"页面加载时"）
          window.electron.ipcRenderer.invoke('marketplace:hireAgent', agentId)
            .then((hireResult) => {
              if (cancelled) return;
              const hr = hireResult as { success: boolean; sessionId?: string; error?: string };
              if (hr.success && hr.sessionId) {
                setSessionId(hr.sessionId);
              } else {
                setInitPhase('idle');
              }
            })
            .catch((err) => {
              if (!cancelled) {
                console.error('[AgentChat] Pre-hire failed:', err);
                setInitPhase('idle');
              }
            });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[AgentChat] Init failed:', err);
          setError((err as Error).message || '初始化失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  /**
   * Respond to a pending approval request from the permission checker.
   */
  async function respondApproval(approved: boolean) {
    if (!approvalRequest) return;
    const reqId = approvalRequest.requestId;
    setApprovalRequest(null);
    try {
      await window.electron.ipcRenderer.invoke('kernel:approvalRespond', reqId, approved);
    } catch (err) {
      console.error('[AgentChat] approval respond failed:', err);
    }
  }

  /**
   * Send a chat message to the agent.
   * If no session exists, first initialize: load config → create session → subscribe.
   */
  async function sendMessage() {
    if (!input.trim() || !agentId || streaming) return;

    // Block sending if provider is not configured (pre-flight check failed)
    if (needsProviderSetup) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: input.trim() },
        { role: 'assistant', content: '⚠️ 请先配置AI服务商的API密钥，然后再发送消息。' },
      ]);
      setInput('');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setStreaming(true);
    setError(null);

    // Add user message to UI
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      // 首次发送：按需初始化 session（hire + subscribe）
      let sid = sessionId;
      if (!sid) {
        // Hire agent (内核此时才按需加载 Agent 配置)
        const hireResult = await window.electron.ipcRenderer.invoke(
          'marketplace:hireAgent',
          agentId
        ) as { success: boolean; sessionId?: string; error?: string };

        if (!hireResult.success || !hireResult.sessionId) {
          setStreaming(false);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `[激活失败] ${hireResult.error || '未知错误'}` },
          ]);
          return;
        }

        sid = hireResult.sessionId;
        setSessionId(sid);
        // sessionId useEffect 会自动处理订阅和 setSessionReady
      }

      // 发送消息
      const result = await kernelClient.sendChat(sid, agentId, userMessage);

      if (!result.success) {
        setStreaming(false);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `[发送失败] ${result.error || '未知错误'}` },
        ]);
      }
      // Streaming response will be handled by useEffect handler
    } catch (err) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `[通信错误] ${(err as Error).message}` },
      ]);
    }
  }

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
        <Button variant="outline" onClick={() => navigate('/marketplace')}>
          返回广场
        </Button>
      </div>
    );
  }

  if (!agentInfo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Agent 未找到</p>
        <Button variant="outline" onClick={() => navigate('/marketplace')}>
          返回广场
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/marketplace')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xl">
          {agentInfo.emoji}
        </div>
        <div>
          <h1 className="font-semibold">{agentInfo.name}</h1>
          <p className="text-xs text-muted-foreground">
            {agentInfo.creature} · {agentInfo.nickname}
          </p>
        </div>
        {sessionReady && initPhase === 'ready' ? (
          <span className="ml-auto text-xs text-green-600">● 已连接{providerInfo ? ` · ${providerInfo.model}` : ''}</span>
        ) : needsProviderSetup ? (
          <span className="ml-auto text-xs text-red-500">● 未配置服务商</span>
        ) : initPhase === 'initializing' ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            正在初始化...
          </span>
        ) : (
          <span className="ml-auto text-xs text-yellow-600">● 待激活</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Bot className="h-10 w-10" />
            <p>开始与 {agentInfo.name} 对话</p>
            <p className="text-xs">Agent 已准备就绪，请输入您的问题</p>
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={cn(
              'flex gap-3',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10'
              )}
            >
              {msg.role === 'user' ? '我' : agentInfo.emoji}
            </div>
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-4 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              {msg.streaming && (
                <span className="inline-block h-4 w-1 animate-pulse bg-current" />
              )}
              {msg.activeTool && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Wrench className="h-3 w-3" />
                  <span>使用工具: {msg.activeTool}</span>
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{agentInfo.name} 思考中...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Approval Dialog */}
      {approvalRequest && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">需要您的确认</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Agent 请求执行以下操作：
            </p>
            <div className="mt-3 rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">工具：{approvalRequest.tool}</p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(approvalRequest.input, null, 2)}
              </pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => respondApproval(false)}>
                拒绝
              </Button>
              <Button onClick={() => respondApproval(true)}>允许</Button>
            </div>
          </div>
        </div>
      )}

      {/* Provider setup guidance */}
      {needsProviderSetup && (
        <div className="border-t bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30">
          <p className="font-medium text-amber-800 dark:text-amber-200">AI服务商未配置</p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            请先配置API密钥后再与Agent对话
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => navigate('/marketplace')}
          >
            前往配置
          </Button>
        </div>
      )}

      {/* Error bar */}
      {error && agentInfo && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t pt-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={`向 ${agentInfo.name} 发送消息...`}
            className="min-h-[60px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            rows={2}
            disabled={streaming}
          />
          <Button
            className="self-end"
            disabled={!input.trim() || streaming}
            onClick={sendMessage}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
