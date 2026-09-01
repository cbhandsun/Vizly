// @vitest-environment node

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createNodeClearanceEvaluationContext } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import {
  baseReactFlowIncrementalEdgesHaveNodeClearance,
} from '../baseReactFlowDisplayIncrementalContracts';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';

const edge: Edge = {
  id: 'source-target',
  source: 'source',
  target: 'target',
  type: 'stablePath',
  data: {
    computedPath: [{ x: 100, y: 30 }, { x: 400, y: 30 }],
    layoutPathLocked: true,
    _layoutPathLocked: true,
  },
};

const createNodes = (blockerY: number): Node[] => [
  { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'target', position: { x: 400, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'blocker', position: { x: 200, y: blockerY }, measured: { width: 100, height: 60 }, data: {} },
];

describe('base React Flow incremental route contracts', () => {
  it('uses the shared half-pixel tolerance at the commercial clearance boundary', () => {
    const boundaryNodes = createNodes(77.5);
    const violatingNodes = createNodes(77);
    const boundaryRisk = createNodeClearanceEvaluationContext(boundaryNodes, edge).score(
      getDisplayComputedPath(edge),
      48,
    );
    const violatingRisk = createNodeClearanceEvaluationContext(violatingNodes, edge).score(
      getDisplayComputedPath(edge),
      48,
    );

    expect(boundaryRisk).toBe(0.5);
    expect(baseReactFlowIncrementalEdgesHaveNodeClearance(
      [edge],
      boundaryNodes,
      new Set([edge.id]),
    )).toBe(true);
    expect(violatingRisk).toBe(1);
    expect(baseReactFlowIncrementalEdgesHaveNodeClearance(
      [edge],
      violatingNodes,
      new Set([edge.id]),
    )).toBe(false);
  });
});
