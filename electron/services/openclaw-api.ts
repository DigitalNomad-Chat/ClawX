/**
 * Minimal openclaw Host API surface for P2 dual-path proof.
 * Behavior mirrors existing openclaw:* IPC handlers in ipc-handlers.ts.
 */
import { existsSync } from 'node:fs';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getOpenClawCliCommand } from '../utils/openclaw-cli';
import { ensureDir, getOpenClawSkillsDir, getOpenClawStatus } from '../utils/paths';

export function createOpenClawApi(): NonNullable<CompleteHostServiceRegistry['openclaw']> {
  return {
    status: () => getOpenClawStatus(),
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
