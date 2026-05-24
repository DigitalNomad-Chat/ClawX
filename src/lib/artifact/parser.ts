import {
  StreamArtifact,
  StreamArtifactType,
  normalizeArtifactType,
} from './types';

export interface ParseResult {
  artifacts: StreamArtifact[];
  plainText: string;
  isComplete: boolean;
}

export interface ParserConfig {
  autoDetectLanguage?: boolean;
  treatCodeBlockAsArtifact?: boolean;
}

export interface ParseError {
  type: 'MALFORMED_FENCE' | 'INVALID_TYPE' | 'MISSING_CONTENT' | 'UNCLOSED_FENCE';
  message: string;
  position: { start: number; end: number };
  rawContent: string;
}

type FenceState =
  | { type: 'none' }
  | {
      type: 'artifact' | 'code';
      start: number;
      rawHeader: string;
      attributes: Record<string, string>;
      content: string;
      detectedType?: StreamArtifactType;
    };

export class ArtifactParser {
  private buffer = '';
  private fenceState: FenceState = { type: 'none' };
  private artifacts: StreamArtifact[] = [];
  private errors: ParseError[] = [];
  private plainTextParts: string[] = [];
  private currentPlainTextStart = 0;
  private lastProcessedIndex = 0;

  constructor(private config: ParserConfig = {}) {
    this.config = {
      autoDetectLanguage: true,
      treatCodeBlockAsArtifact: true,
      ...config,
    };
  }

  append(chunk: string): ParseResult {
    this.buffer += chunk;
    this.processBuffer();
    return this.buildResult();
  }

  finalize(): ParseResult {
    if (this.fenceState.type !== 'none') {
      const state = this.fenceState as Extract<FenceState, { type: 'artifact' | 'code' }>;
      const artifact = this.createArtifact(state, this.buffer.length);
      if (artifact) {
        this.artifacts.push(artifact);
      }
      this.plainTextParts.push(
        this.buffer.slice(this.currentPlainTextStart, state.start),
      );
      this.currentPlainTextStart = this.buffer.length;
      this.fenceState = { type: 'none' };
    }
    return this.buildResult(true);
  }

  reset(): void {
    this.buffer = '';
    this.fenceState = { type: 'none' };
    this.artifacts = [];
    this.errors = [];
    this.plainTextParts = [];
    this.currentPlainTextStart = 0;
    this.lastProcessedIndex = 0;
  }

  private processBuffer(): void {
    let i = this.lastProcessedIndex;
    while (i < this.buffer.length) {
      const lineStart = i;
      const lineEnd = this.buffer.indexOf('\n', i);
      const line =
        lineEnd === -1
          ? this.buffer.slice(i)
          : this.buffer.slice(i, lineEnd + 1);

      if (lineEnd === -1 && this.fenceState.type === 'none') {
        break;
      }

      if (this.fenceState.type === 'none') {
        this.processLineOutsideFence(line, lineStart);
      } else {
        this.processLineInsideFence(line, lineStart);
      }

      i = lineEnd === -1 ? this.buffer.length : lineEnd + 1;
    }
    this.lastProcessedIndex = i;
  }

  private processLineOutsideFence(line: string, lineStart: number): void {
    const artifactMatch = line.match(/^```artifact\s*(.*)/i);
    if (artifactMatch) {
      this.plainTextParts.push(
        this.buffer.slice(this.currentPlainTextStart, lineStart),
      );
      const rawHeader = artifactMatch[1].trim();
      const attributes = this.parseAttributes(rawHeader);
      const detectedType = this.inferTypeFromAttributes(attributes);
      this.fenceState = {
        type: 'artifact',
        start: lineStart,
        rawHeader,
        attributes,
        content: '',
        detectedType,
      };
      return;
    }

    if (this.config.treatCodeBlockAsArtifact) {
      const codeMatch = line.match(/^```(\w+)?/);
      if (codeMatch) {
        const lang = codeMatch[1];
        if (lang) {
          this.plainTextParts.push(
            this.buffer.slice(this.currentPlainTextStart, lineStart),
          );
          const detectedType = this.languageToType(lang);
          this.fenceState = {
            type: 'code',
            start: lineStart,
            rawHeader: lang,
            attributes: { language: lang },
            content: '',
            detectedType,
          };
        }
        return;
      }
    }
  }

  private processLineInsideFence(line: string, _lineStart: number): void {
    const state = this.fenceState as Extract<FenceState, { type: 'artifact' | 'code' }>;

    const endMatch = line.match(/^```\s*(?:\n|$)/);
    if (endMatch) {
      const artifact = this.createArtifact(state, _lineStart + line.length);
      if (artifact) {
        this.artifacts.push(artifact);
      }
      this.currentPlainTextStart = _lineStart + line.length;
      this.fenceState = { type: 'none' };
      return;
    }

    state.content += line;
  }

  private parseAttributes(header: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const regex = /(\w+)\s*="([^"]*)"/g;
    let match;
    while ((match = regex.exec(header)) !== null) {
      attrs[match[1]] = match[2];
    }
    return attrs;
  }

  private inferTypeFromAttributes(attrs: Record<string, string>): StreamArtifactType | undefined {
    const typeAttr = attrs.type;
    if (typeAttr) {
      return normalizeArtifactType(typeAttr) || undefined;
    }
    return undefined;
  }

  private languageToType(lang: string): StreamArtifactType | undefined {
    const map: Record<string, StreamArtifactType> = {
      md: 'document',
      markdown: 'document',
      txt: 'document',
      svg: 'svg',
      mermaid: 'mermaid',
      typescript: 'code',
      jsx: 'code',
      tsx: 'code',
      ts: 'code',
      js: 'code',
      py: 'code',
      json: 'code',
      yaml: 'code',
      yml: 'code',
      css: 'code',
      sql: 'code',
    };
    return map[lang.toLowerCase()];
  }

  private createArtifact(
    state: Extract<FenceState, { type: 'artifact' | 'code' }>,
    endPos: number,
  ): StreamArtifact | null {
    const type =
      state.detectedType ||
      this.languageToType(state.attributes.language || '') ||
      normalizeArtifactType(state.attributes.type || 'document') ||
      'document';

    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      type,
      title: state.attributes.title || '未命名 Artifact',
      content: state.content.trimEnd(),
      status: 'complete',
      meta: {
        language: state.attributes.language || state.rawHeader,
        filename: state.attributes.filename,
        ...state.attributes,
      },
      position: { start: state.start, end: endPos },
      createdAt: now,
      updatedAt: now,
      sessionKey: '', // 由 sync 层填充
    };
  }

  private buildResult(isComplete = false): ParseResult {
    const plainText = this.plainTextParts.join('') + (
      this.fenceState.type === 'none' && this.currentPlainTextStart < this.buffer.length
        ? this.buffer.slice(this.currentPlainTextStart)
        : ''
    );
    return {
      artifacts: [...this.artifacts],
      plainText,
      isComplete,
    };
  }

  static parse(text: string, config?: ParserConfig): ParseResult {
    const parser = new ArtifactParser(config);
    parser.append(text);
    return parser.finalize();
  }
}

export function serializeArtifact(artifact: StreamArtifact): string {
  const attrs: string[] = [`type="${artifact.type}"`];
  if (artifact.title) attrs.push(`title="${artifact.title}"`);
  if (artifact.meta.language) attrs.push(`language="${artifact.meta.language}"`);
  if (artifact.meta.filename) attrs.push(`filename="${artifact.meta.filename}"`);

  return `\`\`\`artifact ${attrs.join(' ')}
${artifact.content}
\`\`\`\n`;
}
