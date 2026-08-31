// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeBaseReactFlowDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayEdges.worker';
import * as measuredDisplayRepair from '../baseReactFlowDisplayMeasuredRepair';
import { DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS } from '../baseReactFlowDisplayRenderPipeline';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { outerCorridorGraph } from './fixtures/outerCorridorGraph';

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
  it('routes around a node instead of certifying a half-pixel diagonal through it', () => {
    const repairNodes: Node[] = [
      { id: 'source', position: { x: -102, y: -96 }, measured: { width: 204, height: 96 }, data: {} },
      { id: 'blocker', position: { x: -136.5, y: 120 }, measured: { width: 273, height: 96 }, data: {} },
      { id: 'target', position: { x: -123, y: 336 }, measured: { width: 246, height: 96 }, data: {} },
    ];
    const repairEdge: Edge = {
      id: 'edge', source: 'source', target: 'target', sourceHandle: 'bottom', targetHandle: 'top',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 0.5, y: 336 }] },
    };
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair', requestId: 'half-pixel-diagonal', repairMode: 'finalized',
      nodes: repairNodes, edges: [repairEdge],
    });
    expect(response.error).toBeUndefined();
    expect(response.hardClean).toBe(true);
    expect(response.hardReport).toMatchObject({
      obstacleHits: 0, minimumClearanceViolations: 0, commercialClearanceViolations: 0,
      terminalsAttached: true, terminalsAnchored: true,
    });
    const result = response.edges?.[0] ?? repairEdge;
    expect(getDisplayComputedPath(result)).not.toEqual(repairEdge.data?.computedPath);
    expect(scoreNodeClearanceRisk(getDisplayComputedPath(result), repairNodes, result, 48)).toBe(0);
  });

  it('finalizes a blocked outer-ring return with zero crossings and commercial clearance violations', () => {
    const graph = outerCorridorGraph();
    const response = computeBaseReactFlowDisplayEdgesWorkerResponse({
      operation: 'repair', requestId: 'outer-corridor-repair', repairMode: 'finalized',
      edges: graph.edges, nodes: graph.nodes,
    });
    expect(response.error).toBeUndefined();
    expect(response.hardClean).toBe(true);
    expect(response.hardReport).toMatchObject({
      terminalsAttached: true, terminalsAnchored: true, obstacleHits: 0,
      minimumClearanceViolations: 0, commercialClearanceViolations: 0,
      quality: { strictCrossings: 0, unrelatedOverlap: 0, reverseOverlap: 0 },
    });
    expect(response.edges?.map(edge => [edge.id, edge.source, edge.target]))
      .toEqual(graph.edges.map(edge => [edge.id, edge.source, edge.target]));
  }, 30000);

  it('uses a hard bounded obstacle budget when the result will be discarded on obstacle failure', () => {
    expect(measuredDisplayRepair.resolveMeasuredObstacleRepairOptions(true, 'TB')).toEqual({
      maxEdges: 2,
      maxCandidatesPerEdge: 16,
      maxQualityEvaluations: 18,
      skipOuterFallback: true,
    });
    expect(measuredDisplayRepair.resolveMeasuredObstacleRepairOptions(false, 'TB')).toBe(
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    );
    expect(measuredDisplayRepair.resolveMeasuredObstacleRepairOptions(true, 'LR')).toBe(
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    );
  });

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
      stopAfterObstacleFailure: true,
    });

    expect(repairSpy).toHaveBeenCalledTimes(1);
    expect(repairSpy.mock.calls[0]?.[4]).toEqual(expect.any(Function));
    expect(repairSpy.mock.calls[0]?.[6]).toBe(true);
    expect(response.requestId).toBe('repair-only');
    expect(Array.isArray(response.edges)).toBe(true);
    expect(typeof response.hardClean).toBe('boolean');
    expect(response.routeResolution).toBe('repair');
    expect(response.phaseTrace).toContainEqual(expect.objectContaining({
      phase: 'measured-repair-normalize',
      parentPhase: 'measured-repair',
    }));
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
