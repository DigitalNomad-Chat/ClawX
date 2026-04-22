/**
 * Agent Marketplace Page
 * Browse, search, and hire pre-built agents
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Store, Sparkles, Users, PenTool, Zap, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LlmConfigSection } from './LlmConfigSection';

interface AgentCardData {
  id: string;
  name: string;
  nickname: string;
  emoji: string;
  creature: string;
  vibe: string;
  description: string;
  tags: string[];
  scenarios: string[];
  version: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  管理: <Briefcase className="h-4 w-4" />,
  创作: <PenTool className="h-4 w-4" />,
  运营: <Sparkles className="h-4 w-4" />,
  效率: <Zap className="h-4 w-4" />,
  通用: <Users className="h-4 w-4" />,
};

const CATEGORIES = ['全部', '管理', '创作', '运营', '效率'];

export function Marketplace() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentCardData | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    try {
      setLoading(true);
      // Use IPC to get agents from kernel
      const result = await window.electron.ipcRenderer.invoke('marketplace:listAgents') as { success: boolean; agents?: AgentCardData[]; error?: string };
      if (result.success) {
        setAgents(result.agents || []);
      } else {
        console.error('Failed to load agents:', result.error);
        // Fallback: load from static manifest for development
        setAgents([
          {
            id: 'hr-manager',
            name: '小H',
            nickname: 'HR',
            emoji: '👔',
            creature: '团队管理者',
            vibe: '专业、严谨、可靠',
            description: 'Agent团队的人事经理，负责整个团队的全生命周期管理。把每个Agent都看作公司的一员，认真对待每一次"招聘"、"培训"和"解聘"。',
            tags: ['管理', '巡检'],
            scenarios: ['Agent创建', '配置优化', '资源清理', '定期巡检'],
            version: '1.0.0',
          },
          {
            id: 'moments-assistant',
            name: '小圈',
            nickname: 'MOMENTS',
            emoji: '✨',
            creature: '朋友圈文案专家',
            vibe: '温暖、专业、有洞察',
            description: '朋友圈文案创作专家，专注于帮助用户打造有温度、有深度、有价值的朋友圈形象。',
            tags: ['创作', '运营'],
            scenarios: ['商业推广', '职场IP', '生活分享'],
            version: '1.0.0',
          },
        ]);
      }
    } catch (err) {
      console.error('Error loading agents:', err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 雇佣 Agent — 纯 UI 跳转，不触发 IPC
   * Agent 配置在首次对话时按需加载（lazy-load）
   */
  function hireAgent(agentId: string) {
    navigate(`/agent-chat/${agentId}`);
  }

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesSearch =
        !searchQuery ||
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        activeCategory === '全部' || agent.tags.includes(activeCategory);

      return matchesSearch && matchesCategory;
    });
  }, [agents, searchQuery, activeCategory]);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Store className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Agent 广场</h1>
          <p className="text-sm text-muted-foreground">
            选择并雇佣专业的 Agent，让 AI 为您工作
          </p>
        </div>
      </div>

      {/* AI Model Config */}
      <LlmConfigSection />

      {/* Search & Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索 Agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Agent Grid */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          加载中...
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Search className="h-8 w-8" />
          <p>未找到匹配的 Agent</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent)}
              onHire={() => hireAgent(agent.id)}
            />
          ))}
        </div>
      )}

      {/* Agent Detail Dialog */}
      {selectedAgent && (
        <AgentDetailDialog
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onHire={() => hireAgent(selectedAgent.id)}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onClick,
  onHire,
}: {
  agent: AgentCardData;
  onClick: () => void;
  onHire: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-5 transition-all',
        'hover:shadow-md hover:border-primary/30 cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl">
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">{agent.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{agent.creature}</p>
        </div>
      </div>

      {/* Description */}
      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Scenarios */}
      <div className="mt-2 flex flex-wrap gap-1">
        {agent.scenarios.slice(0, 3).map((scenario) => (
          <span
            key={scenario}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {CATEGORY_ICONS[scenario] || <Sparkles className="h-3 w-3" />}
            {scenario}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">v{agent.version}</span>
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onHire();
          }}
        >
          雇佣
        </Button>
      </div>
    </div>
  );
}

function AgentDetailDialog({
  agent,
  onClose,
  onHire,
}: {
  agent: AgentCardData;
  onClose: () => void;
  onHire: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-4xl">
            {agent.emoji}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">
              {agent.name} / {agent.nickname}
            </h2>
            <p className="text-sm text-muted-foreground">
              {agent.creature} · {agent.vibe}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">角色简介</h3>
          <p className="mt-1 text-sm">{agent.description}</p>
        </div>

        {/* Scenarios */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">擅长场景</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {agent.scenarios.map((scenario) => (
              <Badge key={scenario} variant="outline">
                {scenario}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">标签</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {agent.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Version */}
        <div className="mt-4 text-xs text-muted-foreground">
          版本: {agent.version}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button className="flex-1" onClick={onHire}>
            雇佣此 Agent
          </Button>
          <Button variant="outline" onClick={onClose}>
            返回广场
          </Button>
        </div>
      </div>
    </div>
  );
}
