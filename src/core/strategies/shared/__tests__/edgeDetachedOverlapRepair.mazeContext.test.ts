import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildBoundedResidualOverlapMazeCandidate } from '../edgeDetachedResidualOverlapMaze';
import { routeStrictCrossingMazeCandidate } from '../edgeDetachedStrictCrossingMaze';
import type { StrictCrossingMazeDiagnostics } from '../edgeDetachedOverlapRepairTypes';
import { countStrictEdgeCrossings } from '../edgeStrictCrossingGuard';

type Point = { x: number; y: number };

function edge(id: string, path: Point[]): Edge {
  return {
    id,
    source: `${id}-source`,
    target: `${id}-target`,
    data: { computedPath: path },
  };
}

describe('routeStrictCrossingMazeCandidate penalty context', () => {
  it.each(['LR', 'RL', 'TB', 'BT'])('charges an internal grid vertex crossing in %s before path compaction', (direction) => {
    const transform = ({ x, y }: Point): Point => {
      const sign = direction === 'RL' || direction === 'BT' ? -1 : 1;
      const along = x === 0 ? 0 : sign * x;
      return direction === 'TB' || direction === 'BT' ? { x: y, y: along } : { x: along, y };
    };
    const directPath: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }].map(transform);
    const blockerPath: Point[] = [{ x: 50, y: -100 }, { x: 50, y: 100 }].map(transform);
    const moving = edge('moving', directPath);
    const blocker = edge('blocker', blockerPath);
    const candidate = routeStrictCrossingMazeCandidate(
      directPath, 0, [directPath, blockerPath], [moving, blocker], [],
    );
    expect(candidate).not.toBeNull();
    if (!candidate) throw new Error('expected a crossing-free detour');
    expect(countStrictEdgeCrossings([edge('moving', candidate), blocker])).toBe(0);
    expect(candidate[0]).toEqual(directPath[0]);
    expect(candidate[candidate.length - 1]).toEqual(directPath[1]);
  });

  it('does not charge a perpendicular shared source as a straight-through crossing', () => {
    const directPath: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const peerPath: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
    const moving = edge('moving', directPath);
    const peer = { ...edge('peer', peerPath), source: moving.source };
    expect(routeStrictCrossingMazeCandidate(
      directPath, 0, [directPath, peerPath], [moving, peer], [],
    )).toBeNull();
  });

  it('keeps a bounded local grid while scoring crossings against the full graph', () => {
    const directPath: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const blockingPath: Point[] = [
      { x: 50, y: -100 },
      { x: 50, y: 100 },
    ];
    const movingEdge = edge('moving', directPath);
    const blockingEdge = edge('blocking', blockingPath);

    // These far-away paths deliberately provide enough unique x/y coordinates
    // to exceed the maze cell budget if penalty paths accidentally seed the
    // coordinate grid. They must affect scoring only.
    const farPaths = Array.from({ length: 130 }, (_, index): Point[] => [
      { x: 10_000 + index * 100, y: 20_000 + index * 100 },
      { x: 10_050 + index * 100, y: 20_000 + index * 100 },
    ]);
    const farEdges = farPaths.map((path, index) => edge(`far-${index}`, path));
    const penaltyPaths = [directPath, blockingPath, ...farPaths];
    const penaltyEdges = [movingEdge, blockingEdge, ...farEdges];

    expect(
      routeStrictCrossingMazeCandidate(
        directPath,
        0,
        [directPath],
        [movingEdge],
        [],
      ),
    ).toBeNull();

    const samePathDiagnostics: StrictCrossingMazeDiagnostics = {};
    expect(routeStrictCrossingMazeCandidate(
      directPath,
      0,
      [directPath],
      [movingEdge],
      [],
      {
        penaltyPaths: [directPath],
        penaltyEdges: [movingEdge],
        penaltyEdgeIndex: 0,
        diagnostics: samePathDiagnostics,
      },
    )).toBeNull();
    expect(samePathDiagnostics.reason).toBe('same-path');

    const diagnostics: StrictCrossingMazeDiagnostics = {};
    const candidate = routeStrictCrossingMazeCandidate(
      directPath,
      0,
      [directPath],
      [movingEdge],
      [],
      {
        penaltyPaths,
        penaltyEdges,
        penaltyEdgeIndex: 0,
        diagnostics,
      },
    );

    expect(candidate).not.toBeNull();
    expect(diagnostics.reason).toBe('candidate');
    expect(diagnostics.gridCellCount).toBeLessThan(20_000);
    const routedEdges = [
      edge('moving', candidate!),
      blockingEdge,
    ];
    expect(countStrictEdgeCrossings(routedEdges)).toBe(0);
  });

  it('reports a local coordinate grid that exceeds the fixed cell budget', () => {
    const directPath: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const gridNoise = Array.from({ length: 160 }, (_, index): Point => ({
      x: 1_000 + index * 10,
      y: 2_000 + index * 11,
    }));
    const movingEdge = edge('moving', directPath);
    const gridNoiseEdge = edge('grid-noise', gridNoise);
    const diagnostics: StrictCrossingMazeDiagnostics = {};

    expect(routeStrictCrossingMazeCandidate(
      directPath,
      0,
      [directPath, gridNoise],
      [movingEdge, gridNoiseEdge],
      [],
      {
        penaltyPaths: [directPath, gridNoise],
        penaltyEdges: [movingEdge, gridNoiseEdge],
        penaltyEdgeIndex: 0,
        diagnostics,
      },
    )).toBeNull();
    expect(diagnostics.reason).toBe('grid-budget');
    expect(diagnostics.gridCellCount).toBeGreaterThan(20_000);
  });

  it('builds a residual-overlap candidate from at most three local coordinate edges', () => {
    const directPath: Point[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 80, y: 0 },
      { x: 100, y: 0 },
    ];
    const localCompanionPath: Point[] = [
      { x: 0, y: 200 },
      { x: 100, y: 200 },
    ];
    const fullGraphBlockerPath: Point[] = [
      { x: 50, y: -100 },
      { x: 50, y: 100 },
    ];
    const edges = [
      edge('moving', directPath),
      edge('local-companion', localCompanionPath),
      edge('full-graph-blocker', fullGraphBlockerPath),
    ];

    expect(buildBoundedResidualOverlapMazeCandidate(edges, [], -1, [1])).toBeNull();
    expect(buildBoundedResidualOverlapMazeCandidate(edges, [], 0, [])).toBeNull();

    const candidate = buildBoundedResidualOverlapMazeCandidate(edges, [], 0, [1], {
      gridPadding: Number.POSITIVE_INFINITY,
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.slice(0, 2)).toEqual(directPath.slice(0, 2));
    expect(candidate?.slice(-2)).toEqual(directPath.slice(-2));
    expect(countStrictEdgeCrossings([
      edge('moving', candidate!),
      edges[2],
    ])).toBe(0);
  });
});
