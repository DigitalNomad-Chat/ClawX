/**
 * Web Fetch Tool - Fetch content from URLs
 */
import type { ToolDefinition } from '../types.js';

export const webFetchToolDefinition: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch content from a URL. Returns the HTML or text content.',
  isReadOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      method: {
        type: 'string',
        description: 'HTTP method (GET, POST)',
        enum: ['GET', 'POST'],
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers',
      },
      body: {
        type: 'string',
        description: 'Optional request body',
      },
    },
    required: ['url'],
  },
};

function isDomainAllowed(
  url: string,
  allowedDomains?: string[],
  deniedDomains?: string[]
): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (deniedDomains) {
      for (const d of deniedDomains) {
        const lower = d.toLowerCase();
        if (hostname === lower || hostname.endsWith(`.${lower}`)) {
          return false;
        }
      }
    }

    if (allowedDomains && allowedDomains.length > 0) {
      for (const d of allowedDomains) {
        const lower = d.toLowerCase();
        if (hostname === lower || hostname.endsWith(`.${lower}`)) {
          return true;
        }
      }
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function executeWebFetch(input: unknown, context?: { cwd: string; allowedDomains?: string[]; deniedDomains?: string[] }): Promise<string> {
  const { url, method = 'GET', headers, body } = input as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  // Validate method
  const normalizedMethod = method.toUpperCase();
  if (!['GET', 'POST'].includes(normalizedMethod)) {
    return 'Error: Only GET and POST methods are allowed.';
  }

  // Validate body size
  if (body && body.length > 100_000) {
    return 'Error: Request body exceeds 100KB limit.';
  }

  // Domain restrictions
  if (!isDomainAllowed(url, context?.allowedDomains, context?.deniedDomains)) {
    return 'Error: This domain is not allowed by the agent configuration.';
  }

  try {
    const response = await fetch(url, {
      method: normalizedMethod,
      headers,
      body: normalizedMethod === 'POST' ? body : undefined,
    });

    const text = await response.text();

    return [
      `Status: ${response.status} ${response.statusText}`,
      `Content-Type: ${response.headers.get('content-type') || 'unknown'}`,
      `Length: ${text.length} characters`,
      '---',
      text.slice(0, 100000), // Limit to 100KB
    ].join('\n');
  } catch (err: unknown) {
    const error = err as Error;
    return `Error fetching URL: ${error.message}`;
  }
}
