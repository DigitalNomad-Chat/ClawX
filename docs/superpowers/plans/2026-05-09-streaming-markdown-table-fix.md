# Streaming Markdown Table Rendering Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the issue where markdown tables render as a "clump" of text during streaming, and only display correctly after refresh or navigation.

**Architecture:** Add a `repairMarkdown` utility that auto-closes incomplete Markdown syntax (tables, code fences, bold, inline code) before `react-markdown` parses it. Combine with a debounce mechanism in the streaming message component to reduce re-render frequency. Keep changes localized to the chat message rendering path.

**Tech Stack:** React 19, react-markdown 10.1.0, remark-gfm 4.0.1, TypeScript, vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/markdown-repair.ts` | **NEW** — Preprocesses incomplete Markdown syntax for streaming contexts |
| `tests/unit/markdown-repair.test.ts` | **NEW** — Unit tests for `repairMarkdown` covering tables, code, bold, edge cases |
| `src/pages/Chat/ChatMessage.tsx` | **MODIFY** — Integrates `repairMarkdown` into `MessageBubble` before `ReactMarkdown` |
| `src/stores/chat/helpers.ts` | **MODIFY** — Adds debounce helper (or uses lodash-es if available) |
| `tests/e2e/chat-table-streaming.spec.ts` | **NEW** — E2E test verifying table renders correctly during simulated streaming |

---

## Chunk 1: Core Markdown Repair Utility + Tests

### Task 1: Create `repairMarkdown` utility

**Files:**
- Create: `src/lib/markdown-repair.ts`
- Test: `tests/unit/markdown-repair.test.ts`

**Overview:**
This utility detects incomplete Markdown syntax at the end of a streaming string and temporarily auto-closes it so `remark-gfm` can parse it correctly. The original string is never mutated; a repaired copy is returned.

**Context-aware rules (in priority order):**
1. **Code fences** — Count `` ``` `` lines. Odd count → append ``\n``` ``
2. **Tables** — Detect incomplete table structures (header without separator, or separator without data). Strategy: if last block looks like a table header but lacks separator, temporarily convert `|` to a visual equivalent or hide until complete.
3. **Bold** — Count `**` pairs outside code fences. Odd count → append `**`
4. **Italic** — Count `*` pairs (not part of `**`) outside code fences. Odd count → append `*`
5. **Inline code** — Count single `` ` `` (not part of ```) outside code fences. Odd count → append `` ` ``
6. **Links** — Detect `[text](url` without closing `)`. Append `)`.

**Table-specific strategy (key insight):**
During streaming, a table arrives line-by-line:
```
| Account | Content |
|---------|---------|
| @OpenAI | ChatGPT...
```
When only `| Account | Content |` has arrived, `remark-gfm` does NOT recognize it as a table (missing separator row). It renders the pipes as literal text, creating the "clump".

**Solution:** If the last line starts with `|` and we don't have a complete table (header + separator + at least one data row), temporarily replace the `|` characters in that incomplete block with an HTML entity or comment so they don't render as text. Once the table completes (separator row arrives), normal parsing resumes.

Actually, a simpler approach: if the last line starts with `|` and the preceding lines don't form a complete table, we can temporarily append a hidden separator row and dummy cell to "complete" the table structure. This is a render-only fix — the raw text in the message store remains unchanged.

Even simpler and safer: **only repair tables when we detect an incomplete table header**. Strategy:
- Check if last line matches `/^\s*\|/` (starts with pipe)
- Walk backwards to find all consecutive lines starting with `|`
- If we have ≥1 such lines but NO separator row (matching `/^\s*\|[\s\-:|]+\|/`), the table is incomplete
- **Repair:** Append a synthetic separator row `|---|---|` (matching column count) so `remark-gfm` parses the header as a table. The separator row is styled with zero height / hidden via CSS if needed, but actually for streaming it's fine because next chunk will replace it.

Wait — but then when the real separator arrives, we won't be appending anymore because the table will be complete. The synthetic row just exists for the current render frame.

Actually, even better approach used by production systems (e.g., Claude.ai, ChatGPT): **Don't try to make incomplete tables render as tables. Instead, prevent the raw `|` from showing as ugly text.** When table is incomplete, escape or hide the pipe characters so they don't create jarring visual output.

Let's go with the **synthetic separator approach** because:
1. It makes the header render as a styled table immediately (good UX)
2. The synthetic separator is invisible once real content arrives
3. It's simpler than escaping

Implementation:
```typescript
function repairIncompleteTable(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const lastLine = lines[lines.length - 1];
  if (!lastLine.trim().startsWith('|')) return lines;

  // Walk back to find the table block
  const tableLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('|')) {
      tableLines.unshift(lines[i]);
    } else {
      break;
    }
  }

  // Check if we already have a separator row
  const hasSeparator = tableLines.some(line =>
    /^\s*\|[\s\-:|]+\|\s*$/.test(line)
  );

  if (hasSeparator) return lines;

  // Count columns in the header (last line)
  const colCount = lastLine.split('|').filter(s => s.trim() !== '').length;
  if (colCount === 0) return lines;

  // Append synthetic separator row
  const separator = '|' + Array(colCount).fill('---').join('|') + '|';
  return [...lines, separator];
}
```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/markdown-repair.test.ts
import { describe, it, expect } from 'vitest';
import { repairMarkdown } from '../../src/lib/markdown-repair';

describe('repairMarkdown', () => {
  it('should append separator row to incomplete table header', () => {
    const input = '| Account | Content |';
    const result = repairMarkdown(input);
    expect(result).toBe('| Account | Content |\n|---|---|');
  });

  it('should not modify complete table', () => {
    const input = '| Account | Content |\n|---------|---------|\n| @OpenAI | ChatGPT |';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should close unclosed code fence', () => {
    const input = '```js\nconst x = 1;';
    const result = repairMarkdown(input);
    expect(result).toBe('```js\nconst x = 1;\n```');
  });

  it('should close unclosed bold marker', () => {
    const input = 'This is **bold';
    const result = repairMarkdown(input);
    expect(result).toBe('This is **bold**');
  });

  it('should not close bold inside code fence', () => {
    const input = '```\nThis is **not bold';
    const result = repairMarkdown(input);
    expect(result).toBe('```\nThis is **not bold\n```');
  });

  it('should close unclosed inline code', () => {
    const input = 'Use `foo';
    const result = repairMarkdown(input);
    expect(result).toBe('Use `foo`');
  });

  it('should close unclosed link', () => {
    const input = '[link](https://example.com';
    const result = repairMarkdown(input);
    expect(result).toBe('[link](https://example.com)');
  });

  it('should handle multiple issues at once', () => {
    const input = '| Name | Value |\n**bold and `code';
    const result = repairMarkdown(input);
    expect(result).toContain('|---|---|');
    expect(result).toContain('**bold**');
    expect(result).toContain('`code`');
  });
});
```

Run: `pnpm test tests/unit/markdown-repair.test.ts`
Expected: FAIL — `repairMarkdown` not defined

- [ ] **Step 2: Implement `repairMarkdown`**

```typescript
// src/lib/markdown-repair.ts

/**
 * Detects whether a position in the text is inside a fenced code block.
 * Walks from the start to the position, counting triple-backtick lines.
 */
function isInsideCodeFence(text: string, position: number): boolean {
  const prefix = text.slice(0, position);
  let fenceCount = 0;
  const lines = prefix.split('\n');
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      fenceCount++;
    }
  }
  return fenceCount % 2 === 1;
}

/**
 * If the last line starts with `|` and there is no separator row,
 * append a synthetic separator so remark-gfm renders the header as a table.
 */
function repairIncompleteTable(text: string): string {
  const lines = text.split('\n');
  if (lines.length === 0) return text;

  const lastLine = lines[lines.length - 1];
  if (!lastLine.trim().startsWith('|')) return text;

  // Walk back to find contiguous table lines
  const tableLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('|')) {
      tableLines.unshift(lines[i]);
    } else {
      break;
    }
  }

  // Already has a separator?
  const hasSeparator = tableLines.some(line =>
    /^\s*\|[\s\-:|]+\|\s*$/.test(line)
  );
  if (hasSeparator) return text;

  // Count columns from the header (last line of text = first table line)
  const headerLine = tableLines[tableLines.length - 1];
  const colCount = headerLine.split('|').filter(s => s.trim() !== '').length;
  if (colCount === 0) return text;

  const separator = '|' + Array(colCount).fill('---').join('|') + '|';
  return text + '\n' + separator;
}

/**
 * Count occurrences of a pattern outside of code fences.
 */
function countOutsideFences(text: string, pattern: RegExp): number {
  let count = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  while ((match = regex.exec(text)) !== null) {
    if (!isInsideCodeFence(text, match.index)) {
      count++;
    }
  }
  return count;
}

/**
 * Repair incomplete Markdown syntax for streaming contexts.
 * Returns a NEW string; does NOT mutate the input.
 *
 * Repairs applied (in order):
 * 1. Incomplete tables → append synthetic separator row
 * 2. Unclosed code fences → append closing fence
 * 3. Unclosed bold ** → append **
 * 4. Unclosed italic * → append *
 * 5. Unclosed inline code ` → append `
 * 6. Unclosed links [text](url → append )
 */
export function repairMarkdown(text: string): string {
  if (!text) return text;
  let result = text;

  // 1. Table repair (context-independent, tables inside code fences are rare)
  result = repairIncompleteTable(result);

  // 2. Code fence repair
  const fenceCount = countOutsideFences(result, /^\s*```/gm);
  if (fenceCount % 2 === 1) {
    result = result + '\n```';
  }

  // 3. Bold repair (must check after code fence because we may have added one)
  const boldCount = countOutsideFences(result, /\*\*/g);
  if (boldCount % 2 === 1) {
    result = result + '**';
  }

  // 4. Italic repair — count single * not part of **
  // Strategy: remove all ** pairs, then count remaining *
  const textOutsideFences = result; // simplified; bold already handled
  let italicCount = 0;
  const italicRegex = /(?<!\*)\*(?!\*)/g;
  let m: RegExpExecArray | null;
  while ((m = italicRegex.exec(textOutsideFences)) !== null) {
    if (!isInsideCodeFence(textOutsideFences, m.index)) {
      italicCount++;
    }
  }
  if (italicCount % 2 === 1) {
    result = result + '*';
  }

  // 5. Inline code repair
  const backtickCount = countOutsideFences(result, /(?<!`)`(?!`)/g);
  if (backtickCount % 2 === 1) {
    result = result + '`';
  }

  // 6. Link repair
  const openLink = result.lastIndexOf('[');
  if (openLink !== -1 && !isInsideCodeFence(result, openLink)) {
    const afterOpen = result.slice(openLink);
    if (/\[.+?\]\([^)]*$/.test(afterOpen)) {
      result = result + ')';
    }
  }

  return result;
}
```

Run: `pnpm test tests/unit/markdown-repair.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/markdown-repair.ts tests/unit/markdown-repair.test.ts
git commit -m "feat: add markdown-repair utility for streaming incomplete syntax

- Auto-closes incomplete tables, code fences, bold, italic, inline code, links
- Context-aware: respects code fence boundaries
- Includes comprehensive unit tests"
```

---

## Chunk 2: Integrate into ChatMessage Component + Debounce

### Task 2: Add debounce utility

**Files:**
- Create: `src/hooks/use-debounced-value.ts`
- Test: `tests/unit/use-debounced-value.test.ts`

- [ ] **Step 4: Write debounce hook**

```typescript
// src/hooks/use-debounced-value.ts
import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

- [ ] **Step 5: Write test**

```typescript
// tests/unit/use-debounced-value.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';

describe('useDebouncedValue', () => {
  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 100));
    expect(result.current).toBe('hello');
  });

  it('should update after delay', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 50),
      { initialProps: { value: 'a' } }
    );
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
    vi.advanceTimersByTime(50);
    await waitFor(() => expect(result.current).toBe('b'));
    vi.useRealTimers();
  });
});
```

Run: `pnpm test tests/unit/use-debounced-value.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-debounced-value.ts tests/unit/use-debounced-value.test.ts
git commit -m "feat: add useDebouncedValue hook for streaming throttling"
```

### Task 3: Integrate into ChatMessage

**Files:**
- Modify: `src/pages/Chat/ChatMessage.tsx:1-20` (imports)
- Modify: `src/pages/Chat/ChatMessage.tsx:373-437` (MessageBubble)

- [ ] **Step 7: Add imports and integrate repairMarkdown**

In `src/pages/Chat/ChatMessage.tsx`:

Add import:
```typescript
import { repairMarkdown } from '@/lib/markdown-repair';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
```

Modify `MessageBubble`:
```typescript
function MessageBubble({
  text,
  isUser,
  isStreaming,
}: {
  text: string;
  isUser: boolean;
  isStreaming: boolean;
}) {
  // Debounce streaming text to reduce re-render frequency (50ms)
  const debouncedText = useDebouncedValue(text, isStreaming ? 50 : 0);
  const displayText = isStreaming ? debouncedText : text;

  // Repair incomplete markdown during streaming
  const repairedText = isStreaming ? repairMarkdown(displayText) : displayText;

  return (
    <div
      className={cn(
        'relative rounded-2xl px-4 py-3',
        !isUser && 'w-full',
        isUser
          ? 'bg-[#0a84ff] text-white shadow-sm'
          : 'bg-black/5 dark:bg-white/5 text-foreground',
      )}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap break-words break-all text-sm">{text}</p>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words break-all">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false, output: 'html' }]]}
            components={{ /* ... existing ... */ }}
          >
            {normalizeLatexDelimiters(repairedText)}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-0.5" />
          )}
        </div>
      )}
    </div>
  );
}
```

Note: For user messages we keep `text` (no repair needed). For assistant messages we use `repairedText`.

Run: `pnpm test` (full suite to ensure no regressions)
Expected: All existing tests pass

- [ ] **Step 8: Commit**

```bash
git add src/pages/Chat/ChatMessage.tsx
git commit -m "feat: integrate markdown repair and debounce into ChatMessage

- Applies repairMarkdown to streaming assistant messages
- Debounces streaming text at 50ms to reduce re-render frequency
- Preserves existing behavior for non-streaming and user messages"
```

---

## Chunk 3: Integration & E2E Verification

### Task 4: Update existing E2E test for streaming table scenario

**Files:**
- Modify: `tests/e2e/chat-table-header-light.spec.ts`
- Create: `tests/e2e/chat-table-streaming.spec.ts`

- [ ] **Step 9: Create streaming table E2E test**

```typescript
// tests/e2e/chat-table-streaming.spec.ts
import { test, expect } from '@playwright/test';
import { closeElectronApp, getStableWindow, installIpcMocks, launchElectronApp } from './fixtures/electron';

const SESSION_KEY = 'agent:main:main';

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
}

test.describe('Streaming markdown table rendering', () => {
  test('table header renders as styled table during simulated streaming', async () => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      await installIpcMocks(app, {
        gatewayStatus: { state: 'running', port: 18789, pid: 12345 },
        gatewayRpc: {
          [stableStringify(['sessions.list', {}])]: {
            success: true,
            result: { sessions: [{ key: SESSION_KEY, displayName: 'main' }] },
          },
          [stableStringify(['chat.history', { sessionKey: SESSION_KEY, limit: 200 }])]: {
            success: true,
            result: { messages: [] },
          },
        },
      });

      const page = await getStableWindow(app);
      await page.reload().catch(() => {});
      await expect(page.getByTestId('main-layout')).toBeVisible();

      // Simulate a streaming assistant message with incomplete table
      await page.evaluate(() => {
        // Access the store directly (if exposed in dev) or simulate via IPC
        // This is a simplified approach; actual test may need IPC event injection
        const event = new CustomEvent('test:chat-event', {
          detail: {
            state: 'delta',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: '| Account | Content |\n| @OpenAI | ChatGPT launches...' }],
            },
          },
        });
        window.dispatchEvent(event);
      });

      // Verify table elements exist (thead, th, td)
      const table = page.locator('.prose table').first();
      await expect(table).toBeVisible({ timeout: 10_000 });
      await expect(table.locator('thead th').first()).toBeVisible();

      // Screenshot for visual regression
      await table.screenshot({ path: 'test-results/streaming-table.png' });
    } finally {
      await closeElectronApp(app);
    }
  });
});
```

Note: This test may need adjustment based on how the app exposes test hooks. If IPC event injection is complex, we can use a simpler unit/integration test approach.

- [ ] **Step 10: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```
Expected: No errors

- [ ] **Step 11: Run full test suite**

```bash
pnpm test
```
Expected: All tests pass

- [ ] **Step 12: Final commit**

```bash
git add tests/e2e/chat-table-streaming.spec.ts
# Also include any additional test fixtures if created
git commit -m "test: add e2e coverage for streaming table rendering"
```

---

## Rollback Plan

If issues arise in production:

1. **Disable repair:** Change `const repairedText = isStreaming ? repairMarkdown(displayText) : displayText;` to `const repairedText = displayText;`
2. **Disable debounce:** Change `const debouncedText = useDebouncedValue(text, isStreaming ? 50 : 0);` to `const debouncedText = text;`

Both changes are in a single file (`ChatMessage.tsx`) and can be toggled independently.

---

## Acceptance Criteria

- [ ] Unit tests for `repairMarkdown` cover: tables, code fences, bold, italic, inline code, links, and context-awareness (inside code fences)
- [ ] `repairMarkdown` is applied only to streaming assistant messages, not user messages or final messages
- [ ] Streaming text is debounced at 50ms to reduce re-render frequency
- [ ] Existing E2E test (`chat-table-header-light.spec.ts`) still passes
- [ ] Full test suite passes without regressions
- [ ] Manual verification: during streaming, table headers render as styled tables immediately rather than as raw text
