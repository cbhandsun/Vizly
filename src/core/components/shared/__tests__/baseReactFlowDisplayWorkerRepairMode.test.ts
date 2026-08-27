// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import * as measuredDisplayRepair from '../baseReactFlowDisplayMeasuredRepair';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'target', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
];

const edges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
}];
const inputIdentity = createDisplayRoutingIdentity(
  '1234',
  `geometry-v1:${'a'.repeat(32)}`,
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('baseReactFlowDisplayEdges worker repair mode', () => {
  it('dispatches bounded repair through the measured repair pipeline', () => {
    const repairSpy = vi.spyOn(
      measuredDisplayRepair,
      'repairBaseReactFlowMeasuredDisplayEdgesWithReport',
    );
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair',
      requestId: 'repair-only',
      edges,
      nodes,
      inputIdentity,
      repairMode: 'bounded',
    });

    expect(repairSpy).toHaveBeenCalledTimes(1);
    expect(response.requestId).toBe('repair-only');
    expect(Array.isArray(response.edges)).toBe(true);
    expect(typeof response.hardClean).toBe('boolean');
    expect(response.routeResolution).toBe('repair');
  });

  it('closes a bounded repair route that passes within the 16px visual floor', () => {
    const repairNodes: Node[] = [
      { id: 'source', position: { x: 4221, y: 695 }, measured: { width: 204, height: 96 }, data: {} },
      { id: 'nearby', position: { x: 4545, y: 695 }, measured: { width: 204, height: 96 }, data: {} },
      { id: 'target', position: { x: 5051, y: 636 }, measured: { width: 204, height: 96 }, data: {} },
    ];
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair',
      requestId: 'repair-minimum-clearance',
      repairMode: 'bounded',
      nodes: repairNodes,
      inputIdentity,
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { computedPath: [
          { x: 4425, y: 743 },
          { x: 4473, y: 743 },
          { x: 4473, y: 684 },
          { x: 5051, y: 684 },
        ] },
      }],
    });

    expect(response.hardClean).toBe(true);
    expect(response.hardReport?.minimumClearanceViolations).toBe(0);
    expect(scoreNodeClearanceRisk(
      getDisplayComputedPath(response.edges?.[0] ?? edges[0]),
      repairNodes,
      response.edges?.[0] ?? edges[0],
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )).toBe(0);
    expect(response.edges?.[0]?.data?.computedPath).not.toEqual([
      { x: 4425, y: 743 },
      { x: 4473, y: 743 },
      { x: 4473, y: 684 },
      { x: 5051, y: 684 },
    ]);
  });
});
