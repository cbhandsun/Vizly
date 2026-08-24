import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  computeAbsolutePosition as computeAbsolutePositionFromPipeline,
  createEdgeWaypointRefinementDiagnostics as createDiagnosticsFromPipeline,
  reduceEdgeCrossingsWithWaypoints as reduceEdgeCrossingsFromPipeline,
  repairSharedTrunkAwareCrossings as repairSharedTrunkFromPipeline,
  setAbsolutePositions as setAbsolutePositionsFromPipeline,
} from '../edgeRoutingPipeline';
import {
  computeAbsolutePosition,
  getRoutingObstacles,
  lockComputedPathsForDisplay,
  sanitizeComputedPaths,
  setAbsolutePositions,
} from '../edgeRoutingPathGeometry';
import {
  createEdgeWaypointRefinementDiagnostics,
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
} from '../edgeRoutingWaypointRefinement';
import { createRoutingWaypointSegmentGroupIndex } from '../edgeRoutingWaypointSegmentIndex';

const node = (id: string, x: number, y: number, parentId?: string): Node => ({
  id,
  parentId,
  position: { x, y },
  data: {},
});

describe('edge routing module boundaries', () => {
  it('indexes only waypoint segment groups that can contribute an exact relation', () => {
    const index = createRoutingWaypointSegmentGroupIndex([
      [{ a: { x: 1_000, y: 1_000 }, b: { x: 1_100, y: 1_000 } }],
      [{ a: { x: 50, y: -50 }, b: { x: 50, y: 50 } }],
      [{ a: { x: 20, y: 1 }, b: { x: 80, y: 1 } }],
    ]);

    const query = index.queryPotentialGroupIndexes([
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    ]);
    expect([...query.groupIndexes].sort((first, second) => first - second)).toEqual([1, 2]);
    expect(query.scannedSegmentCount).toBeLessThan(3);

    const unsupported = index.queryPotentialGroupIndexes([
      { a: { x: 0, y: 0 }, b: { x: 100, y: 100 } },
    ]);
    expect([...unsupported.groupIndexes].sort((first, second) => first - second))
      .toEqual([0, 1, 2]);

    const nonFinite = index.queryPotentialGroupIndexes([
      { a: { x: Number.NaN, y: 0 }, b: { x: 100, y: 0 } },
    ]);
    expect([...nonFinite.groupIndexes].sort((first, second) => first - second))
      .toEqual([0, 1, 2]);
  });

  it('keeps the pipeline compatibility exports bound to the extracted implementations', () => {
    expect(computeAbsolutePositionFromPipeline).toBe(computeAbsolutePosition);
    expect(setAbsolutePositionsFromPipeline).toBe(setAbsolutePositions);
    expect(createDiagnosticsFromPipeline).toBe(createEdgeWaypointRefinementDiagnostics);
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

  it('builds nested routing obstacles in canvas coordinates without positionAbsolute', () => {
    const root = node('root', 100, 200);
    root.type = 'group';
    const child = node('child', 20, 30, 'root');
    child.width = 180;
    child.height = 96;

    expect(getRoutingObstacles([root, child]).get('child')).toEqual({
      x: 120,
      y: 230,
      width: 180,
      height: 96,
    });
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

  it('reports bounded aggregate candidate and scan work without graph identifiers', () => {
    const diagnostics = createEdgeWaypointRefinementDiagnostics();
    const edges: Edge[] = [
      {
        id: 'first',
        source: 'source-a',
        target: 'target-a',
        data: { computedPath: [{ x: 0, y: 40 }, { x: 240, y: 40 }] },
      },
      {
        id: 'second',
        source: 'source-b',
        target: 'target-b',
        data: { computedPath: [{ x: 120, y: 0 }, { x: 120, y: 160 }] },
      },
    ];
    const nodes: Array<Node & { positionAbsolute: { x: number; y: number } }> = [
      {
        id: 'unrelated',
        position: { x: 96, y: 24 },
        positionAbsolute: { x: 96, y: 24 },
        width: 48,
        height: 48,
        measured: { width: 48, height: 48 },
        data: {},
      },
    ];

    reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB', { diagnostics });

    expect(diagnostics.processedCandidateEdgeCount).toBe(2);
    expect(diagnostics.generatedCandidateCount).toBeGreaterThan(2);
    expect(diagnostics.evaluationCount).toBeGreaterThan(0);
    expect(diagnostics.evaluationCount).toBeLessThanOrEqual(diagnostics.generatedCandidateCount);
    expect(diagnostics.scannedNodeCount).toBeGreaterThan(0);
    expect(diagnostics.scannedSegmentCount).toBeGreaterThan(0);
    expect(diagnostics.scannedEdgePairCount).toBeGreaterThan(0);
    expect(Object.keys(diagnostics).sort()).toEqual([
      'evaluationCount',
      'generatedCandidateCount',
      'lowerBoundRejectionCount',
      'processedCandidateEdgeCount',
      'scannedEdgePairCount',
      'scannedNodeCount',
      'scannedSegmentCount',
    ]);

    const exhaustiveDiagnostics = createEdgeWaypointRefinementDiagnostics();
    const exhaustive = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB', {
      diagnostics: exhaustiveDiagnostics,
      disableScoreLowerBoundPruning: true,
    });
    const boundedDiagnostics = createEdgeWaypointRefinementDiagnostics();
    const bounded = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB', {
      diagnostics: boundedDiagnostics,
    });
    const unindexedDiagnostics = createEdgeWaypointRefinementDiagnostics();
    const unindexed = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB', {
      diagnostics: unindexedDiagnostics,
      disableSegmentIndex: true,
    });
    expect(bounded).toEqual(exhaustive);
    expect(bounded).toEqual(unindexed);
    expect(boundedDiagnostics.lowerBoundRejectionCount).toBeGreaterThan(0);
    expect(boundedDiagnostics.scannedNodeCount)
      .toBeLessThan(exhaustiveDiagnostics.scannedNodeCount);
    expect(boundedDiagnostics.scannedSegmentCount)
      .toBeLessThanOrEqual(exhaustiveDiagnostics.scannedSegmentCount);
    expect(boundedDiagnostics.scannedSegmentCount)
      .toBeLessThanOrEqual(unindexedDiagnostics.scannedSegmentCount);
  });
});
