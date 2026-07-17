/**
 * Shell Host API (P3b). Shared by legacy shell:* IPC and host:invoke.
 */
import { shell } from 'electron';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { isRecord } from './payload-utils';

function expandShellPath(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith(`~${sep}`) || input.startsWith('~/') || input.startsWith('~\\')) {
    return join(homedir(), input.slice(2));
  }
  return input;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function resolvePathPayload(payload?: unknown): string {
  if (typeof payload === 'string') return expandShellPath(requireString(payload, 'path'));
  if (isRecord(payload)) return expandShellPath(requireString(payload.path, 'path'));
  throw new Error('path is required');
}

function resolveUrlPayload(payload?: unknown): string {
  if (typeof payload === 'string') return requireString(payload, 'url');
  if (isRecord(payload)) return requireString(payload.url, 'url');
  throw new Error('url is required');
}

export function createShellApi(): NonNullable<CompleteHostServiceRegistry['shell']> {
  return {
    openExternal: async (payload?: unknown) => {
      await shell.openExternal(resolveUrlPayload(payload));
    },
    showItemInFolder: (payload?: unknown) => {
      shell.showItemInFolder(resolvePathPayload(payload));
    },
    openPath: async (payload?: unknown) => shell.openPath(resolvePathPayload(payload)),
  };
}

export { expandShellPath };
