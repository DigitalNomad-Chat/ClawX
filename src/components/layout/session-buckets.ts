import type { ChatSession } from '@/stores/chat';

export interface AgentGroup {
  agentId: string;
  agentName: string;
  sessions: ChatSession[];
  latestActivityMs: number;
}

export type SessionBucketKey =
  | 'today'
  | 'yesterday'
  | 'withinWeek'
  | 'withinTwoWeeks'
  | 'withinMonth'
  | 'older';

export function getSessionBucket(activityMs: number, nowMs: number): SessionBucketKey {
  if (!activityMs || activityMs <= 0) return 'older';

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  if (activityMs >= startOfToday) return 'today';
  if (activityMs >= startOfYesterday) return 'yesterday';

  const daysAgo = (startOfToday - activityMs) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 7) return 'withinWeek';
  if (daysAgo <= 14) return 'withinTwoWeeks';
  if (daysAgo <= 30) return 'withinMonth';
  return 'older';
}

function getSessionCreatedAtMsFromKey(sessionKey: string): number | undefined {
  const match = sessionKey.match(/(?:^|:)session-(\d{11,})(?=$|:)/);
  if (!match) return undefined;

  const createdAtMs = Number(match[1]);
  return Number.isFinite(createdAtMs) && createdAtMs > 0 ? createdAtMs : undefined;
}

export function getSessionActivityMs(
  session: ChatSession,
  sessionLastActivity: Record<string, number>,
): number {
  const lastActivityMs = sessionLastActivity[session.key];
  if (Number.isFinite(lastActivityMs) && lastActivityMs > 0) return lastActivityMs;

  if (typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt) && session.updatedAt > 0) {
    return session.updatedAt;
  }

  return getSessionCreatedAtMsFromKey(session.key) ?? 0;
}

export function groupSessionsByAgent(
  sessions: ChatSession[],
  sessionLastActivity: Record<string, number>,
  agentNameById: Record<string, string>,
): AgentGroup[] {
  const groups = new Map<string, AgentGroup>();

  for (const session of sessions) {
    const match = session.key.match(/^agent:([^:]+)/);
    const agentId = match ? match[1]! : 'main';
    const agentName = agentNameById[agentId] || agentId;
    const activityMs = getSessionActivityMs(session, sessionLastActivity);

    if (!groups.has(agentId)) {
      groups.set(agentId, { agentId, agentName, sessions: [], latestActivityMs: 0 });
    }
    const group = groups.get(agentId)!;
    group.sessions.push(session);
    if (activityMs > group.latestActivityMs) {
      group.latestActivityMs = activityMs;
    }
  }

  for (const group of groups.values()) {
    group.sessions.sort((a, b) => {
      const aMs = getSessionActivityMs(a, sessionLastActivity);
      const bMs = getSessionActivityMs(b, sessionLastActivity);
      return bMs - aMs;
    });
  }

  return Array.from(groups.values()).sort((a, b) => b.latestActivityMs - a.latestActivityMs);
}
