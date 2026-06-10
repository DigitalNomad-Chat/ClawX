/**
 * Policy Store — Electron-store backed persistence for insurance policies
 * Family 1:N Policy relationship, with simple in-memory indexing.
 */

import type { PolicyRecord, PolicyFamily, OfficeToolsStats } from '../../../src/modules/office-tools/types';

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
        families: [] as { id: string; name: string; createdAt: string }[],
      },
    });
  }
  return policyStoreInstance;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Family operations
// ---------------------------------------------------------------------------

export async function listFamilies(): Promise<PolicyFamily[]> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as { id: string; name: string; createdAt: string }[];
  const policies = (store.get('policies') ?? []) as PolicyRecord[];

  return families.map((f) => {
    const famPolicies = policies.filter((p) => p.familyId === f.id);
    return {
      id: f.id,
      name: f.name,
      memberCount: famPolicies.length,
      totalPremium: famPolicies.reduce((sum, p) => sum + (p.premium || 0), 0),
      totalSumAssured: famPolicies.reduce((sum, p) => sum + (p.sumAssured || 0), 0),
      policies: famPolicies,
    };
  });
}

export async function getFamily(familyId: string): Promise<PolicyFamily | null> {
  const families = await listFamilies();
  return families.find((f) => f.id === familyId) ?? null;
}

export async function createFamily(name: string): Promise<{ id: string; name: string; createdAt: string }> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as { id: string; name: string; createdAt: string }[];
  const family = {
    id: `fam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    createdAt: nowIso(),
  };
  families.push(family);
  store.set('families', families);
  return family;
}

export async function updateFamily(familyId: string, patch: { name?: string }): Promise<boolean> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as { id: string; name: string; createdAt: string }[];
  const idx = families.findIndex((f) => f.id === familyId);
  if (idx === -1) return false;
  if (patch.name !== undefined) families[idx].name = patch.name.trim();
  store.set('families', families);
  return true;
}

export async function deleteFamily(familyId: string): Promise<boolean> {
  const store = await getPolicyStore();
  const families = (store.get('families') ?? []) as { id: string; name: string; createdAt: string }[];
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
  return (store.get('policies') ?? []) as PolicyRecord[];
}

export async function getPolicy(id: number): Promise<PolicyRecord | null> {
  const policies = await listPolicies();
  return policies.find((p) => p.id === id) ?? null;
}

export async function createPolicy(input: Omit<PolicyRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PolicyRecord> {
  const store = await getPolicyStore();
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  const maxId = policies.reduce((max, p) => Math.max(max, p.id || 0), 0);
  const policy: PolicyRecord = {
    ...input,
    id: maxId + 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  policies.push(policy);
  store.set('policies', policies);
  return policy;
}

export async function updatePolicy(id: number, patch: Partial<Omit<PolicyRecord, 'id' | 'createdAt'>>): Promise<PolicyRecord | null> {
  const store = await getPolicyStore();
  const policies = (store.get('policies') ?? []) as PolicyRecord[];
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  policies[idx] = { ...policies[idx], ...patch, updatedAt: nowIso() };
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
// Stats
// ---------------------------------------------------------------------------

export async function getOfficeToolsStats(): Promise<OfficeToolsStats> {
  const families = await listFamilies();
  const policies = await listPolicies();
  const activePolicies = policies.filter((p) => p.status === 'active').length;
  const pendingPolicies = policies.filter((p) => p.status === 'pending').length;

  return {
    totalFamilies: families.length,
    totalPolicies: policies.length,
    totalPremium: policies.reduce((sum, p) => sum + (p.premium || 0), 0),
    totalSumAssured: policies.reduce((sum, p) => sum + (p.sumAssured || 0), 0),
    activePolicies,
    pendingPolicies,
    documentsParsed: 0, // populated by document-parser store later
  };
}
