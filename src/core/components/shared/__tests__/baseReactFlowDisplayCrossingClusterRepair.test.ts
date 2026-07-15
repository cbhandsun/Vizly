import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { hasDisplayCrossingClusterFixedPoint } from '../baseReactFlowDisplayCrossingClusterFixedPointCache';
import {
  displayCrossingClusterPathSignature,
  firstDisplayCrossingClusterStrictHits,
  repairBoundedMultiEdgeResidualStrictCrossings,
  selectDisplayCrossingClusterOtherSegments,
} from '../baseReactFlowDisplayCrossingClusterRepair';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import {
  candidateStrictCrossingsForEdge,
  candidateUnrelatedOverlapForEdge,
  createDisplayCandidateInteractionContext,
  displayAxisOf,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from '../baseReactFlowDisplayGeometry';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  data: { computedPath, layoutPathLocked: true, layoutDirection: 'TB' },
});

const segment = (
  edgeIndex: number,
  axis: 'h' | 'v',
  a: DisplayPoint,
  b: DisplayPoint,
  segmentIndex = 0,
): DisplaySegment => {
  const delta = axis === 'h' ? b.x - a.x : b.y - a.y;
  return {
    edgeIndex,
    segmentIndex,
    axis,
    direction: Math.abs(delta) <= 0.5 ? 0 : delta > 0 ? 1 : -1,
    a,
    b,
  };
};

describe('bounded display crossing cluster repair', () => {
  it('keeps the shared ordered segment snapshot immutable while selecting movers', () => {
    const edges: Edge[] = [
      edge('first', 'a', 'b', [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 },
      ]),
      edge('second', 'c', 'd', [
        { x: 5, y: -10 }, { x: 5, y: 30 },
      ]),
      edge('third', 'e', 'f', [
        { x: -10, y: 10 }, { x: 30, y: 10 },
      ]),
    ];
    const sharedSegments = extractDisplaySegments(edges);
    const originalSnapshot = sharedSegments.map(item => ({
      ...item,
      a: { ...item.a },
      b: { ...item.b },
    }));

    const withoutFirst = selectDisplayCrossingClusterOtherSegments(sharedSegments, 0);
    const withoutSecond = selectDisplayCrossingClusterOtherSegments(sharedSegments, 1);
    const firstTwoHits = firstDisplayCrossingClusterStrictHits(sharedSegments);

    expect(sharedSegments).toEqual(originalSnapshot);
    expect(withoutFirst).toEqual(sharedSegments.filter(item => item.edgeIndex !== 0));
    expect(withoutSecond).toEqual(sharedSegments.filter(item => item.edgeIndex !== 1));
    expect(withoutFirst.every(item => sharedSegments.includes(item))).toBe(true);
    expect(withoutSecond.every(item => sharedSegments.includes(item))).toBe(true);
    expect(firstTwoHits).toEqual(findDisplayStrictCrossingHits(edges).slice(0, 2));
  });

  it('preserves the exact legacy path-signature text used for candidate ordering', () => {
    const path: DisplayPoint[] = [
      { x: 1.24, y: -0 },
      { x: -1.26, y: 2.05 },
      { x: 100.01, y: -3.04 },
    ];

    expect(displayCrossingClusterPathSignature(path)).toBe('12:0|-13:21|1000:-30');
    expect(displayCrossingClusterPathSignature([])).toBe('');
  });

  it('can move a small interacting edge cluster without weakening hard quality', () => {
    const nodes: Node[] = [
      node('n0', 100, 587, 420, 159),
      node('n1', 148, 1613, 332, 159),
      node('n2', 142, 2171, 336, 158),
      node('n3', 115, 2489, 390, 159),
      node('n4', 141, 2807, 338, 159),
      node('n5', 141, 1295, 347, 159),
    ];
    const edges: Edge[] = [
      edge('a', 'n0', 'n2', [
        { x: 310, y: 746 }, { x: 310, y: 842 }, { x: 508, y: 842 },
        { x: 508, y: 1998 }, { x: 334, y: 1998 }, { x: 334, y: 2171 },
      ]),
      edge('b', 'n1', 'n3', [
        { x: 476, y: 1772 }, { x: 476, y: 2003 }, { x: 500, y: 2003 },
        { x: 500, y: 2393 }, { x: 377, y: 2393 }, { x: 377, y: 2489 },
      ]),
      edge('c', 'n2', 'n5', [
        { x: 194, y: 2171 }, { x: 194, y: 1780 }, { x: 139, y: 1780 },
        { x: 139, y: 1454 }, { x: 314, y: 1454 },
      ]),
      edge('d', 'n0', 'n4', [
        { x: 310, y: 746 }, { x: 310, y: 842 }, { x: 514, y: 842 },
        { x: 514, y: 2710 }, { x: 310, y: 2710 }, { x: 310, y: 2807 },
      ]),
    ];
    const originalEdges = JSON.parse(JSON.stringify(edges)) as Edge[];
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const baselineObstacleHits = countDisplayObstacleHits(edges, nodes);

    const repaired = repairBoundedMultiEdgeResidualStrictCrossings(edges, nodes);
    const repairedQuality = calculateEdgePathQualityScore(repaired);

    expect(repaired).not.toBe(edges);
    expect(hasDisplayCrossingClusterFixedPoint(edges, nodes)).toBe(false);
    expect(edges).toEqual(originalEdges);
    expect(repairedQuality.strictCrossings).toBeLessThan(baselineQuality.strictCrossings);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(baselineQuality.unexplainedRelatedOverlap);
    expect(repairedQuality.shortEndpointStubs).toBeLessThanOrEqual(baselineQuality.shortEndpointStubs);
    expect(repairedQuality.tinyInteriorDoglegs).toBeLessThanOrEqual(baselineQuality.tinyInteriorDoglegs);
    expect(repairedQuality.hairpins).toBeLessThanOrEqual(baselineQuality.hairpins);
    expect(countDisplayObstacleHits(repaired, nodes)).toBeLessThanOrEqual(baselineObstacleHits);

    const materializedPortCandidates = repaired.filter((candidate, index) => (
      candidate !== edges[index]
      && (candidate.data as Record<string, unknown>)?.terminalPortBridgeRepaired === true
    ));
    expect(materializedPortCandidates.length).toBeGreaterThan(0);
    for (const candidate of materializedPortCandidates) {
      expect(['top', 'bottom', 'left', 'right']).toContain(candidate.sourceHandle);
      expect(['top', 'bottom', 'left', 'right']).toContain(candidate.targetHandle);
      const candidatePath = getDisplayComputedPath(candidate);
      expect(displayAxisOf(candidatePath[0], candidatePath[1])).toBe(
        candidate.sourceHandle === 'left' || candidate.sourceHandle === 'right' ? 'h' : 'v',
      );
      expect(displayAxisOf(
        candidatePath[candidatePath.length - 2],
        candidatePath[candidatePath.length - 1],
      )).toBe(candidate.targetHandle === 'left' || candidate.targetHandle === 'right' ? 'h' : 'v');
    }
  }, 15_000);

  it('does not enter bounded cluster search for graphs above the safety limit', () => {
    const nodes = Array.from({ length: 26 }, (_, index) => node(`n${index}`, index * 100, 0, 60, 40));
    const edges = Array.from({ length: 25 }, (_, index) => edge(
      `e${index}`,
      `n${index}`,
      `n${index + 1}`,
      [{ x: index * 100 + 60, y: 20 }, { x: (index + 1) * 100, y: 20 }],
    ));

    expect(repairBoundedMultiEdgeResidualStrictCrossings(edges, nodes)).toBe(edges);
  });
});

describe('display candidate interaction context', () => {
  it('matches the standalone strict-crossing and unrelated-overlap scorers exactly', () => {
    const edges: Edge[] = [
      edge('mover', 'm-source', 'm-target', [{ x: 0, y: 5 }, { x: 30, y: 5 }]),
      edge('horizontal', 'u1', 'u2', [{ x: 5, y: 5 }, { x: 25, y: 5 }]),
      edge('near-horizontal', 'u3', 'u4', [{ x: 0, y: 8 }, { x: 20, y: 8 }]),
      edge('related-horizontal', 'm-source', 'r1', [{ x: 3, y: 5 }, { x: 27, y: 5 }]),
      edge('target-related-horizontal', 'r2', 'm-target', [{ x: 4.25, y: 5 }, { x: 26.75, y: 5 }]),
      edge('vertical', 'u5', 'u6', [{ x: 10, y: -10 }, { x: 10, y: 30 }]),
      edge('crossing-horizontal', 'u7', 'u8', [{ x: -10, y: 15 }, { x: 30, y: 15 }]),
    ];
    const missingOtherEdgeSegment: DisplaySegment = {
      edgeIndex: 99,
      segmentIndex: 0,
      axis: 'v',
      direction: 1,
      a: { x: 20, y: -10 },
      b: { x: 20, y: 30 },
    };
    const otherSegments = [
      ...extractDisplaySegments(edges).filter(segment => segment.edgeIndex !== 0),
      missingOtherEdgeSegment,
    ];
    const context = createDisplayCandidateInteractionContext(0, edges, otherSegments);
    const candidatePaths: DisplayPoint[][] = [
      [{ x: 0, y: 5 }, { x: 30, y: 5 }],
      [{ x: 10, y: -20 }, { x: 10, y: 35 }],
      [{ x: 0, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 25 }, { x: 5, y: 25 }],
      [{ x: 9, y: 15 }, { x: 11, y: 15 }],
      [{ x: 4.5, y: 5 }, { x: 25.5, y: 5 }],
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    ];

    for (const candidatePath of candidatePaths) {
      expect(context.evaluate(candidatePath)).toEqual({
        strictCrossings: candidateStrictCrossingsForEdge(0, candidatePath, otherSegments),
        unrelatedOverlap: candidateUnrelatedOverlapForEdge(0, candidatePath, edges, otherSegments),
      });
    }
  });

  it('retains standalone missing-mover semantics', () => {
    const edges: Edge[] = [
      edge('vertical', 'a', 'b', [{ x: 10, y: -10 }, { x: 10, y: 30 }]),
    ];
    const otherSegments = extractDisplaySegments(edges);
    const candidatePath = [{ x: 0, y: 5 }, { x: 30, y: 5 }];
    const context = createDisplayCandidateInteractionContext(99, edges, otherSegments);

    expect(context.evaluate(candidatePath)).toEqual({
      strictCrossings: candidateStrictCrossingsForEdge(99, candidatePath, otherSegments),
      unrelatedOverlap: candidateUnrelatedOverlapForEdge(99, candidatePath, edges, otherSegments),
    });
  });

  it.each([
    {
      name: 'forward horizontal segments',
      path: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      otherSegments: [
        segment(1, 'h', { x: 5, y: 0 }, { x: 15, y: 0 }),
        segment(2, 'v', { x: 10, y: -10 }, { x: 10, y: 10 }),
      ],
      expected: { strictCrossings: 1, unrelatedOverlap: 10 },
    },
    {
      name: 'reverse horizontal segments',
      path: [{ x: 20, y: 0 }, { x: 0, y: 0 }],
      otherSegments: [
        segment(1, 'h', { x: 15, y: 0 }, { x: 5, y: 0 }),
        segment(2, 'v', { x: 10, y: 10 }, { x: 10, y: -10 }),
      ],
      expected: { strictCrossings: 1, unrelatedOverlap: 10 },
    },
    {
      name: 'forward vertical segments',
      path: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
      otherSegments: [
        segment(1, 'h', { x: -10, y: 0 }, { x: 10, y: 0 }),
        segment(2, 'v', { x: 0, y: -5 }, { x: 0, y: 5 }),
      ],
      expected: { strictCrossings: 1, unrelatedOverlap: 10 },
    },
    {
      name: 'reverse vertical segments',
      path: [{ x: 0, y: 10 }, { x: 0, y: -10 }],
      otherSegments: [
        segment(1, 'h', { x: 10, y: 0 }, { x: -10, y: 0 }),
        segment(2, 'v', { x: 0, y: 5 }, { x: 0, y: -5 }),
      ],
      expected: { strictCrossings: 1, unrelatedOverlap: 10 },
    },
    {
      name: 'the inclusive 0.5 axis and 4 lane thresholds',
      path: [{ x: 0, y: 0 }, { x: 10, y: 0.5 }],
      otherSegments: [
        segment(1, 'h', { x: 2, y: 4 }, { x: 8, y: 4 }),
        segment(1, 'h', { x: 2, y: 4.000001 }, { x: 8, y: 4.000001 }),
        segment(2, 'v', { x: 5, y: -10 }, { x: 5, y: 10 }),
      ],
      expected: { strictCrossings: 1, unrelatedOverlap: 6 },
    },
    {
      name: 'a segment outside the 0.5 axis threshold',
      path: [{ x: 0, y: 0 }, { x: 10, y: 0.500001 }],
      otherSegments: [
        segment(1, 'h', { x: 2, y: 0 }, { x: 8, y: 0 }),
        segment(2, 'v', { x: 5, y: -10 }, { x: 5, y: 10 }),
      ],
      expected: { strictCrossings: 0, unrelatedOverlap: 0 },
    },
    {
      name: 'a segment with exactly 0.5 axis length',
      path: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }],
      otherSegments: [segment(1, 'h', { x: 0, y: 0 }, { x: 1, y: 0 })],
      expected: { strictCrossings: 0, unrelatedOverlap: 0 },
    },
    {
      name: 'the open one-pixel strict-crossing boundaries',
      path: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      otherSegments: [
        segment(2, 'v', { x: 1, y: -10 }, { x: 1, y: 10 }, 0),
        segment(2, 'v', { x: 1.000001, y: -10 }, { x: 1.000001, y: 10 }, 1),
        segment(2, 'v', { x: 9, y: -10 }, { x: 9, y: 10 }, 2),
        segment(2, 'v', { x: 8.999999, y: -10 }, { x: 8.999999, y: 10 }, 3),
        segment(2, 'v', { x: 5, y: -1 }, { x: 5, y: 10 }, 4),
        segment(2, 'v', { x: 5, y: -10 }, { x: 5, y: 1 }, 5),
      ],
      expected: { strictCrossings: 2, unrelatedOverlap: 0 },
    },
    {
      name: 'decimal overlap at the inclusive lane threshold',
      path: [{ x: 0.25, y: 0 }, { x: 10.75, y: 0 }],
      otherSegments: [
        segment(1, 'h', { x: 5.5, y: 4 }, { x: 12.125, y: 4 }),
        segment(1, 'h', { x: 5.5, y: -4.000001 }, { x: 12.125, y: -4.000001 }),
      ],
      expected: { strictCrossings: 0, unrelatedOverlap: 5.25 },
    },
    {
      name: 'target-related, reverse-related, missing, and self segments',
      path: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      otherSegments: [
        segment(3, 'h', { x: 5, y: 0 }, { x: 15, y: 0 }),
        segment(4, 'h', { x: 3, y: 0 }, { x: 18, y: 0 }),
        segment(0, 'h', { x: 2, y: 0 }, { x: 19, y: 0 }),
        segment(99, 'h', { x: 0, y: 0 }, { x: 20, y: 0 }),
        segment(1, 'h', { x: 7.25, y: 0 }, { x: 11.75, y: 0 }),
        segment(3, 'v', { x: 10, y: -10 }, { x: 10, y: 10 }),
        segment(99, 'v', { x: 12, y: -10 }, { x: 12, y: 10 }),
        segment(0, 'v', { x: 14, y: -10 }, { x: 14, y: 10 }),
      ],
      expected: { strictCrossings: 3, unrelatedOverlap: 4.5 },
    },
    {
      name: 'non-orthogonal segments',
      path: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      otherSegments: [
        segment(1, 'h', { x: 0, y: 0 }, { x: 10, y: 0 }),
        segment(2, 'v', { x: 5, y: -10 }, { x: 5, y: 10 }),
      ],
      expected: { strictCrossings: 0, unrelatedOverlap: 0 },
    },
  ])('preserves standalone semantics for $name', ({ path, otherSegments, expected }) => {
    const edges: Edge[] = [
      edge('mover', 'm-source', 'm-target', [{ x: 0, y: 0 }, { x: 20, y: 0 }]),
      edge('unrelated-horizontal', 'u1', 'u2', [{ x: 0, y: 0 }, { x: 20, y: 0 }]),
      edge('unrelated-vertical', 'u3', 'u4', [{ x: 10, y: -10 }, { x: 10, y: 10 }]),
      edge('target-related', 'r1', 'm-target', [{ x: 0, y: 0 }, { x: 20, y: 0 }]),
      edge('reverse-related', 'm-target', 'r2', [{ x: 0, y: 0 }, { x: 20, y: 0 }]),
    ];
    const context = createDisplayCandidateInteractionContext(0, edges, otherSegments);
    const standalone = {
      strictCrossings: candidateStrictCrossingsForEdge(0, path, otherSegments),
      unrelatedOverlap: candidateUnrelatedOverlapForEdge(0, path, edges, otherSegments),
    };

    expect(context.evaluate(path)).toEqual(standalone);
    expect(standalone).toEqual(expected);
  });

  it('snapshots segment geometry and edge relationships at context creation', () => {
    const edges: Edge[] = [
      edge('mover', 'm-source', 'm-target', [{ x: 0, y: 0 }, { x: 20, y: 0 }]),
      edge('horizontal', 'u1', 'u2', [{ x: 5, y: 0 }, { x: 15, y: 0 }]),
      edge('vertical', 'u3', 'u4', [{ x: 10, y: -10 }, { x: 10, y: 10 }]),
    ];
    const otherSegments = extractDisplaySegments(edges).filter(segment => segment.edgeIndex !== 0);
    const candidatePath = [{ x: 0, y: 0 }, { x: 20, y: 0 }];
    const expected = {
      strictCrossings: candidateStrictCrossingsForEdge(0, candidatePath, otherSegments),
      unrelatedOverlap: candidateUnrelatedOverlapForEdge(0, candidatePath, edges, otherSegments),
    };
    const context = createDisplayCandidateInteractionContext(0, edges, otherSegments);

    edges[1].source = 'm-source';
    otherSegments[0].a.x = 100;
    otherSegments[0].b.x = 200;
    otherSegments.splice(1);

    expect(context.evaluate(candidatePath)).toEqual(expected);
    expect(expected).toEqual({ strictCrossings: 1, unrelatedOverlap: 10 });
  });
});
