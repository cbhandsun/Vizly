import { describe, expect, it, vi } from 'vitest';

import type { SharedGraphContext } from '../../types/routing';
import { clearRenderedPathCache, getRenderedPathCache } from '../../routing/renderedPathCache';
import {
  pruneInactiveRoutingEdges,
  type LatestRoutingRequest,
  type PendingRoutingResolver,
} from '../edgeRoutingCoordinatorSupport';

const requestEntry = (edgeId: string): LatestRoutingRequest => ({
  graphKey: 'graph',
  seq: 1,
  updatedAt: 1,
  request: {
    edgeId,
    job: {
      jobId: `job-${edgeId}`,
      source: 'A',
      target: 'B',
      sourceX: 0,
      sourceY: 0,
      targetX: 10,
      targetY: 10,
    },
    graph: { nodes: [], edges: [], obstacles: [] } as unknown as SharedGraphContext,
  },
});

describe('edgeRoutingCoordinatorSupport', () => {
  it('settles and removes requests, results, and rendered paths from an inactive graph', () => {
    const latestRequests = new Map<string, LatestRoutingRequest>([
      ['active', requestEntry('active')],
      ['stale', requestEntry('stale')],
    ]);
    const resolve = vi.fn();
    const pendingResolvers = new Map<string, PendingRoutingResolver>([
      ['stale', { resolve, seq: 1 }],
    ]);
    const deleteCachedEdge = vi.fn();
    const deleteResultEdge = vi.fn();
    clearRenderedPathCache();
    getRenderedPathCache().set('active', 'M 0 0');
    getRenderedPathCache().set('stale', 'M 1 1');

    pruneInactiveRoutingEdges({
      activeEdgeIds: new Set(['active']),
      latestRequests,
      pendingResolvers,
      deleteCachedEdge,
      deleteResultEdge,
    });

    expect([...latestRequests.keys()]).toEqual(['active']);
    expect(pendingResolvers).toHaveLength(0);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      edgeId: 'stale',
      error: expect.any(String),
    }));
    expect(deleteCachedEdge).toHaveBeenCalledWith('stale');
    expect(deleteResultEdge).toHaveBeenCalledWith('stale');
    expect([...getRenderedPathCache().keys()]).toEqual(['active']);
  });
});
