/**
 * PolicyPage — Policy management main page
 * Dashboard + Family/Policy list + Forms
 */
import { useEffect, useState } from 'react';
import { Shield, ArrowLeft, Users, Upload, Download, Plus, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { usePolicyStore } from '../stores/policyStore';
import { PolicyDashboard } from '../components/PolicyDashboard';
import { PolicyList } from '../components/PolicyList';
import { PolicyForm } from '../components/PolicyForm';
import { FamilyForm } from '../components/FamilyForm';
import { PolicyImportDialog } from '../components/PolicyImportDialog';
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
  const importPolicies = usePolicyStore((s) => s.importPolicies);
  const exportPolicies = usePolicyStore((s) => s.exportPolicies);
  const downloadImportTemplate = usePolicyStore((s) => s.downloadImportTemplate);
  const markPaid = usePolicyStore((s) => s.markPaid);
  const clearError = usePolicyStore((s) => s.clearError);

  const [activeTab, setActiveTab] = useState('dashboard');

  const [familyFormOpen, setFamilyFormOpen] = useState(false);
  const [policyFormOpen, setPolicyFormOpen] = useState(false);
  const [policyFormMode, setPolicyFormMode] = useState<'create' | 'edit'>('create');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedFamilyName, setSelectedFamilyName] = useState('');
  const [editingPolicy, setEditingPolicy] = useState<PolicyRecord | null>(null);

  const [familyToDelete, setFamilyToDelete] = useState<PolicyFamily | null>(null);
  const [policyToDelete, setPolicyToDelete] = useState<PolicyRecord | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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

  const openCreatePolicy = async () => {
    // Always refresh families right before opening the form to avoid stale state
    await fetchFamilies();
    const latestFamilies = usePolicyStore.getState().families;
    if (latestFamilies.length === 0) {
      toast.info('请先添加一个家庭');
      return;
    }
    const family = latestFamilies.find((f) => f.id === selectedFamilyId) ?? latestFamilies[0];
    setSelectedFamilyId(family.id);
    setSelectedFamilyName(family.name);
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

  const handleExport = async () => {
    try {
      await exportPolicies();
      toast.success('CSV 导出已开始');
    } catch {
      // error handled by store
    }
  };

  const handleImport = async (file: File, familyId: string) => {
    const text = await file.text();
    const result = await importPolicies(text, familyId);
    if (result.errors.length === 0) {
      toast.success(`成功导入 ${result.created} 条保单`);
    } else {
      toast.warning(`导入 ${result.created} 条，存在 ${result.errors.length} 个错误`);
    }
    return result;
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadImportTemplate();
      toast.success('导入模板下载已开始');
    } catch {
      // error handled by store
    }
  };

  const handleMarkPaid = async (policy: PolicyRecord) => {
    try {
      await markPaid(policy.id);
      toast.success(`"${policy.productName || policy.policyNo}" 已标记为已缴费`);
    } catch {
      // error handled by store
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-card/50 px-4 sm:px-6 lg:px-8 py-4">
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

      {/* Content — fluid responsive container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dashboard">续期看板</TabsTrigger>
              <TabsTrigger value="list">保单列表</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-4">
              <PolicyDashboard stats={stats} />
              <div className="flex justify-end">
                <Button size="sm" className="gap-1.5" onClick={openCreatePolicy}>
                  <Plus className="h-3.5 w-3.5" />
                  新增保单
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="list" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" className="gap-1.5" onClick={openCreatePolicy}>
                    <Plus className="h-3.5 w-3.5" />
                    新增保单
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportDialogOpen(true)}>
                    <Upload className="h-3.5 w-3.5" />
                    导入 CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadTemplate}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    下载模板
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
                    <Download className="h-3.5 w-3.5" />
                    导出 CSV
                  </Button>
                </div>
              </div>

              <PolicyList
                onEditPolicy={handleEditPolicy}
                onDeletePolicy={(policy) => setPolicyToDelete(policy)}
                onMarkPaid={handleMarkPaid}
              />
            </TabsContent>
          </Tabs>
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
        families={families}
        familyId={selectedFamilyId}
        familyName={selectedFamilyName}
        initial={editingPolicy}
        onSubmit={handlePolicySubmit}
        onClose={() => setPolicyFormOpen(false)}
      />

      <PolicyImportDialog
        open={importDialogOpen}
        families={families}
        onImport={handleImport}
        onClose={() => setImportDialogOpen(false)}
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
