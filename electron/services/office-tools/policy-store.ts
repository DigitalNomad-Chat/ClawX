/**
 * Policy Store — Electron-store backed persistence for insurance policies
 * Family 1:N Policy relationship, with simple in-memory indexing.
 */

import type { PolicyRecord, PolicyFamily, OfficeToolsStats } from '../../../src/modules/office-tools/types';
import {
  INSURANCE_TYPE_LABELS,
  type PaymentFrequency,
  type RenewalStatus,
} from '../../../src/modules/office-tools/constants';
import { parseCSV, mapCsvRowToPolicy, policiesToCsv } from './csv';

// Lazy-load electron-store (ESM module)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let policyStoreInstance: any = null;

async function getPolicyStore() {
  if (!policyStoreInstance) {
    const Store = (await import('electron-store')).default;
    policyStoreInstance = new Store({
      name: 'clawdock-office-tools',
      defaults: {
        schemaVersion: 1,
        policies: [] as PolicyRecord[],
        families: [] as StoredFamily[],
      },
    });
  }
  return policyStoreInstance;
}

interface StoredFamily {
  id: string;
  name: string;
  contactInfo?: string;
  remark?: string;
  createdAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Renewal calculation
// ---------------------------------------------------------------------------

/** Add months to a date without mutating the original. */
function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  // Handle month-end overflow (e.g. Jan 31 + 1 month -> Feb 28)
  if (next.getDate() < day) {
    next.setDate(0);
  }
  return next;
}

/** Map payment frequency to the number of months in one cycle. 0 = one_time. */
function cycleMonths(paymentFrequency?: PaymentFrequency): number {
  switch (paymentFrequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'annual': return 12;
    case 'one_time': return 0;
    default: return 12; // unknown -> assume annual
  }
}

/**
 * "Already renewed" buffer threshold, proportional to the cycle length
 * (~1/6 of the cycle). A policy whose coverage extends further than this
 * buffer past today is considered comfortably paid-up ("renewed"); otherwise
 * it is "due soon" ("normal").
 */
function renewedBufferDays(paymentFrequency?: PaymentFrequency): number {
  switch (paymentFrequency) {
    case 'monthly': return 5;
    case 'quarterly': return 15;
    case 'semi_annual': return 30;
    case 'annual': return 60;
    case 'one_time': return Number.MAX_SAFE_INTEGER;
    default: return 60;
  }
}

/** Grace period (days) after the coverage end date before a policy lapses. */
const GRACE_DAYS = 60;

/**
 * Paid-through-based renewal calculation.
 *
 * Single source of truth: `lastRenewalDate` (the last time a premium was
 * actually paid). If absent, we fall back to `effectiveDate` (treat the first
 * premium as paid on the effective date).
 *
 * Coverage extends one full cycle past the anchor:
 *   paidThrough = anchor + paymentFrequency cycles
 *   daysToRenewal = paidThrough - today   (positive = still covered,
 *                                          negative = overdue)
 *
 * Status:
 *   terminated / expired            -> lapsed
 *   one_time premium                -> renewed (no further cycle)
 *   daysToRenewal > buffer          -> renewed (comfortably paid up)
 *   daysToRenewal >= 0              -> normal  (due within the buffer window)
 *   daysToRenewal >= -GRACE_DAYS    -> grace
 *   otherwise                       -> lapsed
 */

/**
 * Compute the next scheduled due date based on effectiveDate and frequency.
 * This is the contractual renewal date -- NOT influenced by payment history.
 * Returns { recentDue: Date, nextDue: Date, daysToRenewal: number }.
 */
function computeNextScheduledDue(
  effectiveDate: string,
  paymentFrequency?: PaymentFrequency,
  todayArg?: Date,
) {
  const now = todayArg ?? new Date();
  now.setHours(0, 0, 0, 0);
  const eff = new Date(effectiveDate);
  eff.setHours(0, 0, 0, 0);
  const months = cycleMonths(paymentFrequency);

  // Walk forward from eff in whole cycles to find the most recent due <= today.
  let recentDue = new Date(eff);
  const limit = 120;
  for (let i = 0; i < limit; i++) {
    const next = addMonths(recentDue, months);
    if (next.getTime() > now.getTime()) break;
    recentDue = next;
  }
  recentDue.setHours(0, 0, 0, 0);

  // Next scheduled due = one full cycle after recentDue.
  const nextDue = addMonths(recentDue, months);
  nextDue.setHours(0, 0, 0, 0);

  const daysToRenewal = Math.round(
    (nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { recentDue, nextDue, daysToRenewal };
}

export function calculateRenewalStatus(policy: {
  effectiveDate: string;
  lastRenewalDate?: string;
  paymentFrequency?: PaymentFrequency;
  status?: string;
  expiryDate?: string;
}): {
  renewalDate: string;
  renewalStatus: RenewalStatus;
  daysToRenewal: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Terminated, lapsed, or expired policies do not renew.
  if (policy.status === 'terminated' || policy.status === 'lapsed') {
    return { renewalDate: '', renewalStatus: 'lapsed', daysToRenewal: 99999 };
  }
  if (policy.expiryDate) {
    const exp = new Date(policy.expiryDate);
    exp.setHours(0, 0, 0, 0);
    if (exp < today) {
      return { renewalDate: '', renewalStatus: 'lapsed', daysToRenewal: 99999 };
    }
  }

  // One-time premium has no renewal cycle.
  if (policy.paymentFrequency === 'one_time') {
    return { renewalDate: '', renewalStatus: 'renewed', daysToRenewal: 99999 };
  }

  // --- Days to renewal: always from contract (effectiveDate + frequency) ---
  const schedule = computeNextScheduledDue(
    policy.effectiveDate,
    policy.paymentFrequency,
  );

  // --- Status: derived from payment history (lastRenewalDate) ---
  const anchorRaw = policy.lastRenewalDate || policy.effectiveDate;
  if (!anchorRaw || isNaN(new Date(anchorRaw).getTime())) {
    // No valid anchor -> status falls through to "normal"
    return { renewalDate: schedule.nextDue.toISOString(), renewalStatus: 'normal', daysToRenewal: schedule.daysToRenewal };
  }
  const anchor = new Date(anchorRaw);
  anchor.setHours(0, 0, 0, 0);
  const months = cycleMonths(policy.paymentFrequency);

  // Coverage end date = anchor + one cycle.
  const paidThrough = addMonths(anchor, months);
  paidThrough.setHours(0, 0, 0, 0);

  const daysSinceCoverageEnd = Math.round(
    (today.getTime() - paidThrough.getTime()) / (1000 * 60 * 60 * 24),
  );

  const buffer = renewedBufferDays(policy.paymentFrequency);

  let renewalStatus: RenewalStatus;
  if (daysSinceCoverageEnd <= 0) {
    // Still covered by the last payment.
    if (schedule.daysToRenewal > buffer) {
      renewalStatus = 'renewed';
    } else {
      renewalStatus = 'normal';
    }
  } else if (daysSinceCoverageEnd <= GRACE_DAYS) {
    renewalStatus = 'grace';
  } else {
    renewalStatus = 'lapsed';
  }

  return {
    renewalDate: schedule.nextDue.toISOString(),
    renewalStatus,
    daysToRenewal: schedule.daysToRenewal,
  };
}

export function computeDefaultLastRenewalDate(
  effectiveDate: string,
  paymentFrequency?: PaymentFrequency,
): string | undefined {
  if (!effectiveDate || isNaN(new Date(effectiveDate).getTime())) return undefined;
  if (paymentFrequency === 'one_time') return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eff = new Date(effectiveDate);
  eff.setHours(0, 0, 0, 0);

  const months = cycleMonths(paymentFrequency);
  let recent = new Date(eff);
  const limit = 120;
  let i = 0;
  while (i < limit) {
    const next = addMonths(recent, months);
    if (next.getTime() > today.getTime()) break;
    recent = next;
    i++;
  }
  recent.setHours(0, 0, 0, 0);
  return recent.toISOString();
}

/**
 * Enrich a policy object with computed renewal fields.
 */
export function enrichPolicyWithRenewal(policy: PolicyRecord): PolicyRecord {
  const calc = calculateRenewalStatus(policy);

  return {
    ...policy,
    renewalDate: calc.renewalDate,
    renewalStatus: calc.renewalStatus,
    daysToRenewal: calc.daysToRenewal,
  };
}

// ---------------------------------------------------------------------------
// Family operations
// ---------------------------------------------------------------------------

export async function listFamilies(): Promise<PolicyFamily[]> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as StoredFamily[];
  const policies = (store.get('policies') ?? []) as PolicyRecord[];

  return families.map((f) => {
    const famPolicies = policies.filter((p) => p.familyId === f.id).map(enrichPolicyWithRenewal);
    return {
      id: f.id,
      name: f.name,
      memberCount: famPolicies.length,
      totalPremium: famPolicies.reduce((sum, p) => sum + (p.premium || 0), 0),
      totalSumAssured: famPolicies.reduce((sum, p) => sum + (p.sumAssured || 0), 0),
      contactInfo: f.contactInfo,
      remark: f.remark,
      policies: famPolicies,
    };
  });
}

export async function getFamily(familyId: string): Promise<PolicyFamily | null> {
  const families = await listFamilies();
  return families.find((f) => f.id === familyId) ?? null;
}

export async function createFamily(input: {
  name: string;
  contactInfo?: string;
  remark?: string;
}): Promise<StoredFamily> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as StoredFamily[];
  const family: StoredFamily = {
    id: `fam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    contactInfo: input.contactInfo?.trim(),
    remark: input.remark?.trim(),
    createdAt: nowIso(),
  };
  families.push(family);
  store.set('families', families);
  return family;
}

export async function updateFamily(
  familyId: string,
  patch: { name?: string; contactInfo?: string; remark?: string },
): Promise<boolean> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as StoredFamily[];
  const idx = families.findIndex((f) => f.id === familyId);
  if (idx === -1) return false;
  if (patch.name !== undefined) families[idx].name = patch.name.trim();
  if (patch.contactInfo !== undefined) families[idx].contactInfo = patch.contactInfo?.trim();
  if (patch.remark !== undefined) families[idx].remark = patch.remark?.trim();
  store.set('families', families);
  return true;
}

export async function deleteFamily(familyId: string): Promise<boolean> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as StoredFamily[];
  const filteredFamilies = families.filter((f) => f.id !== familyId);
  if (filteredFamilies.length === families.length) return false;

  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  const filteredPolicies = policies.filter((p) => p.familyId !== familyId);

  store.set('families', filteredFamilies);
  store.set('policies', filteredPolicies);
  return true;
}

// ---------------------------------------------------------------------------
// Policy operations
// ---------------------------------------------------------------------------

export async function listPolicies(): Promise<PolicyRecord[]> {
  const store = await getPolicyStore();
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  return policies.map(enrichPolicyWithRenewal);
}

export async function getPolicy(id: number): Promise<PolicyRecord | null> {
  const policies = await listPolicies();
  return policies.find((p) => p.id === id) ?? null;
}

export async function createPolicy(input: Omit<PolicyRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PolicyRecord> {
  const store = await getPolicyStore();
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  const maxId = policies.reduce((max, p) => Math.max(max, p.id || 0), 0);
  const enriched = enrichPolicyWithRenewal({
    ...input,
    id: maxId + 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  } as PolicyRecord);
  policies.push(enriched);
  store.set('policies', policies);
  return enriched;
}

export async function updatePolicy(
  id: number,
  patch: Partial<Omit<PolicyRecord, 'id' | 'createdAt'>>,
): Promise<PolicyRecord | null> {
  const store = await getPolicyStore();
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const merged: PolicyRecord = { ...policies[idx], ...patch, updatedAt: nowIso() };
  policies[idx] = enrichPolicyWithRenewal(merged);
  store.set('policies', policies);
  return policies[idx];
}

export async function deletePolicy(id: number): Promise<boolean> {
  const store = await getPolicyStore();
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  const filtered = policies.filter((p) => p.id !== id);
  if (filtered.length === policies.length) return false;
  store.set('policies', filtered);
  return true;
}

// ---------------------------------------------------------------------------
// CSV import / export
// ---------------------------------------------------------------------------

export async function importPolicies(
  csvText: string,
  familyId: string,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as StoredFamily[];
  const family = families.find((f) => f.id === familyId);
  if (!family) {
    return { created: 0, updated: 0, errors: ['Family not found'] };
  }

  const rows = parseCSV(csvText);
  // Read policies once, mutate in memory, then persist once at the end.
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  let nextId = policies.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const policyData = mapCsvRowToPolicy(row, familyId, family.name);

      // Match existing policy by productName + policyHolder + insuredPerson within the same family
      const existingIdx = policies.findIndex(
        (p) =>
          p.familyId === familyId &&
          p.productName === policyData.productName &&
          p.policyHolder === policyData.policyHolder &&
          p.insuredPerson === policyData.insuredPerson,
      );

      const base: Partial<PolicyRecord> = {
        policyNo: '',
        insurer: '',
        productName: policyData.productName || '未知产品',
        premium: policyData.premium ?? 0,
        sumAssured: 0,
        effectiveDate: policyData.effectiveDate || nowIso(),
        expiryDate: '',
        status: 'active',
        beneficiary: '',
        remarks: '',
        ...policyData,
      };

      if (existingIdx >= 0) {
        const merged: PolicyRecord = { ...policies[existingIdx], ...base, updatedAt: nowIso() };
        policies[existingIdx] = enrichPolicyWithRenewal(merged);
        updated++;
      } else {
        const newPolicy = enrichPolicyWithRenewal({
          ...base,
          id: nextId++,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        } as PolicyRecord);
        policies.push(newPolicy);
        created++;
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${(err as Error).message}`);
    }
  }

  store.set('policies', policies);
  return { created, updated, errors };
}

export async function exportPoliciesToCsv(familyId?: string): Promise<string> {
  const policies = await listPolicies();
  const filtered = familyId ? policies.filter((p) => p.familyId === familyId) : policies;
  return policiesToCsv(filtered);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getDashboardStats(): Promise<OfficeToolsStats> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as StoredFamily[];
  const rawPolicies = (store.get('policies') ?? []) as PolicyRecord[];
  const policies = rawPolicies.map(enrichPolicyWithRenewal);

  const totalPremium = policies.reduce((sum, p) => sum + (p.premium || 0), 0);
  const totalSumAssured = policies.reduce((sum, p) => sum + (p.sumAssured || 0), 0);
  const activePolicies = policies.filter((p) => p.status === 'active').length;
  const pendingPolicies = policies.filter((p) => p.status === 'pending').length;

  // Cumulative rolling windows: within30Days includes policies renewing within 7 days, etc.
  // Already-renewed policies are excluded from upcoming reminders.
  const upcomingRenewals = { within7Days: 0, within30Days: 0, within60Days: 0 };
  const statusDistribution = { normal: 0, grace: 0, lapsed: 0, renewed: 0 };
  const typeDistribution: Record<string, number> = {};

  for (const p of policies) {
    const status = p.renewalStatus;
    if (status && status in statusDistribution) {
      statusDistribution[status as keyof typeof statusDistribution]++;
    }

    // Upcoming reminders: daysToRenewal counts down to the next scheduled due
    // date (by contract). Count policies whose next due date is within the
    // rolling reminder window. Already-paid policies are excluded.
    if (status !== 'renewed') {
      const days = p.daysToRenewal;
      if (days !== undefined && days <= 7) upcomingRenewals.within7Days++;
      if (days !== undefined && days <= 30) upcomingRenewals.within30Days++;
      if (days !== undefined && days <= 60) upcomingRenewals.within60Days++;
    }

    const type = p.insuranceType;
    if (type) {
      const label = INSURANCE_TYPE_LABELS[type] || type;
      typeDistribution[label] = (typeDistribution[label] || 0) + 1;
    }
  }

  return {
    totalFamilies: (families as StoredFamily[]).length,
    totalPolicies: policies.length,
    totalPremium: Math.round(totalPremium * 100) / 100,
    totalSumAssured: Math.round(totalSumAssured * 100) / 100,
    activePolicies,
    pendingPolicies,
    documentsParsed: 0,
    upcomingRenewals,
    statusDistribution,
    typeDistribution,
  };
}

export async function getOfficeToolsStats(): Promise<OfficeToolsStats> {
  return getDashboardStats();
}
