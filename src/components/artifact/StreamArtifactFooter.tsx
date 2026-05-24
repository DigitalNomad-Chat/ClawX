import { useStreamArtifactStore } from '@/stores/stream-artifact';
import { streamArtifactRegistry } from '@/lib/artifact/registry';

export function StreamArtifactFooter() {
  const { artifacts, selectedArtifactId, selectArtifact } = useStreamArtifactStore();

  return (
    <div className="flex gap-1 px-2 py-2 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
      {artifacts.map((art) => {
        const entry = streamArtifactRegistry.get(art.type);
        const isSelected = art.id === selectedArtifactId;

        return (
          <button
            key={art.id}
            onClick={() => selectArtifact(art.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            <span>{entry?.icon ?? '📄'}</span>
            <span className="truncate max-w-[120px]">{art.title}</span>
            {art.status === 'streaming' && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}
