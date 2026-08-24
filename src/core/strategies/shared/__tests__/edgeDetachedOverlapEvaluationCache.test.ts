import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

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
