/**
 * GoClaw - 我的 Agent 管理页面
 * 列出、编辑、删除用户自定义的 Agent
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Pencil, Trash2, MessageCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { kernelClient, AgentInfo } from '@/lib/kernel-client';
import { cn } from '@/lib/utils';

export function MyAgents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAgents() {
    setLoading(true);
    try {
      const result = await kernelClient.listCustomAgents();
      if (result.success && result.agents) {
        setAgents(result.agents);
      } else {
        setAgents([]);
      }
    } catch (err) {
      console.error('[MyAgents] Failed to load custom agents:', err);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAgents();
  }, []);

  async function handleDelete(agentId: string) {
    const confirmed = window.confirm('确定删除这个自定义 Agent？此操作不可恢复。');
    if (!confirmed) return;

    try {
      const result = await kernelClient.deleteCustomAgent(agentId);
      if (result.success) {
        await loadAgents();
      } else {
        console.error('[MyAgents] Delete failed:', result.error);
      }
    } catch (err) {
      console.error('[MyAgents] Failed to delete agent:', err);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">我的 Agent</h1>
            <p className="text-sm text-muted-foreground">
              管理您创建的自定义 Agent
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/goclaw/custom-agent/new')}
        >
          <Plus className="h-4 w-4 mr-1" />
          创建 Agent
        </Button>
      </div>

      {/* Agent Grid */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          加载中...
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Search className="h-8 w-8" />
          <p>暂无自定义 Agent，点击右上角创建</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={cn(
                'group relative flex flex-col rounded-xl p-5 transition-all',
                'border bg-card hover:shadow-md hover:border-primary/30'
              )}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl h-11 w-11">
                  {agent.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{agent.creature}</p>
                </div>
              </div>

              {/* Description */}
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                {agent.description}
              </p>

              {/* Tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {agent.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-auto pt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="flex-1"
                  onClick={() => navigate(`/goclaw/chat/${agent.id}`)}
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  雇佣
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/goclaw/custom-agent/${agent.id}/edit`)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(agent.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
