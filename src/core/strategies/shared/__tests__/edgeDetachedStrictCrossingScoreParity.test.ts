import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createDetachedOverlapStateEvaluationContext,
  scoreDetachedOverlapState,
  type Point,
} from '../edgeDetachedOverlapRepair';
import {
  createStrictCrossingSegmentIndex,
  extractPathSegmentRefs,
  extractPathSegmentRefsForPath,
  findStrictCrossings,
  readStrictCrossingSegmentIndexMetrics,
  strictCross,
  strictCrossingsForEdgeSegments,
} from '../edgeDetachedOverlapGeometry';
import {
  repairDetachedStrictCrossingBypassesWithScoreContextForTesting,
  type DetachedStrictCrossingScoreEvaluationContextFactory,
} from '../edgeDetachedStrictCrossingRepair';
import { countStrictEdgeCrossings } from '../edgeStrictCrossingGuard';

const edge = (id: string, path: Point[]): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath: path },
});

const cloneEdges = (edges: Edge[]): Edge[] => edges.map(item => ({
  ...item,
  data: {
    ...(item.data || {}),
    computedPath: ((item.data as { computedPath: Point[] }).computedPath)
      .map(point => ({ ...point })),
  },
}));

const fullScoreContextFactory: DetachedStrictCrossingScoreEvaluationContextFactory = (
  _baselinePaths,
  edges,
  nodes,
) => ({
  evaluate: candidatePaths => scoreDetachedOverlapState(candidatePaths, edges, nodes),
  evaluateChanged: candidatePaths => scoreDetachedOverlapState(candidatePaths, edges, nodes),
  readMetrics: () => ({ pairCacheHitCount: 0, pairEvaluationCount: 0 }),
});

describe('detached strict-crossing incremental score parity', () => {
  it('counts only perpendicular segments from other edges', () => {
    const paths: Point[][] = [
      [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }],
      [{ x: 50, y: 0 }, { x: 50, y: 100 }],
      [{ x: 0, y: 75 }, { x: 100, y: 75 }],
    ];
    const edges = paths.map((path, index) => edge(`partition-${index}`, path));

    const allSegments = extractPathSegmentRefs(paths, edges);
    const segmentIndex = createStrictCrossingSegmentIndex(allSegments);
    const candidateSegments = extractPathSegmentRefsForPath(paths[0], 0, edges);
    expect(strictCrossingsForEdgeSegments(
      candidateSegments,
      allSegments,
      0,
      segmentIndex,
    )).toBe(1);
    const metricsAfterFirst = readStrictCrossingSegmentIndexMetrics(segmentIndex);
    expect(strictCrossingsForEdgeSegments(
      candidateSegments.map(segment => ({ ...segment })),
      allSegments,
      0,
      segmentIndex,
    )).toBe(1);
    expect(readStrictCrossingSegmentIndexMetrics(segmentIndex)).toEqual({
      cacheHitCount: metricsAfterFirst.cacheHitCount + candidateSegments.length,
      evaluationCount: metricsAfterFirst.evaluationCount,
      candidateVisitCount: metricsAfterFirst.candidateVisitCount,
    });
  });

  it('does not retain invalid candidate geometry in the strict crossing cache', () => {
    const paths: Point[][] = [
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      [{ x: 50, y: 0 }, { x: 50, y: 100 }],
    ];
    const edges = paths.map((path, index) => edge(`invalid-cache-${index}`, path));
    const allSegments = extractPathSegmentRefs(paths, edges);
    const segmentIndex = createStrictCrossingSegmentIndex(allSegments);
    const source = extractPathSegmentRefsForPath(paths[0], 0, edges)[0];
    const invalid = { ...source, a: { ...source.a, x: Number.NaN } };

    strictCrossingsForEdgeSegments([invalid], allSegments, 0, segmentIndex);
    const afterFirst = readStrictCrossingSegmentIndexMetrics(segmentIndex);
    strictCrossingsForEdgeSegments([invalid], allSegments, 0, segmentIndex);

    expect(readStrictCrossingSegmentIndexMetrics(segmentIndex)).toEqual({
      cacheHitCount: afterFirst.cacheHitCount,
      evaluationCount: afterFirst.evaluationCount + 1,
      candidateVisitCount: afterFirst.candidateVisitCount,
    });
  });

  it('preserves source segment order while partitioning strict-crossing axes', () => {
    const paths: Point[][] = [
      [{ x: 25, y: 0 }, { x: 25, y: 100 }],
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      [{ x: 75, y: 0 }, { x: 75, y: 100 }],
    ];
    const edges = paths.map((path, index) => edge(`ordered-${index}`, path));

    expect(findStrictCrossings(paths, edges).map(hit => [hit.a.edgeId, hit.b.edgeId]))
      .toEqual([
        ['ordered-0', 'ordered-1'],
        ['ordered-1', 'ordered-2'],
      ]);
  });

  it('matches the full pair scan for unsorted axes and endpoint-tolerance boundaries', () => {
    const paths: Point[][] = [
      [{ x: 90, y: 0 }, { x: 90, y: 120 }],
      [{ x: 0, y: 80 }, { x: 100, y: 80 }],
      [{ x: 10, y: 0 }, { x: 10, y: 120 }],
      [{ x: 0, y: 40 }, { x: 100, y: 40 }],
      [{ x: 0.5, y: 0 }, { x: 0.5, y: 120 }],
      [{ x: 99.5, y: 0 }, { x: 99.5, y: 120 }],
    ];
    const edges = paths.map((path, index) => edge(`range-${index}`, path));
    const segments = extractPathSegmentRefs(paths, edges);
    const expectedPairs: string[][] = [];
    for (let first = 0; first < segments.length; first += 1) {
      for (let second = first + 1; second < segments.length; second += 1) {
        if (
          segments[first].edgeIndex !== segments[second].edgeIndex
          && strictCross(segments[first], segments[second])
        ) {
          expectedPairs.push([segments[first].edgeId, segments[second].edgeId]);
        }
      }
    }

    expect(findStrictCrossings(paths, edges).map(hit => [hit.a.edgeId, hit.b.edgeId]))
      .toEqual(expectedPairs);
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const expectedCount = expectedPairs.filter(pair => pair.includes(edges[edgeIndex].id)).length;
      expect(strictCrossingsForEdgeSegments(
        extractPathSegmentRefsForPath(paths[edgeIndex], edgeIndex, edges),
        segments,
        edgeIndex,
      )).toBe(expectedCount);
    }
  });

  it('matches the ordered full scan for seeded fixed-coordinate ranges', () => {
    let state = 0x5eed1234;
    const next = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const paths: Point[][] = Array.from({ length: 96 }, (_, index) => {
      const fixed = Math.round((next() * 480 - 240) * 2) / 2;
      const start = Math.round((next() * 480 - 240) * 2) / 2;
      const length = 8 + Math.round(next() * 360);
      return index % 2 === 0
        ? [{ x: start, y: fixed }, { x: start + length, y: fixed }]
        : [{ x: fixed, y: start }, { x: fixed, y: start + length }];
    });
    const edges = paths.map((path, index) => edge(`seeded-${index}`, path));
    const segments = extractPathSegmentRefs(paths, edges);
    const expected: number[][] = [];
    for (let first = 0; first < segments.length; first += 1) {
      for (let second = first + 1; second < segments.length; second += 1) {
        if (
          segments[first].edgeIndex !== segments[second].edgeIndex
          && strictCross(segments[first], segments[second])
        ) {
          expected.push([
            segments[first].edgeIndex,
            segments[first].segIdx,
            segments[second].edgeIndex,
            segments[second].segIdx,
          ]);
        }
      }
    }

    expect(findStrictCrossings(paths, edges).map(hit => [
      hit.a.edgeIndex,
      hit.a.segIdx,
      hit.b.edgeIndex,
      hit.b.segIdx,
    ])).toEqual(expected);
  });

  it.each([
    {
      name: 'one changed edge',
      changedIndexes: [1],
      candidatePaths: [
        [{ x: 0, y: 0 }, { x: 200, y: 0 }],
        [{ x: 100, y: -100 }, { x: 300, y: -100 }, { x: 300, y: 100 }, { x: 100, y: 100 }],
        [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      ],
    },
    {
      name: 'two changed edges',
      changedIndexes: [1, 2],
      candidatePaths: [
        [{ x: 0, y: 0 }, { x: 200, y: 0 }],
        [{ x: 100, y: -100 }, { x: 300, y: -100 }, { x: 300, y: 100 }, { x: 100, y: 100 }],
        [{ x: 0, y: 200 }, { x: 200, y: 200 }],
      ],
    },
  ])('matches the full scorer exactly for $name', ({ changedIndexes, candidatePaths }) => {
    const baselinePaths: Point[][] = [
      [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      [{ x: 100, y: -100 }, { x: 100, y: 100 }],
      [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    ];
    const edges = baselinePaths.map((path, index) => edge(`parity-${index}`, path));
    const context = createDetachedOverlapStateEvaluationContext(baselinePaths, edges, []);

    expect(context.evaluateChanged(candidatePaths, changedIndexes)).toBe(
      scoreDetachedOverlapState(candidatePaths, edges, []),
    );
  });

  it('selects the same point-for-point repair as the legacy full scorer', () => {
    const edges = [
      edge('horizontal', [{ x: 0, y: 100 }, { x: 400, y: 100 }]),
      edge('vertical', [{ x: 200, y: -100 }, { x: 200, y: 300 }]),
      edge('nearby', [{ x: 0, y: 200 }, { x: 400, y: 200 }]),
    ];

    const fullScoreRepair = repairDetachedStrictCrossingBypassesWithScoreContextForTesting(
      cloneEdges(edges),
      [],
      fullScoreContextFactory,
    );
    const incrementalRepair = repairDetachedStrictCrossingBypassesWithScoreContextForTesting(
      cloneEdges(edges),
      [],
      createDetachedOverlapStateEvaluationContext,
    );

    expect(countStrictEdgeCrossings(incrementalRepair)).toBeLessThan(
      countStrictEdgeCrossings(edges),
    );
    expect(incrementalRepair.map(item => (item.data as { computedPath: Point[] }).computedPath))
      .toEqual(fullScoreRepair.map(item => (item.data as { computedPath: Point[] }).computedPath));
  });

  it('does not construct the detached scorer when no hard-safe strict reduction exists', () => {
    const edges = [
      edge('short-horizontal', [{ x: 0, y: 0 }, { x: 35, y: 0 }]),
      edge('short-vertical', [{ x: 17.5, y: -15 }, { x: 17.5, y: 15 }]),
      edge('upper-detour-blocker', [{ x: 10, y: -300 }, { x: 10, y: -1 }]),
      edge('near-lower-detour-blocker', [{ x: 10, y: 10 }, { x: 10, y: 20 }]),
      edge('far-lower-detour-blocker', [{ x: 10, y: 40 }, { x: 10, y: 300 }]),
      edge('left-detour-blocker', [{ x: -300, y: 5 }, { x: -1, y: 5 }]),
      edge('right-detour-blocker', [{ x: 40, y: 5 }, { x: 300, y: 5 }]),
    ];
    const createScoreContext = vi.fn<DetachedStrictCrossingScoreEvaluationContextFactory>(() => {
      throw new Error('a strict-only reduction must not construct the detached scorer');
    });

    const repaired = repairDetachedStrictCrossingBypassesWithScoreContextForTesting(
      cloneEdges(edges),
      [],
      createScoreContext,
    );

    expect(countStrictEdgeCrossings(edges)).toBe(1);
    expect(countStrictEdgeCrossings(repaired)).toBe(1);
    expect(createScoreContext).not.toHaveBeenCalled();
  });
});
