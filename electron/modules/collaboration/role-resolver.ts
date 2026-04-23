"use strict";

/**
 * Hall Role Resolver
 * Infers semantic roles from agent names.
 * Adapted from Control Center's hall-role-resolver.ts
 */
import type { HallParticipant, HallSemanticRole } from "./types";

interface AgentRosterEntry {
  agentId: string;
  displayName: string;
}

const ROLE_PATTERNS: Record<Exclude<HallSemanticRole, "generalist">, RegExp[]> = {
  manager: [/manager/i, /\bmain\b/i, /lead/i, /chief/i, /owner/i, /orchestr/i],
  planner: [/planner/i, /plan/i, /research/i, /architect/i, /product/i, /design/i],
  coder: [/coder/i, /code/i, /dev/i, /engineer/i, /implement/i, /build/i, /builder/i, /maker/i],
  reviewer: [/review/i, /qa/i, /audit/i, /critic/i, /test/i, /verify/i],
};

export function resolveParticipantsFromRoster(roster: AgentRosterEntry[]): HallParticipant[] {
  const ordered = [...roster]
    .map((entry) => ({
      agentId: entry.agentId.trim(),
      displayName: entry.displayName.trim() || entry.agentId.trim(),
    }))
    .filter((entry) => entry.agentId.length > 0)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  if (ordered.length === 0) {
    return [
      toParticipant("main", "Main", "manager"),
      toParticipant("planner", "Planner", "planner"),
      toParticipant("coder", "Coder", "coder"),
      toParticipant("reviewer", "Reviewer", "reviewer"),
    ];
  }

  const assigned = new Set<string>();
  const participants: HallParticipant[] = [];

  const pushRole = (role: Exclude<HallSemanticRole, "generalist">) => {
    const candidate = pickBestRoleCandidate(ordered, role, assigned);
    if (!candidate) return;
    assigned.add(candidate.agentId);
    participants.push(toParticipant(candidate.agentId, candidate.displayName, role));
  };

  pushRole("manager");
  pushRole("planner");
  pushRole("coder");
  pushRole("reviewer");

  for (const entry of ordered) {
    if (assigned.has(entry.agentId)) continue;
    participants.push(toParticipant(entry.agentId, entry.displayName, "generalist"));
  }

  return participants;
}

export function pickPrimaryParticipantByRole(
  participants: HallParticipant[],
  role: Exclude<HallSemanticRole, "generalist">,
): HallParticipant | undefined {
  const direct = participants.find((p) => p.active && p.semanticRole === role);
  if (direct) return direct;
  if (role === "manager") return participants.find((p) => p.active);
  if (role === "planner") {
    return participants.find((p) => p.active && p.semanticRole !== "manager");
  }
  return participants.find((p) => p.active && p.semanticRole === "generalist");
}

export function resolveSemanticRoleLabel(
  role: HallSemanticRole,
  language: "en" | "zh" = "zh",
): string {
  if (language === "zh") {
    if (role === "planner") return "策划";
    if (role === "coder") return "执行";
    if (role === "reviewer") return "审核";
    if (role === "manager") return "经理";
    return "通用";
  }
  if (role === "planner") return "Planner";
  if (role === "coder") return "Coder";
  if (role === "reviewer") return "Reviewer";
  if (role === "manager") return "Manager";
  return "Generalist";
}

function pickBestRoleCandidate(
  entries: AgentRosterEntry[],
  role: Exclude<HallSemanticRole, "generalist">,
  assigned: Set<string>,
): AgentRosterEntry | undefined {
  const patterns = ROLE_PATTERNS[role];
  for (const entry of entries) {
    if (assigned.has(entry.agentId)) continue;
    const text = `${entry.displayName} ${entry.agentId}`;
    if (patterns.some((p) => p.test(text))) {
      return entry;
    }
  }
  // Fallback: pick first unassigned
  return entries.find((e) => !assigned.has(e.agentId));
}

function toParticipant(
  agentId: string,
  displayName: string,
  semanticRole: HallSemanticRole,
): HallParticipant {
  return {
    participantId: agentId,
    agentId,
    displayName,
    semanticRole,
    active: true,
    aliases: [displayName, agentId],
    isHuman: false,
  };
}

// ---------------------------------------------------------------------------
//  Domain inference & executor recommendation
// ---------------------------------------------------------------------------

export function inferDiscussionDomain(taskCard: { title: string; description: string }): string {
  const text = `${taskCard.title} ${taskCard.description}`.toLowerCase();
  if (/\b(code|engineer|program|develop|api|backend|frontend|bug|fix|refactor|test|deploy|db|database|server|cloud|infra|devops)\b/.test(text)) return "engineering";
  if (/\b(design|creative|copy|content|brand|video|thumbnail|hook|script|storyboard|marketing|ad|campaign|media|visual|ui|ux)\b/.test(text)) return "creative";
  if (/\b(analys|research|data|survey|report|metric|kpi|insight|trend|benchmark|competitor|market)\b/.test(text)) return "analysis";
  if (/\b(product|feature|requirement|spec|prd|roadmap|user story|mvp|launch|release|version)\b/.test(text)) return "product";
  if (/\b(ops|operation|workflow|process|automation|schedule|logistics|supply|inventory|support|ticket)\b/.test(text)) return "operations";
  return "general";
}

export function recommendExecutorRoleOrder(domain: string): HallSemanticRole[] {
  if (domain === "engineering") return ["coder", "planner", "manager"];
  if (domain === "creative") return ["planner", "coder", "generalist"];
  if (domain === "analysis") return ["planner", "coder", "reviewer"];
  if (domain === "product") return ["planner", "manager", "coder"];
  if (domain === "research") return ["planner", "reviewer", "manager"];
  if (domain === "operations") return ["manager", "planner", "reviewer"];
  return ["planner", "generalist", "manager", "coder"];
}

export function pickExecutorForTask(
  hall: { participants: HallParticipant[] },
  taskCard: { title: string; description: string },
): HallParticipant | undefined {
  const domain = inferDiscussionDomain(taskCard);
  const roleOrder = recommendExecutorRoleOrder(domain);

  for (const role of roleOrder) {
    const p = hall.participants.find((participant) => participant.active && participant.semanticRole === role);
    if (p) return p;
  }

  return hall.participants.find((participant) => participant.active) ?? hall.participants[0];
}
