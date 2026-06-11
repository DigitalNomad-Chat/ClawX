/**
 * GoClaw - 龙虾管家
 * 管理 Agent 专用控制台：招聘专员、培训专员、成长专员、解聘专员
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Wrench } from 'lucide-react';
import { useFeatureGuard } from '@/hooks/useFeatureGuard';
import { UsageLimitModal } from '@/components/auth/UsageLimitModal';
import { useGoClawStore } from './store';
import { AgentCard, AgentDetailDialog, AgentCardData, MANAGER_AGENT_IDS } from './agent-components';

export function GoClawManager() {
  const navigate = useNavigate();
  const agentsFromStore = useGoClawStore((s) => s.agents);
  const loadAgents = useGoClawStore((s) => s.loadAgents);

  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentCardData | null>(null);

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
      navigate(`/goclaw/chat/${agentId}`, { state: { from: '/goclaw/manager' } });
    }
  }

  const managerAgents = useMemo(() => {
    const filtered = agents.filter((agent) => MANAGER_AGENT_IDS.includes(agent.id));
    // 按照 MANAGER_AGENT_IDS 定义的顺序排列
    const orderMap = new Map(MANAGER_AGENT_IDS.map((id, idx) => [id, idx]));
    return filtered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }, [agents]);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">龙虾管家</h1>
            <p className="text-sm text-muted-foreground">
              专业的 OpenClaw 系统管理 Agent，负责招聘、治理、巡检与清理
            </p>
          </div>
        </div>
      </div>

      {/* Intro banner */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/[0.05] to-transparent p-5 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">系统级管理 Agent</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            龙虾管家是 OpenClaw 的系统级治理智能体，包含四位核心管理 Agent。它们负责 Agent 的创建引导、
            配置诊断、经验巡检和安全清理，确保您的 Agent 生态始终保持健康运转。
          </p>
        </div>
      </div>

      {/* Manager Agent Grid */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          加载中...
        </div>
      ) : managerAgents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Shield className="h-8 w-8" />
          <p>暂无可用的管理 Agent</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {managerAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              variant="manager"
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

      <UsageLimitModal feature="marketplace" open={showLimitModal} onClose={closeLimitModal} />
    </div>
  );
}
