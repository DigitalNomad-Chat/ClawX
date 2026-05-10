/**
 * Resolve runtime directory paths for feature modules.
 * All module data is stored under {userData}/modules/<module-id>/
 */
import { app } from 'electron';
import { join } from 'path';
import { mkdirSync } from 'fs';

/** Base directory for all module runtime data */
export function getModulesBaseDir(): string {
  const base = join(app.getPath('userData'), 'modules');
  try {
    mkdirSync(base, { recursive: true });
  } catch {
    // ignore — may already exist
  }
  return base;
}

/** Runtime directory for a specific module */
export function getModuleRuntimeDir(moduleId: string): string {
  const dir = join(getModulesBaseDir(), moduleId);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

/** Resolve a file path inside a module's runtime directory */
export function getModuleFilePath(moduleId: string, ...segments: string[]): string {
  return join(getModuleRuntimeDir(moduleId), ...segments);
}
