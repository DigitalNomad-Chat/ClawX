/**
 * Policy Store — Electron-store backed persistence for insurance policies
 * Family 1:N Policy relationship, with simple in-memory indexing.
 */

import type { PolicyRecord, PolicyFamily, OfficeToolsStats } from '../../../src/modules/office-tools/types';
import {
  INSURANCE_TYPE_LABELS,
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

/**
 * Calculate renewal status from effective date and this-year renewal flag.
 * Pure function — does not depend on storage.
 */
export function calculateRenewalStatus(
  effectiveDate: string,
  thisYearRenewed: boolean,
): {
  renewalDate: string;
  renewalStatus: RenewalStatus;
  daysToRenewal: number;
} {
  const effDate = new Date(effectiveDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Next renewal date falls on the same month/day as effective date,
  // in the current or next year.
  const renewalDate = new Date(effDate);
  renewalDate.setFullYear(today.getFullYear());
  renewalDate.setHours(0, 0, 0, 0);
  if (renewalDate < today) {
    renewalDate.setFullYear(today.getFullYear() + 1);
  }

  const daysToRenewal = Math.ceil(
    (renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  let renewalStatus: RenewalStatus;
  if (thisYearRenewed) {
    renewalStatus = 'renewed';
  } else if (daysToRenewal >= 0) {
    renewalStatus = 'normal';
  } else if (daysToRenewal >= -60) {
    renewalStatus = 'grace';
  } else {
    renewalStatus = 'lapsed';
  }

  return {
    renewalDate: renewalDate.toISOString(),
    renewalStatus,
    daysToRenewal,
  };
}

/**
 * Enrich a policy object with computed renewal fields.
 */
export function enrichPolicyWithRenewal(policy: PolicyRecord): PolicyRecord {
  const effectiveDate = policy.effectiveDate || new Date().toISOString();
  const calc = calculateRenewalStatus(effectiveDate, policy.thisYearRenewed ?? false);

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

    // Only count not-yet-renewed policies as "upcoming" renewals.
    if (status !== 'renewed') {
      const days = p.daysToRenewal;
      if (days !== undefined && days >= 0) {
        if (days <= 7) upcomingRenewals.within7Days++;
        if (days <= 30) upcomingRenewals.within30Days++;
        if (days <= 60) upcomingRenewals.within60Days++;
      }
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
