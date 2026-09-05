import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildDisplaySegmentMazeCandidate } from '../baseReactFlowDisplaySegmentMazeCandidate';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  displayAxisOf,
  displaySegmentIntersectsRect,
  extractDisplaySegments,
  getDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from '../baseReactFlowDisplayGeometry';

const edge = (id: string, path: DisplayPoint[]): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  sourceHandle: 'out',
  targetHandle: 'in',
  data: { computedPath: path, treeRouting: { points: path }, preserved: id },
});

const segment = (
  edgeIndex: number, segmentIndex: number, axis: 'h' | 'v', a: DisplayPoint, b: DisplayPoint,
): DisplaySegment => ({ edgeIndex, segmentIndex, axis, direction: 1, a, b });

describe('buildDisplaySegmentMazeCandidate', () => {
  it.each([0, 1, 2, 3])('routes renamed and translated perpendicular geometry in rotation %i', (turns) => {
    const transform = (x: number, y: number): DisplayPoint => {
      for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
      return { x: x + 721, y: y - 393 };
    };
    const edges = [
      edge(`arbitrary-a-${turns}`, [transform(0, 0), transform(400, 0)]),
      edge(`arbitrary-b-${turns}`, [transform(200, -100), transform(200, 100)]),
    ];
    const segments = extractDisplaySegments(edges);
    const candidate = buildDisplaySegmentMazeCandidate(edges, [], segments[0], segments[1]);
    expect(candidate).not.toBeNull();
    if (!candidate) throw new Error('expected rotated candidate');
    const score = calculateEdgePathQualityScore([candidate, edges[1]]);
    expect(score.strictCrossings).toBe(0);
    expect(score.nonOrthogonalSegments).toBe(0);
    expect(score.tinyInteriorDoglegs).toBe(0);
  });

  it('replaces only a verified middle segment and retains edge metadata', () => {
    const movingPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 100 }, { x: 600, y: 100 }];
    const opposingPath = [{ x: 250, y: -100 }, { x: 250, y: 100 }];
    const edges = [edge('moving', movingPath), edge('opposing', opposingPath)];
    const candidate = buildDisplaySegmentMazeCandidate(
      edges, [], segment(0, 1, 'h', movingPath[1], movingPath[2]), segment(1, 0, 'v', opposingPath[0], opposingPath[1]),
    );
    expect(candidate).not.toBeNull();
    if (!candidate) throw new Error('expected maze candidate');
    const path = getDisplayComputedPath(candidate);
    expect(path[0]).toEqual(movingPath[0]);
    expect(path.at(-1)).toEqual(movingPath.at(-1));
    expect(path.some(point => point.x === 250 && point.y === 0)).toBe(false);
    expect(candidate.sourceHandle).toBe('out');
    expect(candidate.targetHandle).toBe('in');
    expect(candidate.data?.preserved).toBe('moving');
  });

  it('rejects invalid geometry, invalid indices, and parallel segments', () => {
    const movingPath = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const otherPath = [{ x: 0, y: 40 }, { x: 200, y: 40 }];
    const edges = [edge('moving', movingPath), edge('other', otherPath)];
    expect(buildDisplaySegmentMazeCandidate(
      edges, [], segment(0, 1, 'h', movingPath[0], movingPath[1]), segment(1, 0, 'h', otherPath[0], otherPath[1]),
    )).toBeNull();
    expect(buildDisplaySegmentMazeCandidate(
      edges, [], segment(0, 0, 'h', movingPath[0], movingPath[1]), segment(1, 0, 'h', otherPath[0], otherPath[1]),
    )).toBeNull();
    expect(buildDisplaySegmentMazeCandidate(
      [edge('empty', []), edges[1]], [], segment(0, 0, 'h', movingPath[0], movingPath[1]), segment(1, 0, 'h', otherPath[0], otherPath[1]),
    )).toBeNull();
  });

  it('uses all nodes for collision checks even when a node is outside the grid seed square', () => {
    const movingPath = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const opposingPath = [{ x: 500, y: -100 }, { x: 500, y: 100 }];
    const edges = [edge('moving', movingPath), edge('opposing', opposingPath)];
    const moving = segment(0, 0, 'h', movingPath[0], movingPath[1]);
    const opposing = segment(1, 0, 'v', opposingPath[0], opposingPath[1]);
    const wall: Node = { id: 'far-wall', position: { x: 900, y: -30 }, width: 30, height: 60, data: {} };
    const candidate = buildDisplaySegmentMazeCandidate(edges, [wall], moving, opposing);
    expect(candidate).not.toBeNull();
    if (!candidate) throw new Error('expected collision-aware maze candidate');
    const path = getDisplayComputedPath(candidate);
    for (let index = 1; index < path.length; index += 1) {
      const axis = displayAxisOf(path[index - 1], path[index]);
      if (!axis) throw new Error('expected an orthogonal candidate');
      expect(displaySegmentIntersectsRect(path[index - 1], path[index], {
        x: 888, y: -42, width: 54, height: 84,
      })).toBe(false);
    }
  });
});
