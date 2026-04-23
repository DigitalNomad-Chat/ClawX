"use strict";

/**
 * Collaboration Hall — Prompt Builder
 *
 * Builds differentiated prompts based on dispatch mode:
 *   discussion  → encourage multi-angle analysis, no concrete deliverable required
 *   execution   → require concrete deliverable (code/copy/URL), include doneWhen
 *   handoff     → summarize progress, specify next owner
 *   review      → review previous output, list must-fix items
 *
 * All modes append a <hall-structured> JSON block requirement at the end.
 */
import type {
  CollaborationHall,
  HallExecutionItem,
  HallMessage,
  HallParticipant,
  HallTaskCard,
} from "./types";

export type DispatchMode = "discussion" | "execution" | "handoff" | "review";

export interface PromptBuildInput {
  mode: DispatchMode;
  participant: HallParticipant;
  taskCard: HallTaskCard;
  hall: CollaborationHall;
  triggerMessage?: HallMessage;
  recentMessages?: HallMessage[];
  currentExecutionItem?: HallExecutionItem;
  operatorIntent?: HallOperatorIntent;
}

export interface HallOperatorIntent {
  type: "direct_ask" | "review_request" | "repo_scan_request" | "general";
  text?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userMessage: string;
  mode: DispatchMode;
  expectedOutputFormat: "structured" | "free";
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function buildDispatchPrompt(input: PromptBuildInput): BuiltPrompt {
  const { mode, participant, taskCard, hall, recentMessages } = input;
  const language = inferLanguage(taskCard, input.triggerMessage);
  const roleLabel = translateRole(participant.semanticRole, language);
  const coworkerLines = buildCoworkerContext(hall, participant);
  const historyLines = buildMessageHistory(recentMessages ?? [], participant);

  const systemPrompt = buildSystemPrompt(mode, language, roleLabel);
  const userMessage = buildUserMessage({
    mode,
    taskCard,
    participant,
    hall,
    coworkerLines,
    historyLines,
    currentExecutionItem: input.currentExecutionItem,
    operatorIntent: input.operatorIntent,
    language,
  });

  return {
    systemPrompt,
    userMessage,
    mode,
    expectedOutputFormat: "structured",
  };
}

// ---------------------------------------------------------------------------
//  System prompt per mode
// ---------------------------------------------------------------------------

function buildSystemPrompt(mode: DispatchMode, language: "zh" | "en", roleLabel: string): string {
  const isZh = language === "zh";

  if (mode === "discussion") {
    return isZh
      ? `你是一位名叫"${roleLabel}"的协作者，正在群聊大厅中参与任务讨论。请从专业角度发表你的观点，不要求产出具体交付物。保持简洁，避免重复他人的观点。`
      : `You are a collaborator named "${roleLabel}" participating in a group discussion hall. Share your professional perspective concisely. Avoid repeating what others have said.`;
  }

  if (mode === "execution") {
    return isZh
      ? `你是一位名叫"${roleLabel}"的执行者。你的任务要求产出具体交付物（代码、文案、URL、方案等），不要只评论方向。请在回复末尾附上 <hall-structured> JSON 块。`
      : `You are an executor named "${roleLabel}". You must produce concrete deliverables (code, copy, URLs, plans). Do not just comment on direction. Append a <hall-structured> JSON block at the end.`;
  }

  if (mode === "handoff") {
    return isZh
      ? `你是一位名叫"${roleLabel}"的执行者，正在完成任务并准备交接。请总结当前进度、已完成的部分、阻塞项，并明确下一步应该交给谁。在回复末尾附上 <hall-structured> JSON 块。`
      : `You are an executor named "${roleLabel}" wrapping up your task and preparing to hand off. Summarize progress, blockers, and clearly state who should take the next step. Append a <hall-structured> JSON block at the end.`;
  }

  // review
  return isZh
    ? `你是一位名叫"${roleLabel}"的评审者。请检查上一位执行者的产出，列出 must-fix（必须修改）项。如果质量合格，直接通过。在回复末尾附上 <hall-structured> JSON 块。`
    : `You are a reviewer named "${roleLabel}". Inspect the previous executor's output and list must-fix items. If quality is acceptable, approve directly. Append a <hall-structured> JSON block at the end.`;
}

// ---------------------------------------------------------------------------
//  User message builder
// ---------------------------------------------------------------------------

interface UserMessageInput {
  mode: DispatchMode;
  taskCard: HallTaskCard;
  participant: HallParticipant;
  hall: CollaborationHall;
  coworkerLines: string[];
  historyLines: string[];
  currentExecutionItem?: HallExecutionItem;
  operatorIntent?: HallOperatorIntent;
  language: "zh" | "en";
}

function buildUserMessage(input: UserMessageInput): string {
  const { mode, taskCard, participant, coworkerLines, historyLines, currentExecutionItem, operatorIntent, language } = input;
  const isZh = language === "zh";
  const lines: string[] = [];

  // Header
  lines.push(isZh ? `# 任务：${taskCard.title}` : `# Task: ${taskCard.title}`);
  if (taskCard.description) {
    lines.push(isZh ? "## 描述" : "## Description");
    lines.push(taskCard.description);
  }
  if (taskCard.doneWhen) {
    lines.push(isZh ? "## 完成标准 (Done When)" : "## Done When");
    lines.push(taskCard.doneWhen);
  }
  if (taskCard.latestSummary) {
    lines.push(isZh ? "## 当前进展" : "## Current Progress");
    lines.push(taskCard.latestSummary);
  }

  // Execution item (execution / handoff / review)
  if (currentExecutionItem && mode !== "discussion") {
    lines.push(isZh ? "## 当前步骤" : "## Current Step");
    lines.push(currentExecutionItem.task);
  }

  // Operator intent (direct human instruction)
  if (operatorIntent?.text) {
    lines.push(isZh ? "## 指令" : "## Instruction");
    lines.push(operatorIntent.text);
  }

  // Coworker context
  if (coworkerLines.length > 0) {
    lines.push(isZh ? "## 协作者" : "## Coworkers");
    lines.push(...coworkerLines);
  }

  // Recent messages
  if (historyLines.length > 0) {
    lines.push(isZh ? "## 最近讨论" : "## Recent Discussion");
    lines.push(...historyLines);
  }

  // Structured block instruction
  lines.push("");
  lines.push(isZh
    ? structuredInstructionZh(participant.displayName)
    : structuredInstructionEn(participant.displayName));

  return lines.join("\n");
}

function structuredInstructionZh(displayName: string): string {
  return `请在回复末尾严格按以下格式输出 JSON（不要换行在标签内）：

<hall-structured>
{
  "proposal": "你的建议（可选）",
  "decision": "你的决策（可选）",
  "executor": "建议的下一个执行者名字（可选）",
  "doneWhen": "完成标准（可选）",
  "blockers": ["阻塞项1", "阻塞项2"],
  "requiresInputFrom": ["需要输入的参与者ID"],
  "latestSummary": "当前进展摘要（可选）",
  "nextAction": "continue | review | blocked | handoff | done",
  "nextStep": "下一步具体任务描述（可选）",
  "artifactRefs": [
    { "type": "code|doc|link|other", "label": "标签", "location": "URL或文件路径" }
  ]
}
</hall-structured>

注意：
- 所有字段都是可选的，根据当前模式填充相关内容。
- nextAction 是关键字段，决定任务下一步走向。
- 如果你是执行者且已完成交付物，设置 nextAction 为 "handoff" 或 "done"。
- 如果你被阻塞，设置 nextAction 为 "blocked" 并在 blockers 中列出原因。
`;
}

function structuredInstructionEn(displayName: string): string {
  return `At the end of your reply, output a JSON block exactly like this (no line breaks inside tags):

<hall-structured>
{
  "proposal": "your proposal (optional)",
  "decision": "your decision (optional)",
  "executor": "suggested next executor name (optional)",
  "doneWhen": "completion criteria (optional)",
  "blockers": ["blocker 1", "blocker 2"],
  "requiresInputFrom": ["participant IDs that need to provide input"],
  "latestSummary": "summary of current progress (optional)",
  "nextAction": "continue | review | blocked | handoff | done",
  "nextStep": "description of the next concrete task (optional)",
  "artifactRefs": [
    { "type": "code|doc|link|other", "label": "label", "location": "URL or file path" }
  ]
}
</hall-structured>

Notes:
- All fields are optional; fill based on the current mode.
- nextAction is the key field that determines the next step.
- If you are the executor and have delivered output, set nextAction to "handoff" or "done".
- If you are blocked, set nextAction to "blocked" and list reasons in blockers.
`;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function buildCoworkerContext(hall: CollaborationHall, self: HallParticipant): string[] {
  return hall.participants
    .filter((p) => p.participantId !== self.participantId && p.active)
    .map((p) => {
      const role = translateRole(p.semanticRole, "zh");
      return `- ${p.displayName} (${role})${p.aliases.length > 0 ? `，别名: ${p.aliases.join(", ")}` : ""}`;
    });
}

function buildMessageHistory(messages: HallMessage[], self: HallParticipant): string[] {
  // Take last 15 messages, skip system messages, format compactly
  return messages
    .filter((m) => m.kind !== "system")
    .slice(-15)
    .map((m) => {
      const prefix = m.authorParticipantId === self.participantId ? "[你]" : `[${m.authorLabel}]`;
      return `${prefix}: ${m.content.slice(0, 400)}${m.content.length > 400 ? "..." : ""}`;
    });
}

function inferLanguage(taskCard: HallTaskCard, triggerMessage?: HallMessage): "zh" | "en" {
  const source = `${taskCard.title}\n${taskCard.description}\n${triggerMessage?.content ?? ""}`;
  const cjk = (source.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (source.match(/[A-Za-z]/g) ?? []).length;
  return cjk > latin ? "zh" : "en";
}

function translateRole(role: string, language: "zh" | "en"): string {
  if (language === "en") return role;
  const map: Record<string, string> = {
    planner: "策划",
    coder: "执行",
    reviewer: "评审",
    manager: "经理",
    generalist: "通用",
  };
  return map[role] || role;
}

export function inferDiscussionDomain(taskCard: HallTaskCard): string {
  const text = `${taskCard.title} ${taskCard.description}`.toLowerCase();
  if (/\b(code|engineer|program|develop|api|backend|frontend|bug|fix|refactor|test|deploy|db|database|server|cloud|infra|devops)\b/.test(text)) return "engineering";
  if (/\b(design|creative|copy|content|brand|video|thumbnail|hook|script|storyboard|marketing|ad|campaign|media|visual|ui|ux)\b/.test(text)) return "creative";
  if (/\b(analys|research|data|survey|report|metric|kpi|insight|trend|benchmark|competitor|market)\b/.test(text)) return "analysis";
  if (/\b(product|feature|requirement|spec|prd|roadmap|user story|mvp|launch|release|version)\b/.test(text)) return "product";
  if (/\b(ops|operation|workflow|process|automation|schedule|logistics|supply|inventory|support|ticket)\b/.test(text)) return "operations";
  return "general";
}
