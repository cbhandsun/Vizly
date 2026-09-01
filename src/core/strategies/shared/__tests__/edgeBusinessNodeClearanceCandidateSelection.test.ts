import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { withBusinessNodeClearancePath } from '../edgeBusinessNodeClearanceCandidateCommit';
import { selectAcceptedBusinessNodeClearanceCandidate } from '../edgeBusinessNodeClearanceCandidateSelection';
import { createEdgePathQualityEvaluationContext } from '../edgeStrictCrossingGuard';
import { createRoutingObstacleEvaluationContext } from '../edgeRoutingObstacleEvaluation';

const edgeWithPath = (computedPath: Array<{ x: number; y: number }>): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  data: {
    computedPath,
    treeRouting: { points: computedPath, preserved: true },
  },
});

describe('business-node clearance candidate commit', () => {
  it('updates computed and tree paths without mutating the baseline edge', () => {
    const originalPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const nextPath = [{ x: 0, y: 0 }, { x: 120, y: 0 }];
    const edge = edgeWithPath(originalPath);

    const repaired = withBusinessNodeClearancePath(edge, nextPath);

    expect(repaired).not.toBe(edge);
    expect(repaired.data?.computedPath).toBe(nextPath);
    expect(repaired.data?.treeRouting).toEqual({ points: nextPath, preserved: true });
    expect(edge.data?.computedPath).toBe(originalPath);
  });
});

describe('business-node clearance candidate selection', () => {
  const safePath = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }];
  const unsafePath = [
    { x: 0, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 180 },
    { x: 200, y: 180 }, { x: 200, y: 100 },
  ];
  const terminals = new Map([
    ['source', { x: -40, y: -20, width: 40, height: 40 }],
    ['target', { x: 180, y: 100, width: 40, height: 40 }],
  ]);

  it.each([false, true])('rejects terminal traversal before consulting the caller gate (dirty baseline: %s)', dirty => {
    const baseline = [edgeWithPath(dirty ? unsafePath : safePath)];
    const qualityContext = createEdgePathQualityEvaluationContext(baseline);
    const obstacleContext = createRoutingObstacleEvaluationContext(baseline[0], terminals);
    const validateCandidate = vi.fn(() => true);
    const selected = selectAcceptedBusinessNodeClearanceCandidate({
      allowTransientStrictCrossing: false, baselineEdges: baseline,
      baselineObstacleHits: 0,
      baselineQuality: qualityContext.evaluate(baseline), edge: baseline[0], edgeIndex: 0,
      obstacleContext, qualityContext,
      rankedCandidates: (dirty ? [safePath] : [unsafePath, safePath])
        .map(candidate => ({ candidate, hits: 0 })),
      validateCandidate,
    });
    expect(selected?.[0].data?.computedPath).toEqual(safePath);
    expect(validateCandidate).toHaveBeenCalledOnce();
    expect(baseline[0].data?.computedPath).toEqual(dirty ? unsafePath : safePath);
  });

  it.each([{ paths: [] }, { paths: [unsafePath] }])('returns no candidate when the pool is empty or only traverses a terminal', ({ paths }) => {
    const baseline = [edgeWithPath(safePath)];
    const qualityContext = createEdgePathQualityEvaluationContext(baseline);
    const validateCandidate = vi.fn(() => true);
    expect(selectAcceptedBusinessNodeClearanceCandidate({
      allowTransientStrictCrossing: false, baselineEdges: baseline,
      baselineObstacleHits: 0,
      baselineQuality: qualityContext.evaluate(baseline), edge: baseline[0], edgeIndex: 0,
      obstacleContext: createRoutingObstacleEvaluationContext(baseline[0], terminals), qualityContext,
      rankedCandidates: paths.map(candidate => ({ candidate, hits: 0 })), validateCandidate,
    })).toBeNull();
    expect(validateCandidate).not.toHaveBeenCalled();
  });

  it('commits the first quality-safe candidate accepted by the exact gate', () => {
    const baseline = [edgeWithPath([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
    ])];
    const qualityContext = createEdgePathQualityEvaluationContext(baseline);
    const validateCandidate = vi.fn(() => true);

    const selected = selectAcceptedBusinessNodeClearanceCandidate({
      allowTransientStrictCrossing: false,
      baselineEdges: baseline,
      baselineObstacleHits: 0,
      baselineQuality: qualityContext.evaluate(baseline),
      edge: baseline[0],
      edgeIndex: 0,
      obstacleContext: createRoutingObstacleEvaluationContext(baseline[0], new Map()),
      qualityContext,
      rankedCandidates: [{ candidate: [
        { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 },
      ], hits: 0 }],
      validateCandidate,
    });

    expect(selected).not.toBeNull();
    expect(selected?.[0]).not.toBe(baseline[0]);
    expect(validateCandidate).toHaveBeenCalledOnce();
  });

  it('returns null when the exact gate rejects every candidate', () => {
    const baseline = [edgeWithPath([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
    ])];
    const qualityContext = createEdgePathQualityEvaluationContext(baseline);

    expect(selectAcceptedBusinessNodeClearanceCandidate({
      allowTransientStrictCrossing: false,
      baselineEdges: baseline,
      baselineObstacleHits: 0,
      baselineQuality: qualityContext.evaluate(baseline),
      edge: baseline[0],
      edgeIndex: 0,
      obstacleContext: createRoutingObstacleEvaluationContext(baseline[0], new Map()),
      qualityContext,
      rankedCandidates: [{ candidate: [
        { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 },
      ], hits: 0 }],
      validateCandidate: () => false,
    })).toBeNull();
  });
});
