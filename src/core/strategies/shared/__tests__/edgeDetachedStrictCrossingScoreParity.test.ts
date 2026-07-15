import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createDetachedOverlapStateEvaluationContext,
  scoreDetachedOverlapState,
  type Point,
} from '../edgeDetachedOverlapRepair';
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
});

describe('detached strict-crossing incremental score parity', () => {
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

  it('does not construct the detached scorer when a strict reduction has no equal-strict tie', () => {
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
    expect(countStrictEdgeCrossings(repaired)).toBe(0);
    expect(createScoreContext).not.toHaveBeenCalled();
  });
});
