import { describe, it, expect } from 'vitest';
import { repairMarkdown } from '../../src/lib/markdown-repair';

describe('repairMarkdown', () => {
  it('should append separator row to incomplete table header', () => {
    const input = '| Account | Content |';
    const result = repairMarkdown(input);
    expect(result).toBe('| Account | Content |\n|---|---|');
  });

  it('should append separator for table with multiple header rows', () => {
    const input = '| Account | Content |\n| @OpenAI | ChatGPT launches...';
    const result = repairMarkdown(input);
    expect(result).toBe('| Account | Content |\n| @OpenAI | ChatGPT launches...\n|---|---|');
  });

  it('should not modify complete table', () => {
    const input = '| Account | Content |\n|---------|---------|\n| @OpenAI | ChatGPT |';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should not modify table with separator but no data', () => {
    const input = '| Account | Content |\n|---------|---------|';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should close unclosed code fence', () => {
    const input = '```js\nconst x = 1;';
    const result = repairMarkdown(input);
    expect(result).toBe('```js\nconst x = 1;\n```');
  });

  it('should not modify closed code fence', () => {
    const input = '```js\nconst x = 1;\n```';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should close unclosed bold marker', () => {
    const input = 'This is **bold';
    const result = repairMarkdown(input);
    expect(result).toBe('This is **bold**');
  });

  it('should not close balanced bold markers', () => {
    const input = 'This is **bold** text';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should not close bold inside code fence', () => {
    const input = '```\nThis is **not bold';
    const result = repairMarkdown(input);
    expect(result).toBe('```\nThis is **not bold\n```');
  });

  it('should close unclosed italic marker', () => {
    const input = 'This is *italic';
    const result = repairMarkdown(input);
    expect(result).toBe('This is *italic*');
  });

  it('should not close italic inside code fence', () => {
    const input = '```\nThis is *not italic';
    const result = repairMarkdown(input);
    expect(result).toBe('```\nThis is *not italic\n```');
  });

  it('should close unclosed inline code', () => {
    const input = 'Use `foo';
    const result = repairMarkdown(input);
    expect(result).toBe('Use `foo`');
  });

  it('should not close inline code inside code fence', () => {
    const input = '```\nUse `foo';
    const result = repairMarkdown(input);
    expect(result).toBe('```\nUse `foo\n```');
  });

  it('should close unclosed link', () => {
    const input = '[link](https://example.com';
    const result = repairMarkdown(input);
    expect(result).toBe('[link](https://example.com)');
  });

  it('should not modify closed link', () => {
    const input = '[link](https://example.com)';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should handle bold and code together', () => {
    const input = '**bold and `code';
    const result = repairMarkdown(input);
    // repairMarkdown appends closers at the end of the entire text
    expect(result).toBe('**bold and `code**`');
  });

  it('should handle table and bold together', () => {
    const input = '**bold\n| Name | Value |';
    const result = repairMarkdown(input);
    // Table gets synthetic separator, bold gets closer at end
    expect(result).toBe('**bold\n| Name | Value |\n|---|---|**');
  });

  it('should handle empty string', () => {
    const result = repairMarkdown('');
    expect(result).toBe('');
  });

  it('should handle plain text without markdown', () => {
    const input = 'Hello world, no markdown here.';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should handle table header with extra spaces', () => {
    const input = '  |  Account  |  Content  |  ';
    const result = repairMarkdown(input);
    expect(result).toBe('  |  Account  |  Content  |  \n|---|---|');
  });

  it('should not treat pipe in middle of text as table', () => {
    const input = 'Use the | operator in TypeScript';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should handle code fence with language tag', () => {
    const input = '```typescript\nconst x: number = 1;';
    const result = repairMarkdown(input);
    expect(result).toBe('```typescript\nconst x: number = 1;\n```');
  });

  it('should not add extra separator if table already has data rows', () => {
    const input = '| A | B |\n|---|---|\n| 1 | 2 |';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  // ── Trailing newline cases (common in streaming) ──

  it('should detect table when text ends with trailing newline', () => {
    const input = '📊 数据概况\n| 指标 | 数值 |\n';
    const result = repairMarkdown(input);
    expect(result).toBe('📊 数据概况\n| 指标 | 数值 |\n|---|---|\n');
  });

  it('should detect table when text ends with multiple trailing newlines', () => {
    const input = '| A | B |\n\n';
    const result = repairMarkdown(input);
    expect(result).toBe('| A | B |\n|---|---|\n\n');
  });

  it('should detect table when text ends with trailing spaces then newline', () => {
    const input = '| A | B |   \n';
    const result = repairMarkdown(input);
    expect(result).toBe('| A | B |   \n|---|---|\n');
  });

  it('should not modify table with separator when trailing newline present', () => {
    const input = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const result = repairMarkdown(input);
    expect(result).toBe(input);
  });

  it('should handle table header preceded by content with trailing newline', () => {
    // Simulates LLM output: paragraph, then table header, then newline
    const input = 'Here is the data:\n| Name | Value |\n';
    const result = repairMarkdown(input);
    expect(result).toBe('Here is the data:\n| Name | Value |\n|---|---|\n');
  });
});
