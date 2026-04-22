/**
 * OS-level Sandbox Executor
 * Wraps shell commands with platform-native sandboxing:
 *   - macOS: sandbox-exec (Seatbelt profile)
 *   - Linux: bubblewrap (bwrap) namespace isolation
 *
 * Falls back to unsandboxed execution when sandbox is unavailable
 * and sandboxFailIfUnavailable is false.
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SandboxResult {
  command: string;
  sandboxed: boolean;
  sandboxTool?: string;
  error?: string;
}

/** Check if a command exists in PATH */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`command -v ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

/** Build a sandbox-exec profile for macOS */
function buildMacProfile(workspaceRoot: string, allowNetwork: boolean): string {
  // Seatbelt profile: allow file operations under workspaceRoot,
  // allow execution from common binary paths,
  // optionally allow network
  const lines: string[] = [
    '(version 1)',
    '(deny default)',
    '',
    // Allow reading workspace
    `(allow file-read* file-read-metadata file-ioctl (subpath "${workspaceRoot}"))`,
    // Allow writing workspace
    `(allow file-write* (subpath "${workspaceRoot}"))`,
    '',
    // Allow execution from common binary directories
    '(allow process-exec (subpath "/bin"))',
    '(allow process-exec (subpath "/usr/bin"))',
    '(allow process-exec (subpath "/usr/local/bin"))',
    '(allow process-exec (subpath "/opt/homebrew/bin"))',
    '(allow process-exec (subpath "/opt/local/bin"))',
    '',
    // Allow reading shared libraries and system data
    '(allow file-read* file-read-metadata (subpath "/usr/lib"))',
    '(allow file-read* file-read-metadata (subpath "/usr/local/lib"))',
    '(allow file-read* file-read-metadata (subpath "/opt/homebrew/lib"))',
    '(allow file-read* file-read-metadata (subpath "/System"))',
    '(allow file-read* file-read-metadata (subpath "/Library"))',
    '(allow file-read* file-read-metadata (subpath "/dev"))',
    '(allow file-read* file-read-metadata (subpath "/etc"))',
    '(allow file-read* file-read-metadata (subpath "/private/etc"))',
    '(allow file-read* file-read-metadata (subpath "/private/var/db/dyld"))',
    '(allow file-read* file-read-metadata (subpath "/private/tmp"))',
    '(allow file-read* file-read-metadata (subpath "/var"))',
    '',
    // Allow standard POSIX IPC
    '(allow ipc-posix-shm)',
    '(allow signal (target same-sandbox))',
    '(allow process-fork)',
  ];

  if (allowNetwork) {
    lines.push('(allow network*)');
  }

  return lines.join('\n');
}

/** Build a bubblewrap command prefix for Linux */
function buildBwrapArgs(workspaceRoot: string, allowNetwork: boolean): string[] {
  const args: string[] = [
    'bwrap',
    '--unshare-all',
    '--share-net', // we control network via firewall if needed; keep basic connectivity
    '--bind', workspaceRoot, workspaceRoot,
    '--bind', '/bin', '/bin',
    '--bind', '/usr', '/usr',
    '--bind', '/lib', '/lib',
    '--bind', '/lib64', '/lib64',
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--dir', '/home',
    '--chdir', workspaceRoot,
    '--die-with-parent',
  ];

  if (!allowNetwork) {
    // Remove --share-net if network is disallowed
    const idx = args.indexOf('--share-net');
    if (idx > -1) args.splice(idx, 1);
    args.push('--unshare-net');
  }

  return args;
}

/** Wrap a shell command with the platform sandbox */
export async function wrapWithSandbox(
  command: string,
  workspaceRoot: string,
  sandboxEnabled: boolean,
  sandboxFailIfUnavailable: boolean,
  allowNetwork = true,
): Promise<SandboxResult> {
  if (!sandboxEnabled) {
    return { command, sandboxed: false };
  }

  const platform = process.platform;

  if (platform === 'darwin') {
    const hasSandboxExec = await commandExists('sandbox-exec');
    if (!hasSandboxExec) {
      if (sandboxFailIfUnavailable) {
        return {
          command,
          sandboxed: false,
          error: 'sandbox-exec is not available on this macOS system and sandboxFailIfUnavailable=true.',
        };
      }
      console.warn('[Sandbox] sandbox-exec not found; falling back to unsandboxed execution');
      return { command, sandboxed: false };
    }

    const profile = buildMacProfile(workspaceRoot, allowNetwork);
    // Use -p with inline profile string (single-quoted for shell safety)
    // We encode the profile to avoid shell injection
    const wrapped = `sandbox-exec -p '${profile.replace(/'/g, "'\"'\"'")}' /bin/sh -c '${command.replace(/'/g, "'\"'\"'")}'`;
    return {
      command: wrapped,
      sandboxed: true,
      sandboxTool: 'sandbox-exec',
    };
  }

  if (platform === 'linux') {
    const hasBwrap = await commandExists('bwrap');
    if (!hasBwrap) {
      if (sandboxFailIfUnavailable) {
        return {
          command,
          sandboxed: false,
          error: 'bubblewrap (bwrap) is not available and sandboxFailIfUnavailable=true. Install bubblewrap to continue.',
        };
      }
      console.warn('[Sandbox] bwrap not found; falling back to unsandboxed execution');
      return { command, sandboxed: false };
    }

    const bwrapArgs = buildBwrapArgs(workspaceRoot, allowNetwork);
    const wrapped = `${bwrapArgs.join(' ')} /bin/sh -c '${command.replace(/'/g, "'\"'\"'")}'`;
    return {
      command: wrapped,
      sandboxed: true,
      sandboxTool: 'bubblewrap',
    };
  }

  // Unsupported platform
  if (sandboxFailIfUnavailable) {
    return {
      command,
      sandboxed: false,
      error: `OS-level sandbox is not supported on platform '${platform}' and sandboxFailIfUnavailable=true.`,
    };
  }
  console.warn(`[Sandbox] Platform '${platform}' does not support OS-level sandbox; falling back to unsandboxed execution`);
  return { command, sandboxed: false };
}
