/**
 * GoClaw - 应用广场页面
 * 浏览、搜索、雇佣预构建的 Agent（不含管理 Agent）
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Store,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeatureGuard } from '@/hooks/useFeatureGuard';
import { UsageLimitModal } from '@/components/auth/UsageLimitModal';
import { UsageBar } from '@/components/auth/UsageBar';
import { useGoClawStore } from './store';
import { AgentCard, AgentDetailDialog, AgentCardData, MANAGER_AGENT_IDS } from './agent-components';

const CATEGORIES = ['全部', '工程', '营销', '设计', '产品', '商务', '运营', '专项', '创意', '管理'];

export function GoClawMarketplace() {
  const navigate = useNavigate();
  const agentsFromStore = useGoClawStore((s) => s.agents);
  const loadAgents = useGoClawStore((s) => s.loadAgents);

  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentCardData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  const { showLimitModal, closeLimitModal, recordAndCheck } = useFeatureGuard('marketplace');

  useEffect(() => {
    if (agentsFromStore.length > 0) {
      setAgents(agentsFromStore as AgentCardData[]);
      setLoading(false);
    }
    void loadAgents().then(() => {
      setAgents(useGoClawStore.getState().agents as AgentCardData[]);
      setLoading(false);
    });
  }, [agentsFromStore.length, loadAgents]);

  async function hireAgent(agentId: string) {
    const allowed = await recordAndCheck();
    if (allowed) {
      navigate(`/agent-chat/${agentId}`);
    }
  }

  // 排除管理 Agent（它们在"龙虾管家"中展示）
  const visibleAgents = useMemo(
    () => agents.filter((agent) => !MANAGER_AGENT_IDS.includes(agent.id)),
    [agents]
  );

  const filteredAgents = useMemo(() => {
    return visibleAgents.filter((agent) => {
      const matchesSearch =
        !searchQuery ||
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = activeCategory === '全部' || agent.tags.includes(activeCategory);

      return matchesSearch && matchesCategory;
    });
  }, [visibleAgents, searchQuery, activeCategory]);

  const totalPages = Math.ceil(filteredAgents.length / PAGE_SIZE);
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAgents.slice(start, start + PAGE_SIZE);
  }, [filteredAgents, currentPage]);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Store className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">应用广场</h1>
            <p className="text-sm text-muted-foreground">
              选择并雇佣专业的 Agent，让 AI 为您工作
            </p>
          </div>
        </div>
        <UsageBar feature="marketplace" />
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索 Agent..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setActiveCategory(cat);
                setCurrentPage(1);
              }}
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => setSelectedAgent(agent)}
                onHire={() => hireAgent(agent.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="min-w-[32px]"
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground ml-2">
                共 {filteredAgents.length} 个
              </span>
            </div>
          )}
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

      <UsageLimitModal feature="marketplace" open={showLimitModal} onClose={closeLimitModal} />
    </div>
  );
}
