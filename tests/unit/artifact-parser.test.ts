import { describe, it, expect } from 'vitest';
import { ArtifactParser } from '@/lib/artifact/parser';

describe('ArtifactParser', () => {
  it('parses a single artifact block', () => {
    const text = `Some text before
\`\`\`artifact type="html" title="Hello"
<h1>Hello World</h1>
\`\`\`
Some text after`;

    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.artifacts[0].title).toBe('Hello');
    expect(result.artifacts[0].content).toBe('<h1>Hello World</h1>');
    expect(result.plainText).toBe('Some text before\nSome text after');
    expect(result.isComplete).toBe(true);
  });

  it('handles streaming chunks incrementally', () => {
    const parser = new ArtifactParser();

    let result = parser.append('Some text\n```artifact type="code" title="Test"\n');
    expect(result.artifacts).toHaveLength(0);
    expect(result.plainText).toBe('Some text\n');

    result = parser.append('const x = 1;\n');
    expect(result.artifacts).toHaveLength(0);

    result = parser.append('```\nAfter text');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].content).toBe('const x = 1;');
    expect(result.plainText).toBe('Some text\nAfter text');
  });

  it('handles unclosed fence in finalize', () => {
    const parser = new ArtifactParser();
    parser.append('```artifact type="html"\n<p>Hello</p>');
    const result = parser.finalize();

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.isComplete).toBe(true);
  });

  it('treats code blocks as artifacts when configured', () => {
    const text = '```typescript\nconst x = 1;\n```';
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('code');
    expect(result.artifacts[0].meta.language).toBe('typescript');
  });

  it('ignores code blocks without language', () => {
    const text = '```\nplain text\n```';
    const result = ArtifactParser.parse(text, { treatCodeBlockAsArtifact: true });

    expect(result.artifacts).toHaveLength(0);
  });

  it('handles nested code blocks inside artifact', () => {
    const text = `\`\`\`artifact type="document"
Here is some code:
\`\`\`js
const x = 1;
\`\`\`
More text
\`\`\``;
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].content).toContain('const x = 1;');
  });

  it('returns empty result for plain text without artifacts', () => {
    const text = 'Just plain text without any fences.';
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(0);
    expect(result.plainText).toBe(text);
  });

  it('creates new artifact at different position in streaming', () => {
    const parser = new ArtifactParser();
    parser.append('```artifact type="code"\nline1\n```');
    let result = parser.append('');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].content).toBe('line1');

    // Parser does not deduplicate; store layer handles that.
    // A new artifact block at a different position creates a second entry.
    result = parser.append('```artifact type="code"\nline1\nline2\n```');
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[1].content).toBe('line1\nline2');
  });

  it('fallbacks to document for invalid type', () => {
    const text = '```artifact type="unknown"\ncontent\n```';
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('document');
  });

  it('infers type from language attribute', () => {
    const text = '```artifact language="mermaid"\ngraph TD;\n```';
    const result = ArtifactParser.parse(text);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('mermaid');
  });

  it('infers html type from html code block', () => {
    const text = '```html\n<div>Hello</div>\n```';
    const result = ArtifactParser.parse(text, { treatCodeBlockAsArtifact: true });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.artifacts[0].meta.language).toBe('html');
  });

  it('handles streaming html code block across chunks', () => {
    const parser = new ArtifactParser({ treatCodeBlockAsArtifact: true });

    let result = parser.append('Here is some HTML:\n```html\n');
    expect(result.artifacts).toHaveLength(0);
    expect(result.plainText).toBe('Here is some HTML:\n');

    result = parser.append('<div>Hello</div>\n');
    expect(result.artifacts).toHaveLength(0);

    result = parser.append('```\nAfter text');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.artifacts[0].content).toBe('<div>Hello</div>');
    expect(result.plainText).toBe('Here is some HTML:\nAfter text');
  });

  it('handles code block start split across chunks', () => {
    const parser = new ArtifactParser({ treatCodeBlockAsArtifact: true });

    // First chunk contains incomplete fence start
    let result = parser.append('```ht');
    expect(result.artifacts).toHaveLength(0);

    // Second chunk completes the fence start
    result = parser.append('ml\n<div>Hello</div>\n```\n');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].type).toBe('html');
    expect(result.artifacts[0].content).toBe('<div>Hello</div>');
  });
});
