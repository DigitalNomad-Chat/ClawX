import { useState } from 'react';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { useArtifactPanel } from '@/stores/artifact-panel';
import { streamArtifactRegistry } from '@/lib/artifact/registry';
import { RendererErrorBoundary } from './renderers/RendererErrorBoundary';
import { StreamArtifactHeader } from './StreamArtifactHeader';
import { StreamArtifactFooter } from './StreamArtifactFooter';
import type { StreamArtifact } from '@/lib/artifact/types';

export function StreamArtifactView() {
  const { artifacts, selectedArtifactId } = useStreamArtifactStore();
  const { close } = useArtifactPanel();
  const selected = artifacts.find((a) => a.id === selectedArtifactId);

  if (artifacts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        暂无内容
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {selected && (
        <StreamArtifactHeader artifact={selected} onClose={close} />
      )}

      <div className="flex-1 overflow-hidden">
        {selected ? (
          <RendererErrorBoundary>
            <StreamArtifactContent artifact={selected} />
          </RendererErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
            选择一个 artifact 查看
          </div>
        )}
      </div>

      {artifacts.length > 1 && <StreamArtifactFooter />}
    </div>
  );
}

function StreamArtifactContent({
  artifact,
}: {
  artifact: StreamArtifact;
}) {
  const entry = streamArtifactRegistry.get(artifact.type);
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');

  if (!entry) {
    return (
      <div className="p-4 text-amber-600 dark:text-amber-400">
        不支持的 artifact 类型: {artifact.type}
      </div>
    );
  }

  const Renderer = entry.component;
  return (
    <Renderer
      artifact={artifact}
      isStreaming={artifact.status === 'streaming'}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  );
}
