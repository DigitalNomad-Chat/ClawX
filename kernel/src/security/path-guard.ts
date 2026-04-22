/**
 * Path Guard - Workspace isolation and sensitive path protection
 * All file tool paths are resolved relative to the agent's workspace root.
 * Absolute paths are rejected unless explicitly allowed.
 * Sensitive paths (SSH keys, credentials, system files) are always blocked.
 */
import { resolve, isAbsolute } from 'path';

export interface PathResolutionResult {
  path: string;
  allowed: boolean;
  reason?: string;
}

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(^|\/|\\)\.ssh($|\/|\\)/i,
  /(^|\/|\\)\.gnupg($|\/|\\)/i,
  /(^|\/|\\)\.aws($|\/|\\)/i,
  /(^|\/|\\)\.azure($|\/|\\)/i,
  /(^|\/|\\)id_rsa/i,
  /(^|\/|\\)id_ed25519/i,
  /(^|\/|\\)\.env/i,
  /(^|\/|\\)\.claude($|\/|\\)/i,
  /(^|\/|\\)keychain/i,
  /(^|\/|\\)Library[\/\\]Keychains/i,
  /(^|\/|\\)credentials/i,
  /(^|\/|\\)etc[\/\\]shadow/i,
  /(^|\/|\\)etc[\/\\]passwd/i,
  /(^|\/|\\)etc[\/\\]hosts/i,
  /(^|\/|\\)private[\/\\]var[\/\\]db($|\/|\\)/i,
  /(^|\/|\\)Library[\/\\]Application Support[\/\\](Keychains|com\.apple)/i,
  /(^|\/|\\)\.bashrc/i,
  /(^|\/|\\)\.zshrc/i,
  /(^|\/|\\)\.profile/i,
  /(^|\/|\\)\.bash_profile/i,
  /(^|\/|\\)\.zprofile/i,
  /(^|\/|\\)\.npmrc/i,
  /(^|\/|\\)\.pypirc/i,
  /(^|\/|\\)\.gitconfig/i,
  /(^|\/|\\)\.netrc/i,
  /(^|\/|\\)\.docker[\/\\]config\.json/i,
  /(^|\/|\\)\.kube($|\/|\\)/i,
  /(^|\/|\\)Library[\/\\]Keychains/i,
];

export function isSensitivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolveWorkspacePath(
  cwd: string,
  path: string,
  allowAbsolute?: boolean
): PathResolutionResult {
  const normalizedPath = path.trim();

  // Reject path traversal attempts
  if (normalizedPath.includes('..')) {
    return {
      path: '',
      allowed: false,
      reason: 'Path traversal (..) is not allowed',
    };
  }

  let fullPath: string;

  if (isAbsolute(normalizedPath)) {
    if (!allowAbsolute) {
      return {
        path: '',
        allowed: false,
        reason: 'Absolute paths are not allowed. Use a relative path within the workspace.',
      };
    }
    fullPath = resolve(normalizedPath);
  } else {
    fullPath = resolve(cwd, normalizedPath);
  }

  // Ensure relative paths stay within workspace
  if (!isAbsolute(normalizedPath)) {
    const resolvedCwd = resolve(cwd);
    if (!fullPath.startsWith(resolvedCwd)) {
      return {
        path: '',
        allowed: false,
        reason: 'Resolved path escapes the workspace directory',
      };
    }
  }

  // Check sensitive path blacklist
  if (isSensitivePath(fullPath)) {
    return {
      path: '',
      allowed: false,
      reason: 'Access to this path is restricted for security reasons',
    };
  }

  return { path: fullPath, allowed: true };
}
