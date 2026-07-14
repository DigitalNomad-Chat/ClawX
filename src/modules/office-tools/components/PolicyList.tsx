/**
 * PolicyList — Policy table with filter bar and pagination
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Pencil,
  Trash2,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { PolicyRecord } from '../types';
import {
  INSURANCE_TYPE_LABELS,
  RENEWAL_STATUS_LABELS,
  RENEWAL_STATUS_TYPES,
  type InsuranceType,
  type RenewalStatus,
} from '../constants';
import { usePolicyStore } from '../stores/policyStore';

interface PolicyListProps {
  onEditPolicy: (policy: PolicyRecord) => void;
  onDeletePolicy: (policy: PolicyRecord) => void;
  onMarkPaid?: (policy: PolicyRecord) => void;
}

// daysToRenewal semantics:
//   positive -> days until the NEXT scheduled due date (larger = farther away)
//   0        -> next due date is today
//   negative -> would only appear for terminated/expired (99999 sentinel, hidden)
function daysColor(days?: number): string {
  if (days === undefined || days === null) return '';
  if (days <= 7) return 'text-destructive font-semibold';
  if (days <= 30) return 'text-warning';
  if (days <= 60) return 'text-yellow-600';
  return 'text-muted-foreground';
}

function formatDaysToRenewal(days?: number): string {
  if (days === undefined || days === null) return '-';
  if (days >= 999 || days <= -999) return '-';
  if (days === 0) return '今天到期';
  return `${days} 天后`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('zh-CN');
}

/* ── Column system: reorderable + resizable ────────────────────── */

type ColumnKey =
  | 'productName'
  | 'insuranceType'
  | 'renewalStatus'
  | 'daysToRenewal'
  | 'persons'
  | 'family'
  | 'premium'
  | 'effectiveDate'
  | 'actions';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  minWidth: number;
  defaultWidth: number;
  /** Breakpoint below which the column is hidden — 'none' = always visible */
  visibility: 'none' | 'sm' | 'md' | 'lg';
  align?: 'left' | 'right' | 'center';
}

const COLUMNS: ColumnDef[] = [
  { key: 'productName',   label: '产品名称', minWidth: 120, defaultWidth: 190, visibility: 'none' },
  { key: 'insuranceType', label: '险种',     minWidth: 72,  defaultWidth: 120, visibility: 'sm' },
  { key: 'renewalStatus', label: '续期状态',   minWidth: 72,  defaultWidth: 110, visibility: 'sm' },
  { key: 'daysToRenewal', label: '距离续期',   minWidth: 72,  defaultWidth: 100, visibility: 'sm', align: 'right' },
  { key: 'persons',       label: '人员',       minWidth: 100, defaultWidth: 160, visibility: 'none' },
  { key: 'family',        label: '家庭',       minWidth: 60,  defaultWidth: 100, visibility: 'lg' },
  { key: 'premium',       label: '保费',       minWidth: 72,  defaultWidth: 110, visibility: 'sm', align: 'right' },
  { key: 'effectiveDate', label: '生效日期',    minWidth: 88,  defaultWidth: 130, visibility: 'md' },
  { key: 'actions',       label: '操作',       minWidth: 80,  defaultWidth: 120, visibility: 'none', align: 'center' },
];

const COLUMN_MAP = new Map(COLUMNS.map((c) => [c.key, c]));

const VIS_CLASS: Record<string, string> = {
  none: '',
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

/* ──────────────────────────────────────────────────────────────── */

export function PolicyList({
  onEditPolicy,
  onDeletePolicy,
  onMarkPaid,
}: PolicyListProps) {
  const {
    families,
    policies,
    loading,
    filterFamilyId,
    filterInsuranceType,
    filterRenewalStatus,
    searchKeyword,
    sortBy,
    sortOrder,
    currentPage,
    pageSize,
    totalPolicies,
    totalPages,
    setFilterFamilyId,
    setFilterInsuranceType,
    setFilterRenewalStatus,
    setSearchKeyword,
    setSortBy,
    setSortOrder,
    setPage,
    setPageSize,
    fetchFamilies,
    fetchPolicies,
  } = usePolicyStore();

  // 本地搜索输入框，仅在点击搜索时同步到 store（支持防抖/避免每次按键刷新）
  const [localSearch, setLocalSearch] = useState(searchKeyword);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  useEffect(() => {
    fetchPolicies();
  }, [
    fetchPolicies,
    filterFamilyId,
    filterInsuranceType,
    filterRenewalStatus,
    searchKeyword,
    sortBy,
    sortOrder,
    currentPage,
    pageSize,
  ]);

  // 当 store 的搜索关键词被外部重置时，同步本地输入
  useEffect(() => {
    setLocalSearch(searchKeyword);
  }, [searchKeyword]);

  const handleSearch = () => {
    setSearchKeyword(localSearch);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // ── Column system hooks (MUST be before any early return ─ React rule of hooks) ──
  const orderKey = 'policy-list-column-order';
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem(orderKey);
      const parsed: ColumnKey[] = saved ? JSON.parse(saved) : COLUMNS.map((c) => c.key);
      if (parsed.every((k) => COLUMN_MAP.has(k))) return parsed;
    } catch { /* ignore */ }
    return COLUMNS.map((c) => c.key);
  });
  useEffect(() => {
    localStorage.setItem(orderKey, JSON.stringify(columnOrder));
  }, [columnOrder]);

  const [, forceRender] = useState(0);

  function loadColWidths(): Record<string, number> {
    try {
      const saved = localStorage.getItem('policy-list-column-widths');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  }

  const colWidthsRef = useRef<Record<string, number>>(loadColWidths());
  const [resizingKey, setResizingKey] = useState<ColumnKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<ColumnKey | null>(null);

  const getColWidth = useCallback((key: ColumnKey): number =>
    colWidthsRef.current[key] ?? COLUMN_MAP.get(key)!.defaultWidth,
  []);

  const handleResizeStart = (e: React.MouseEvent, key: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const def = COLUMN_MAP.get(key)!;
    const startWidth = getColWidth(key);

    const onMove = (ev: MouseEvent) => {
      colWidthsRef.current[key] = Math.max(def.minWidth, startWidth + (ev.clientX - startX));
      forceRender((t) => t + 1);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setResizingKey(null);
      localStorage.setItem('policy-list-column-widths', JSON.stringify(colWidthsRef.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setResizingKey(key);
  };

  // ── Cell content renderer (not a hook, but uses hooks data above) ──
  const cellContent = useCallback((policy: PolicyRecord, key: ColumnKey): React.ReactNode => {
    switch (key) {
      case 'productName':
        return (
          <>
            <div className="font-medium truncate" title={policy.productName}>
              {policy.productName || policy.policyNo}
            </div>
            <div className="text-xs text-muted-foreground truncate">{policy.insurer}</div>
          </>
        );
      case 'insuranceType':
        return policy.insuranceType
          ? <Badge variant="outline" className="text-[10px]">{INSURANCE_TYPE_LABELS[policy.insuranceType]}</Badge>
          : <span className="text-xs text-muted-foreground">-</span>;
      case 'renewalStatus':
        return policy.renewalStatus
          ? <Badge variant={RENEWAL_STATUS_TYPES[policy.renewalStatus]} className="text-[10px]">{RENEWAL_STATUS_LABELS[policy.renewalStatus]}</Badge>
          : <span className="text-xs text-muted-foreground">-</span>;
      case 'daysToRenewal':
        return (
          <span className={cn('tabular-nums', daysColor(policy.daysToRenewal))}>
            {formatDaysToRenewal(policy.daysToRenewal)}
          </span>
        );
      case 'persons':
        return (
          <div className="text-xs">
            <div className="truncate">{policy.policyHolder}</div>
            <div className="truncate text-muted-foreground">→ {policy.insuredPerson}</div>
          </div>
        );
      case 'family':
        return <span className="text-xs text-muted-foreground truncate">{policy.familyName}</span>;
      case 'premium':
        return (
          <span className="tabular-nums">
            {policy.premium > 0 ? `¥${policy.premium.toLocaleString()}` : '-'}
          </span>
        );
      case 'effectiveDate':
        return <span className="text-xs text-muted-foreground truncate">{formatDate(policy.effectiveDate)}</span>;
      case 'actions':
        return (
          <div className="flex items-center justify-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditPolicy(policy)} title="编辑">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {onMarkPaid && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-600 hover:text-emerald-500"
                onClick={() => onMarkPaid(policy)}
                title="标记已续费"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDeletePolicy(policy)}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
    }
  }, [onEditPolicy, onDeletePolicy, onMarkPaid]);

  if (families.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-card/30 py-12">
        <Users className="h-8 w-8 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">暂无家庭分组</p>
        <p className="text-xs text-muted-foreground/60">点击上方按钮添加家庭</p>
      </div>
    );
  }

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className="space-y-3">
      {/* 筛选栏 — 响应式折叠 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="filterFamily" className="sr-only">家庭</Label>
          <Select
            id="filterFamily"
            value={filterFamilyId ?? ''}
            onChange={(e) => setFilterFamilyId(e.target.value || undefined)}
            className="w-28 sm:w-36"
          >
            <option value="">全部家庭</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Label htmlFor="filterInsuranceType" className="sr-only">险种</Label>
          <Select
            id="filterInsuranceType"
            value={filterInsuranceType ?? ''}
            onChange={(e) => setFilterInsuranceType(e.target.value as InsuranceType | '')}
            className="w-28 sm:w-32"
          >
            <option value="">全部险种</option>
            {Object.entries(INSURANCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Label htmlFor="filterRenewalStatus" className="sr-only">续期状态</Label>
          <Select
            id="filterRenewalStatus"
            value={filterRenewalStatus ?? ''}
            onChange={(e) => setFilterRenewalStatus(e.target.value as RenewalStatus | '')}
            className="w-28 sm:w-32"
          >
            <option value="">全部状态</option>
            {Object.entries(RENEWAL_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-1 items-center gap-1.5 min-w-[10rem] sm:min-w-[12rem]">
          <Label htmlFor="searchKeyword" className="sr-only">搜索</Label>
          <Input
            id="searchKeyword"
            placeholder="搜索产品/投保人/被保人"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>
            <Search className="h-4 w-4" />
            <span className="sr-only">搜索</span>
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Label htmlFor="sortBy" className="sr-only">排序</Label>
          <Select
            id="sortBy"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="w-24 sm:w-28"
          >
            <option value="daysToRenewal">按续期天数</option>
            <option value="premium">按保费</option>
            <option value="productName">按产品名</option>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? '升序' : '降序'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* 表格 — 支持拖拽调整列序 + 拖拽调整列宽 */}
      <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <colgroup>
              {columnOrder.map((key) => {
                const def = COLUMN_MAP.get(key)!;
                const w = getColWidth(key);
                return <col key={key} style={{ width: `${w}px`, minWidth: `${def.minWidth}px` }} />;
              })}
            </colgroup>
            <thead className="bg-muted/50 sticky top-0 z-10 select-none">
              <tr className="border-b border-border/60">
                {columnOrder.map((key) => {
                  const def = COLUMN_MAP.get(key)!;
                  const w = getColWidth(key);
                  return (
                    <th
                      key={key}
                      className={cn(
                        'group relative px-3 py-2 font-medium text-muted-foreground transition-colors',
                        def.align === 'right' && 'text-right',
                        def.align === 'center' && 'text-center',
                        VIS_CLASS[def.visibility],
                        dragOverKey === key && 'bg-primary/10',
                        resizingKey === key && 'select-none',
                      )}
                      style={{ width: `${w}px`, maxWidth: `${w}px` }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', key);
                        e.dataTransfer.effectAllowed = 'move';
                        e.currentTarget.classList.add('opacity-50');
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.classList.remove('opacity-50');
                        setDragOverKey(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverKey(key);
                      }}
                      onDragLeave={() => setDragOverKey(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const srcKey = e.dataTransfer.getData('text/plain') as ColumnKey;
                        if (srcKey && srcKey !== key) {
                          setColumnOrder((prev) => {
                            const next = [...prev];
                            const srcIdx = next.indexOf(srcKey);
                            const tgtIdx = next.indexOf(key);
                            if (srcIdx === -1 || tgtIdx === -1) return prev;
                            next.splice(srcIdx, 1);
                            next.splice(tgtIdx, 0, srcKey);
                            return next;
                          });
                        }
                        setDragOverKey(null);
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-all" />
                        <span className="truncate">{def.label}</span>
                      </div>
                      {/* 列宽调节手柄 */}
                      <div
                        className={cn(
                          'absolute right-0 top-0 h-full w-1 cursor-col-resize transition-all',
                          'hover:w-1.5 hover:bg-primary/40',
                          resizingKey === key && 'w-1.5 bg-primary',
                        )}
                        onMouseDown={(e) => handleResizeStart(e, key)}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                <tr>
                  <td colSpan={columnOrder.length} className="px-4 py-12 text-center text-muted-foreground">加载中…</td>
                </tr>
              ) : policies.length === 0 ? (
                <tr>
                  <td colSpan={columnOrder.length} className="px-4 py-12 text-center text-muted-foreground">
                    暂无保单，请选择家庭并添加
                  </td>
                </tr>
              ) : (
                policies.map((policy) => (
                  <tr key={policy.id} className="hover:bg-muted/30 transition-colors">
                    {columnOrder.map((key) => {
                      const def = COLUMN_MAP.get(key)!;
                      const w = getColWidth(key);
                      return (
                        <td
                          key={key}
                          className={cn(
                            'px-3 py-2 overflow-hidden',
                            def.align === 'right' && 'text-right',
                            def.align === 'center' && 'text-center',
                            VIS_CLASS[def.visibility],
                          )}
                          style={{ maxWidth: `${w}px` }}
                        >
                          {cellContent(policy, key)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>共 {totalPolicies} 条，第 {currentPage}/{totalPages} 页</span>
          <div className="flex items-center gap-1">
            <Label htmlFor="pageSize" className="sr-only">每页条数</Label>
            <Select
              id="pageSize"
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="w-20"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>{size} 条/页</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoPrev}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoNext}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
