import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { DisplaySegment } from '../baseReactFlowDisplayGeometry';
import { buildNearParallelLaneNudgePaths } from '../baseReactFlowDisplayNearParallelCandidates';

const edge: Edge = { id: 'edge', source: 'source', target: 'target' };

describe('buildNearParallelLaneNudgePaths', () => {
  it('rejects segment indexes outside the path boundary', () => {
    const segment: DisplaySegment = {
      edgeIndex: 0, segmentIndex: -1, axis: 'h', direction: 1,
      a: { x: 0, y: 0 }, b: { x: 100, y: 0 },
    };
    expect(buildNearParallelLaneNudgePaths(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      segment,
      { ...segment, segmentIndex: 0 },
      [{ x: 0, y: 4 }, { x: 100, y: 4 }],
      [],
      edge,
      [edge],
    )).toEqual([]);
  });

  it('creates finite, orthogonal, deduplicated endpoint alternatives', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const segment: DisplaySegment = {
      edgeIndex: 0, segmentIndex: 0, axis: 'h', direction: 1,
      a: path[0], b: path[1],
    };
    const candidates = buildNearParallelLaneNudgePaths(
      path,
      segment,
      { ...segment, edgeIndex: 1, a: { x: 0, y: 3 }, b: { x: 100, y: 3 } },
      [{ x: 0, y: 3 }, { x: 100, y: 3 }],
      [],
      edge,
      [edge],
    );
    const signatures = candidates.map(candidate => JSON.stringify(candidate));

    expect(candidates.length).toBeGreaterThan(0);
    expect(new Set(signatures).size).toBe(candidates.length);
    expect(candidates.every(candidate => candidate.every(point => (
      Number.isFinite(point.x) && Number.isFinite(point.y)
    )))).toBe(true);
    expect(candidates.every(candidate => candidate.slice(1).every((point, index) => (
      point.x === candidate[index].x || point.y === candidate[index].y
    )))).toBe(true);
  });

  it('prioritizes straightening an interior stair away from a sibling source breakout', () => {
    const path = [
      { x: 1960, y: 1294 },
      { x: 2008, y: 1294 },
      { x: 2008, y: 1267 },
      { x: 2232, y: 1267 },
      { x: 2232, y: 1473 },
      { x: 2292, y: 1473 },
    ];
    const siblingPath = [
      { x: 1960, y: 1267 },
      { x: 2072, y: 1267 },
      { x: 2072, y: 1521 },
      { x: 2578, y: 1521 },
    ];
    const candidates = buildNearParallelLaneNudgePaths(
      path,
      {
        edgeIndex: 0,
        segmentIndex: 2,
        axis: 'h',
        direction: 1,
        a: path[2],
        b: path[3],
      },
      {
        edgeIndex: 1,
        segmentIndex: 0,
        axis: 'h',
        direction: 1,
        a: siblingPath[0],
        b: siblingPath[1],
      },
      siblingPath,
      [],
      edge,
      [edge],
    );

    expect(candidates[0]).toEqual([
      { x: 1960, y: 1294 },
      { x: 2232, y: 1294 },
      { x: 2232, y: 1473 },
      { x: 2292, y: 1473 },
    ]);
  });
});
