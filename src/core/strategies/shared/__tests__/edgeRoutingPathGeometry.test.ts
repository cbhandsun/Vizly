import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  computeAbsolutePosition as computeAbsolutePositionFromPipeline,
  reduceEdgeCrossingsWithWaypoints as reduceEdgeCrossingsFromPipeline,
  repairSharedTrunkAwareCrossings as repairSharedTrunkFromPipeline,
  setAbsolutePositions as setAbsolutePositionsFromPipeline,
} from '../edgeRoutingPipeline';
import {
  computeAbsolutePosition,
  lockComputedPathsForDisplay,
  sanitizeComputedPaths,
  setAbsolutePositions,
} from '../edgeRoutingPathGeometry';
import {
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
} from '../edgeRoutingWaypointRefinement';

const node = (id: string, x: number, y: number, parentId?: string): Node => ({
  id,
  parentId,
  position: { x, y },
  data: {},
});

describe('edge routing module boundaries', () => {
  it('keeps the pipeline compatibility exports bound to the extracted implementations', () => {
    expect(computeAbsolutePositionFromPipeline).toBe(computeAbsolutePosition);
    expect(setAbsolutePositionsFromPipeline).toBe(setAbsolutePositions);
    expect(reduceEdgeCrossingsFromPipeline).toBe(reduceEdgeCrossingsWithWaypoints);
    expect(repairSharedTrunkFromPipeline).toBe(repairSharedTrunkAwareCrossings);
  });

  it('resolves nested absolute positions and terminates a cyclic parent chain', () => {
    const root = node('root', 100, 200);
    const parent = node('parent', 20, 30, 'root');
    const child = node('child', 4, 5, 'parent');
    const map = new Map([root, parent, child].map(item => [item.id, item] as const));

    expect(computeAbsolutePosition(child, map)).toEqual({ x: 124, y: 235 });

    const first = node('first', 10, 20, 'second');
    const second = node('second', 30, 40, 'first');
    const cyclicMap = new Map([first, second].map(item => [item.id, item] as const));
    expect(computeAbsolutePosition(first, cyclicMap)).toEqual({ x: 40, y: 60 });
  });

  it('sanitizes and locks paths without mutating the input edge data', () => {
    const originalPath = [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ];
    const edges: Edge[] = [{
      id: 'diagonal',
      source: 'source',
      target: 'target',
      data: {
        computedPath: originalPath,
        runtimeHandleLock: { source: false },
      },
    }];

    const sanitized = sanitizeComputedPaths(edges);
    const locked = lockComputedPathsForDisplay(sanitized);

    expect(sanitized).not.toBe(edges);
    expect(sanitized[0]).not.toBe(edges[0]);
    expect((sanitized[0].data as any).computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    expect((edges[0].data as any).computedPath).toBe(originalPath);
    expect((edges[0].data as any).runtimeHandleLock).toEqual({ source: false });
    expect(locked[0]).not.toBe(sanitized[0]);
    expect((locked[0].data as any).runtimeHandleLock).toEqual({ source: true, target: true });
  });

  it('preserves references when a path needs no cleanup', () => {
    const edge: Edge = {
      id: 'orthogonal',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
    };

    expect(sanitizeComputedPaths([edge])[0]).toBe(edge);
    const emptyEdges: Edge[] = [];
    expect(reduceEdgeCrossingsWithWaypoints(emptyEdges, [], 'TB')).toBe(emptyEdges);
  });
});
