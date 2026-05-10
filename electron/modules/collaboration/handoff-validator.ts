"use strict";

/**
 * Collaboration Hall — Handoff Validator
 *
 * Validates a StructuredHandoffPacket before accepting a handoff.
 * Ensures all required fields are present and contain substantive content.
 */
import type { StructuredHandoffPacket, HallParticipant } from "./types";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface HandoffValidationResult {
  valid: boolean;
  errors: HandoffValidationError[];
  warnings: HandoffValidationWarning[];
}

export interface HandoffValidationError {
  field: keyof StructuredHandoffPacket;
  code: string;
  message: string;
}

export interface HandoffValidationWarning {
  field: keyof StructuredHandoffPacket;
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
//  Placeholder patterns (common non-substantive content)
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^[-—]+$/i,
  /^(待定|无|暂无|TBD|N\/A|n\/a|none|null|undefined|TODO|todo)$/i,
  /^(请填写|请补充|待补充|待完善)$/i,
];

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Validate a structured handoff packet.
 *
 * Rules:
 *   - `goal` must be non-empty and not a placeholder
 *   - `currentResult` must contain substantive content (>= 10 chars, not placeholder)
 *   - `nextOwner` must be a valid participantId from the participant list (if provided)
 *   - `doneWhen` should be a verifiable condition (warning if missing or vague)
 *   - `blockers` items must be non-empty strings (warning if present but empty items)
 */
export function validateHandoffPacket(
  packet: Partial<StructuredHandoffPacket> | undefined | null,
  participants?: HallParticipant[],
): HandoffValidationResult {
  const errors: HandoffValidationError[] = [];
  const warnings: HandoffValidationWarning[] = [];

  if (!packet) {
    errors.push({
      field: "goal",
      code: "MISSING_PACKET",
      message: "移交数据包缺失",
    });
    return { valid: false, errors, warnings };
  }

  // goal — required, non-placeholder
  if (!packet.goal || isPlaceholder(packet.goal)) {
    errors.push({
      field: "goal",
      code: "GOAL_MISSING_OR_PLACEHOLDER",
      message: packet.goal
        ? "任务目标 (goal) 内容无效（占位符或过短）"
        : "任务目标 (goal) 不能为空",
    });
  }

  // currentResult — required, substantive (>= 10 chars)
  if (!packet.currentResult || isPlaceholder(packet.currentResult)) {
    errors.push({
      field: "currentResult",
      code: "RESULT_MISSING_OR_PLACEHOLDER",
      message: packet.currentResult
        ? "当前结果 (currentResult) 内容无效（占位符或过短）"
        : "当前结果 (currentResult) 不能为空",
    });
  } else if (packet.currentResult.trim().length < 10) {
    warnings.push({
      field: "currentResult",
      code: "RESULT_TOO_SHORT",
      message: "当前结果 (currentResult) 内容过短，建议提供更详细的描述",
    });
  }

  // nextOwner — required if participants provided, must be valid
  if (!packet.nextOwner || isPlaceholder(packet.nextOwner)) {
    errors.push({
      field: "nextOwner",
      code: "NEXT_OWNER_MISSING",
      message: "下一负责人 (nextOwner) 不能为空",
    });
  } else if (participants && participants.length > 0) {
    const validIds = participants.map((p) => p.participantId);
    const validAliases = participants.flatMap((p) => p.aliases);
    const match = validIds.includes(packet.nextOwner)
      || validAliases.includes(packet.nextOwner)
      || participants.some((p) => p.displayName === packet.nextOwner);

    if (!match) {
      errors.push({
        field: "nextOwner",
        code: "NEXT_OWNER_NOT_FOUND",
        message: `下一负责人 '${packet.nextOwner}' 不在参与者列表中`,
      });
    }
  }

  // doneWhen — recommended, warning if missing
  if (!packet.doneWhen || isPlaceholder(packet.doneWhen)) {
    warnings.push({
      field: "doneWhen",
      code: "DONE_WHEN_MISSING",
      message: "建议提供完成标准 (doneWhen) 以便验证交付质量",
    });
  } else if (packet.doneWhen.trim().length < 5) {
    warnings.push({
      field: "doneWhen",
      code: "DONE_WHEN_VAGUE",
      message: "完成标准 (doneWhen) 描述过短，建议更具体的验证条件",
    });
  }

  // blockers — check for empty items
  if (packet.blockers && packet.blockers.length > 0) {
    const emptyBlockers = packet.blockers.filter((b) => !b || !b.trim());
    if (emptyBlockers.length > 0) {
      warnings.push({
        field: "blockers",
        code: "EMPTY_BLOCKERS",
        message: `阻塞项中包含 ${emptyBlockers.length} 个空条目`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Build a StructuredHandoffPacket from the structured block fields
 * that runtime-dispatch already parses from agent replies.
 */
export function buildHandoffPacketFromStructured(
  structured: {
    latestSummary?: string;
    nextStep?: string;
    executor?: string;
    doneWhen?: string;
    blockers?: string[];
    requiresInputFrom?: string[];
  },
  taskCard: { title: string; description: string; doneWhen?: string },
): StructuredHandoffPacket {
  return {
    goal: taskCard.title,
    currentResult: structured.latestSummary || structured.nextStep || "",
    doneWhen: structured.doneWhen || taskCard.doneWhen || "",
    blockers: structured.blockers ?? [],
    nextOwner: structured.executor || "",
    requiresInputFrom: structured.requiresInputFrom ?? [],
  };
}
