import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readRegisteredReactFlowSnapshot,
  registerReactFlowSnapshotProvider,
} from '../reactFlowSnapshotRegistry';

const cleanups: Array<() => void> = [];

const register = (diagramId: unknown, provider: () => unknown) => {
  const cleanup = registerReactFlowSnapshotProvider(diagramId, provider);
  cleanups.push(cleanup);
  return cleanup;
};

describe('reactFlowSnapshotRegistry', () => {
  afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
  });

  it('selects the populated canvas when an outer provider is empty', () => {
    register('diagram-1', () => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }));
    register('diagram-1', () => ({
      nodes: [{ id: 'node-1' }, { id: 'node-2' }],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      viewport: { x: 4, y: 5, zoom: 0.8 },
    }));

    expect(readRegisteredReactFlowSnapshot('diagram-1')).toMatchObject({
      nodes: [{ id: 'node-1' }, { id: 'node-2' }],
      edges: [{ id: 'edge-1' }],
      viewport: { x: 4, y: 5, zoom: 0.8 },
    });
  });

  it('uses edge count to resolve equal-sized canvas providers', () => {
    register('diagram-1', () => ({ nodes: [{ id: 'node-1' }], edges: [] }));
    register('diagram-1', () => ({
      nodes: [{ id: 'node-1' }],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-1' }],
    }));

    expect(readRegisteredReactFlowSnapshot('diagram-1')?.edges).toHaveLength(1);
  });

  it('ignores malformed and failing providers', () => {
    const failingProvider = vi.fn(() => {
      throw new Error('stale canvas');
    });
    register('diagram-1', failingProvider);
    register('diagram-1', () => ({ nodes: 'invalid', edges: [] }));
    register('diagram-1', () => ({ nodes: [{ id: 'valid' }], edges: [] }));

    expect(readRegisteredReactFlowSnapshot('diagram-1')?.nodes).toEqual([{ id: 'valid' }]);
    expect(failingProvider).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, '', ' '.repeat(3), 'x'.repeat(201)])(
    'rejects an invalid diagram id: %s',
    diagramId => {
      register(diagramId, () => ({ nodes: [{ id: 'hidden' }], edges: [] }));
      expect(readRegisteredReactFlowSnapshot(diagramId)).toBeNull();
    },
  );

  it('removes only the provider owned by its cleanup', () => {
    const cleanupEmpty = register('diagram-1', () => ({ nodes: [], edges: [] }));
    register('diagram-1', () => ({ nodes: [{ id: 'live' }], edges: [] }));
    cleanupEmpty();

    expect(readRegisteredReactFlowSnapshot('diagram-1')?.nodes).toEqual([{ id: 'live' }]);
  });
});
