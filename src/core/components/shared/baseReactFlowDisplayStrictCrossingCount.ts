import type { Edge } from '@xyflow/react';

import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { countDisplayStrictCrossings } from './baseReactFlowDisplayEvaluation';

/**
 * Reuses the exact strict-crossing count already produced by a quality evaluation.
 * The display-specific fallback is only needed while an edge still lacks a full
 * computed path, because that compatibility path derives display segments itself.
 */
export const displayStrictCrossingsFromKnownQuality = (
  edges: Edge[],
  quality: { strictCrossings: number },
  metrics?: { knownQualityStrictReuseCount: number },
): number => {
  if (edges.every(edge => getDisplayComputedPath(edge).length >= 2)) {
    if (metrics) metrics.knownQualityStrictReuseCount += 1;
    return quality.strictCrossings;
  }
  return countDisplayStrictCrossings(edges);
};

export const createDisplayStrictCrossingCounter = (
  metrics?: { knownQualityStrictReuseCount: number },
) => (
  edges: Edge[],
  quality: { strictCrossings: number },
): number => displayStrictCrossingsFromKnownQuality(edges, quality, metrics);
