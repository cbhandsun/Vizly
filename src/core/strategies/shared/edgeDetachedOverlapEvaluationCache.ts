import type { Edge } from '@xyflow/react';

import {
  calculateEdgePathQualityScore,
  type EdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';
import { edgeRoutingQualityIntentToken } from './edgeRoutingQualityIntent';
import { getEdgePath, type Point } from './edgeDetachedOverlapCandidates';

export type QualityEvaluationBudget = {
  exhausted: () => boolean;
  evaluate: (candidateEdges: Edge[]) => EdgePathQualityScore | null;
  evaluateChanged: (
    candidateEdges: Edge[],
    context: EdgePathQualityEvaluationContext,
    changedIndexes: readonly number[],
  ) => EdgePathQualityScore | null;
};

const pathSignature = (path: readonly Point[]): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

const changedEdgesSignature = (
  candidateEdges: Edge[],
  changedIndexes: readonly number[],
): string => changedIndexes
  .map(index => {
    const edge = candidateEdges[index];
    if (!edge) return `${index}:missing`;
    const ports = `${String(edge.sourceHandle ?? '')}>${String(edge.targetHandle ?? '')}`;
    const qualityIntent = edgeRoutingQualityIntentToken(edge);
    return `${index}:${edge.source}>${edge.target}:${ports}:${qualityIntent}:${pathSignature(getEdgePath(edge))}`;
  })
  .join('||');

/**
 * Caches exact incremental scores inside one baseline context while preserving the
 * public evaluation budget: cache hits still consume one requested evaluation.
 */
export function createQualityEvaluationBudget(maxQualityEvaluations: number): QualityEvaluationBudget {
  let qualityEvaluations = 0;
  const incrementalQualityCache = new WeakMap<
    EdgePathQualityEvaluationContext,
    Map<string, EdgePathQualityScore>
  >();

  return {
    exhausted: () => qualityEvaluations >= maxQualityEvaluations,
    evaluate: (candidateEdges) => {
      if (qualityEvaluations >= maxQualityEvaluations) return null;
      qualityEvaluations += 1;
      return calculateEdgePathQualityScore(candidateEdges);
    },
    evaluateChanged: (candidateEdges, context, changedIndexes) => {
      if (qualityEvaluations >= maxQualityEvaluations) return null;
      qualityEvaluations += 1;
      let contextCache = incrementalQualityCache.get(context);
      if (!contextCache) {
        contextCache = new Map<string, EdgePathQualityScore>();
        incrementalQualityCache.set(context, contextCache);
      }
      const cacheKey = changedEdgesSignature(candidateEdges, changedIndexes);
      const cached = contextCache.get(cacheKey);
      if (cached) return cached;
      const score = context.evaluateChanged(candidateEdges, changedIndexes);
      contextCache.set(cacheKey, score);
      return score;
    },
  };
}
