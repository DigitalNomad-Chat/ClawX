/**
 * Bash Tool - Execute shell commands
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';
import { wrapWithSandbox } from '../security/sandbox.js';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const MAX_TIMEOUT = 600_000; // 10 minutes
const MAX_OUTPUT_LENGTH = 12_000;

const COMMAND_DENY_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+[~.]/i,
  /:\(\)\s*{\s*:\|:\s*&\s*};:/i, // fork bomb
  /curl\s+.*\|\s*(sh|bash|zsh)/i,
  /wget\s+.*\|\s*(sh|bash|zsh)/i,
  /mkfs\./i,
  /dd\s+if=.*of=\/dev\/(sd|hd|disk)/i,
  />\s*\/dev\/(sd|hd|disk)/i,
  /chmod\s+-R\s+777\s+\//i,
  /shutdown/i,
  /reboot/i,
  /halt/i,
];

function isCommandDenied(command: string): boolean {
  return COMMAND_DENY_PATTERNS.some((pattern) => pattern.test(command));
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return output.slice(0, MAX_OUTPUT_LENGTH) + `\n\n[Output truncated: ${output.length} characters, showing first ${MAX_OUTPUT_LENGTH}]`;
}

export const bashToolDefinition: ToolDefinition = {
  name: 'bash',
  description: 'Execute a shell command. Use this for file operations, git commands, and system administration.',
  isReadOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      workingDir: {
        type: 'string',
        description: 'Optional working directory for the command',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000, max: 600000)',
      },
    },
    required: ['command'],
  },
};

export async function executeBash(input: unknown, context?: ToolExecutionContext): Promise<string> {
  const { command, workingDir, timeout: userTimeout } = input as {
    command: string;
    workingDir?: string;
    timeout?: number;
  };

  if (isCommandDenied(command)) {
    return 'Error: This command is blocked for security reasons.';
  }

  let finalCommand = command;
  let sandboxed = false;

  // Apply OS-level sandbox if configured
  const sc = context?.sandboxConfig;
  if (sc?.enabled && context?.cwd) {
    const sandboxResult = await wrapWithSandbox(
      command,
      context.cwd,
      sc.enabled,
      sc.failIfUnavailable,
    );
    if (sandboxResult.error) {
      return `Error: ${sandboxResult.error}`;
    }
    finalCommand = sandboxResult.command;
    sandboxed = sandboxResult.sandboxed;
  }

  const timeout = Math.min(userTimeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

  try {
    const { stdout, stderr } = await execAsync(finalCommand, {
      cwd: workingDir || context?.cwd,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
    });

    const output = stderr ? `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}` : stdout;
    return truncateOutput(sandboxed ? `[Sandboxed]\n${output}` : output);
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string };
    const output = `Error: ${error.message}\n\nSTDOUT:\n${error.stdout || ''}\n\nSTDERR:\n${error.stderr || ''}`;
    return truncateOutput(sandboxed ? `[Sandboxed]\n${output}` : output);
  }
}
