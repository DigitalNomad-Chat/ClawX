"use strict";

/**
 * Collaboration Hall — Content Sanitizer
 *
 * Cleans agent runtime output into human-readable visible text.
 * Removes ANSI escapes, tool traces, thinking processes, meta-discussion,
 * and extracts artifact references (URLs, file paths, markdown links).
 *
 * Adapted from Control Center's hall-runtime-dispatch.ts sanitizer logic.
 */
import type { TaskArtifact } from "./types";
import type { DispatchMode } from "./prompt-builder";

export interface SanitizedContent {
  visibleText: string;
  structuredBlock?: ParsedStructuredBlock;
  artifactRefs: TaskArtifact[];
}

export interface ParsedStructuredBlock {
  proposal?: string;
  decision?: string;
  executor?: string;
  doneWhen?: string;
  blockers?: string[];
  requiresInputFrom?: string[];
  latestSummary?: string;
  nextAction?: "continue" | "review" | "blocked" | "handoff" | "done";
  nextStep?: string;
  artifactRefs?: TaskArtifact[];
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function sanitizeAgentReply(rawText: string): SanitizedContent {
  const { visibleText, structured } = extractStructuredBlock(rawText);
  const sanitized = sanitizeHallVisibleRuntimeText(visibleText);
  const artifactRefs = mergeArtifactRefs(
    structured.artifactRefs,
    extractArtifactRefsFromVisibleContent(sanitized),
  );

  return {
    visibleText: sanitized,
    structuredBlock: structured,
    artifactRefs,
  };
}

export function formatVisibleContentForMode(
  mode: DispatchMode,
  raw: string,
  language: "zh" | "en",
): string {
  if (mode === "discussion") {
    return compactHallDiscussionReply(sanitizeHallVisibleRuntimeText(raw), language);
  }
  return compactHallCoworkerReply(sanitizeHallVisibleRuntimeText(raw), language);
}

export function inferHallResponseLanguage(source: string | undefined): "zh" | "en" {
  const value = String(source ?? "").trim();
  if (!value) return "en";
  const cjk = value.match(/[\u4e00-\u9fff]/g) ?? [];
  const latin = value.match(/[A-Za-z]/g) ?? [];
  if (cjk.length > 0) return "zh";
  if (latin.length > 0) return "en";
  return "en";
}

// ---------------------------------------------------------------------------
//  Structured block parser
// ---------------------------------------------------------------------------

function extractStructuredBlock(rawText: string): { visibleText: string; structured: ParsedStructuredBlock } {
  const match = /\u003chall-structured\u003e\s*([\s\S]*?)\s*\u003c\/hall-structured\u003e/i.exec(rawText);
  if (!match) {
    const dangling = rawText.search(/\u003chall-structured\u003e/i);
    const visibleText = (dangling >= 0 ? rawText.slice(0, dangling) : rawText).trim();
    return { visibleText, structured: {} };
  }

  let structured: ParsedStructuredBlock = {};
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    structured = {
      proposal: asOptionalString(parsed.proposal),
      decision: asOptionalString(parsed.decision),
      executor: asOptionalString(parsed.executor),
      doneWhen: asOptionalString(parsed.doneWhen),
      blockers: asOptionalStringArray(parsed.blockers),
      requiresInputFrom: asOptionalStringArray(parsed.requiresInputFrom),
      latestSummary: asOptionalString(parsed.latestSummary),
      nextAction: asOptionalNextAction(parsed.nextAction),
      nextStep: asOptionalString(parsed.nextStep),
      artifactRefs: asOptionalArtifactRefs(parsed.artifactRefs),
    };
  } catch {
    structured = {};
  }

  const visibleText = rawText.replace(match[0], "").trim();
  return { visibleText, structured };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function asOptionalNextAction(value: unknown): ParsedStructuredBlock["nextAction"] | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (["continue", "review", "blocked", "handoff", "done"].includes(v)) {
    return v as ParsedStructuredBlock["nextAction"];
  }
  return undefined;
}

function asOptionalArtifactRefs(value: unknown): TaskArtifact[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .map((item) => normalizeArtifactRef(item))
    .filter((item): item is TaskArtifact => Boolean(item));
  return refs.length > 0 ? refs : undefined;
}

function normalizeArtifactRef(value: unknown): TaskArtifact | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const location = typeof obj.location === "string" ? obj.location.trim() : "";
  if (!location) return undefined;
  const label = typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : inferArtifactLabel(location);
  const explicitType = typeof obj.type === "string" ? obj.type.trim().toLowerCase() : "";
  const type = ["code", "doc", "link", "other"].includes(explicitType)
    ? (explicitType as TaskArtifact["type"])
    : inferArtifactType(location);
  const artifactId = typeof obj.artifactId === "string" && obj.artifactId.trim()
    ? obj.artifactId.trim()
    : buildArtifactId(location);
  return { artifactId, type, label, location };
}

// ---------------------------------------------------------------------------
//  Visible text sanitizer
// ---------------------------------------------------------------------------

export function sanitizeHallVisibleRuntimeText(raw: string | undefined): string {
  const value = String(raw ?? "");
  const normalized = value
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "\n")
    .replace(/\u003chall-structured\u003e[\s\S]*?(?:\u003c\/hall-structured\u003e|$)/gi, "");

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("🦞 OpenClaw"))
    .filter((line) => !line.startsWith("Registered plugin command:"))
    .filter((line) => !/Waiting for agent reply/i.test(line))
    .filter((line) => !/^[◒◐◓◑◇│]+$/.test(line))
    .filter((line) => !/^流式中$/i.test(line))
    .filter((line) => !/\u003c\/?hall-structured\u003e/i.test(line))
    .filter((line) => !/^[\[{]?\s*"?(nextAction|nextStep|latestSummary|artifactRefs|proposal|decision|executor|doneWhen|blockers|requiresInputFrom)"\s*:/i.test(line))
    .filter((line) => !/^\[tool(?:[^\]]*)?\]/i.test(line))
    .filter((line) => !/^thinking\b/i.test(line))
    .filter((line) => !/^Inspecting\b/i.test(line))
    .filter((line) => !/^Checking\b/i.test(line))
    .filter((line) => !/^Considering\b/i.test(line))
    .filter((line) => !/^Maybe\b/i.test(line))
    .filter((line) => !/^It seems\b/i.test(line))
    .filter((line) => !/^Since the user\b/i.test(line))
    .filter((line) => !/^I should\b/i.test(line))
    .filter((line) => !/^I think\b/i.test(line))
    .filter((line) => !/^I might\b/i.test(line))
    .filter((line) => !/^I can\b/i.test(line))
    .filter((line) => !/^Let's\b/i.test(line))
    .filter((line) => !/^\[\/?tool\]/i.test(line))
    .filter((line) => !/^```(?:ts|tsx|js|jsx|json|sh|bash)?$/i.test(line))
    .filter((line) => !/^(import|export)\s+/i.test(line))
    .filter((line) => !/(数据缺失|未验证素材|验收标准|创意约束|not a verified finding|validation constraint)/i.test(line));

  if (lines.length === 0 && value.includes("\u003chall-structured\u003e")) {
    return "";
  }

  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
//  Artifact extraction from visible content
// ---------------------------------------------------------------------------

function extractArtifactRefsFromVisibleContent(content: string): TaskArtifact[] {
  const refs: TaskArtifact[] = [];
  const seen = new Set<string>();

  const pushRef = (location: string, label?: string): void => {
    const normalized = location.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({
      artifactId: buildArtifactId(normalized),
      type: inferArtifactType(normalized),
      label: label?.trim() || inferArtifactLabel(normalized),
      location: normalized,
    });
  };

  const mdImage = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
  const url = /https?:\/\/[^\s<)]+/gi;

  for (const m of content.matchAll(mdImage)) pushRef(m[2] ?? "", m[1] ?? "");
  for (const m of content.matchAll(mdLink)) pushRef(m[2] ?? "", m[1] ?? "");
  for (const m of content.matchAll(url)) pushRef(m[0] ?? "");

  return refs;
}

function mergeArtifactRefs(...groups: Array<TaskArtifact[] | undefined>): TaskArtifact[] {
  const merged = new Map<string, TaskArtifact>();
  for (const group of groups) {
    if (!group) continue;
    for (const a of group) {
      if (!a?.location) continue;
      const key = a.location.toLowerCase();
      if (merged.has(key)) continue;
      merged.set(key, a);
    }
  }
  return [...merged.values()];
}

// ---------------------------------------------------------------------------
//  Compaction helpers
// ---------------------------------------------------------------------------

function compactHallDiscussionReply(content: string, language: "zh" | "en"): string {
  const normalized = sanitizeHallVisibleRuntimeText(content)
    .replace(/\u003cbr\s*\/?\u003e/gi, "\n")
    .trim();
  if (!normalized) return content;

  return normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\u003cbr\u003e");
}

function compactHallCoworkerReply(content: string, language: "zh" | "en"): string {
  const normalized = sanitizeHallVisibleRuntimeText(content)
    .replace(/\u003cbr\s*\/?\u003e/gi, "\n")
    .trim();
  if (!normalized) return content;

  // If it already looks like a concrete deliverable, keep it
  if (looksLikeConcreteExecutionDeliverable(normalized)) return normalized;

  const rawSegments = normalized
    .split(/\n+/)
    .flatMap((line) => line.split(language === "zh" ? /(?<=[。！？])/ : /(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const segments = rawSegments.filter((segment) => {
    if (seen.has(segment)) return false;
    seen.add(segment);
    // Filter out meta-discussion prefixes
    return !/^(我先把|当前结果是|现阶段|一句话先锁|我这边先|这版先|我建议下一步|建议下一步|这里最重要的是|基于现有上下文|从.*角度来看|I want to clarify|At this stage|Current result:|Here is the current state|For this round|At this point|Based on the current context|The key thing is)/i.test(segment);
  });

  if (segments.length === 0) return normalized;
  return segments.join("\u003cbr\u003e");
}

// ---------------------------------------------------------------------------
//  Deliverable detection
// ---------------------------------------------------------------------------

function looksLikeConcreteExecutionDeliverable(content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const deliverableListCount = countListLikeDeliverableItems(content);
  const quotedItemCount = countQuotedDeliverableItems(content);
  const inlineEnum = [...normalized.matchAll(/(?:^|[\s，,:：;；(（。！？.!?])([1-9])[、,.，．]\s*([^0-9][^]*?)(?=(?:[\s，,:：;；（）.!?][1-9][、,.，．]\s*)|$)/g)];
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
//  Artifact helpers
// ---------------------------------------------------------------------------

function inferArtifactType(location: string): TaskArtifact["type"] {
  const normalized = location.trim().toLowerCase();
  if (/\.(ts|tsx|js|jsx|json|py|rb|go|rs|java|kt|swift|sh|sql|yaml|yml)(?:[?#].*)?$/.test(normalized)) return "code";
  if (/\.(md|txt|pdf|docx?|pptx?|csv|xlsx?)(?:[?#].*)?$/.test(normalized)) return "doc";
  if (/^https?:\/\//.test(normalized)) return "link";
  return "other";
}

function inferArtifactLabel(location: string): string {
  try {
    const url = new URL(location);
    const pathname = url.pathname.split("/").filter(Boolean);
    return pathname.at(-1) || url.hostname || location;
  } catch {
    const tokens = location.split(/[\\/]/).filter(Boolean);
    return tokens.at(-1) || location;
  }
}

function buildArtifactId(seed: string): string {
  return `artifact-${stableHash(seed).toString(16)}`;
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}
