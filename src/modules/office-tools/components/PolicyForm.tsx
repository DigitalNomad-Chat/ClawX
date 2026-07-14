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
import { Textarea } from '@/components/ui/textarea';
import type { PolicyRecord, PolicyFamily } from '../types';
import {
  INSURANCE_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  type InsuranceType,
  type Relationship,
  type PaymentFrequency,
} from '../constants';

/** Months per cycle for each payment frequency. */
const CYCLE_MONTHS: Record<PaymentFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
  one_time: 0,
};

/**
 * Compute the most recent scheduled payment due date <= today, used as the
 * smart default for `lastRenewalDate` on policy creation. Mirrors the backend
 * computeDefaultLastRenewalDate so the form is self-contained.
 */
function computeDefaultLastRenewalDate(
  effectiveDate: string,
  paymentFrequency?: PaymentFrequency | '',
): string {
  if (!effectiveDate) return '';
  const eff = new Date(effectiveDate);
  if (isNaN(eff.getTime())) return '';
  if (!paymentFrequency || CYCLE_MONTHS[paymentFrequency as PaymentFrequency] === 0) return '';

  const months = CYCLE_MONTHS[paymentFrequency as PaymentFrequency];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eff.setHours(0, 0, 0, 0);

  let recent = new Date(eff);
  for (let i = 0; i < 120; i++) {
    const next = new Date(recent);
    next.setMonth(next.getMonth() + months);
    if (next.getTime() > today.getTime()) break;
    recent = next;
  }
  recent.setHours(0, 0, 0, 0);
  return recent.toISOString().slice(0, 10);
}

interface PolicyFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  families: PolicyFamily[];
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

interface FormState {
  policyNo: string;
  insurer: string;
  productName: string;
  premium: string;
  sumAssured: string;
  effectiveDate: string;
  expiryDate: string;
  status: PolicyRecord['status'];
  beneficiary: string;
  remarks: string;
  insuranceType: InsuranceType | '';
  policyHolder: string;
  insuredPerson: string;
  relationship: Relationship | '';
  paymentAccount: string;
  purchasePlatform: string;
  paymentFrequency: PaymentFrequency | '';
  lastRenewalDate: string;
  followUpRecord: string;
  statusTag: string;
}

function emptyForm(): FormState {
  return {
    policyNo: '',
    insurer: '',
    productName: '',
    premium: '',
    sumAssured: '',
    effectiveDate: '',
    expiryDate: '',
    status: 'active',
    beneficiary: '',
    remarks: '',
    insuranceType: '',
    policyHolder: '',
    insuredPerson: '',
    relationship: '',
    paymentAccount: '',
    purchasePlatform: '',
    paymentFrequency: '',
    lastRenewalDate: '',
    followUpRecord: '',
    statusTag: '',
  };
}

function recordToForm(initial: PolicyRecord): FormState {
  return {
    policyNo: initial.policyNo || '',
    insurer: initial.insurer || '',
    productName: initial.productName || '',
    premium: initial.premium ? String(initial.premium) : '',
    sumAssured: initial.sumAssured ? String(initial.sumAssured) : '',
    effectiveDate: initial.effectiveDate || '',
    expiryDate: initial.expiryDate || '',
    status: initial.status || 'active',
    beneficiary: initial.beneficiary || '',
    remarks: initial.remarks || '',
    insuranceType: initial.insuranceType || '',
    policyHolder: initial.policyHolder || '',
    insuredPerson: initial.insuredPerson || '',
    relationship: initial.relationship || '',
    paymentAccount: initial.paymentAccount || '',
    purchasePlatform: initial.purchasePlatform || '',
    paymentFrequency: initial.paymentFrequency || '',
    lastRenewalDate: initial.lastRenewalDate ? initial.lastRenewalDate.slice(0, 10) : '',
    followUpRecord: initial.followUpRecord || '',
    statusTag: initial.statusTag || '',
  };
}

export function PolicyForm({ open, mode, families, familyId, familyName, initial, onSubmit, onClose }: PolicyFormProps) {
  const [selectedFamilyId, setSelectedFamilyId] = useState(familyId);
  const selectedFamily = families.find((f) => f.id === selectedFamilyId) ?? families[0];

  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    setSelectedFamilyId(familyId);
    setForm(initial ? recordToForm(initial) : emptyForm());
  }, [initial, open, familyId]);

  if (!open) return null;

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // On create, auto-fill lastRenewalDate whenever effectiveDate or
      // paymentFrequency changes and the user hasn't set it manually.
      if (
        mode === 'create' &&
        (field === 'effectiveDate' || field === 'paymentFrequency') &&
        !next.lastRenewalDate
      ) {
        next.lastRenewalDate = computeDefaultLastRenewalDate(next.effectiveDate, next.paymentFrequency);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetFamily = selectedFamily || { id: familyId, name: familyName };
    onSubmit({
      familyId: targetFamily.id,
      familyName: targetFamily.name,
      policyNo: form.policyNo,
      insurer: form.insurer,
      productName: form.productName,
      premium: Number(form.premium) || 0,
      sumAssured: Number(form.sumAssured) || 0,
      effectiveDate: form.effectiveDate,
      expiryDate: form.expiryDate,
      status: form.status,
      beneficiary: form.beneficiary,
      remarks: form.remarks,
      insuranceType: form.insuranceType || undefined,
      // 创建时若未填写则兜底为"未知"；编辑时原样透传，允许清空
      policyHolder: mode === 'create' ? (form.policyHolder || '未知') : form.policyHolder,
      insuredPerson: mode === 'create' ? (form.insuredPerson || '未知') : form.insuredPerson,
      relationship: form.relationship || undefined,
      paymentAccount: form.paymentAccount,
      purchasePlatform: form.purchasePlatform,
      paymentFrequency: form.paymentFrequency || undefined,
      lastRenewalDate: form.lastRenewalDate || undefined,
      followUpRecord: form.followUpRecord,
      statusTag: form.statusTag,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className={cn(
          'mx-4 w-full max-w-2xl rounded-lg border bg-card shadow-lg',
          'max-h-[90vh] overflow-y-auto'
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
          <div className="space-y-1.5">
            <Label htmlFor="familyId">家庭 *</Label>
            <Select
              id="familyId"
              value={selectedFamilyId}
              onChange={(e) => setSelectedFamilyId(e.target.value)}
              disabled={mode === 'edit'}
            >
              {families.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground">编辑保单时不能更改所属家庭</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="policyNo">保单号 *</Label>
              <Input id="policyNo" value={form.policyNo} onChange={(e) => updateField('policyNo', e.target.value)} required placeholder="请输入保单号" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurer">保险公司 *</Label>
              <Input id="insurer" value={form.insurer} onChange={(e) => updateField('insurer', e.target.value)} required placeholder="如：平安人寿" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productName">产品名称</Label>
            <Input id="productName" value={form.productName} onChange={(e) => updateField('productName', e.target.value)} placeholder="如：平安福终身寿险" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="insuranceType">险种</Label>
              <Select
                id="insuranceType"
                value={form.insuranceType}
                onChange={(e) => updateField('insuranceType', e.target.value as InsuranceType | '')}
              >
                <option value="">请选择</option>
                {Object.entries(INSURANCE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentFrequency">缴费频率</Label>
              <Select
                id="paymentFrequency"
                value={form.paymentFrequency}
                onChange={(e) => updateField('paymentFrequency', e.target.value as PaymentFrequency | '')}
              >
                <option value="">请选择</option>
                {Object.entries(PAYMENT_FREQUENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="policyHolder">投保人 *</Label>
              <Input id="policyHolder" value={form.policyHolder} onChange={(e) => updateField('policyHolder', e.target.value)} required placeholder="请输入投保人姓名" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insuredPerson">被保人 *</Label>
              <Input id="insuredPerson" value={form.insuredPerson} onChange={(e) => updateField('insuredPerson', e.target.value)} required placeholder="请输入被保人姓名" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="relationship">关系</Label>
              <Select
                id="relationship"
                value={form.relationship}
                onChange={(e) => updateField('relationship', e.target.value as Relationship | '')}
              >
                <option value="">请选择</option>
                {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="beneficiary">受益人</Label>
              <Input id="beneficiary" value={form.beneficiary} onChange={(e) => updateField('beneficiary', e.target.value)} placeholder="如：法定受益人" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="premium">保费</Label>
              <Input id="premium" type="number" min={0} value={form.premium} onChange={(e) => updateField('premium', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sumAssured">保额</Label>
              <Input id="sumAssured" type="number" min={0} value={form.sumAssured} onChange={(e) => updateField('sumAssured', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">生效日期</Label>
              <Input id="effectiveDate" type="date" value={form.effectiveDate} onChange={(e) => updateField('effectiveDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">到期日期</Label>
              <Input id="expiryDate" type="date" value={form.expiryDate} onChange={(e) => updateField('expiryDate', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="status">状态</Label>
              <Select id="status" value={form.status} onChange={(e) => updateField('status', e.target.value as PolicyRecord['status'])}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastRenewalDate">最近缴费日期</Label>
              <Input
                id="lastRenewalDate"
                type="date"
                value={form.lastRenewalDate}
                onChange={(e) => updateField('lastRenewalDate', e.target.value)}
              />
              {mode === 'create' && !form.lastRenewalDate && form.effectiveDate && form.paymentFrequency && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => updateField(
                    'lastRenewalDate',
                    computeDefaultLastRenewalDate(form.effectiveDate, form.paymentFrequency),
                  )}
                >
                  自动填充为最近应缴费日
                </button>
              )}
              <p className="text-xs text-muted-foreground">决定续期状态的计算基准，留空则按生效日期</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="purchasePlatform">购买平台</Label>
              <Input id="purchasePlatform" value={form.purchasePlatform} onChange={(e) => updateField('purchasePlatform', e.target.value)} placeholder="如：支付宝、微信、线下代理人" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentAccount">缴费账户</Label>
              <Input id="paymentAccount" value={form.paymentAccount} onChange={(e) => updateField('paymentAccount', e.target.value)} placeholder="扣款银行卡/账户" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="statusTag">状态标签</Label>
              <Input id="statusTag" value={form.statusTag} onChange={(e) => updateField('statusTag', e.target.value)} placeholder="自定义状态标记" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followUpRecord">跟进记录</Label>
            <Textarea
              id="followUpRecord"
              value={form.followUpRecord}
              onChange={(e) => updateField('followUpRecord', e.target.value)}
              placeholder="续期跟进记录"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remarks">备注</Label>
            <Input id="remarks" value={form.remarks} onChange={(e) => updateField('remarks', e.target.value)} placeholder="可选" />
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
