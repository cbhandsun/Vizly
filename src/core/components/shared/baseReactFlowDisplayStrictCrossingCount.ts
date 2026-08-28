import type { Edge } from '@xyflow/react';

import {
  compactDisplayEdgePaths,
  getDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { countDisplayStrictCrossings } from './baseReactFlowDisplayEvaluation';

/**
 * Reuses the exact strict-crossing count already produced by a quality evaluation.
 * The display-specific fallback remains necessary when a computed path is
 * incomplete or render compaction changes its segment topology.
 */
export const displayStrictCrossingsFromKnownQuality = (
  edges: Edge[],
  quality: { strictCrossings: number },
  metrics?: { knownQualityStrictReuseCount: number },
): number => {
  if (
    edges.every(edge => getDisplayComputedPath(edge).length >= 2)
    && compactDisplayEdgePaths(edges) === edges
  ) {
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
