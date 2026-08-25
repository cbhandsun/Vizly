import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { createDetachedOverlapCandidateDedup } from '../edgeDetachedOverlapCandidateDedup';
import { createQualityEvaluationBudget } from '../edgeDetachedOverlapEvaluationCache';
import { createRoutingObstacleGate } from '../edgeDetachedObstacleGate';
import {
  calculateEdgePathQualityScore,
  type EdgePathQualityEvaluationContext,
} from '../edgeStrictCrossingGuard';

const candidateEdges = (sourceHandle = 'right'): Edge[] => [{
  id: 'edge-a',
  source: 'source',
  target: 'target',
  sourceHandle,
  targetHandle: 'left',
  data: {
    computedPath: [
      { x: 0, y: 40 },
      { x: 200, y: 40 },
    ],
  },
}];

const unusedStateEvaluation = (): never => {
  throw new Error('state evaluation is not used by this budget test');
};

describe('createQualityEvaluationBudget', () => {
  it('charges pruned exact duplicates without rebuilding their score', () => {
    const diagnostics = { evaluationCount: 0, cacheHitCount: 0 };
    const budget = createQualityEvaluationBudget(2, diagnostics);

    expect(budget.consumeCachedRequest()).toBe(true);
    expect(budget.exhausted()).toBe(false);
    expect(budget.consumeCachedRequest()).toBe(true);
    expect(budget.exhausted()).toBe(true);
    expect(budget.consumeCachedRequest()).toBe(false);
    expect(diagnostics).toEqual({ evaluationCount: 0, cacheHitCount: 2 });
  });

  it('builds the immutable obstacle evaluation context once per edge', () => {
    class CountingObstacleMap extends Map<string, { x: number; y: number; width: number; height: number }> {
      iterationCount = 0;

      override [Symbol.iterator](): MapIterator<[string, { x: number; y: number; width: number; height: number }]> {
        this.iterationCount += 1;
        return super[Symbol.iterator]();
      }
    }

    const obstacles = new CountingObstacleMap([
      ['business-node', { x: 80, y: 20, width: 40, height: 40 }],
    ]);
    const gate = createRoutingObstacleGate(candidateEdges(), obstacles);

    expect(gate(
      [[{ x: 0, y: 0 }, { x: 200, y: 0 }]],
      [[{ x: 0, y: 80 }, { x: 200, y: 80 }]],
      [0],
    )).toBe(true);
    expect(gate(
      [[{ x: 0, y: 100 }, { x: 200, y: 100 }]],
      [[{ x: 0, y: 120 }, { x: 200, y: 120 }]],
      [0],
    )).toBe(true);
    expect(obstacles.iterationCount).toBe(1);
  });

  it('reuses obstacle results for cloned exact candidate geometry', () => {
    const edges = candidateEdges();
    const diagnostics = { cacheHitCount: 0 };
    const gate = createRoutingObstacleGate(edges, new Map(), diagnostics);
    const path = [{ x: 0, y: 40 }, { x: 200, y: 40 }];
    const clone = () => path.map(point => ({ ...point }));

    expect(gate([clone()], [clone()], [0])).toBe(true);
    expect(diagnostics.cacheHitCount).toBe(1);
    expect(gate([clone()], [clone()], [0])).toBe(true);
    expect(diagnostics.cacheHitCount).toBe(3);
  });

  it('reuses an exact incremental score while still charging every request to the budget', () => {
    const edges = candidateEdges();
    const score = calculateEdgePathQualityScore(edges);
    const evaluateChanged = vi.fn(() => score);
    const context: EdgePathQualityEvaluationContext = {
      createState: unusedStateEvaluation,
      evaluate: vi.fn(() => score),
      evaluateChanged,
      evaluateStateChanged: unusedStateEvaluation,
    };
    const diagnostics = { evaluationCount: 99, cacheHitCount: 99 };
    const budget = createQualityEvaluationBudget(2, diagnostics);

    expect(budget.evaluateChanged(edges, context, [0])).toBe(score);
    expect(budget.evaluateChanged(edges, context, [0])).toBe(score);
    expect(evaluateChanged).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual({ evaluationCount: 1, cacheHitCount: 1 });
    expect(budget.exhausted()).toBe(true);
    expect(budget.evaluateChanged(edges, context, [0])).toBeNull();
  });

  it('does not share scores across port, path, or baseline-context changes', () => {
    const first = candidateEdges('right');
    const changedPort = candidateEdges('left');
    const changedPath = candidateEdges('right');
    (changedPath[0].data as any).computedPath = [
      { x: 0, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 80 },
      { x: 200, y: 80 },
    ];
    const score = calculateEdgePathQualityScore(first);
    const firstEvaluateChanged = vi.fn(() => score);
    const secondEvaluateChanged = vi.fn(() => score);
    const firstContext: EdgePathQualityEvaluationContext = {
      createState: unusedStateEvaluation,
      evaluate: vi.fn(() => score),
      evaluateChanged: firstEvaluateChanged,
      evaluateStateChanged: unusedStateEvaluation,
    };
    const secondContext: EdgePathQualityEvaluationContext = {
      createState: unusedStateEvaluation,
      evaluate: vi.fn(() => score),
      evaluateChanged: secondEvaluateChanged,
      evaluateStateChanged: unusedStateEvaluation,
    };
    const budget = createQualityEvaluationBudget(4);

    expect(budget.evaluateChanged(first, firstContext, [0])).toBe(score);
    expect(budget.evaluateChanged(changedPort, firstContext, [0])).toBe(score);
    expect(budget.evaluateChanged(changedPath, firstContext, [0])).toBe(score);
    expect(budget.evaluateChanged(first, secondContext, [0])).toBe(score);
    expect(firstEvaluateChanged).toHaveBeenCalledTimes(3);
    expect(secondEvaluateChanged).toHaveBeenCalledTimes(1);
  });

  it('invalidates the incremental cache when shared-trunk quality intent changes', () => {
    const first = candidateEdges();
    const intentChanged = candidateEdges();
    (intentChanged[0].data as any).sharedTrunkAware = true;
    const score = calculateEdgePathQualityScore(first);
    const evaluateChanged = vi.fn(() => score);
    const context: EdgePathQualityEvaluationContext = {
      createState: unusedStateEvaluation,
      evaluate: vi.fn(() => score),
      evaluateChanged,
      evaluateStateChanged: unusedStateEvaluation,
    };
    const budget = createQualityEvaluationBudget(2);

    expect(budget.evaluateChanged(first, context, [0])).toBe(score);
    expect(budget.evaluateChanged(intentChanged, context, [0])).toBe(score);
    expect(evaluateChanged).toHaveBeenCalledTimes(2);
  });
});

describe('createDetachedOverlapCandidateDedup', () => {
  it('deduplicates exact changed geometry while keeping search variants isolated', () => {
    const score = { value: 1 };
    const dedup = createDetachedOverlapCandidateDedup<typeof score>();
    const evaluateObstacle = vi.fn(() => true);
    const evaluateQuality = vi.fn(() => score);
    const consumeCachedRequest = vi.fn(() => true);
    const paths = [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 20, y: 20 }, { x: 20, y: 120 }],
    ];
    const clone = paths.map(path => path.map(point => ({ ...point })));

    expect(dedup.evaluate(
      paths,
      [1, 0],
      'regular',
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    )).toEqual({ obstacleAccepted: true, quality: score });
    expect(dedup.evaluate(
      clone,
      [0, 1],
      'regular',
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    )).toEqual({ obstacleAccepted: true, quality: score });
    expect(dedup.evaluate(
      clone,
      [1, 0],
      'narrow',
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    )).toEqual({ obstacleAccepted: true, quality: score });
    expect(evaluateObstacle).toHaveBeenCalledTimes(2);
    expect(evaluateQuality).toHaveBeenCalledTimes(2);
    expect(consumeCachedRequest).toHaveBeenCalledTimes(1);
  });

  it('fails open for non-finite geometry', () => {
    const dedup = createDetachedOverlapCandidateDedup<{ value: number }>();
    const evaluateObstacle = vi.fn(() => false);
    const evaluateQuality = vi.fn(() => ({ value: 1 }));
    const consumeCachedRequest = vi.fn(() => true);
    const paths = [[{ x: Number.NaN, y: 0 }, { x: 100, y: 0 }]];

    expect(dedup.evaluate(
      paths,
      [0],
      'regular',
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    )).toEqual({ obstacleAccepted: false, quality: null });
    expect(dedup.evaluate(
      paths,
      [0],
      'regular',
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    )).toEqual({ obstacleAccepted: false, quality: null });
    expect(evaluateObstacle).toHaveBeenCalledTimes(2);
    expect(evaluateQuality).not.toHaveBeenCalled();
    expect(consumeCachedRequest).not.toHaveBeenCalled();
  });

  it('reuses an exact obstacle rejection without charging the quality budget', () => {
    const dedup = createDetachedOverlapCandidateDedup<{ value: number }>();
    const evaluateObstacle = vi.fn(() => false);
    const evaluateQuality = vi.fn(() => ({ value: 1 }));
    const consumeCachedRequest = vi.fn(() => true);
    const paths = [[{ x: 0, y: 0 }, { x: 100, y: 0 }]];
    const evaluate = () => dedup.evaluate(
      paths,
      [0],
      'regular',
      evaluateObstacle,
      evaluateQuality,
      consumeCachedRequest,
    );

    expect(evaluate()).toEqual({ obstacleAccepted: false, quality: null });
    expect(evaluate()).toEqual({ obstacleAccepted: false, quality: null });
    expect(evaluateObstacle).toHaveBeenCalledTimes(1);
    expect(evaluateQuality).not.toHaveBeenCalled();
    expect(consumeCachedRequest).not.toHaveBeenCalled();
  });
});
