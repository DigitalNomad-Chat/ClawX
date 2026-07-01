/**
 * PolicyForm — Dialog form for creating / editing a policy
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { PolicyRecord } from '../types';

interface PolicyFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  familyId: string;
  familyName: string;
  initial?: PolicyRecord | null;
  onSubmit: (data: Omit<PolicyRecord, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: PolicyRecord['status']; label: string }[] = [
  { value: 'active', label: '生效中' },
  { value: 'pending', label: '待生效' },
  { value: 'lapsed', label: '已失效' },
  { value: 'terminated', label: '已终止' },
];

export function PolicyForm({ open, mode, familyId, familyName, initial, onSubmit, onClose }: PolicyFormProps) {
  const [policyNo, setPolicyNo] = useState('');
  const [insurer, setInsurer] = useState('');
  const [productName, setProductName] = useState('');
  const [premium, setPremium] = useState('');
  const [sumAssured, setSumAssured] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState<PolicyRecord['status']>('active');
  const [beneficiary, setBeneficiary] = useState('');
  const [remarks, setRemarks] = useState('');
  const [policyHolder, setPolicyHolder] = useState('');
  const [insuredPerson, setInsuredPerson] = useState('');
  const [thisYearRenewed, setThisYearRenewed] = useState(false);

  useEffect(() => {
    if (initial) {
      setPolicyNo(initial.policyNo || '');
      setInsurer(initial.insurer || '');
      setProductName(initial.productName || '');
      setPremium(initial.premium ? String(initial.premium) : '');
      setSumAssured(initial.sumAssured ? String(initial.sumAssured) : '');
      setEffectiveDate(initial.effectiveDate || '');
      setExpiryDate(initial.expiryDate || '');
      setStatus(initial.status || 'active');
      setBeneficiary(initial.beneficiary || '');
      setRemarks(initial.remarks || '');
      setPolicyHolder(initial.policyHolder || '');
      setInsuredPerson(initial.insuredPerson || '');
      setThisYearRenewed(initial.thisYearRenewed);
    } else {
      setPolicyNo('');
      setInsurer('');
      setProductName('');
      setPremium('');
      setSumAssured('');
      setEffectiveDate('');
      setExpiryDate('');
      setStatus('active');
      setBeneficiary('');
      setRemarks('');
      setPolicyHolder('');
      setInsuredPerson('');
      setThisYearRenewed(false);
    }
  }, [initial, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      familyId,
      familyName,
      policyNo,
      insurer,
      productName,
      premium: Number(premium) || 0,
      sumAssured: Number(sumAssured) || 0,
      effectiveDate,
      expiryDate,
      status,
      beneficiary,
      remarks,
      policyHolder,
      insuredPerson,
      thisYearRenewed,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={cn(
          'mx-4 w-full max-w-lg rounded-lg border bg-card shadow-lg',
          'max-h-[85vh] overflow-y-auto'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? '新增保单' : '编辑保单'}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="text-xs text-muted-foreground mb-1">
            家庭：{familyName}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="policyNo">保单号 *</Label>
              <Input id="policyNo" value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} required placeholder="请输入保单号" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurer">保险公司 *</Label>
              <Input id="insurer" value={insurer} onChange={(e) => setInsurer(e.target.value)} required placeholder="如：平安人寿" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productName">产品名称</Label>
            <Input id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="如：平安福终身寿险" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="premium">保费</Label>
              <Input id="premium" type="number" min={0} value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sumAssured">保额</Label>
              <Input id="sumAssured" type="number" min={0} value={sumAssured} onChange={(e) => setSumAssured(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">生效日期</Label>
              <Input id="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">到期日期</Label>
              <Input id="expiryDate" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="status">状态</Label>
              <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as PolicyRecord['status'])}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="beneficiary">受益人</Label>
              <Input id="beneficiary" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="如：法定受益人" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remarks">备注</Label>
            <Input id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="可选" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">
              {mode === 'create' ? '保存' : '更新'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
