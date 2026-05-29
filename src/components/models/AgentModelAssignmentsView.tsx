import { useState, useMemo } from 'react';
import { ArrowLeft, Pencil, RotateCcw, Zap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAgentsStore } from '@/stores/agents';
import { ModelSelectorModal } from './ModelSelectorModal';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AgentSummary } from '@/types/agent';

interface AgentModelAssignmentsViewProps {
  onBack: () => void;
}

export function AgentModelAssignmentsView({ onBack }: AgentModelAssignmentsViewProps) {
  const { t } = useTranslation('agents');
  const { agents, defaultModelRef, updateAgentModel, batchUpdateAgentModels } = useAgentsStore();
  const [editAgent, setEditAgent] = useState<AgentSummary | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);

  const inheritedCount = useMemo(
    () => agents.filter((a) => a.inheritedModel).length,
    [agents],
  );
  const overriddenCount = agents.length - inheritedCount;

  const handleResetAgent = async (agentId: string) => {
    try {
      await updateAgentModel(agentId, null);
      toast.success(t('toast.agentModelReset'));
    } catch (error) {
      toast.error(t('toast.agentModelUpdateFailed', { error: String(error) }));
    }
  };

  const handleBatchSave = async (modelRef: string | null) => {
    try {
      await batchUpdateAgentModels(modelRef);
      toast.success(t('toast.batchModelUpdated'));
      setShowBatchModal(false);
    } catch (error) {
      toast.error(t('toast.batchModelUpdateFailed', { error: String(error) }));
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('agentModelAssignments.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('agentModelAssignments.subtitle')}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowBatchModal(true)}>
          <Zap className="h-4 w-4 mr-2" />
          {t('agentModelAssignments.batchSet')}
        </Button>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{t('agentModelAssignments.inheritedCount', { count: inheritedCount })}</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        <span>{t('agentModelAssignments.overriddenCount', { count: overriddenCount })}</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="rounded-xl border shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{agent.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {agent.modelRef || defaultModelRef || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={agent.inheritedModel ? 'secondary' : 'default'} className="text-xs">
                  {agent.inheritedModel
                    ? t('agentModelAssignments.inherited')
                    : t('agentModelAssignments.overridden')}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditAgent(agent)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!agent.inheritedModel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleResetAgent(agent.id)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editAgent && (
        <ModelSelectorModal
          title={t('agentModelAssignments.editTitle', { name: editAgent.name })}
          description={t('agentModelAssignments.editDescription', { defaultModel: defaultModelRef || '-' })}
          defaultModelRef={defaultModelRef}
          currentModelRef={editAgent.overrideModelRef}
          onSave={async (modelRef) => {
            await updateAgentModel(editAgent.id, modelRef);
            toast.success(modelRef ? t('toast.agentModelUpdated') : t('toast.agentModelReset'));
            setEditAgent(null);
          }}
          onClose={() => setEditAgent(null)}
        />
      )}

      {showBatchModal && (
        <ModelSelectorModal
          title={t('agentModelAssignments.batchTitle')}
          description={t('agentModelAssignments.batchDescription')}
          defaultModelRef={defaultModelRef}
          onSave={handleBatchSave}
          onClose={() => setShowBatchModal(false)}
        />
      )}
    </div>
  );
}
