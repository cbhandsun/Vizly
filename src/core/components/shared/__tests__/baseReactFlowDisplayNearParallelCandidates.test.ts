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
});
