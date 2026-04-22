/**
 * Session Audit Logger
 * Records all security-relevant events to a per-session audit log file.
 * Events: tool invocation, permission decision, approval request/response, errors.
 */
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export type AuditEventType =
  | 'tool.invoke'
  | 'tool.result'
  | 'permission.check'
  | 'approval.request'
  | 'approval.respond'
  | 'error';

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  agentId: string;
  eventType: AuditEventType;
  toolName?: string;
  input?: unknown;
  output?: string;
  decision?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

function getAuditLogPath(workspaceRoot: string): string {
  const dir = resolve(workspaceRoot, 'output');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return resolve(dir, 'audit.log');
}

function serializeEntry(entry: AuditEntry): string {
  return JSON.stringify(entry) + '\n';
}

/**
 * Append an audit entry to the session's audit log.
 */
export function auditLog(workspaceRoot: string, entry: Omit<AuditEntry, 'timestamp'>): void {
  try {
    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const logPath = getAuditLogPath(workspaceRoot);
    appendFileSync(logPath, serializeEntry(fullEntry));
  } catch (err) {
    // Audit logging should never break the main flow
    console.error('[AuditLogger] Failed to write audit log:', err);
  }
}

/**
 * Convenience wrapper for logging a tool invocation start.
 */
export function auditToolInvoke(
  workspaceRoot: string,
  sessionId: string,
  agentId: string,
  toolName: string,
  input: unknown,
): void {
  auditLog(workspaceRoot, {
    sessionId,
    agentId,
    eventType: 'tool.invoke',
    toolName,
    input,
  });
}

/**
 * Convenience wrapper for logging a tool result.
 */
export function auditToolResult(
  workspaceRoot: string,
  sessionId: string,
  agentId: string,
  toolName: string,
  output: string,
  durationMs: number,
  error?: string,
): void {
  auditLog(workspaceRoot, {
    sessionId,
    agentId,
    eventType: 'tool.result',
    toolName,
    output: output.slice(0, 2000), // limit stored output
    durationMs,
    error,
  });
}

/**
 * Convenience wrapper for logging a permission check.
 */
export function auditPermission(
  workspaceRoot: string,
  sessionId: string,
  agentId: string,
  toolName: string,
  decision: string,
  metadata?: Record<string, unknown>,
): void {
  auditLog(workspaceRoot, {
    sessionId,
    agentId,
    eventType: 'permission.check',
    toolName,
    decision,
    metadata,
  });
}

/**
 * Convenience wrapper for logging an approval event.
 */
export function auditApproval(
  workspaceRoot: string,
  sessionId: string,
  agentId: string,
  requestId: string,
  approved: boolean,
  toolName: string,
): void {
  auditLog(workspaceRoot, {
    sessionId,
    agentId,
    eventType: 'approval.respond',
    toolName,
    decision: approved ? 'approved' : 'denied',
    metadata: { requestId },
  });
}
