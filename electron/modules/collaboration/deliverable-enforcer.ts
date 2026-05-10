"use strict";

/**
 * Collaboration Hall — Deliverable Enforcer
 *
 * Detects whether an agent's reply contains a concrete deliverable
 * (code, copy, URLs, plans, etc.). If not, marks it for retry.
 *
 * Adapted from Control Center's hall-runtime-dispatch.ts enforcement logic.
 */
import type { DispatchMode, HallOperatorIntent } from "./prompt-builder";
import type { ParsedStructuredBlock } from "./content-sanitizer";
import { sanitizeHallVisibleRuntimeText, inferHallResponseLanguage } from "./content-sanitizer";

export type ConcreteDeliverableKind =
  | "generic"
  | "repo_scan"
  | "thumbnail_urls"
  | "thumbnail_ideas"
  | "spoken_openings"
  | "hooks"
  | "script"
  | "review";

export interface EnforceResult {
  content: string;
  nextAction?: "continue" | "retry";
  nextStep?: string;
  suppressVisibleMessage?: boolean;
  /** Reason for retry, for debugging/telemetry */
  retryReason?: string;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function enforceConcreteDeliverable(
  mode: DispatchMode,
  task: string | undefined,
  visibleContent: string,
  structured: ParsedStructuredBlock,
  language: "zh" | "en",
  operatorIntent?: HallOperatorIntent,
): EnforceResult {
  // Blocked state always passes through
  if (structured.nextAction === "blocked" || looksLikeBlockedExecutionUpdate(visibleContent)) {
    return { content: visibleContent };
  }

  // Mode-specific enforcement
  if (mode === "discussion") {
    return enforceDiscussionDeliverable(visibleContent, operatorIntent, language);
  }

  if (mode === "review") {
    return enforceReviewDeliverable(visibleContent, structured, language);
  }

  if (mode === "handoff") {
    return enforceHandoffDeliverable(visibleContent, structured, language);
  }

  // execution mode (default)
  return enforceExecutionDeliverable(task, visibleContent, structured, language, operatorIntent);
}

// ---------------------------------------------------------------------------
//  Mode-specific enforcers
// ---------------------------------------------------------------------------

function enforceDiscussionDeliverable(
  visibleContent: string,
  operatorIntent: HallOperatorIntent | undefined,
  language: "zh" | "en",
): EnforceResult {
  // Non-direct discussion: no enforcement needed
  if (operatorIntent?.type !== "direct_ask") {
    return { content: visibleContent };
  }

  const task = operatorIntent?.text ?? "";
  const deliverableKind = resolveConcreteDeliverableKind(task, operatorIntent);

  // Direct ask with explicit deliverable kind
  if (deliverableKind !== "generic") {
    if (matchesConcreteDeliverableKind(deliverableKind, visibleContent, task)) {
      return { content: visibleContent };
    }
    return {
      content: visibleContent,
      nextAction: "retry",
      retryReason: "discussion_direct_ask_no_deliverable",
      nextStep: buildConcreteDeliverableRetryInstruction(task, language, operatorIntent),
    };
  }

  // Generic direct ask: relaxed check — just needs meaningful content
  if (visibleContent.trim().length >= 20) {
    return { content: visibleContent };
  }

  return {
    content: visibleContent,
    nextAction: "retry",
    retryReason: "discussion_direct_ask_too_short",
    nextStep: buildConcreteDeliverableRetryInstruction(task, language, operatorIntent),
  };
}

function enforceExecutionDeliverable(
  task: string | undefined,
  visibleContent: string,
  _structured: ParsedStructuredBlock,
  language: "zh" | "en",
  operatorIntent?: HallOperatorIntent,
): EnforceResult {
  const currentTask = task ?? "";
  const deliverableKind = resolveConcreteDeliverableKind(currentTask, operatorIntent);

  // execution mode: must have substantive result description (>= 50 chars)
  const sanitized = sanitizeHallVisibleRuntimeText(visibleContent).trim();
  const hasMinimumLength = sanitized.length >= 50;

  if (deliverableKind === "generic") {
    const looksLikeDeliverable = looksLikeConcreteExecutionDeliverable(visibleContent);
    if (looksLikeDeliverable && hasMinimumLength) {
      return { content: visibleContent };
    }
    const retryReason = !looksLikeDeliverable
      ? "execution_no_concrete_deliverable"
      : "execution_result_too_short";
    return {
      content: "",
      nextAction: "retry",
      suppressVisibleMessage: true,
      retryReason,
      nextStep: buildConcreteDeliverableRetryInstruction(currentTask, language, operatorIntent),
    };
  }

  // Specific deliverable kind check
  if (matchesConcreteDeliverableKind(deliverableKind, visibleContent, currentTask)) {
    if (hasMinimumLength) {
      return { content: visibleContent };
    }
  }

  if (looksLikeConcreteExecutionDeliverable(visibleContent)) {
    return {
      content: visibleContent,
      nextAction: "retry",
      retryReason: "execution_result_too_short",
      nextStep: buildConcreteDeliverableRetryInstruction(currentTask, language, operatorIntent),
    };
  }

  return {
    content: "",
    nextAction: "retry",
    suppressVisibleMessage: true,
    retryReason: "execution_no_concrete_deliverable",
    nextStep: buildConcreteDeliverableRetryInstruction(currentTask, language, operatorIntent),
  };
}

function enforceReviewDeliverable(
  visibleContent: string,
  structured: ParsedStructuredBlock,
  language: "zh" | "en",
): EnforceResult {
  const sanitized = sanitizeHallVisibleRuntimeText(visibleContent).trim();
  const hasExplicitOutcome =
    /(must-fix|不过|通过|pass|clean pass|硬问题|硬缺口|可以过|需要改|驳回|拒绝|拒绝通过)/i.test(sanitized)
    || structured.decision !== undefined;

  // review mode: must have explicit approve/reject determination
  if (hasExplicitOutcome && sanitized.length >= 15) {
    return { content: visibleContent };
  }

  const isZh = language === "zh";
  return {
    content: visibleContent,
    nextAction: "retry",
    retryReason: "review_no_explicit_outcome",
    nextStep: isZh
      ? "请直接给出明确的通过/驳回判定，并列出具体的 must-fix 项。不要只描述方向。"
      : "Please give an explicit approve/reject verdict and list specific must-fix items. Do not just describe the direction.",
  };
}

function enforceHandoffDeliverable(
  visibleContent: string,
  structured: ParsedStructuredBlock,
  language: "zh" | "en",
): EnforceResult {
  const sanitized = sanitizeHallVisibleRuntimeText(visibleContent).trim();

  // handoff mode: must summarize progress and specify next owner
  const hasProgressSummary = sanitized.length >= 30;
  const hasNextOwner = !!structured.executor || /(交接给|交给|下一步由|next owner|handoff to)/i.test(sanitized);

  if (hasProgressSummary && hasNextOwner) {
    return { content: visibleContent };
  }

  const isZh = language === "zh";
  return {
    content: visibleContent,
    nextAction: "retry",
    retryReason: "handoff_incomplete",
    nextStep: isZh
      ? "请总结当前进度和结果，并明确指定下一步负责人。"
      : "Please summarize current progress and results, and clearly specify the next owner.",
  };
}

// ---------------------------------------------------------------------------
//  Deliverable kind resolution
// ---------------------------------------------------------------------------

function resolveConcreteDeliverableKind(
  task: string | undefined,
  operatorIntent?: HallOperatorIntent,
): ConcreteDeliverableKind {
  const normalized = String(task || "").trim().toLowerCase();
  if (!normalized) return "generic";

  if (
    operatorIntent?.type === "review_request"
    || /(must-fix|review only|审核|评审|检查上一位结果|挑一下|挑出|只挑|硬问题|硬缺口)/i.test(normalized)
  ) {
    return "review";
  }

  if (operatorIntent?.type === "repo_scan_request" || /(scan|inspect|repo|codebase|仓库|源码|扫描代码|看代码|看仓库)/i.test(normalized)) {
    return "repo_scan";
  }

  if (/(thumbnail|缩略图)/i.test(normalized) && /(url|链接|image|图)/i.test(normalized)) {
    return "thumbnail_urls";
  }

  if (/(thumbnail|缩略图)/i.test(normalized)) {
    return "thumbnail_ideas";
  }

  if (/(视频开头|口播开头|开头文案|完整.*开头|完整可口播开头|video opening|spoken opening|intro line|opening lines|开场白|开场文案|开头)/i.test(normalized)) {
    return "spoken_openings";
  }

  if (/(hook|标题|文案)/i.test(normalized)) {
    return "hooks";
  }

  if (/(script|脚本|台词|分镜|storyboard|outline)/i.test(normalized)) {
    return "script";
  }

  return "generic";
}

// ---------------------------------------------------------------------------
//  Deliverable matching
// ---------------------------------------------------------------------------

function matchesConcreteDeliverableKind(
  kind: ConcreteDeliverableKind,
  content: string,
  task?: string,
): boolean {
  const normalized = sanitizeHallVisibleRuntimeText(content)
    .replace(/\u003cbr\s*\/?\u003e/gi, "\n")
    .trim();
  if (!normalized) return false;

  const requiredCount = resolveRequestedDeliverableCount(task);
  const listCount = countListLikeDeliverableItems(normalized);
  const quoteCount = countQuotedDeliverableItems(normalized);
  const urlMatches = normalized.match(/(?:https?:\/\/|file:\/\/\/)[^\s]+/gi) ?? [];

  switch (kind) {
    case "repo_scan":
      return /src\/[A-Za-z0-9._/-]+/.test(normalized)
        || (listCount >= 1 && normalized.length >= 120);

    case "review":
      return /(must-fix|不过|通过|pass|clean pass|硬问题|硬缺口|可以过|需要改)/i.test(normalized);

    case "thumbnail_urls":
      return urlMatches.length >= requiredCount;

    case "thumbnail_ideas":
      return listCount >= requiredCount
        || quoteCount >= requiredCount
        || (requiredCount <= 1 && /(thumbnail|缩略图)/i.test(normalized) && normalized.length >= 24);

    case "spoken_openings":
      return /开头\s*[123一二三]/i.test(normalized)
        || (quoteCount >= requiredCount)
        || (listCount >= requiredCount)
        || (requiredCount <= 1 && normalized.length >= 40);

    case "hooks":
      return listCount >= requiredCount || quoteCount >= requiredCount;

    case "script":
      return listCount >= 2
        || quoteCount >= 3
        || normalized.split("\n").filter((l) => l.trim().length > 0).length >= 3
        || normalized.length >= 160;

    case "generic":
    default:
      return looksLikeConcreteExecutionDeliverable(normalized);
  }
}

function resolveRequestedDeliverableCount(task: string | undefined): number {
  const normalized = String(task || "").trim();
  if (/(?:exactly\s*)?(?:three|3)\b|3\s*(?:个|条|版|种|份)|三\s*(?:个|条|版|种|份)/i.test(normalized)) return 3;
  if (/\b(?:one|single|1)\b|1\s*(?:个|条|版|种|份)|一\s*(?:个|条|版|种|份)/i.test(normalized)) return 1;
  return 1;
}

// ---------------------------------------------------------------------------
//  Concrete deliverable detection (reused from sanitizer)
// ---------------------------------------------------------------------------

function looksLikeConcreteExecutionDeliverable(content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const deliverableListCount = countListLikeDeliverableItems(content);
  const quotedItemCount = countQuotedDeliverableItems(content);
  const inlineEnum = [...normalized.matchAll(/(?:^|[\s，,:：;；（（。！？.!?])([1-9])[、,.，．]\s*([^0-9][^]*?)(?=(?:[\s，,:：;；（）.!?][1-9][、,.，．]\s*)|$)/g)];
  const hasInlineEnum = new Set(inlineEnum.map((m) => m[1])).size >= 2;

  return /(^|\n)\s*([0-9]+\.)\s/.test(content)
    || hasInlineEnum
    || deliverableListCount >= 3
    || quotedItemCount >= 3
    || /(thumbnail idea|hook 1|hook 2|hook 3|脚本初稿|thumbnail|hook 的三个版本|3 个 thumbnail idea|3 个 hook|3 条 hook|三条 hook|三个版本|方案一|方案二|方案三|版本一|版本二|版本三|开头 1|开头 2|开头 3|视频开头|口播开头|完整的三个视频开头|opening 1|opening 2|opening 3|intro 1|intro 2|intro 3|A\/B|A:|B:|must-fix|硬问题|硬缺口|可访问 URL|图片 URL|url|https?:\/\/|src\/[A-Za-z0-9._/-]+)/i.test(normalized);
}

function countListLikeDeliverableItems(content: string): number {
  const normalized = content.replace(/\u003cbr\s*\/?\u003e/gi, "\n").replace(/\r\n/g, "\n");
  const lineMatches = normalized.match(/^\s*(?:开头\s*)?(?:[1-9]|[一二三四五六七八九])[、,.，．:：)\]]\s+/gmu) ?? [];
  const inlineMatches = [
    ...normalized.matchAll(/(?:^|[\s，,:：;；（（。！？.!?])(?:开头\s*)?([1-9]|[一二三四五六七八九])[、,.，．:：)\]]\s*/gmu),
  ];
  return Math.max(lineMatches.length, new Set(inlineMatches.map((m) => m[1])).size);
}

function countQuotedDeliverableItems(content: string): number {
  const normalized = content.replace(/\u003cbr\s*\/?\u003e/gi, "\n");
  const chinese = normalized.match(/[“]([^”\n]{4,800})[”]/g) ?? [];
  const english = normalized.match(/["]([^"\n]{4,800})["]/g) ?? [];
  return chinese.length + english.length;
}

// ---------------------------------------------------------------------------
//  Blocked detection
// ---------------------------------------------------------------------------

function looksLikeBlockedExecutionUpdate(content: string): boolean {
  const normalized = sanitizeHallVisibleRuntimeText(content)
    .replace(/\u003cbr\s*\/?\u003e/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  return /(这一步.*卡住|先卡住了|当前.*卡住|被卡住|卡在|阻塞|缺的是|缺少|缺失|拿不到|没有.*(上下文|代码|文件|权限|信息)|无法继续|不能继续(?:这一棒|往下|执行)|still need|still missing|blocked on|blocked by|can't continue|cannot continue|need more context|need the repo|need the file)/i.test(normalized);
}

// ---------------------------------------------------------------------------
//  Retry instruction builder
// ---------------------------------------------------------------------------

function buildConcreteDeliverableRetryInstruction(
  task: string | undefined,
  language: "zh" | "en",
  operatorIntent?: HallOperatorIntent,
): string {
  const kind = resolveConcreteDeliverableKind(task, operatorIntent);

  const map: Record<ConcreteDeliverableKind, [string, string]> = {
    repo_scan: [
      "别再讲原则或价值，下一条直接贴代码发现：至少 2 个真实文件路径，并说明每个文件证明了什么。",
      "Stop meta-discussing and post concrete repo findings next: cite at least two real file paths and what each file proves.",
    ],
    thumbnail_urls: [
      "别再讲原则或价值，下一条直接贴 3 个 thumbnail 方向和对应 URL。",
      "Stop meta-discussing and post the concrete deliverable next: three thumbnail directions plus their URLs.",
    ],
    thumbnail_ideas: [
      "别再讲原则或价值，下一条直接贴 3 个 thumbnail 方向。",
      "Stop meta-discussing and post the concrete deliverable next: three thumbnail directions.",
    ],
    spoken_openings: [
      "别再讲原则或价值，下一条直接贴 3 个完整可口播的视频开头。",
      "Stop meta-discussing and post the concrete deliverable next: three complete spoken video openings.",
    ],
    hooks: [
      "别再讲原则或价值，下一条直接贴 3 个 hook。",
      "Stop meta-discussing and post the concrete deliverable next: three hooks.",
    ],
    script: [
      "别再讲原则或价值，下一条直接贴脚本/台词/分镜初稿。",
      "Stop meta-discussing and post the concrete deliverable next: the draft script, lines, or storyboard.",
    ],
    review: [
      "请直接列出 must-fix 项或通过结论，不要只讲方向。",
      "List must-fix items or an approval conclusion directly, not just commentary.",
    ],
    generic: [
      "别再讲原则或价值，下一条直接贴具体产物。",
      "Stop meta-discussing and post the concrete deliverable in the next reply.",
    ],
  };

  const [zh, en] = map[kind] || map.generic;
  return language === "zh" ? zh : en;
}
