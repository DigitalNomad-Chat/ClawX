/**
 * File Write Tool - Write content to a file
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';
import { resolveWorkspacePath } from '../security/path-guard.js';

export const fileWriteToolDefinition: ToolDefinition = {
  name: 'file_write',
  description: 'Write content to a file. Creates parent directories if needed.',
  isReadOnly: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      content: {
        type: 'string',
        description: 'Content to write',
      },
      append: {
        type: 'boolean',
        description: 'If true, append to file instead of overwriting',
      },
    },
    required: ['path', 'content'],
  },
};

export async function executeFileWrite(input: unknown, context?: ToolExecutionContext): Promise<string> {
  const { path, content, append } = input as {
    path: string;
    content: string;
    append?: boolean;
  };

  const cwd = context?.cwd || process.cwd();
  const resolved = resolveWorkspacePath(cwd, path);
  if (!resolved.allowed) {
    return `Error: ${resolved.reason}`;
  }

  try {
    mkdirSync(dirname(resolved.path), { recursive: true });

    if (append) {
      const { appendFileSync } = await import('fs');
      appendFileSync(resolved.path, content, 'utf8');
    } else {
      writeFileSync(resolved.path, content, 'utf8');
    }

    return `File written successfully: ${resolved.path}`;
  } catch (err: unknown) {
    const error = err as Error;
    return `Error writing file: ${error.message}`;
  }
}
