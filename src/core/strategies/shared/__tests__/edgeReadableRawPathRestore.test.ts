import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { restoreReadableRawLockedPaths } from '../edgeReadableRawPathRestore';
import { getRoutingObstacles } from '../edgeRoutingPathGeometry';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from '../edgeWaypointCandidateRepair';

function node(id: string, x: number, y: number, width: number, height: number): Node {
  return {
    id,
    position: { x, y },
    positionAbsolute: { x, y },
    measured: { width, height } as any,
    width,
    height,
    data: {},
  } as Node;
}

describe('restoreReadableRawLockedPaths', () => {
  it('restores and cleans a readable locked path in a larger graph when a later bypass creates a large return loop', () => {
    const currentEdges: Edge[] = [
      {
        id: 'edge-loms-tms',
        source: 'l-oms',
        target: 'tms',
        data: {
          computedPath: [
            { x: 1323, y: 803 },
            { x: 1323, y: 962 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier-portal',
        sourceHandle: 'source-bottom-runtime-port-1',
        targetHandle: 'target-bottom-runtime-port-1',
        data: {
          computedPath: [
            { x: 1323, y: 1198 },
            { x: 1323, y: 1649 },
            { x: 2285, y: 1649 },
            { x: 2285, y: 861 },
            { x: 1769, y: 861 },
            { x: 1769, y: 278 },
          ],
          runtimeHandleLock: { source: true, target: true },
        },
      },
      {
        id: 'edge-loms-customs',
        source: 'l-oms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 1323, y: 803 },
            { x: 1323, y: 899 },
            { x: 2063, y: 899 },
            { x: 2063, y: 981 },
          ],
        },
      },
    ];
    const rawEdges: Edge[] = [
      currentEdges[0],
      {
        ...currentEdges[1],
        data: {
          computedPath: [
            { x: 1227, y: 961 },
            { x: 1227, y: 939 },
            { x: 1311, y: 939 },
            { x: 1311, y: 865 },
            { x: 1769, y: 865 },
            { x: 1769, y: 278 },
          ],
          layoutPathLocked: true,
          runtimeHandleLock: { source: true, target: true },
        },
      },
      currentEdges[2],
    ];
    const fillerEdges = Array.from({ length: 24 }, (_, index): Edge => ({
      id: `filler-${index}`,
      source: `filler-source-${index}`,
      target: `filler-target-${index}`,
      data: {
        computedPath: [
          { x: 0, y: 3000 + index * 100 },
          { x: 100, y: 3000 + index * 100 },
        ],
      },
    }));
    currentEdges.push(...fillerEdges);
    rawEdges.push(...fillerEdges);
    const baseline = calculateEdgePathQualityScore(currentEdges);

    const restored = restoreReadableRawLockedPaths(currentEdges, rawEdges, [
      node('tms', 1113.25, 962, 420, 236),
      node('carrier-portal', 1608.49, 80, 322, 197),
      node('l-oms', 1120.25, 605, 406, 197),
    ]);
    const quality = calculateEdgePathQualityScore(restored);
    const restoredPath = (restored[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.reverseOverlap).toBeLessThanOrEqual(baseline.reverseOverlap);
    expect(quality.detourPenalty).toBeLessThan(baseline.detourPenalty);
    expect((restored[1].data as any).readableRawPathRestored).toBe(true);
    expect(restored[1].sourceHandle).toBe('right');
    expect(restored[1].targetHandle).toBe('target-bottom-runtime-port-1');
    expect(restoredPath.length).toBeLessThanOrEqual(5);
    expect(restoredPath[0].x).toBe(1533);
    expect(restoredPath[restoredPath.length - 1]).toEqual({ x: 1769, y: 278 });
  });

  it.each([
    ['exact handle', { manualHandles: { source: true, target: true } }],
    ['side handles', { manualHandleSides: ['source', 'target'] }],
  ])('restores a same-side raw path without canonicalizing source-authored %s', (_name, lockData) => {
    const graphNodes = [
      node('source', 0, 0, 100, 60),
      node('target', 500, 0, 100, 60),
    ];
    const currentPath = [
      { x: 100, y: 30 },
      { x: 148, y: 30 },
      { x: 148, y: 200 },
      { x: 452, y: 200 },
      { x: 452, y: 30 },
      { x: 500, y: 30 },
    ];
    const rawPath = [
      { x: 100, y: 30 },
      { x: 500, y: 30 },
    ];
    const currentEdge: Edge = {
      id: 'source-target',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-right-port-1',
      targetHandle: 'target-left-port-1',
      data: { ...lockData, computedPath: currentPath },
    };
    const rawEdge: Edge = {
      ...currentEdge,
      data: { ...lockData, computedPath: rawPath, layoutPathLocked: true },
    };

    const [restored] = restoreReadableRawLockedPaths([currentEdge], [rawEdge], graphNodes);

    expect((restored.data as any).computedPath).toEqual(rawPath);
    expect(restored.sourceHandle).toBe('source-right-port-1');
    expect(restored.targetHandle).toBe('target-left-port-1');
  });

  it('rejects a shorter raw path that crosses an unrelated node', () => {
    const graphNodes = [
      node('source', 0, 0, 100, 60),
      node('blocker', 220, -20, 100, 100),
      node('target', 500, 0, 100, 60),
    ];
    const currentPath = [
      { x: 100, y: 30 },
      { x: 148, y: 30 },
      { x: 148, y: 200 },
      { x: 452, y: 200 },
      { x: 452, y: 30 },
      { x: 500, y: 30 },
    ];
    const rawPath = [
      { x: 100, y: 30 },
      { x: 500, y: 30 },
    ];
    const currentEdge: Edge = {
      id: 'source-target',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: currentPath },
    };
    const rawEdge: Edge = {
      ...currentEdge,
      data: { computedPath: rawPath, layoutPathLocked: true },
    };

    const [restored] = restoreReadableRawLockedPaths([currentEdge], [rawEdge], graphNodes);
    const restoredPath = (restored.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(restoredPath).not.toEqual(rawPath);
    expect(countRoutingObstacleHits(
      restoredPath,
      restored,
      getRoutingObstacles(graphNodes),
    )).toBe(0);
  });

  it('rejects a shorter raw path whose locked handle initially slides along the node boundary', () => {
    const graphNodes = [
      node('source', 0, 0, 100, 100),
      node('target', 600, 0, 100, 100),
    ];
    const currentEdge: Edge = {
      id: 'source-target',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 100, y: 50 },
        { x: 200, y: 50 },
        { x: 200, y: 500 },
        { x: 500, y: 500 },
        { x: 500, y: 50 },
        { x: 600, y: 50 },
      ] },
    };
    const rawPath = [
      { x: 100, y: 50 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 50 },
      { x: 600, y: 50 },
    ];
    const rawEdge: Edge = {
      ...currentEdge,
      data: {
        computedPath: rawPath,
        layoutPathLocked: true,
        runtimeHandleLock: { source: true, target: true },
      },
    };

    const [restored] = restoreReadableRawLockedPaths([currentEdge], [rawEdge], graphNodes);
    const restoredPath = (restored.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(restoredPath).not.toEqual(rawPath);
    expect(restoredPath[1].y).toBe(restoredPath[0].y);
    expect(restoredPath[1].x).toBeGreaterThan(restoredPath[0].x);
  });
});
