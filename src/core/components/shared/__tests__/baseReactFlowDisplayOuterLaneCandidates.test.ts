import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  STRICT_OUTER_LANE_MAX_CANDIDATES,
  buildDirectionalStrictOuterLaneCandidates,
} from '../baseReactFlowDisplayOuterLaneCandidates';
import {
  buildStrictInterSegmentLaneXs,
  buildStrictInterSegmentLaneYs,
} from '../baseReactFlowDisplayLanePositions';

const edge: Edge = { id: 'edge', source: 'source', target: 'target' };
const nodes: Node[] = [
  { id: 'source', position: { x: -40, y: -40 }, width: 80, height: 80, data: {} },
  { id: 'obstacle', position: { x: 120, y: 220 }, width: 80, height: 120, data: {} },
  { id: 'target', position: { x: 260, y: 560 }, width: 80, height: 80, data: {} },
];

describe('baseReactFlowDisplayOuterLaneCandidates', () => {
  it('rejects short and undersized paths at the boundary', () => {
    expect([...buildDirectionalStrictOuterLaneCandidates([], nodes, edge)]).toEqual([]);
    expect([...buildDirectionalStrictOuterLaneCandidates([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
    ], nodes, edge)]).toEqual([]);
  });

  it('streams finite vertical outer-lane candidates in bounded batches', () => {
    const batches = [...buildDirectionalStrictOuterLaneCandidates([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 600 },
    ], nodes, edge)];

    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every(batch => batch.candidates.length <= STRICT_OUTER_LANE_MAX_CANDIDATES)).toBe(true);
    expect(batches.flatMap(batch => batch.candidates).every(path => (
      path.length >= 2 && path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    ))).toBe(true);
  });

  it('does not search without a non-terminal obstacle', () => {
    expect([...buildDirectionalStrictOuterLaneCandidates([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 600 },
    ], nodes.filter(node => node.id !== 'obstacle'), edge)]).toEqual([]);
  });
});

describe('display lane positions', () => {
  it('finds sorted corridor midpoints while removing duplicate coordinates', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const segments = [
      { a: { x: 20, y: -10 }, b: { x: 20, y: 110 }, axis: 'v' as const },
      { a: { x: 20, y: 0 }, b: { x: 20, y: 100 }, axis: 'v' as const },
      { a: { x: 60, y: 0 }, b: { x: 60, y: 100 }, axis: 'v' as const },
    ];
    expect(buildStrictInterSegmentLaneXs(path, segments)).toEqual([40]);
  });

  it('ignores gaps outside the supported lane range and empty paths', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const segments = [
      { a: { x: 0, y: 10 }, b: { x: 100, y: 10 }, axis: 'h' as const },
      { a: { x: 0, y: 15 }, b: { x: 100, y: 15 }, axis: 'h' as const },
      { a: { x: 0, y: 120 }, b: { x: 100, y: 120 }, axis: 'h' as const },
    ];
    expect(buildStrictInterSegmentLaneYs(path, segments)).toEqual([]);
    expect(buildStrictInterSegmentLaneYs([], segments)).toEqual([]);
  });
});
