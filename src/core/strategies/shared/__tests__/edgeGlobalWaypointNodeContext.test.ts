import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createGlobalEdgeWaypointNodeContext,
  queryGlobalEdgeWaypointObstacles,
} from '../edgeGlobalWaypointNodeContext';

const node = (id: string, x: number): Node => ({
  id,
  position: { x, y: 0 },
  width: 80,
  height: 48,
  data: {},
});

const edge: Edge = {
  id: 'edge',
  source: 'source',
  target: 'target',
};

describe('global edge waypoint node context', () => {
  it('returns no obstacles for an empty context', () => {
    const context = createGlobalEdgeWaypointNodeContext([]);

    expect(queryGlobalEdgeWaypointObstacles({
      context,
      disableIndex: false,
      edge,
      segment: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    })).toEqual({ rects: [], scannedNodeCount: 0 });
  });

  it('fails closed for invalid geometry while excluding endpoint nodes', () => {
    const context = createGlobalEdgeWaypointNodeContext([
      node('source', 0),
      node('target', 100),
      node('peer', 200),
    ]);

    const result = queryGlobalEdgeWaypointObstacles({
      context,
      disableIndex: false,
      edge,
      segment: { a: { x: Number.NaN, y: 0 }, b: { x: 100, y: 0 } },
    });

    expect(result).toEqual({
      rects: [{ x: 200, y: 0, width: 80, height: 48 }],
      scannedNodeCount: 1,
    });
  });
});
