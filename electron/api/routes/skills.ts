import type { IncomingMessage, ServerResponse } from 'http';
import { basename } from 'node:path';
import { getAllSkillConfigs } from '../../utils/skill-config';
import { collectQuickAccessSkills, filterEnabledQuickAccessSkills, type QuickAccessRuntimeSkillStatus, type QuickAccessSkillSource } from '../../utils/skill-quick-access';
import type { ClawHubInstallParams, ClawHubSearchParams, ClawHubUninstallParams } from '../../gateway/clawhub';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';

/**
 * 本地扫描目录来源 → 前端 `resolveSkillSourceLabel` 识别的来源键。
 * 让 Skills 页 source 徽标正确显示（Workspace / Managed / Extra 等），
 * 而非原样暴露 collectQuickAccessSkills 的内部枚举。
 */
const QUICK_ACCESS_SOURCE_TO_GATEWAY: Record<QuickAccessSkillSource, string> = {
  workspace: 'clawdock-workspace',
  openclaw: 'openclaw-managed',
  agents: 'agents-skills-personal',
  legacy: 'clawdock-extra',
};

/**
 * 将本地扫描到的 skill 目录映射为前端 Skills 管理页所需的状态结构。
 *
 * 数据来源（本地扫描为基准，不依赖 Gateway 是否就绪）：
 *   1. `collectQuickAccessSkills` 扫描 ~/.clawdock/skills、.agents/skills、
 *      workspace、legacy roots → skill 列表基准。
 *   2. `getAllSkillConfigs` 读取用户配置 → 判定显式禁用的 skill。
 *   3. Gateway `skills.status`（可选，try/catch 容错）→ 叠加运行时 disabled。
 *
 * 与 `/api/skills/quick-access` 的 `filterEnabledQuickAccessSkills`（剔除禁用项，
 * 用于"快速访问"语境）刻意不同：管理页需展示全部已发现的 skill，并通过
 * `disabled` 字段让用户重新启用被禁用的项。
 */
async function collectSkillStatuses(ctx: HostApiContext) {
  const [scannedSkills, configs] = await Promise.all([
    collectQuickAccessSkills({}),
    getAllSkillConfigs(),
  ]);

  const configDisabledKeys = new Set<string>();
  for (const [skillKey, config] of Object.entries(configs || {})) {
    if (config?.enabled === false) {
      const normalized = skillKey.trim().toLowerCase();
      if (normalized) configDisabledKeys.add(normalized);
    }
  }

  const runtimeDisabledKeys = new Set<string>();
  if (ctx.gatewayManager.getStatus().state === 'running') {
    try {
      const runtimeStatus = await ctx.gatewayManager.rpc<{ skills?: QuickAccessRuntimeSkillStatus[] }>('skills.status');
      for (const skill of runtimeStatus.skills || []) {
        if (!skill.disabled) continue;
        const aliases = [skill.skillKey, skill.slug, skill.name, skill.baseDir ? basename(skill.baseDir) : '']
          .map((value) => (value || '').trim().toLowerCase())
          .filter(Boolean);
        for (const alias of aliases) runtimeDisabledKeys.add(alias);
      }
    } catch {
      // Gateway 不可用时仅依赖 config + 本地扫描，不影响列表返回。
    }
  }

  return scannedSkills.map((skill) => {
    const key = skill.name.trim().toLowerCase();
    return {
      skillKey: skill.name,
      slug: skill.name,
      name: skill.name,
      description: skill.description,
      disabled: configDisabledKeys.has(key) || runtimeDisabledKeys.has(key),
      source: QUICK_ACCESS_SOURCE_TO_GATEWAY[skill.source] ?? skill.source,
      baseDir: skill.baseDir,
      filePath: skill.manifestPath,
    };
  });
}

export async function handleSkillRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/skills/status' && req.method === 'GET') {
    try {
      // 本地扫描为基准（不依赖 Gateway），叠加 config + runtime 的 disabled 状态。
      sendJson(res, 200, { success: true, skills: await collectSkillStatuses(ctx) });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/skills/configs' && req.method === 'GET') {
    // P3c: thin delegate to createSkillsApi
    const { createSkillsApi } = await import('../../services/skills-api');
    sendJson(res, 200, await createSkillsApi().getAllConfigs());
    return true;
  }

  if (url.pathname === '/api/skills/config' && req.method === 'PUT') {
    try {
      const body = await parseJsonBody<{
        skillKey: string;
        apiKey?: string;
        env?: Record<string, string>;
      }>(req);
      const { createSkillsApi } = await import('../../services/skills-api');
      sendJson(res, 200, await createSkillsApi().updateConfig(body));
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/skills/quick-access' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        workspace?: string;
      }>(req);
      const [scannedSkills, configs] = await Promise.all([
        collectQuickAccessSkills({
          workspace: body.workspace,
        }),
        getAllSkillConfigs(),
      ]);
      let runtimeSkills: QuickAccessRuntimeSkillStatus[] | undefined;
      if (ctx.gatewayManager.getStatus().state === 'running') {
        try {
          const runtimeStatus = await ctx.gatewayManager.rpc<{ skills?: QuickAccessRuntimeSkillStatus[] }>('skills.status');
          runtimeSkills = runtimeStatus.skills || [];
        } catch {
          runtimeSkills = undefined;
        }
      }
      sendJson(res, 200, {
        success: true,
        skills: filterEnabledQuickAccessSkills(scannedSkills, runtimeSkills, configs),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/capability' && req.method === 'GET') {
    try {
      sendJson(res, 200, {
        success: true,
        capability: await ctx.clawHubService.getMarketplaceCapability(),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/search' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<ClawHubSearchParams>(req);
      sendJson(res, 200, {
        success: true,
        results: await ctx.clawHubService.search(body),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/install' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<ClawHubInstallParams>(req);
      await ctx.clawHubService.install(body);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/uninstall' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<ClawHubUninstallParams>(req);
      await ctx.clawHubService.uninstall(body);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/list' && req.method === 'GET') {
    try {
      sendJson(res, 200, { success: true, results: await ctx.clawHubService.listInstalled() });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/open-readme' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ slug?: string; skillKey?: string; baseDir?: string }>(req);
      await ctx.clawHubService.openSkillReadme(body.skillKey || body.slug || '', body.slug, body.baseDir);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/clawhub/open-path' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ slug?: string; skillKey?: string; baseDir?: string }>(req);
      await ctx.clawHubService.openSkillPath(body.skillKey || body.slug || '', body.slug, body.baseDir);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
