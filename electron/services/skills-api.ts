/**
 * Skills config Host API (P3c medium-risk).
 * Wraps skill-config utils; never logs apiKey values.
 * Shared by skill:* IPC, HTTP /api/skills/config*, host:invoke.
 */
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import {
  getAllSkillConfigs,
  getSkillConfig,
  updateSkillConfig,
} from '../utils/skill-config';
import { isRecord } from './payload-utils';

function requireSkillKey(payload?: unknown): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (isRecord(payload) && typeof payload.skillKey === 'string' && payload.skillKey.trim()) {
    return payload.skillKey.trim();
  }
  throw new Error('skillKey is required');
}

function getEnv(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export function createSkillsApi(): NonNullable<CompleteHostServiceRegistry['skills']> {
  return {
    status: async () => {
      // Full status needs HostApiContext (Gateway + disk scan); keep on HTTP route.
      return { success: false, error: 'skills.status requires HTTP /api/skills/status' };
    },
    getConfig: async (payload?: unknown) => {
      return await getSkillConfig(requireSkillKey(payload));
    },
    getAllConfigs: async () => {
      return await getAllSkillConfigs();
    },
    updateConfig: async (payload?: unknown) => {
      if (!isRecord(payload)) {
        throw new Error('updateConfig requires { skillKey, apiKey?, env? }');
      }
      const skillKey = requireSkillKey(payload);
      return await updateSkillConfig(skillKey, {
        apiKey: typeof payload.apiKey === 'string' ? payload.apiKey : undefined,
        env: getEnv(payload.env),
      });
    },
  };
}
