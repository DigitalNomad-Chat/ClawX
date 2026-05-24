import { describe, it, expect, beforeEach } from 'vitest';
import { useStreamArtifactStore } from '@/stores/stream-artifact';
import type { StreamArtifact } from '@/lib/artifact/types';

function makeArtifact(overrides = {}): StreamArtifact {
  return {
    id: 'test-id',
    type: 'code',
    title: 'Test',
    content: 'console.log(1)',
    status: 'streaming',
    meta: {},
    position: { start: 0, end: 20 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionKey: 'session-1',
    ...overrides,
  };
}

describe('StreamArtifactStore', () => {
  beforeEach(() => {
    useStreamArtifactStore.setState({
      artifacts: [],
      selectedArtifactId: null,
      streamingArtifactId: null,
    });
  });

  it('adds an artifact', () => {
    const artifact = makeArtifact();
    useStreamArtifactStore.getState().addArtifact(artifact);

    expect(useStreamArtifactStore.getState().artifacts).toHaveLength(1);
    expect(useStreamArtifactStore.getState().selectedArtifactId).toBe('test-id');
  });

  it('updates an artifact by id', () => {
    const artifact = makeArtifact();
    useStreamArtifactStore.getState().addArtifact(artifact);
    useStreamArtifactStore.getState().updateArtifact('test-id', { content: 'updated' });

    expect(useStreamArtifactStore.getState().artifacts[0].content).toBe('updated');
  });

  it('deduplicates by position + type for same message', () => {
    const a1 = makeArtifact({ id: 'id-1', position: { start: 0, end: 10 } });
    const a2 = makeArtifact({ id: 'id-2', position: { start: 0, end: 10 } });
    useStreamArtifactStore.getState().addArtifact(a1);
    useStreamArtifactStore.getState().addArtifact(a2);

    expect(useStreamArtifactStore.getState().artifacts).toHaveLength(1);
    expect(useStreamArtifactStore.getState().artifacts[0].id).toBe('id-1');
  });

  it('clears artifacts by sessionKey', () => {
    useStreamArtifactStore.getState().addArtifact(makeArtifact({ sessionKey: 's1' }));
    useStreamArtifactStore.getState().addArtifact(makeArtifact({ id: 'id-2', sessionKey: 's2' }));
    useStreamArtifactStore.getState().clearSessionArtifacts('s1');

    expect(useStreamArtifactStore.getState().artifacts).toHaveLength(1);
    expect(useStreamArtifactStore.getState().artifacts[0].sessionKey).toBe('s2');
  });
});
