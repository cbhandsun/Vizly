import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as maze from '../baseReactFlowDisplaySegmentMazeCandidate';
import { createDisplayCrossingClusterMazePool } from '../baseReactFlowDisplayCrossingClusterMazePool';
import { repairBoundedMultiEdgeResidualStrictCrossings } from '../baseReactFlowDisplayCrossingClusterRepair';
import { extractDisplaySegments, getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';

const fixture = (): Edge[] => [
  { id: 'horizontal', source: 'a', target: 'b', data: { computedPath: [{ x: 0, y: 0 }, { x: 400, y: 0 }] } },
  { id: 'vertical', source: 'c', target: 'd', data: { computedPath: [{ x: 200, y: -100 }, { x: 200, y: 100 }] } },
];

afterEach(() => vi.restoreAllMocks());

describe('crossing cluster maze pool', () => {
  it('builds lazily, reuses candidates, and isolates separate searches', () => {
    const edges = fixture();
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockReturnValue(edges[0]);
    const pool = createDisplayCrossingClusterMazePool(edges, [], extractDisplaySegments(edges));
    expect(build).not.toHaveBeenCalled();
    expect(pool(0)).toBe(edges[0]);
    expect(pool(0)).toBe(edges[0]);
    expect(pool(99)).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    createDisplayCrossingClusterMazePool(edges, [], extractDisplaySegments(edges))(0);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('caches failed candidates without retrying and handles empty graphs', () => {
    const edges = fixture();
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockReturnValue(null);
    const pool = createDisplayCrossingClusterMazePool(edges, [], extractDisplaySegments(edges));
    expect(pool(0)).toBeNull();
    expect(pool(0)).toBeNull();
    expect(createDisplayCrossingClusterMazePool([], [], [])(0)).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('uses the local alternative when terminal bridge geometry is unavailable', () => {
    const edges = fixture();
    const before = structuredClone(edges);
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate');
    const repaired = repairBoundedMultiEdgeResidualStrictCrossings(edges, []);
    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(edges).toEqual(before);
    expect(build.mock.calls.length).toBeGreaterThan(0);
    expect(build.mock.calls.length).toBeLessThanOrEqual(2);
    repaired.forEach((edge, index) => {
      const path = getDisplayComputedPath(edge);
      expect(path[0]).toEqual(getDisplayComputedPath(edges[index])[0]);
      expect(path.at(-1)).toEqual(getDisplayComputedPath(edges[index]).at(-1));
    });
  });

  it('rejects an alternative that removes a crossing by adding diagonal geometry', () => {
    const edges = fixture();
    vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockImplementation((all, _nodes, moving) => ({
      ...all[moving.edgeIndex],
      data: { computedPath: [{ x: 1000, y: 1000 }, { x: 1200, y: 1100 }] },
    }));
    expect(repairBoundedMultiEdgeResidualStrictCrossings(edges, [])).toBe(edges);
  });
});
