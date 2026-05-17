"use strict";

/**
 * Dashboard Module — Backend
 * Aggregates system health, usage, and session statistics.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BackendModule } from '../types';
import { sendJson } from '../../api/route-utils';
import { getRecentTokenUsageHistory } from '../../utils/token-usage';
import { listConfiguredAgentIds } from '../../utils/agent-config';
import { getOpenClawConfigDir } from '../../utils/paths';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createModuleLogger } from '../_shared/module-logger';

const logger = createModuleLogger('dashboard');

interface DashboardOverview {
  gateway: {
    state: string;
    uptime?: number;
    version?: string;
    pid?: number;
  };
  stats: {
    agentCount: number;
    sessionCount: number;
    cronJobCount: number;
    totalTokensUsed: number;
  };
  tokenHistory: Array<{
    date: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
}

async function countSessions(): Promise<number> {
  const configDir = getOpenClawConfigDir();
  let count = 0;
  try {
    const agentsDir = join(configDir, 'agents');
    const agentEntries = await readdir(agentsDir, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (!entry.isDirectory()) continue;
      const sessionsDir = join(agentsDir, entry.name, 'sessions');
      try {
        const files = await readdir(sessionsDir, { withFileTypes: true });
        count += files.filter((f) => f.isFile() && f.name.endsWith('.jsonl')).length;
      } catch {
        // ignore missing sessions dir
      }
    }
  } catch {
    // ignore missing agents dir
  }
  return count;
}

async function countCronJobs(): Promise<number> {
  const configDir = getOpenClawConfigDir();
  try {
    const cronPath = join(configDir, 'cron', 'jobs.json');
    const raw = await readFile(cronPath, 'utf-8');
    const parsed = JSON.parse(raw) as { jobs?: unknown[] };
    return Array.isArray(parsed.jobs) ? parsed.jobs.length : 0;
  } catch {
    return 0;
  }
}

async function getTokenHistory(days = 30) {
  // Fetch a generous number of entries to cover the full time range
  const history = await getRecentTokenUsageHistory(5000);

  // Build a map of day -> aggregated tokens
  const now = Date.now();
  const dayMs = 86_400_000;
  const dayMap = new Map<string, { date: string; promptTokens: number; completionTokens: number; totalTokens: number }>();

  for (const h of history) {
    const ts = typeof h.timestamp === 'string' ? Date.parse(h.timestamp) : Number(h.timestamp);
    if (Number.isNaN(ts)) continue;
    const diffDays = Math.floor((now - ts) / dayMs);
    if (diffDays >= days) continue;

    const dateKey = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = dayMap.get(dateKey);
    const input = h.inputTokens ?? 0;
    const output = h.outputTokens ?? 0;
    const total = h.totalTokens ?? 0;
    if (existing) {
      existing.promptTokens += input;
      existing.completionTokens += output;
      existing.totalTokens += total;
    } else {
      dayMap.set(dateKey, { date: dateKey, promptTokens: input, completionTokens: output, totalTokens: total });
    }
  }

  // Fill gaps with zero entries and sort ascending
  const result: Array<{ date: string; promptTokens: number; completionTokens: number; totalTokens: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    const entry = dayMap.get(key);
    result.push(entry ?? { date: key, promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }
  return result;
}

async function handleDashboardRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: { gatewayManager: { getStatus: () => { state: string; uptime?: number; version?: string; pid?: number } } }
): Promise<boolean> {
  if (url.pathname === '/api/dashboard/overview' && req.method === 'GET') {
    try {
      const [agents, sessions, cronJobs, tokenHistory] = await Promise.all([
        listConfiguredAgentIds().catch(() => [] as string[]),
        countSessions(),
        countCronJobs(),
        getTokenHistory(),
      ]);

      const gatewayStatus = ctx.gatewayManager.getStatus();
      const totalTokens = tokenHistory.reduce((sum, entry) => sum + entry.totalTokens, 0);

      const overview: DashboardOverview = {
        gateway: {
          state: gatewayStatus.state,
          uptime: gatewayStatus.uptime,
          version: gatewayStatus.version,
          pid: gatewayStatus.pid,
        },
        stats: {
          agentCount: agents.length,
          sessionCount: sessions,
          cronJobCount: cronJobs,
          totalTokensUsed: totalTokens,
        },
        tokenHistory,
      };

      sendJson(res, 200, { success: true, data: overview });
    } catch (error) {
      logger.error('Failed to build dashboard overview:', error);
      sendJson(res, 500, { success: false, error: 'Failed to build dashboard overview' });
    }
    return true;
  }

  return false;
}

const dashboardModule: BackendModule = {
  id: 'dashboard',
  name: '仪表盘',
  routeHandlers: [handleDashboardRoutes],
};

export default dashboardModule;
