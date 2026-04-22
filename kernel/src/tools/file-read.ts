/**
 * File Read Tool - Read file contents
 */
import { readFileSync } from 'fs';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';
import { resolveWorkspacePath } from '../security/path-guard.js';

export const fileReadToolDefinition: ToolDefinition = {
  name: 'file_read',
  description: 'Read the contents of a file from the local filesystem.',
  isReadOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      offset: {
        type: 'number',
        description: 'Line offset to start reading from (1-based)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read',
      },
    },
    required: ['path'],
  },
};

export async function executeFileRead(input: unknown, context?: ToolExecutionContext): Promise<string> {
  const { path, offset, limit } = input as {
    path: string;
    offset?: number;
    limit?: number;
  };

  const cwd = context?.cwd || process.cwd();
  const resolved = resolveWorkspacePath(cwd, path);
  if (!resolved.allowed) {
    return `Error: ${resolved.reason}`;
  }

  try {
    let content = readFileSync(resolved.path, 'utf8');

    if (offset || limit) {
      const lines = content.split('\n');
      const start = (offset || 1) - 1;
      const end = limit ? start + limit : lines.length;
      content = lines.slice(start, end).join('\n');
    }

    return content;
  } catch (err: unknown) {
    const error = err as Error;
    return `Error reading file: ${error.message}`;
  }
}
