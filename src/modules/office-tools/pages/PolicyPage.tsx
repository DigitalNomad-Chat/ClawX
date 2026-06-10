/**
 * PolicyPage — Policy management main page
 * Dashboard + Family/Policy list + Forms
 */
import { useEffect, useState } from 'react';
import { Shield, ArrowLeft, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { usePolicyStore } from '../stores/policyStore';
import { PolicyDashboard } from '../components/PolicyDashboard';
import { PolicyList } from '../components/PolicyList';
import { PolicyForm } from '../components/PolicyForm';
import { FamilyForm } from '../components/FamilyForm';
import type { PolicyRecord, PolicyFamily } from '../types';

export function PolicyPage() {
  const navigate = useNavigate();
  const families = usePolicyStore((s) => s.families);
  const stats = usePolicyStore((s) => s.stats);
  const error = usePolicyStore((s) => s.error);
  const fetchFamilies = usePolicyStore((s) => s.fetchFamilies);
  const fetchStats = usePolicyStore((s) => s.fetchStats);
  const createFamily = usePolicyStore((s) => s.createFamily);
  const deleteFamily = usePolicyStore((s) => s.deleteFamily);
  const createPolicy = usePolicyStore((s) => s.createPolicy);
  const updatePolicy = usePolicyStore((s) => s.updatePolicy);
  const deletePolicy = usePolicyStore((s) => s.deletePolicy);
  const clearError = usePolicyStore((s) => s.clearError);

  const [familyFormOpen, setFamilyFormOpen] = useState(false);
  const [policyFormOpen, setPolicyFormOpen] = useState(false);
  const [policyFormMode, setPolicyFormMode] = useState<'create' | 'edit'>('create');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedFamilyName, setSelectedFamilyName] = useState('');
  const [editingPolicy, setEditingPolicy] = useState<PolicyRecord | null>(null);

  const [familyToDelete, setFamilyToDelete] = useState<PolicyFamily | null>(null);
  const [policyToDelete, setPolicyToDelete] = useState<PolicyRecord | null>(null);

  useEffect(() => {
    void fetchFamilies();
    void fetchStats();
  }, [fetchFamilies, fetchStats]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleAddFamily = async (name: string) => {
    try {
      await createFamily(name);
      setFamilyFormOpen(false);
      toast.success('家庭已添加');
    } catch {
      // error handled by store
    }
  };

  const handleAddPolicy = (familyId: string, familyName: string) => {
    setSelectedFamilyId(familyId);
    setSelectedFamilyName(familyName);
    setEditingPolicy(null);
    setPolicyFormMode('create');
    setPolicyFormOpen(true);
  };

  const handleEditPolicy = (policy: PolicyRecord) => {
    setSelectedFamilyId(policy.familyId);
    setSelectedFamilyName(policy.familyName);
    setEditingPolicy(policy);
    setPolicyFormMode('edit');
    setPolicyFormOpen(true);
  };

  const handlePolicySubmit = async (data: Parameters<typeof createPolicy>[0]) => {
    try {
      if (policyFormMode === 'create') {
        await createPolicy(data);
        toast.success('保单已添加');
      } else if (editingPolicy) {
        await updatePolicy(editingPolicy.id, data);
        toast.success('保单已更新');
      }
      setPolicyFormOpen(false);
    } catch {
      // error handled by store
    }
  };

  const handleDeleteFamily = async () => {
    if (!familyToDelete) return;
    try {
      await deleteFamily(familyToDelete.id);
      setFamilyToDelete(null);
      toast.success('家庭已删除');
    } catch {
      // error handled by store
    }
  };

  const handleDeletePolicy = async () => {
    if (!policyToDelete) return;
    try {
      await deletePolicy(policyToDelete.id);
      setPolicyToDelete(null);
      toast.success('保单已删除');
    } catch {
      // error handled by store
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-card/50 px-6 py-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate('/office-tools')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-foreground">保单管理</h1>
          <p className="text-xs text-muted-foreground">家庭保单录入、查询与统计</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setFamilyFormOpen(true)}
        >
          <Users className="h-3.5 w-3.5" />
          添加家庭
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <PolicyDashboard stats={stats} />
          <PolicyList
            families={families}
            onAddPolicy={handleAddPolicy}
            onEditPolicy={handleEditPolicy}
            onDeletePolicy={(policy) => setPolicyToDelete(policy)}
            onDeleteFamily={(family) => setFamilyToDelete(family)}
          />
        </div>
      </div>

      {/* Forms */}
      <FamilyForm
        open={familyFormOpen}
        mode="create"
        onSubmit={handleAddFamily}
        onClose={() => setFamilyFormOpen(false)}
      />

      <PolicyForm
        open={policyFormOpen}
        mode={policyFormMode}
        familyId={selectedFamilyId}
        familyName={selectedFamilyName}
        initial={editingPolicy}
        onSubmit={handlePolicySubmit}
        onClose={() => setPolicyFormOpen(false)}
      />

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!familyToDelete}
        title="确认删除家庭"
        message={`确定要删除家庭 "${familyToDelete?.name}" 吗？该家庭下的所有保单也将被删除，此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={handleDeleteFamily}
        onCancel={() => setFamilyToDelete(null)}
      />

      <ConfirmDialog
        open={!!policyToDelete}
        title="确认删除保单"
        message={`确定要删除保单 "${policyToDelete?.productName || policyToDelete?.policyNo}" 吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={handleDeletePolicy}
        onCancel={() => setPolicyToDelete(null)}
      />
    </div>
  );
}
