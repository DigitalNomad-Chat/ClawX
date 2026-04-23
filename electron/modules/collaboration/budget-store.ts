"use strict";

/**
 * Collaboration Hall — Budget Store
 *
 * Stores BudgetPolicy and per-task allocations in a dedicated JsonStore.
 */
import { JsonStore } from "../_shared/json-store";
import { getModuleFilePath } from "../_shared/runtime-path";
import type { BudgetPolicy, TaskBudgetAllocation } from "./types";

interface BudgetStoreSnapshot {
  policies: BudgetPolicy[];
  taskAllocations: TaskBudgetAllocation[];
  updatedAt: string;
}

function createBudgetStore(): JsonStore<BudgetStoreSnapshot> {
  return new JsonStore<BudgetStoreSnapshot>({
    filePath: getModuleFilePath("collaboration", "budget.json"),
    defaultValue: {
      policies: [],
      taskAllocations: [],
      updatedAt: new Date(0).toISOString(),
    },
    schemaVersion: 1,
  });
}

let budgetStore: JsonStore<BudgetStoreSnapshot> | null = null;

function getBudgetStore(): JsonStore<BudgetStoreSnapshot> {
  if (!budgetStore) budgetStore = createBudgetStore();
  return budgetStore;
}

export async function loadBudgetStore(): Promise<BudgetStoreSnapshot> {
  return getBudgetStore().read();
}

// ---------------------------------------------------------------------------
//  Policy CRUD
// ---------------------------------------------------------------------------

export async function listPolicies(): Promise<BudgetPolicy[]> {
  const store = await loadBudgetStore();
  return store.policies;
}

export async function getPolicy(policyId: string): Promise<BudgetPolicy | undefined> {
  const store = await loadBudgetStore();
  return store.policies.find((p) => p.policyId === policyId);
}

export async function createPolicy(
  input: Omit<BudgetPolicy, "policyId" | "createdAt">,
): Promise<BudgetPolicy> {
  const store = await loadBudgetStore();
  const now = new Date().toISOString();
  const policy: BudgetPolicy = {
    ...input,
    policyId: `policy-${Date.now()}`,
    createdAt: now,
  };
  store.policies.push(policy);
  store.updatedAt = now;
  await getBudgetStore().write(store);
  return policy;
}

export async function updatePolicy(
  policyId: string,
  input: Partial<Omit<BudgetPolicy, "policyId" | "createdAt">>,
): Promise<BudgetPolicy | undefined> {
  const store = await loadBudgetStore();
  const idx = store.policies.findIndex((p) => p.policyId === policyId);
  if (idx === -1) return undefined;
  store.policies[idx] = { ...store.policies[idx], ...input };
  store.updatedAt = new Date().toISOString();
  await getBudgetStore().write(store);
  return store.policies[idx];
}

export async function deletePolicy(policyId: string): Promise<boolean> {
  const store = await loadBudgetStore();
  const before = store.policies.length;
  store.policies = store.policies.filter((p) => p.policyId !== policyId);
  if (store.policies.length === before) return false;
  store.updatedAt = new Date().toISOString();
  await getBudgetStore().write(store);
  return true;
}

// ---------------------------------------------------------------------------
//  Task Allocation
// ---------------------------------------------------------------------------

export async function getTaskAllocation(taskCardId: string): Promise<TaskBudgetAllocation | undefined> {
  const store = await loadBudgetStore();
  return store.taskAllocations.find((a) => a.taskCardId === taskCardId);
}

export async function upsertTaskAllocation(
  taskCardId: string,
  policyId: string,
  consumedTokens: number,
  consumedCost: number,
): Promise<TaskBudgetAllocation> {
  const store = await loadBudgetStore();
  const now = new Date().toISOString();
  const idx = store.taskAllocations.findIndex((a) => a.taskCardId === taskCardId);

  const allocation: TaskBudgetAllocation = {
    taskCardId,
    policyId,
    consumedTokens,
    consumedCost,
    lastUpdatedAt: now,
  };

  if (idx >= 0) {
    store.taskAllocations[idx] = allocation;
  } else {
    store.taskAllocations.push(allocation);
  }

  store.updatedAt = now;
  await getBudgetStore().write(store);
  return allocation;
}
