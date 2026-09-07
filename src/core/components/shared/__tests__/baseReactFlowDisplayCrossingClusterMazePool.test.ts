import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as maze from '../baseReactFlowDisplaySegmentMazeCandidate';
import { createDisplayCrossingClusterMazePool } from '../baseReactFlowDisplayCrossingClusterMazePool';
import { repairBoundedMultiEdgeResidualStrictCrossings } from '../baseReactFlowDisplayCrossingClusterRepair';
import { extractDisplaySegments, getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { createEdgePathQualityEvaluationContext } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { repairDisplayCrossingClusterMazeFallback } from '../baseReactFlowDisplayCrossingClusterMazeFallback';

const fixture = (): Edge[] => [
  { id: 'horizontal', source: 'a', target: 'b', data: { computedPath: [{ x: 0, y: 0 }, { x: 400, y: 0 }] } },
  { id: 'vertical', source: 'c', target: 'd', data: { computedPath: [{ x: 12, y: -100 }, { x: 12, y: 100 }] } },
];

afterEach(() => vi.restoreAllMocks());

describe('crossing cluster maze pool', () => {
  it('honors transaction constraints without caching a constrained failure as a graph fixed point', () => {
    const edges = fixture();
    const reject = vi.fn(() => false);
    expect(repairBoundedMultiEdgeResidualStrictCrossings(edges, [], { acceptCandidate: reject })).toBe(edges);
    expect(reject).toHaveBeenCalled();
    const unrestricted = repairBoundedMultiEdgeResidualStrictCrossings(edges, []);
    expect(calculateEdgePathQualityScore(unrestricted).strictCrossings).toBe(0);
  });

  it('preserves the clean fast path without calling transaction constraints', () => {
    const acceptCandidate = vi.fn(() => false);
    const edges = [fixture()[0]];
    expect(repairBoundedMultiEdgeResidualStrictCrossings(edges, [], { acceptCandidate })).toBe(edges);
    expect(acceptCandidate).not.toHaveBeenCalled();
  });

  it('does not expand intermediate bridge states rejected by transaction invariants', () => {
    const edges = fixture();
    const nodes = [
      { id: 'a', position: { x: -100, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'b', position: { x: 400, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'c', position: { x: -28, y: -180 }, width: 80, height: 80, data: {} },
      { id: 'd', position: { x: -28, y: 100 }, width: 80, height: 80, data: {} },
    ];
    const acceptCandidate = vi.fn(() => false);
    expect(repairBoundedMultiEdgeResidualStrictCrossings(edges, nodes, { acceptCandidate })).toBe(edges);
    expect(acceptCandidate).toHaveBeenCalled();
    // One initial state (12 evaluations) plus at most three two-edge maze subsets.
    expect(acceptCandidate.mock.calls.length).toBeLessThanOrEqual(15);
  });

  it('does not swallow failures from transaction validation', () => {
    const failure = new Error('transaction validation failed');
    expect(() => repairBoundedMultiEdgeResidualStrictCrossings(fixture(), [], {
      acceptCandidate: () => { throw failure; },
    })).toThrow(failure);
  });

  it('builds lazily, reuses candidates, and isolates separate searches', () => {
    const edges = fixture();
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockReturnValue(edges[0]);
    const pool = createDisplayCrossingClusterMazePool(edges, [], extractDisplaySegments(edges));
    expect(build).not.toHaveBeenCalled();
    expect(pool.get(0)).toBe(edges[0]);
    expect(pool.get(0)).toBe(edges[0]);
    expect(pool.get(99)).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    createDisplayCrossingClusterMazePool(edges, [], extractDisplaySegments(edges)).get(0);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('caches failed candidates without retrying and handles empty graphs', () => {
    const edges = fixture();
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockReturnValue(null);
    const pool = createDisplayCrossingClusterMazePool(edges, [], extractDisplaySegments(edges));
    expect(pool.get(0)).toBeNull();
    expect(pool.get(0)).toBeNull();
    expect(createDisplayCrossingClusterMazePool([], [], []).get(0)).toBeNull();
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

  it('can repair a later disjoint pair when the first component has no maze alternative', () => {
    const first = fixture();
    const second = fixture().map(edge => ({
      ...edge, id: `${edge.id}-second`, source: `${edge.source}-second`, target: `${edge.target}-second`,
      data: { computedPath: getDisplayComputedPath(edge).map(point => ({ x: point.x, y: point.y + 1000 })) },
    }));
    const edges = [...first, ...second, ...Array.from({ length: 21 }, (_, index): Edge => ({
      id: `isolated-${index}`, source: `s-${index}`, target: `t-${index}`, data: {},
    }))];
    const originalBuild = maze.buildDisplaySegmentMazeCandidate;
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockImplementation((all, nodes, moving, opposing) => (
      moving.edgeIndex < 2 ? null : originalBuild(all, nodes, moving, opposing)
    ));
    const repaired = repairBoundedMultiEdgeResidualStrictCrossings(edges, []);
    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(2);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(1);
    expect(repaired[0]).toBe(edges[0]);
    expect(repaired[1]).toBe(edges[1]);
    expect(build.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('tries a bounded moving set even when its full crossing component exceeds the bridge budget', () => {
    const edges: Edge[] = [{ ...fixture()[0], data: { computedPath: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] } }, ...Array.from({ length: 24 }, (_, index): Edge => ({
      id: `crossing-${index}`, source: `s-${index}`, target: `t-${index}`,
      data: { computedPath: [{ x: 80 + index * 32, y: -12 }, { x: 80 + index * 32, y: 100 }] },
    }))];
    // Supply one feasible local route so this test isolates moving-set selection
    // from the maze grid's independently tested search envelope.
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockImplementation((routes, _nodes, moving) => (
      moving.edgeIndex === 0 ? { ...routes[0], data: { computedPath: [
        { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 48, y: -60 },
        { x: 952, y: -60 }, { x: 952, y: 0 }, { x: 1000, y: 0 },
      ] } } : null
    ));
    const repaired = repairBoundedMultiEdgeResidualStrictCrossings(edges, []);
    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(24);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBeLessThan(24);
    expect(build.mock.calls.length).toBeLessThanOrEqual(4);
    expect(repaired.filter((edge, index) => edge !== edges[index]).length).toBeLessThanOrEqual(4);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])('does no work for unavailable or invalid budget %s', (budget) => {
    const edges = fixture();
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate');
    expect(repairDisplayCrossingClusterMazeFallback(edges, [], budget)).toBe(edges);
    expect(build).not.toHaveBeenCalled();
  });

  it('never exceeds the caller remaining quality evaluations', () => {
    const edges = fixture();
    const context = createEdgePathQualityEvaluationContext(edges);
    const evaluate = vi.spyOn(context, 'evaluateChanged');
    repairDisplayCrossingClusterMazeFallback(edges, [], 1);
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it('keeps a successful terminal-bridge solution without constructing maze candidates', () => {
    const edges = fixture();
    const nodes = [
      { id: 'a', position: { x: -100, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'b', position: { x: 400, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'c', position: { x: -28, y: -180 }, width: 80, height: 80, data: {} },
      { id: 'd', position: { x: -28, y: 100 }, width: 80, height: 80, data: {} },
    ];
    const build = vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate');
    const repaired = repairBoundedMultiEdgeResidualStrictCrossings(edges, nodes);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(build).not.toHaveBeenCalled();
  });

  it('rejects a crossing-free alternative that introduces a minimum node-clearance violation', () => {
    const edges = fixture();
    vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockImplementation((all, _nodes, moving) => (
      moving.edgeIndex !== 0 ? null : {
        ...all[0], data: { computedPath: [
          { x: 0, y: 0 }, { x: 0, y: -120 }, { x: 400, y: -120 }, { x: 400, y: 0 },
        ] },
      }
    ));
    const nodes = [{ id: 'unrelated', position: { x: 150, y: -160 }, width: 40, height: 30, data: {} }];
    expect(repairDisplayCrossingClusterMazeFallback(edges, nodes, 15)).toBe(edges);
  });

  it.each(['detached', 'wrong-axis'])('rejects a crossing-free candidate with %s terminals', (defect) => {
    const edges = fixture();
    edges[0] = { ...edges[0], sourceHandle: 'right', targetHandle: 'left' };
    const nodes = [
      { id: 'a', position: { x: -100, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'b', position: { x: 400, y: -40 }, width: 100, height: 80, data: {} },
    ];
    vi.spyOn(maze, 'buildDisplaySegmentMazeCandidate').mockImplementation((all, _nodes, moving) => (
      moving.edgeIndex !== 0 ? null : {
        ...all[0], data: { computedPath: defect === 'detached'
          ? [{ x: 0, y: -200 }, { x: 400, y: -200 }]
          : [{ x: 0, y: 0 }, { x: 0, y: -200 }, { x: 400, y: -200 }, { x: 400, y: 0 }] },
      }
    ));
    expect(repairDisplayCrossingClusterMazeFallback(edges, nodes, 15)).toBe(edges);
  });
});
