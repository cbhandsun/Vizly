import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { compareEdgePathQualityScores, emptyScore } from '../edgePathQualityGeometry';
import { calculateEdgePathQualityScoreExact } from '../edgePathQualityFullScan';
import {
  calculateEdgePathQualityScore, countStrictEdgeCrossings, createEdgePathQualityEvaluationContext,
} from '../edgeStrictCrossingGuard';

const edge = (id: string, points: Array<{ x: number; y: number }>): Edge => ({
  id, source: `${id}-source`, target: `${id}-target`, data: { computedPath: points },
});
const crossing = (x = 50): Edge[] => [
  edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
  edge('vertical', [{ x, y: 0 }, { x, y: 100 }]),
];

describe('balanced crossing quality', () => {
  it('retains ordinary crossings without requiring a magic data flag', () => {
    const score = calculateEdgePathQualityScore(crossing());
    expect(score).toMatchObject({ strictCrossings: 0, bridgedCrossings: 1, bends: 0 });
  });

  it('keeps cold, warm, exact and incremental counts consistent through route changes', () => {
    const initial = crossing();
    expect(countStrictEdgeCrossings(initial)).toBe(0);
    const context = createEdgePathQualityEvaluationContext(initial);
    for (const x of [1, 50, 24, 99, 200, 50]) {
      const candidate = [initial[0], crossing(x)[1]];
      const exact = calculateEdgePathQualityScoreExact(candidate);
      expect(countStrictEdgeCrossings(candidate)).toBe(exact.strictCrossings);
      expect(context.evaluateChanged(candidate, [1])).toEqual(exact);
      expect(calculateEdgePathQualityScore(candidate)).toEqual(exact);
      expect(countStrictEdgeCrossings(candidate)).toBe(exact.strictCrossings);
      expect(exact.strictCrossings + (exact.bridgedCrossings ?? 0)).toBe(x < 100 ? 1 : 0);
    }
  });

  it('assigns higher readability cost to crossings among adjacent branches', () => {
    const edges = crossing();
    edges[1].source = edges[0].source;
    expect(calculateEdgePathQualityScore(edges)).toMatchObject({
      strictCrossings: 0, bridgedCrossings: 1, crossingCost: 7,
    });
    expect(countStrictEdgeCrossings(edges)).toBe(0);
  });

  it('prefers a clear crossing over a long detour but fewer crossings for comparable paths', () => {
    const direct = { ...emptyScore(), bridgedCrossings: 1, totalLength: 100 };
    const detour = { ...emptyScore(), bends: 2, totalLength: 300 };
    expect(compareEdgePathQualityScores(direct, detour)).toBeLessThan(0);
    expect(compareEdgePathQualityScores(direct, { ...direct, bridgedCrossings: 2 })).toBeLessThan(0);
    expect(compareEdgePathQualityScores({ ...direct, unrelatedOverlap: 50 }, detour)).toBeGreaterThan(0);
  });

  it('uses related lane sharing only after primary readability ties', () => {
    const bundled = { ...emptyScore(), relatedOverlap: 360, totalLength: 200 };
    const longerSeparated = { ...emptyScore(), bends: 1, relatedOverlap: 0, totalLength: 260 };
    const tiedSeparated = { ...emptyScore(), relatedOverlap: 0, totalLength: 200 };

    expect(compareEdgePathQualityScores(bundled, longerSeparated)).toBeLessThan(0);
    expect(compareEdgePathQualityScores(bundled, tiedSeparated)).toBeGreaterThan(0);
    expect(compareEdgePathQualityScores({ ...bundled, unrelatedOverlap: 1 }, tiedSeparated)).toBeGreaterThan(0);
  });
});
