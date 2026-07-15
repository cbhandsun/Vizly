import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { repairTerminalBoundaryStairs } from '../edgeTerminalBoundaryStairRepair';
import { countEndpointNodeTraversalHits } from '../edgeWaypointCandidateRepair';

const sourceNode: Node = {
  id: 'source',
  type: 'process',
  position: { x: 0, y: 100 },
  width: 100,
  height: 100,
  measured: { width: 100, height: 100 },
  data: {},
};

describe('readable geometric terminal exits', () => {
  it('widens a short geometric exit before committing an own-node traversal repair', () => {
    const edge: Edge = {
      id: 'source-to-remote-target',
      source: 'source',
      target: 'remote-target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 50, y: 200 },
        { x: 50, y: 80 },
        { x: 150, y: 80 },
        { x: 150, y: -50 },
      ] },
    };
    const obstacles = new Map([
      ['source', { x: 0, y: 100, width: 100, height: 100 }],
    ]);
    expect(countEndpointNodeTraversalHits((edge.data as any).computedPath, edge, obstacles)).toBe(1);

    const [repaired] = repairTerminalBoundaryStairs([edge], [sourceNode], { maxEdges: 0 });
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;
    const quality = calculateEdgePathQualityScore([repaired]);

    expect(repaired.sourceHandle).toBe('top');
    expect(path[0]).toEqual({ x: 50, y: 100 });
    expect(path[0].y - path[1].y).toBeGreaterThanOrEqual(48);
    expect(countEndpointNodeTraversalHits(path, repaired, obstacles)).toBe(0);
    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });
});
