/**
 * Permission Checker - Evaluates whether a tool call is allowed
 * Three-layer decision chain:
 *   1. Tool blacklist / whitelist
 *   2. Permission mode (default / plan / full_auto)
 *   3. Read-only auto-approval vs mutating confirmation
 */
import type { AgentConfig, PermissionMode, RegisteredTool } from '../types.js';

export interface PermissionResult {
  allowed: boolean;
  requiresConfirmation?: boolean;
  reason?: string;
}

export class PermissionChecker {
  evaluate(
    toolName: string,
    _input: unknown,
    toolDef: RegisteredTool,
    agentConfig: AgentConfig,
  ): PermissionResult {
    // Layer 1: Explicit blacklist
    if (agentConfig.toolBlacklist?.includes(toolName)) {
      return { allowed: false, reason: `Tool '${toolName}' is blacklisted` };
    }

    // Layer 1: Explicit whitelist
    if (agentConfig.toolWhitelist && agentConfig.toolWhitelist.length > 0) {
      if (!agentConfig.toolWhitelist.includes(toolName)) {
        return { allowed: false, reason: `Tool '${toolName}' is not in the whitelist` };
      }
    }

    // Layer 2: Permission mode
    const mode: PermissionMode = agentConfig.permissionMode || 'default';

    if (mode === 'full_auto') {
      return { allowed: true };
    }

    if (mode === 'plan') {
      // Plan mode: block all mutating tools
      if (!toolDef.isReadOnly) {
        return {
          allowed: false,
          reason: `Tool '${toolName}' is mutating and blocked in plan mode`,
        };
      }
      return { allowed: true };
    }

    // Layer 3: Default mode — read-only auto-allow, mutating requires confirmation
    if (toolDef.isReadOnly) {
      return { allowed: true };
    }

    return {
      allowed: false,
      requiresConfirmation: true,
      reason: `Tool '${toolName}' requires user approval`,
    };
  }
}
