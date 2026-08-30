import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { withBusinessNodeClearancePath } from '../edgeBusinessNodeClearanceCandidateCommit';
import { selectAcceptedBusinessNodeClearanceCandidate } from '../edgeBusinessNodeClearanceCandidateSelection';
import { createEdgePathQualityEvaluationContext } from '../edgeStrictCrossingGuard';

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
  it('commits the first quality-safe candidate accepted by the exact gate', () => {
    const baseline = [edgeWithPath([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
    ])];
    const qualityContext = createEdgePathQualityEvaluationContext(baseline);
    const validateCandidate = vi.fn(() => true);

    const selected = selectAcceptedBusinessNodeClearanceCandidate({
      allowTransientStrictCrossing: false,
      baselineEdges: baseline,
      baselineQuality: qualityContext.evaluate(baseline),
      edge: baseline[0],
      edgeIndex: 0,
      qualityContext,
      rankedCandidates: [{ candidate: [
        { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 },
      ] }],
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
      baselineQuality: qualityContext.evaluate(baseline),
      edge: baseline[0],
      edgeIndex: 0,
      qualityContext,
      rankedCandidates: [{ candidate: [
        { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 },
      ] }],
      validateCandidate: () => false,
    })).toBeNull();
  });
});
