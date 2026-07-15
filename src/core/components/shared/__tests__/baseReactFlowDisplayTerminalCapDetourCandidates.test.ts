import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { buildTerminalCapDetourCandidates } from '../baseReactFlowDisplayTerminalCapDetourCandidates';
import { repairFinalResidualStrictCrossings } from '../baseReactFlowDisplayStrictResidualRepair';
import {
  edgeNodeObstacleHits,
  strictPathCrossings,
} from './baseReactFlowDisplayEdges.testUtils';

const computedEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  path: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  data: { computedPath: path },
});

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

describe('buildTerminalCapDetourCandidates', () => {
  const nodes = [
    node('mover-source', 20, 20, 200, 80),
    node('mover-target', 720, 820, 200, 100),
    node('barrier-source', 500, 20, 200, 80),
    node('barrier-target', 400, 420, 220, 100),
  ];
  const moverPath = [
    { x: 120, y: 100 },
    { x: 120, y: 160 },
    { x: 820, y: 160 },
    { x: 820, y: 820 },
  ];
  const barrierPath = [
    { x: 500, y: 100 },
    { x: 500, y: 420 },
  ];
  const mover = computedEdge(
    'mover',
    'mover-source',
    'mover-target',
    'bottom',
    'top',
    moverPath,
  );
  const barrier = computedEdge(
    'barrier',
    'barrier-source',
    'barrier-target',
    'bottom',
    'top',
    barrierPath,
  );
  const moverSegment = {
    edgeIndex: 0,
    segmentIndex: 1,
    axis: 'h' as const,
    direction: 1 as const,
    a: moverPath[1],
    b: moverPath[2],
  };
  const barrierSegment = {
    edgeIndex: 1,
    segmentIndex: 0,
    axis: 'v' as const,
    direction: 1 as const,
    a: barrierPath[0],
    b: barrierPath[1],
  };

  it('builds source and target node-cap detours from declared terminal sides', () => {
    const candidates = buildTerminalCapDetourCandidates(
      moverPath,
      moverSegment,
      barrierPath,
      barrierSegment,
      barrier,
      nodes,
    );

    expect(candidates).toEqual([
      [
        { x: 120, y: 100 },
        { x: 120, y: 160 },
        { x: 452, y: 160 },
        { x: 452, y: -28 },
        { x: 748, y: -28 },
        { x: 748, y: 160 },
        { x: 820, y: 160 },
        { x: 820, y: 820 },
      ],
      [
        { x: 120, y: 100 },
        { x: 120, y: 160 },
        { x: 352, y: 160 },
        { x: 352, y: 568 },
        { x: 668, y: 568 },
        { x: 668, y: 160 },
        { x: 820, y: 160 },
        { x: 820, y: 820 },
      ],
    ]);
  });

  it('repairs the crossing with exact hard-quality and obstacle gates', () => {
    const edges = [mover, barrier];
    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);

    const repaired = repairFinalResidualStrictCrossings(edges, nodes);
    const paths = repaired.map(edge => ({
      id: edge.id,
      path: ((edge.data as any)?.computedPath || []) as Array<{ x: number; y: number }>,
    }));
    const quality = calculateEdgePathQualityScore(repaired);

    expect(strictPathCrossings(paths)).toEqual([]);
    expect(edgeNodeObstacleHits(repaired, nodes)).toEqual([]);
    expect(quality).toMatchObject({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
    });
  });

  it('rejects invalid clearance and terminal axes', () => {
    expect(buildTerminalCapDetourCandidates(
      moverPath,
      moverSegment,
      barrierPath,
      barrierSegment,
      { ...barrier, sourceHandle: 'left', targetHandle: 'right' },
      nodes,
    )).toEqual([]);
    expect(buildTerminalCapDetourCandidates(
      moverPath,
      moverSegment,
      barrierPath,
      barrierSegment,
      barrier,
      nodes,
      47,
    )).toEqual([]);
  });
});
