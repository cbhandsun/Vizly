import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateEdgePathQualityScore,
  chooseFewestStrictCrossings,
  countStrictEdgeCrossings,
  createEdgePathQualityEvaluationContext,
  keepIfNoNewStrictCrossings,
  type EdgePathQualityScore,
} from '../edgeStrictCrossingGuard';
import { qualitySegmentBoundsMayContribute } from '../edgePathQualitySegmentIndex';

const edge = (id: string, path: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath: path },
});

const linkedEdge = (
  id: string,
  source: string,
  target: string,
  path: Array<{ x: number; y: number }>,
  data: Record<string, unknown> = {},
): Edge => ({
  id,
  source,
  target,
  data: { ...data, computedPath: path },
});

const cloneEdges = (edges: Edge[]): Edge[] => edges.map((current) => {
  const data = { ...((current.data || {}) as Record<string, any>) };
  for (const pathKey of ['computedPath', 'elkPath']) {
    if (Array.isArray(data[pathKey])) {
      data[pathKey] = data[pathKey].map((point: any) => ({ ...point }));
    }
  }
  if (data.treeRouting && typeof data.treeRouting === 'object') {
    data.treeRouting = {
      ...data.treeRouting,
      points: Array.isArray(data.treeRouting.points)
        ? data.treeRouting.points.map((point: any) => ({ ...point }))
        : data.treeRouting.points,
    };
  }
  return { ...current, data };
});

const createIncrementalParityBaseline = (): Edge[] => [
  linkedEdge('shared-left', 'hub', 'left', [
    { x: 0, y: 0 }, { x: 0, y: 40 }, { x: 120, y: 40 },
    { x: 120, y: 160 }, { x: -120, y: 160 },
  ]),
  linkedEdge('shared-right', 'hub', 'right', [
    { x: 0, y: 0 }, { x: 0, y: -40 }, { x: 120, y: -40 },
    { x: 120, y: 160 }, { x: 120, y: 220 },
  ]),
  linkedEdge('horizontal-a', 'a', 'b', [{ x: -80, y: 60 }, { x: 240, y: 60 }]),
  linkedEdge('vertical-a', 'c', 'd', [{ x: 40, y: -80 }, { x: 40, y: 240 }]),
  linkedEdge('reverse-a', 'e', 'f', [{ x: 210, y: 100 }, { x: -40, y: 100 }]),
  linkedEdge('hairpin-a', 'g', 'h', [
    { x: 0, y: 260 }, { x: 100, y: 260 }, { x: 100, y: 280 },
    { x: 20, y: 280 }, { x: 20, y: 360 },
  ]),
  linkedEdge('grid-0', 'i0', 'o0', [{ x: -100, y: 320 }, { x: 260, y: 320 }]),
  linkedEdge('grid-1', 'i1', 'o1', [{ x: 80, y: 200 }, { x: 80, y: 420 }]),
  linkedEdge('grid-2', 'i2', 'o2', [{ x: -100, y: 380 }, { x: 260, y: 380 }]),
  linkedEdge('grid-3', 'i3', 'o3', [{ x: 160, y: 200 }, { x: 160, y: 420 }]),
  linkedEdge('grid-4', 'i4', 'o4', [{ x: -100, y: 440 }, { x: 260, y: 440 }]),
  linkedEdge('grid-5', 'i5', 'o5', [{ x: 220, y: 200 }, { x: 220, y: 480 }]),
];

const expectIncrementalParity = (baseline: Edge[], candidate: Edge[]): void => {
  const context = createEdgePathQualityEvaluationContext(baseline);
  const expected = calculateEdgePathQualityScore(cloneEdges(candidate));
  expect(context.evaluate(candidate)).toEqual(expected);
};

const calculateFreshQualityScore = async (edges: Edge[]) => {
  vi.resetModules();
  const guard = await import('../edgeStrictCrossingGuard');
  return guard.calculateEdgePathQualityScore(edges);
};

const legacyQualityKeys: Array<keyof EdgePathQualityScore> = [
  'nonOrthogonalSegments',
  'strictCrossings',
  'reverseOverlap',
  'unrelatedOverlap',
  'unexplainedRelatedOverlap',
  'shortEndpointStubs',
  'tinyInteriorDoglegs',
  'hairpins',
  'backtrackPenalty',
  'detourPenalty',
  'bends',
  'totalLength',
];

const legacyCompareScores = (
  first: EdgePathQualityScore,
  second: EdgePathQualityScore,
): number => {
  for (const key of legacyQualityKeys) {
    const delta = first[key] - second[key];
    if (delta !== 0) return delta;
  }
  return 0;
};

const legacyNonOrthogonalSegments = (candidate: Edge[]): number => candidate.reduce(
  (total, current) => {
    const raw = (current.data as any)?.computedPath
      || (current.data as any)?.treeRouting?.points
      || (current.data as any)?.elkPath
      || [];
    if (!Array.isArray(raw)) return total;
    const path = raw
      .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    let count = 0;
    for (let index = 0; index < path.length - 1; index += 1) {
      if (
        Math.abs(path[index].x - path[index + 1].x) > 0.5
        && Math.abs(path[index].y - path[index + 1].y) > 0.5
      ) count += 1;
    }
    return total + count;
  },
  0,
);

const legacyChooseFewestStrictCrossings = <T extends Edge[]>(...candidates: T[]): T => {
  if (candidates.length === 0) return [] as unknown as T;
  const uniqueCandidates = candidates.filter(
    (candidate, index) => candidates.indexOf(candidate) === index,
  );
  const leadingMetrics = uniqueCandidates.map(candidate => ({
    candidate,
    nonOrthogonalSegments: legacyNonOrthogonalSegments(candidate),
    strictCrossings: countStrictEdgeCrossings(candidate),
  }));
  let bestLeading = leadingMetrics[0];
  for (let index = 1; index < leadingMetrics.length; index += 1) {
    const metric = leadingMetrics[index];
    if (
      metric.nonOrthogonalSegments < bestLeading.nonOrthogonalSegments
      || (
        metric.nonOrthogonalSegments === bestLeading.nonOrthogonalSegments
        && metric.strictCrossings < bestLeading.strictCrossings
      )
    ) bestLeading = metric;
  }
  const finalists = leadingMetrics.filter(metric => (
    metric.nonOrthogonalSegments === bestLeading.nonOrthogonalSegments
    && metric.strictCrossings === bestLeading.strictCrossings
  ));
  let best = finalists[0].candidate;
  let bestScore = calculateEdgePathQualityScore(best);
  for (let index = 1; index < finalists.length; index += 1) {
    const candidate = finalists[index].candidate;
    const candidateScore = calculateEdgePathQualityScore(candidate);
    if (legacyCompareScores(candidateScore, bestScore) < 0) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
};

describe('edgeStrictCrossingGuard', () => {
  it('counts strict orthogonal crossings between different edges', () => {
    expect(countStrictEdgeCrossings([
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
    ])).toBe(1);
  });

  it('invalidates cached quality when a path is mutated in place', () => {
    const edges = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
    ];

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    expect(countStrictEdgeCrossings(edges)).toBe(1);

    ((edges[1].data as any).computedPath[0] as { x: number }).x = 120;
    ((edges[1].data as any).computedPath[1] as { x: number }).x = 120;

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(0);
    expect(countStrictEdgeCrossings(edges)).toBe(0);
  });

  it('keeps a candidate that does not increase strict crossings', () => {
    const baseline = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 120, y: 0 }, { x: 120, y: 100 }]),
    ];
    const candidate = [
      edge('horizontal', [{ x: 0, y: 60 }, { x: 100, y: 60 }]),
      edge('vertical', [{ x: 120, y: 0 }, { x: 120, y: 100 }]),
    ];

    expect(keepIfNoNewStrictCrossings(baseline, candidate)).toBe(candidate);
  });

  it('rolls back a candidate that introduces strict crossings', () => {
    const baseline = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 120, y: 0 }, { x: 120, y: 100 }]),
    ];
    const candidate = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
    ];

    expect(keepIfNoNewStrictCrossings(baseline, candidate)).toBe(baseline);
  });

  it('selects the cleanest candidate from a final quality pool', () => {
    const crossed = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
    ];
    const clean = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 120, y: 0 }, { x: 120, y: 100 }]),
    ];

    expect(chooseFewestStrictCrossings(crossed, clean, crossed)).toBe(clean);
  });

  it('keeps the legacy candidate identity for incremental, broad, duplicate, and diagonal pools', () => {
    const baseline = createIncrementalParityBaseline();
    const oneChanged = cloneEdges(baseline);
    (oneChanged[3].data as any).computedPath = [
      { x: 280, y: -80 },
      { x: 280, y: 240 },
    ];
    const twoChanged = cloneEdges(oneChanged);
    (twoChanged[7].data as any).computedPath = [
      { x: 300, y: 200 },
      { x: 300, y: 420 },
    ];
    const broadChanged = cloneEdges(baseline);
    for (let index = 0; index < broadChanged.length; index += 1) {
      const path = (broadChanged[index].data as any).computedPath as Array<{ x: number; y: number }>;
      (broadChanged[index].data as any).computedPath = path.map(point => ({
        x: point.x + 400 + index * 8,
        y: point.y + 600,
      }));
    }
    const diagonal = cloneEdges(oneChanged);
    (diagonal[0].data as any).computedPath = [
      { x: 0, y: 0 },
      { x: 80, y: 80 },
    ];
    const equalClone = cloneEdges(baseline);
    const pools = [
      [baseline, oneChanged, twoChanged, broadChanged, diagonal, oneChanged],
      [diagonal, broadChanged, twoChanged, baseline, oneChanged],
      [equalClone, baseline, oneChanged, twoChanged],
    ];

    for (const pool of pools) {
      expect(chooseFewestStrictCrossings(...pool)).toBe(
        legacyChooseFewestStrictCrossings(...pool),
      );
    }
  });

  it('keeps the legacy boundary behavior for empty, malformed, and extreme candidates', () => {
    const empty: Edge[] = [];
    const missingPath = {
      id: 'missing-path',
      source: 'missing-source',
      target: 'missing-target',
      data: { computedPath: 'not-an-array' },
    } as unknown as Edge;
    const invalidPoints = edge('invalid-points', [
      { x: Number.NaN, y: 0 },
      { x: Number.POSITIVE_INFINITY, y: 20 },
      { x: 40, y: 20 },
    ]);
    const extreme = edge('extreme', [
      { x: -Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
      { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
    ]);
    const malformed: Edge[] = [missingPath, invalidPoints];
    const extremeCandidate: Edge[] = [extreme];

    expect(chooseFewestStrictCrossings()).toEqual([]);
    for (const pool of [
      [malformed, extremeCandidate],
      [extremeCandidate, empty, malformed],
      [empty, malformed, extremeCandidate, empty],
    ]) {
      expect(chooseFewestStrictCrossings(...pool)).toBe(
        legacyChooseFewestStrictCrossings(...pool),
      );
    }
  });

  it('uses reverse overlap as a tie-breaker when strict crossings are equal', () => {
    const reverseOverlap = [
      edge('forward', [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      edge('reverse', [{ x: 90, y: 0 }, { x: 10, y: 0 }]),
    ];
    const separated = [
      edge('forward', [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      edge('reverse', [{ x: 90, y: 24 }, { x: 10, y: 24 }]),
    ];

    expect(countStrictEdgeCrossings(reverseOverlap)).toBe(0);
    expect(countStrictEdgeCrossings(separated)).toBe(0);
    expect(calculateEdgePathQualityScore(reverseOverlap).reverseOverlap).toBeGreaterThan(0);
    expect(chooseFewestStrictCrossings(reverseOverlap, separated)).toBe(separated);
  });

  it('treats stroke-adjacent parallel lanes as visual overlap', () => {
    const visualReverseOverlap = [
      linkedEdge('master-data-tms', 'master-data', 'tms', [
        { x: 218, y: 213 },
        { x: 819, y: 213 },
      ]),
      linkedEdge('upstream-oms', 'upstream', 'oms', [
        { x: 541, y: 212 },
        { x: 496, y: 212 },
      ]),
    ];
    const separated = [
      linkedEdge('master-data-tms', 'master-data', 'tms', [
        { x: 218, y: 213 },
        { x: 819, y: 213 },
      ]),
      linkedEdge('upstream-oms', 'upstream', 'oms', [
        { x: 541, y: 224 },
        { x: 496, y: 224 },
      ]),
    ];

    const quality = calculateEdgePathQualityScore(visualReverseOverlap);
    expect(quality.reverseOverlap).toBeGreaterThan(0);
    expect(quality.unrelatedOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(separated).unrelatedOverlap).toBe(0);
    expect(chooseFewestStrictCrossings(visualReverseOverlap, separated)).toBe(separated);
  });

  it('rejects even short terminal merges between edges without a shared endpoint', () => {
    const shortMerge = [
      edge('long-trunk', [{ x: 0, y: 20 }, { x: 0, y: 200 }]),
      edge('terminal-stub', [{ x: 0, y: 0 }, { x: 0, y: 48 }, { x: -80, y: 48 }]),
    ];
    const tooLong = [
      edge('long-trunk', [{ x: 0, y: 8 }, { x: 0, y: 200 }]),
      edge('terminal-stub', [{ x: 0, y: 0 }, { x: 0, y: 48 }, { x: -80, y: 48 }]),
    ];

    expect(calculateEdgePathQualityScore(shortMerge).unrelatedOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(tooLong).unrelatedOverlap).toBeGreaterThan(0);
  });

  it('uses the rendered-audit inclusive 24px overlap boundary', () => {
    const exactBoundary = [
      edge('boundary-a', [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      edge('boundary-b', [{ x: 76, y: 0 }, { x: 160, y: 0 }]),
    ];
    const belowBoundary = [
      edge('below-a', [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      edge('below-b', [{ x: 76.01, y: 0 }, { x: 160, y: 0 }]),
    ];

    expect(calculateEdgePathQualityScore(exactBoundary).unrelatedOverlap).toBe(24);
    expect(calculateEdgePathQualityScore(belowBoundary).unrelatedOverlap).toBe(0);
  });

  it('allows same-source overlap only when it is the endpoint trunk', () => {
    const sharedSourceTrunk = [
      linkedEdge('hub-left', 'hub', 'left', [
        { x: 0, y: 0 },
        { x: 0, y: 80 },
        { x: -120, y: 80 },
      ]),
      linkedEdge('hub-right', 'hub', 'right', [
        { x: 0, y: 0 },
        { x: 0, y: 80 },
        { x: 120, y: 80 },
      ]),
    ];
    const distantSharedLane = [
      linkedEdge('hub-left', 'hub', 'left', [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 120, y: 40 },
        { x: 120, y: 160 },
        { x: -120, y: 160 },
      ]),
      linkedEdge('hub-right', 'hub', 'right', [
        { x: 0, y: 0 },
        { x: 0, y: -40 },
        { x: 120, y: -40 },
        { x: 120, y: 160 },
        { x: 120, y: 200 },
      ]),
    ];

    expect(calculateEdgePathQualityScore(sharedSourceTrunk).relatedOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(sharedSourceTrunk).unexplainedRelatedOverlap).toBe(0);
    expect(calculateEdgePathQualityScore(distantSharedLane).unexplainedRelatedOverlap).toBeGreaterThan(0);
  });

  it('does not let stale shared-trunk metadata hide a non-prefix overlap', () => {
    const explicitTrunk = [
      linkedEdge('hub-left', 'hub', 'left', [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 120, y: 40 },
        { x: 120, y: 160 },
        { x: -120, y: 160 },
      ], { sharedTrunkSynthesized: true }),
      linkedEdge('hub-right', 'hub', 'right', [
        { x: 0, y: 0 },
        { x: 0, y: -40 },
        { x: 120, y: -40 },
        { x: 120, y: 160 },
        { x: 120, y: 200 },
      ], { sharedTrunkSynthesized: true }),
    ];

    expect(calculateEdgePathQualityScore(explicitTrunk).relatedOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(explicitTrunk).unexplainedRelatedOverlap).toBeGreaterThan(0);
  });

  it('rejects non-orthogonal candidates before softer quality tie-breakers', () => {
    const diagonal = [
      edge('diagonal', [{ x: 0, y: 0 }, { x: 100, y: 100 }]),
    ];
    const orthogonal = [
      edge('orthogonal', [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
      ]),
    ];

    expect(calculateEdgePathQualityScore(diagonal).nonOrthogonalSegments).toBe(1);
    expect(chooseFewestStrictCrossings(diagonal, orthogonal)).toBe(orthogonal);
  });

  it('uses local hairpins and detours as later visual tie-breakers', () => {
    const hairpin = [
      edge('hairpin', [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 100 },
      ]),
    ];
    const direct = [
      edge('direct', [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]),
    ];

    expect(calculateEdgePathQualityScore(hairpin).hairpins).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(hairpin).detourPenalty).toBeGreaterThan(0);
    expect(chooseFewestStrictCrossings(hairpin, direct)).toBe(direct);
  });

  it('prefers paths that do not move away from the target on the dominant axis', () => {
    const backtracking = [
      edge('status-return', [
        { x: 701, y: 2638 },
        { x: 701, y: 2734 },
        { x: 171, y: 2734 },
        { x: 171, y: 694 },
        { x: 260, y: 694 },
        { x: 260, y: 598 },
      ]),
    ];
    const monotonic = [
      edge('status-return', [
        { x: 701, y: 2638 },
        { x: 701, y: 2542 },
        { x: 171, y: 2542 },
        { x: 171, y: 694 },
        { x: 260, y: 694 },
        { x: 260, y: 598 },
      ]),
    ];

    expect(calculateEdgePathQualityScore(backtracking).backtrackPenalty).toBe(96);
    expect(calculateEdgePathQualityScore(monotonic).backtrackPenalty).toBe(0);
    expect(chooseFewestStrictCrossings(backtracking, monotonic)).toBe(monotonic);
  });

  it('keeps exact full-score parity for zero, one, two, and several changed edges', () => {
    const baseline = createIncrementalParityBaseline();
    const candidates: Edge[][] = [];

    candidates.push(cloneEdges(baseline));

    const oneChanged = cloneEdges(baseline);
    (oneChanged[3].data as any).computedPath = [
      { x: 280, y: -80 }, { x: 280, y: 240 },
    ];
    candidates.push(oneChanged);

    const twoChanged = cloneEdges(baseline);
    twoChanged[0].source = 'detached-source';
    twoChanged[1].target = 'left';
    candidates.push(twoChanged);

    const severalChanged = cloneEdges(baseline);
    for (const index of [2, 3, 6, 7, 9]) {
      const path = (severalChanged[index].data as any).computedPath as Array<{ x: number; y: number }>;
      (severalChanged[index].data as any).computedPath = path.map(point => ({
        x: point.x + index * 7,
        y: point.y - index * 5,
      }));
    }
    candidates.push(severalChanged);

    for (const candidate of candidates) expectIncrementalParity(baseline, candidate);
  });

  it('keeps explicit changed-index evaluation exactly equal to the full scorer', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const oneChanged = cloneEdges(baseline);
    (oneChanged[3].data as any).computedPath = [
      { x: 280, y: -80 }, { x: 280, y: 240 },
    ];
    expect(context.evaluateChanged(oneChanged, [3])).toEqual(
      calculateEdgePathQualityScore(cloneEdges(oneChanged)),
    );

    const twoChanged = cloneEdges(baseline);
    twoChanged[0].source = 'detached-source';
    twoChanged[1].target = 'left';
    expect(context.evaluateChanged(twoChanged, [0, 1])).toEqual(
      calculateEdgePathQualityScore(cloneEdges(twoChanged)),
    );
  });

  it('revalidates broad reference changes before using the full pair scorer', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    let endpointReads = 0;
    const candidate = baseline.map((current, index) => {
      const clone = cloneEdges([current])[0];
      const source = clone.source;
      const target = clone.target;
      Object.defineProperties(clone, {
        source: {
          enumerable: true,
          get: () => {
            endpointReads += 1;
            return source;
          },
        },
        target: {
          enumerable: true,
          get: () => {
            endpointReads += 1;
            return target;
          },
        },
      });
      if (index === 3) {
        const data = clone.data as Record<string, unknown>;
        data.computedPath = [{ x: 280, y: -80 }, { x: 280, y: 240 }];
      }
      return clone;
    });

    const score = context.evaluateChanged(candidate, candidate.map((_, index) => index));

    expect(score).toEqual(calculateEdgePathQualityScore(cloneEdges(candidate)));
    expect(endpointReads).toBeLessThan(80);
  });

  it('seeds the exact full-score cache from changed-index evaluation and invalidates later mutations', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const candidate = baseline.map((current, index) => index === 3
      ? linkedEdge('vertical-a', 'c', 'd', [{ x: 280, y: -80 }, { x: 280, y: 240 }])
      : current);

    const incrementalScore = context.evaluateChanged(candidate, [3]);
    expect(calculateEdgePathQualityScore(candidate)).toBe(incrementalScore);

    (candidate[3].data as any).computedPath = [
      { x: 300, y: -80 }, { x: 300, y: 240 },
    ];
    const pathMutatedScore = calculateEdgePathQualityScore(candidate);
    expect(pathMutatedScore).not.toBe(incrementalScore);
    expect(pathMutatedScore).toEqual(calculateEdgePathQualityScore(cloneEdges(candidate)));

    (candidate[0].data as any).sharedTrunkSynthesized = true;
    const intentMutatedScore = calculateEdgePathQualityScore(candidate);
    expect(intentMutatedScore).not.toBe(pathMutatedScore);
    expect(intentMutatedScore).toEqual(calculateEdgePathQualityScore(cloneEdges(candidate)));
  });

  it('reuses exact cached context scores for the same object and distinct edge arrays', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const candidate = cloneEdges(baseline);
    (candidate[3].data as any).computedPath = [
      { x: 317, y: -83 }, { x: 317, y: 247 },
    ];

    const evaluated = context.evaluate(candidate);
    expect(context.evaluate(candidate)).toBe(evaluated);
    expect(context.evaluate(cloneEdges(candidate))).toBe(evaluated);

    const explicitlyEvaluated = context.evaluateChanged(candidate, [3]);
    expect(explicitlyEvaluated).toBe(evaluated);
    expect(context.evaluateChanged(cloneEdges(candidate), [3])).toBe(evaluated);
  });

  it('does not reuse context scores after exact path, handle, or routing-intent changes', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const candidate = cloneEdges(baseline);
    (candidate[3].data as any).computedPath = [
      { x: 331, y: -89 }, { x: 331, y: 251 },
    ];
    const initialScore = context.evaluateChanged(candidate, [3]);

    const pathChanged = cloneEdges(candidate);
    (pathChanged[3].data as any).computedPath = [
      { x: 347, y: -89 }, { x: 347, y: 251 },
    ];
    const pathScore = context.evaluateChanged(pathChanged, [3]);
    expect(pathScore).not.toBe(initialScore);

    const sourceHandleChanged = cloneEdges(candidate);
    sourceHandleChanged[3].sourceHandle = 'left';
    const sourceHandleScore = context.evaluateChanged(sourceHandleChanged, [3]);
    expect(sourceHandleScore).not.toBe(initialScore);
    expect(context.evaluate(cloneEdges(sourceHandleChanged))).toBe(sourceHandleScore);

    const targetHandleChanged = cloneEdges(candidate);
    targetHandleChanged[3].targetHandle = 'right';
    const targetHandleScore = context.evaluateChanged(targetHandleChanged, [3]);
    expect(targetHandleScore).not.toBe(initialScore);

    const intentChanged = cloneEdges(candidate);
    (intentChanged[3].data as any).sharedTrunkSynthesized = true;
    const intentScore = context.evaluateChanged(intentChanged, [3]);
    expect(intentScore).not.toBe(initialScore);

    expect(pathScore).toEqual(calculateEdgePathQualityScore(cloneEdges(pathChanged)));
    expect(sourceHandleScore).toEqual(calculateEdgePathQualityScore(cloneEdges(sourceHandleChanged)));
    expect(targetHandleScore).toEqual(calculateEdgePathQualityScore(cloneEdges(targetHandleChanged)));
    expect(intentScore).toEqual(calculateEdgePathQualityScore(cloneEdges(intentChanged)));
  });

  it.each([
    ['first', 0],
    ['middle', 6],
    ['last', 11],
  ])('keeps the single-change fast path exact for the %s edge', async (label, changedIndex) => {
    const baseline = createIncrementalParityBaseline().map(current => ({
      ...current,
      source: `${current.source}-${label}`,
      target: `${current.target}-${label}`,
    }));
    const context = createEdgePathQualityEvaluationContext(baseline);
    const candidate = cloneEdges(baseline);
    const path = (candidate[changedIndex].data as any).computedPath as Array<{ x: number; y: number }>;
    (candidate[changedIndex].data as any).computedPath = path.map((point, pointIndex) => ({
      x: point.x + changedIndex * 13 + pointIndex * 3 + 17,
      y: point.y - changedIndex * 7 - pointIndex * 5 - 19,
    }));
    candidate[changedIndex].sourceHandle = `${label}-source-handle`;
    candidate[changedIndex].targetHandle = `${label}-target-handle`;
    (candidate[changedIndex].data as any).sharedTrunkAware = true;

    const incremental = context.evaluateChanged(candidate, [changedIndex]);
    const full = await calculateFreshQualityScore(cloneEdges(candidate));
    expect(incremental).toEqual(full);
  });

  it('keeps a signature-shared decomposition exact across distinct edge arrays', () => {
    const first = createIncrementalParityBaseline();
    const expected = calculateEdgePathQualityScore(first);
    const second = cloneEdges(first);
    const context = createEdgePathQualityEvaluationContext(second);

    expect(context.evaluate(second)).toEqual(expected);

    const pathChanged = cloneEdges(second);
    (pathChanged[3].data as any).computedPath = [
      { x: 300, y: -80 }, { x: 300, y: 240 },
    ];
    expect(context.evaluateChanged(pathChanged, [3])).toEqual(
      calculateEdgePathQualityScore(cloneEdges(pathChanged)),
    );
  });

  it('invalidates source, target, shared-trunk intent, and path-carrier metadata exactly', () => {
    const baseline = createIncrementalParityBaseline();
    const baselineScore = calculateEdgePathQualityScore(cloneEdges(baseline));

    const sourceChanged = cloneEdges(baseline);
    sourceChanged[0].source = 'detached-source';
    expectIncrementalParity(baseline, sourceChanged);
    expect(calculateEdgePathQualityScore(sourceChanged).unrelatedOverlap)
      .toBeGreaterThan(baselineScore.unrelatedOverlap);

    const targetBaseline = cloneEdges(baseline);
    targetBaseline[0].source = 'first-source';
    targetBaseline[1].source = 'second-source';
    targetBaseline[0].target = 'shared-target';
    targetBaseline[1].target = 'shared-target';
    const targetChanged = cloneEdges(targetBaseline);
    targetChanged[1].target = 'detached-target';
    expectIncrementalParity(targetBaseline, targetChanged);

    const sharedIntentChanged = cloneEdges(baseline);
    (sharedIntentChanged[0].data as any).sharedTrunkSynthesized = true;
    (sharedIntentChanged[1].data as any).sharedTrunkAware = true;
    expectIncrementalParity(baseline, sharedIntentChanged);
    expect(calculateEdgePathQualityScore(sharedIntentChanged).unexplainedRelatedOverlap)
      .toBe(baselineScore.unexplainedRelatedOverlap);

    const treeBusIntentChanged = cloneEdges(baseline);
    (treeBusIntentChanged[0].data as any).isTreeBus = true;
    (treeBusIntentChanged[1].data as any).isTreeBus = true;
    expectIncrementalParity(baseline, treeBusIntentChanged);
    expect(calculateEdgePathQualityScore(treeBusIntentChanged).unexplainedRelatedOverlap)
      .toBe(baselineScore.unexplainedRelatedOverlap);

    const treeRoutingIntentChanged = cloneEdges(baseline);
    for (const index of [0, 1]) {
      const computedPath = (treeRoutingIntentChanged[index].data as any).computedPath as Array<{
        x: number;
        y: number;
      }>;
      (treeRoutingIntentChanged[index].data as any).treeRouting = {
        points: computedPath.map(point => ({ ...point })),
      };
    }
    expectIncrementalParity(baseline, treeRoutingIntentChanged);
    expect(calculateEdgePathQualityScore(treeRoutingIntentChanged).unexplainedRelatedOverlap)
      .toBe(baselineScore.unexplainedRelatedOverlap);

    const treePathChanged = cloneEdges(baseline);
    delete (treePathChanged[4].data as any).computedPath;
    (treePathChanged[4].data as any).treeRouting = {
      points: [{ x: -40, y: 132 }, { x: 210, y: 132 }],
    };
    expectIncrementalParity(baseline, treePathChanged);

    const elkPathChanged = cloneEdges(baseline);
    delete (elkPathChanged[5].data as any).computedPath;
    (elkPathChanged[5].data as any).elkPath = [
      { x: 20, y: 260 }, { x: 20, y: 360 },
    ];
    expectIncrementalParity(baseline, elkPathChanged);
  });

  it('keeps parent-child state parity across consecutive edits to different edges', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const rootState = context.createState(baseline);
    expect(rootState.score).toEqual(calculateEdgePathQualityScore(cloneEdges(baseline)));

    const firstCandidate = baseline.map((current, index) => index === 2
      ? linkedEdge(current.id, current.source, current.target, [
        { x: -80, y: 84 }, { x: 240, y: 84 },
      ], current.data as Record<string, unknown>)
      : current);
    const firstState = context.evaluateStateChanged(rootState, firstCandidate, [2]);
    expect(firstState.score).toEqual(calculateEdgePathQualityScore(cloneEdges(firstCandidate)));

    const secondCandidate = firstCandidate.map((current, index) => index === 3
      ? linkedEdge(current.id, current.source, current.target, [
        { x: 64, y: -80 }, { x: 64, y: 240 },
      ], current.data as Record<string, unknown>)
      : current);
    const secondState = context.evaluateStateChanged(firstState, secondCandidate, [3]);
    expect(secondState.score).toEqual(calculateEdgePathQualityScore(cloneEdges(secondCandidate)));
  });

  it('keeps parent-child state parity when the same edge changes repeatedly', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    let state = context.createState(baseline);
    let candidate = baseline;

    for (const x of [52, 96, 144, 40]) {
      candidate = candidate.map((current, index) => index === 3
        ? linkedEdge(current.id, current.source, current.target, [
          { x, y: -80 }, { x, y: 240 },
        ], current.data as Record<string, unknown>)
        : current);
      state = context.evaluateStateChanged(state, candidate, [3]);
      expect(state.score).toEqual(calculateEdgePathQualityScore(cloneEdges(candidate)));
    }
  });

  it('revalidates broad parent-child reference changes before full pair scoring', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const rootState = context.createState(baseline);
    let endpointReads = 0;
    const candidate = baseline.map((current, index) => {
      const clone = cloneEdges([current])[0];
      const source = clone.source;
      const target = clone.target;
      Object.defineProperties(clone, {
        source: {
          enumerable: true,
          get: () => {
            endpointReads += 1;
            return source;
          },
        },
        target: {
          enumerable: true,
          get: () => {
            endpointReads += 1;
            return target;
          },
        },
      });
      if (index === 3) {
        const data = clone.data as Record<string, unknown>;
        data.computedPath = [{ x: 296, y: -80 }, { x: 296, y: 240 }];
      }
      return clone;
    });

    const state = context.evaluateStateChanged(
      rootState,
      candidate,
      candidate.map((_, index) => index),
    );

    expect(state.score).toEqual(calculateEdgePathQualityScore(cloneEdges(candidate)));
    expect(endpointReads).toBeLessThan(200);
  });

  it('uses child edge metadata for related and permitted overlap contributions', () => {
    const baseline: Edge[] = [
      linkedEdge('metadata-first', 'shared-source', 'first-target', [
        { x: 0, y: 0 }, { x: 160, y: 0 },
      ]),
      linkedEdge('metadata-second', 'shared-source', 'second-target', [
        { x: 0, y: 0 }, { x: 160, y: 0 },
      ]),
    ];
    const context = createEdgePathQualityEvaluationContext(baseline);
    const rootState = context.createState(baseline);

    const unrelated = baseline.map((current, index) => index === 1
      ? { ...current, source: 'detached-source' }
      : current);
    const unrelatedState = context.evaluateStateChanged(rootState, unrelated, [1]);
    expect(unrelatedState.score).toEqual(calculateEdgePathQualityScore(cloneEdges(unrelated)));
    expect(unrelatedState.score.unrelatedOverlap).toBeGreaterThan(0);

    const permitted = unrelated.map((current, index) => index === 1
      ? {
        ...current,
        source: 'shared-source',
        data: { ...(current.data || {}), sharedTrunkAware: true },
      }
      : index === 0
        ? { ...current, data: { ...(current.data || {}), sharedTrunkSynthesized: true } }
        : current);
    const permittedState = context.evaluateStateChanged(unrelatedState, permitted, [0, 1]);
    expect(permittedState.score).toEqual(calculateEdgePathQualityScore(cloneEdges(permitted)));
    expect(permittedState.score.unexplainedRelatedOverlap).toBe(0);
  });

  it.each([
    ['negative', [-1]],
    ['out-of-range', [12]],
    ['fractional', [0.5]],
    ['duplicate', [2, 2]],
  ])('falls back to the full scorer for %s parent-child indexes', (_label, indexes) => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const rootState = context.createState(baseline);
    const candidate = baseline.map((current, index) => index === 2
      ? linkedEdge(current.id, current.source, current.target, [
        { x: -80, y: 91 }, { x: 240, y: 91 },
      ], current.data as Record<string, unknown>)
      : current);
    const state = context.evaluateStateChanged(rootState, candidate, indexes);
    expect(state.score).toEqual(calculateEdgePathQualityScore(cloneEdges(candidate)));
  });

  it('keeps parity after the baseline array and path objects are mutated in place', () => {
    const baseline = createIncrementalParityBaseline();
    const context = createEdgePathQualityEvaluationContext(baseline);
    const originalScore = context.evaluate(baseline);
    expect(context.evaluate(baseline)).toBe(originalScore);
    expect(context.evaluateChanged(baseline, [])).toBe(originalScore);
    baseline[0].source = 'mutated-source';
    ((baseline[3].data as any).computedPath[0] as { x: number; y: number }).x = 300;
    ((baseline[3].data as any).computedPath[1] as { x: number; y: number }).x = 300;

    const expected = calculateEdgePathQualityScore(cloneEdges(baseline));
    expect(context.evaluate(baseline)).toEqual(expected);
    expect(context.evaluateChanged(baseline, [])).toEqual(expected);
  });

  it('falls back without changing results for broad edits and edge additions or removals', () => {
    const baseline = createIncrementalParityBaseline();
    const broadEdit = cloneEdges(baseline);
    for (let index = 0; index < 9; index += 1) {
      const path = (broadEdit[index].data as any).computedPath as Array<{ x: number; y: number }>;
      (broadEdit[index].data as any).computedPath = path.map(point => ({
        x: point.x + 11,
        y: point.y + 13,
      }));
    }
    expectIncrementalParity(baseline, broadEdit);

    const added = cloneEdges(baseline);
    added.push(edge('added', [{ x: -200, y: 75 }, { x: 300, y: 75 }]));
    expectIncrementalParity(baseline, added);

    const removed = cloneEdges(baseline).slice(0, -1);
    expectIncrementalParity(baseline, removed);
  });

  it('keeps parity for empty and malformed path metadata', () => {
    const empty: Edge[] = [];
    expectIncrementalParity(empty, []);

    const baseline = createIncrementalParityBaseline();
    const malformed = cloneEdges(baseline);
    (malformed[2].data as any).computedPath = 'not-a-path';
    (malformed[3].data as any).computedPath = [
      { x: Number.POSITIVE_INFINITY, y: 0 },
      { x: 40, y: Number.NaN },
      { x: 40, y: 240 },
    ];
    expectIncrementalParity(baseline, malformed);
  });

  it('identifies only edges participating in hard pair defects', () => {
    const baseline = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
      edge('detached', [{ x: 200, y: 0 }, { x: 200, y: 100 }]),
    ];
    const context = createEdgePathQualityEvaluationContext(baseline);

    expect(context.edgeHasPairRepairOpportunity?.(0)).toBe(true);
    expect(context.edgeHasPairRepairOpportunity?.(1)).toBe(true);
    expect(context.edgeHasPairRepairOpportunity?.(2)).toBe(false);
    expect(context.edgeHasPairRepairOpportunity?.(-1)).toBe(false);
    expect(context.edgeHasPairRepairOpportunity?.(3)).toBe(false);
  });

  it('keeps overlap-only edges behind the micro cleanup local-quality prefilter', () => {
    const baseline = [
      edge('parallel-a', [{ x: 0, y: 0 }, { x: 120, y: 0 }]),
      edge('parallel-b', [{ x: 40, y: 2 }, { x: 160, y: 2 }]),
    ];
    const context = createEdgePathQualityEvaluationContext(baseline);

    expect(calculateEdgePathQualityScore(baseline).unrelatedOverlap).toBeGreaterThan(0);
    expect(context.edgeHasPairRepairOpportunity?.(0)).toBe(false);
    expect(context.edgeHasPairRepairOpportunity?.(1)).toBe(false);
  });

  it('uses conservative finite bounds for changed-edge pair scans', () => {
    const baseline = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

    expect(qualitySegmentBoundsMayContribute(baseline, null)).toBe(false);
    expect(qualitySegmentBoundsMayContribute(
      baseline,
      { minX: 50, maxX: 150, minY: 50, maxY: 150 },
    )).toBe(true);
    expect(qualitySegmentBoundsMayContribute(
      baseline,
      { minX: 104, maxX: 200, minY: 0, maxY: 100 },
    )).toBe(true);
    expect(qualitySegmentBoundsMayContribute(
      baseline,
      { minX: 105, maxX: 200, minY: 0, maxY: 100 },
    )).toBe(false);
  });
});
