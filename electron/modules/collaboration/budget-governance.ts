"use strict";

/**
 * Collaboration Hall — Budget Governance
 *
 * Evaluates current consumption vs budget and decides whether to allow
 * further execution. Currently uses estimated consumption (message length
 * × model coefficient) because ClawX Gateway does not expose precise
 * token-usage APIs.
 */
import { getPolicy, getTaskAllocation } from "./budget-store";
import type { BudgetPolicy, HallTaskCard } from "./types";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  remainingRatio: number;
  alertTriggered: boolean;
}

/**
 * Estimate token count from text length.
 * Heuristic: ~0.75 tokens per English char, ~1.5 per CJK char.
 */
function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs + CJK Extension blocks + Hiragana + Katakana
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      tokens += 1.5;
    } else {
      tokens += 0.75;
    }
  }
  return Math.ceil(tokens);
}

/**
 * Check whether a task is still within its budget.
 */
export async function checkTaskBudget(
  taskCard: HallTaskCard,
  options?: { estimatedTokens?: number; estimatedCost?: number },
): Promise<BudgetCheckResult> {
  if (!taskCard.budgetLimit || taskCard.budgetLimit <= 0) {
    return { allowed: true, remainingRatio: 1, alertTriggered: false };
  }

  const allocation = await getTaskAllocation(taskCard.taskCardId);
  const consumedTokens = allocation?.consumedTokens ?? 0;
  const consumedCost = allocation?.consumedCost ?? 0;

  // If a policy is linked, use policy limits; otherwise use task-level limit
  const policy = allocation?.policyId ? await getPolicy(allocation.policyId) : undefined;

  const totalLimit = policy?.perTaskTokenLimit ?? taskCard.budgetLimit;
  const threshold = policy?.alertThreshold ?? taskCard.budgetAlertThreshold ?? 0.8;

  const projectedTokens = consumedTokens + (options?.estimatedTokens ?? 0);
  const projectedCost = consumedCost + (options?.estimatedCost ?? 0);

  const remainingRatio = Math.max(0, 1 - projectedTokens / totalLimit);
  const alertTriggered = remainingRatio <= threshold;

  if (projectedTokens > totalLimit) {
    return {
      allowed: false,
      reason: `预算超限: 预计消耗 ${Math.round(projectedTokens)} tokens，限额 ${totalLimit}`,
      remainingRatio,
      alertTriggered: true,
    };
  }

  return {
    allowed: true,
    remainingRatio,
    alertTriggered,
  };
}

/**
 * Record estimated consumption for a task.
 */
export async function consumeTaskBudget(
  taskCard: HallTaskCard,
  content: string,
  options?: { cost?: number; policyId?: string },
): Promise<void> {
  if (!taskCard.budgetLimit || taskCard.budgetLimit <= 0) return;

  const tokens = estimateTokens(content);
  const allocation = await getTaskAllocation(taskCard.taskCardId);
  const policyId = options?.policyId ?? allocation?.policyId ?? "default";

  await upsertTaskAllocation(
    taskCard.taskCardId,
    policyId,
    (allocation?.consumedTokens ?? 0) + tokens,
    (allocation?.consumedCost ?? 0) + (options?.cost ?? 0),
  );
}

// Re-export store helpers for convenience
export { getPolicy, getTaskAllocation, upsertTaskAllocation } from "./budget-store";
