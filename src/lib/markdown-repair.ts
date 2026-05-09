/**
 * Markdown Repair Utility
 *
 * Detects incomplete Markdown syntax at the end of a streaming string and
 * temporarily auto-closes it so remark-gfm can parse it correctly.
 *
 * The original string is NEVER mutated; a repaired copy is returned.
 */

/**
 * Detects whether a position in the text is inside a fenced code block.
 * Walks from the start to the position, counting triple-backtick lines.
 *
 * IMPORTANT: This is intended for non-fence content (e.g. `*` or `` ` ``).
 * Do NOT use it to decide whether a ``` line itself should be counted.
 */
function isInsideCodeFence(text: string, position: number): boolean {
  const prefix = text.slice(0, position);
  let fenceCount = 0;
  const lines = prefix.split('\n');
  for (const line of lines) {
    const trimmed = line.trimStart();
    // Match lines that start with ``` (optionally followed by language tag)
    if (trimmed.startsWith('```')) {
      fenceCount++;
    }
  }
  return fenceCount % 2 === 1;
}

/**
 * If the last non-empty line starts with `|` and there is no separator row,
 * append a synthetic separator so remark-gfm renders the header as a table.
 *
 * Trailing newlines are common in streaming (LLMs often emit `\n` after a
 * table header row).  We skip them so the table is still detected.
 */
function repairIncompleteTable(text: string): string {
  // Trim trailing newlines so that a trailing `\n` does not hide the
  // last table line.  Preserve the trimmed suffix so we can reattach it.
  // Only strip newlines — NOT spaces, which are part of the line content.
  const trimmed = text.replace(/\n+$/, '');
  const suffix = text.slice(trimmed.length);
  if (!trimmed) return text;

  const lines = trimmed.split('\n');
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
  const hasSeparator = tableLines.some((line) =>
    /^\s*\|[\s\-:|]+\|\s*$/.test(line),
  );
  if (hasSeparator) return text;

  // Count columns from the header (last non-empty line = last table line)
  const headerLine = tableLines[tableLines.length - 1];
  const colCount = headerLine.split('|').filter((s) => s.trim() !== '').length;
  if (colCount === 0) return text;

  const separator = '|' + Array(colCount).fill('---').join('|') + '|';
  return trimmed + '\n' + separator + suffix;
}

/**
 * Count total code-fence markers in the text.
 * Used to check whether fences are balanced (even = closed).
 */
function countCodeFences(text: string): number {
  let count = 0;
  const regex = /^\s*```/gm;
  while (regex.exec(text) !== null) {
    count++;
  }
  return count;
}

/**
 * Count occurrences of a pattern outside of code fences.
 */
function countOutsideFences(text: string, pattern: RegExp): number {
  let count = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
  );
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
 * 1. Incomplete tables -> append synthetic separator row
 * 2. Unclosed code fences -> append closing fence
 * 3. Unclosed bold ** -> append **
 * 4. Unclosed italic * -> append *
 * 5. Unclosed inline code ` -> append `
 * 6. Unclosed links [text](url -> append )
 */
export function repairMarkdown(text: string): string {
  if (!text) return text;
  let result = text;

  // 1. Table repair (context-independent, tables inside code fences are rare)
  result = repairIncompleteTable(result);

  // 2. Code fence repair — count all ``` lines directly (not via countOutsideFences)
  if (countCodeFences(result) % 2 === 1) {
    result = result + '\n```';
  }

  // 3. Bold repair
  const boldCount = countOutsideFences(result, /\*\*/g);
  if (boldCount % 2 === 1) {
    result = result + '**';
  }

  // 4. Italic repair — count single * not part of **
  let italicCount = 0;
  const italicRegex = /(?<!\*)\*(?!\*)/g;
  let m: RegExpExecArray | null;
  while ((m = italicRegex.exec(result)) !== null) {
    if (!isInsideCodeFence(result, m.index)) {
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
