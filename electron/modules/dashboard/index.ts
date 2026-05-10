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
    timestamp: number;
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

async function getTokenHistory(limit = 30) {
  const history = await getRecentTokenUsageHistory(limit);
  return history
    .map((h) => ({
      timestamp: h.timestamp,
      promptTokens: h.promptTokens ?? 0,
      completionTokens: h.completionTokens ?? 0,
      totalTokens: (h.promptTokens ?? 0) + (h.completionTokens ?? 0),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
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
