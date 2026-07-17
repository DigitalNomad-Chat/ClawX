/**
 * OpenClaw Host API surface (P3a thin service).
 * Shared by legacy openclaw:* IPC handlers and host:invoke openclaw.*.
 */
import { existsSync } from 'node:fs';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getOpenClawCliCommand } from '../utils/openclaw-cli';
import {
  ensureDir,
  getOpenClawConfigDir,
  getOpenClawDir,
  getOpenClawSkillsDir,
  getOpenClawStatus,
} from '../utils/paths';

export function createOpenClawApi(): NonNullable<CompleteHostServiceRegistry['openclaw']> & {
  getDir: () => string;
  getConfigDir: () => string;
} {
  return {
    status: () => getOpenClawStatus(),
    getDir: () => getOpenClawDir(),
    getConfigDir: () => getOpenClawConfigDir(),
    getSkillsDir: () => {
      const dir = getOpenClawSkillsDir();
      ensureDir(dir);
      return dir;
    },
    getCliCommand: () => {
      const status = getOpenClawStatus();
      if (!status.packageExists) {
        return { success: false, error: `OpenClaw package not found at: ${status.dir}` };
      }
      if (!existsSync(status.entryPath)) {
        return { success: false, error: `OpenClaw entry script not found at: ${status.entryPath}` };
      }
      return { success: true, command: getOpenClawCliCommand() };
    },
  };
}
