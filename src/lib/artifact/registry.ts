import { StreamArtifactType, RendererEntry } from './types';

class StreamArtifactRendererRegistry {
  private entries = new Map<StreamArtifactType, RendererEntry>();

  register(entry: RendererEntry): void {
    this.entries.set(entry.type, entry);
  }

  get(type: StreamArtifactType): RendererEntry | undefined {
    return this.entries.get(type);
  }

  has(type: StreamArtifactType): boolean {
    return this.entries.has(type);
  }

  getAll(): RendererEntry[] {
    return Array.from(this.entries.values());
  }

  getFileExtension(type: StreamArtifactType): string {
    const entry = this.entries.get(type);
    if (entry?.fileExtension) return entry.fileExtension;
    const map: Record<string, string> = {
      document: 'md',
      code: 'txt',
      html: 'html',
      svg: 'svg',
      mermaid: 'mmd',
    };
    return map[type] || 'txt';
  }
}

export const streamArtifactRegistry = new StreamArtifactRendererRegistry();
