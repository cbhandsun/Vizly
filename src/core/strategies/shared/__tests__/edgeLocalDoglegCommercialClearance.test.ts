import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairLocalDoglegArtifacts } from '../edgeLocalDoglegRepair';
import {
  BUSINESS_NODE_CLEARANCE,
  createNodeClearanceGraphEvaluationContext,
} from '../edgeWaypointCandidateRepair';

describe('edgeLocalDoglegRepair commercial clearance ranking', () => {
  it('prefers a local dogleg candidate with better commercial clearance before final repair', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: -80, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
      { id: 'target', position: { x: 220, y: 90 }, data: {}, measured: { width: 60, height: 60 } },
      { id: 'business-node', position: { x: 70, y: 40 }, data: {}, measured: { width: 20, height: 40 } },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 12 },
            { x: 112, y: 12 },
            { x: 112, y: 120 },
            { x: 200, y: 120 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as { computedPath: Array<{ x: number; y: number }> }).computedPath;
    const clearance = createNodeClearanceGraphEvaluationContext(nodes);
    const beforeRisk = clearance.score(
      (edges[0].data as { computedPath: Array<{ x: number; y: number }> }).computedPath,
      edges[0],
      BUSINESS_NODE_CLEARANCE,
    );
    const afterRisk = clearance.score(path, repaired, BUSINESS_NODE_CLEARANCE);

    expect((repaired.data as { localDoglegRepaired?: boolean }).localDoglegRepaired).toBe(true);
    expect(beforeRisk).toBeGreaterThan(0);
    expect(afterRisk).toBe(0);
    expect(path).not.toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 120 },
      { x: 200, y: 120 },
    ]);
  });
});
