import { describe, expect, it } from 'vitest';

import type { PathFindingResult, SharedGraphContext } from '../../types/routing';
import type { LatestRoutingRequestEntry } from '../edgeRoutingBatchLifecycle';
import { EdgeRoutingResultContext, MAX_STORED_ROUTING_POINTS } from '../edgeRoutingResultContext';

const result = (points: Array<{ x: number; y: number }>): PathFindingResult => ({
  jobId: 'job',
  edgeId: 'edge',
  path: '',
  points,
  labelX: 50,
  labelY: 20,
});

const requestEntry = (graphKey = 'v1'): LatestRoutingRequestEntry => ({
  graphKey,
  seq: 1,
  updatedAt: 1,
  request: {
    edgeId: 'edge',
    job: { source: 'A', target: 'B' },
    graph: { nodes: [], edges: [], obstacles: [] } as unknown as SharedGraphContext,
  },
});

describe('EdgeRoutingResultContext', () => {
  it('copies finite routed paths and exposes them only for the matching graph', () => {
    const context = new EdgeRoutingResultContext();
    const routed = result([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    context.storePath('edge', routed, 'v1');
    routed.points[0].x = 999;

    const candidates = context.buildPathCandidates(
      new Map([['edge', requestEntry()]]),
      () => null,
      () => false,
    );
    expect(candidates[0].points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);

    const mismatched = context.buildPathCandidates(
      new Map([['edge', requestEntry('v2')]]),
      () => null,
      () => true,
    );
    expect(mismatched[0]).toMatchObject({ dirty: true, points: undefined });
  });

  it('rejects failed, malformed, non-finite, and excessively large paths', () => {
    const context = new EdgeRoutingResultContext();
    const valid = result([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    context.storePath('edge', valid, 'v1');

    context.storePath('edge', { ...valid, error: 'failed' }, 'v1');
    context.storePath('edge', result([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }]), 'v1');
    context.storePath('edge', result(Array.from(
      { length: MAX_STORED_ROUTING_POINTS + 1 },
      (_, index) => ({ x: index, y: 0 }),
    )), 'v1');

    expect(context.buildPathCandidates(
      new Map([['edge', requestEntry()]]),
      () => null,
      () => false,
    )[0].points).toBeUndefined();
  });

  it('prefers validated cache points and rejects malformed cache output', () => {
    const context = new EdgeRoutingResultContext();
    context.storePath('edge', result([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 'v1');
    const cached = result([{ x: 0, y: 0 }, { x: 20, y: 0 }]);

    expect(context.buildPathCandidates(
      new Map([['edge', requestEntry()]]),
      () => cached,
      () => false,
    )[0]).toMatchObject({ cachedPoints: cached.points, points: cached.points });

    cached.points[1].x = Number.POSITIVE_INFINITY;
    expect(context.buildPathCandidates(
      new Map([['edge', requestEntry()]]),
      () => cached,
      () => false,
    )[0].points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('tracks only labels with text and finite routed coordinates', () => {
    const context = new EdgeRoutingResultContext();
    const graph = {
      edges: [{ id: 'edge', label: '<b>Safe label</b>' }],
    } as unknown as SharedGraphContext;
    context.updateLabelObstacle('edge', result([{ x: 0, y: 0 }, { x: 1, y: 1 }]), graph);
    expect(context.getLabelObstacles()).toHaveLength(1);

    context.updateLabelObstacle('edge', {
      ...result([{ x: 0, y: 0 }, { x: 1, y: 1 }]),
      labelX: Number.NaN,
    }, graph);
    expect(context.getLabelObstacles()).toEqual([]);
  });
});
