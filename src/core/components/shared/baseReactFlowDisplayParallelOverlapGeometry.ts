import type { Edge } from '@xyflow/react';

import {
  displayEdgesRelated,
  displaySegmentOverlap,
  extractDisplaySegments,
  getDisplayComputedPath,
  isProtectedDisplaySharedTrunkPair,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

export interface DisplayExactThresholdResidualPair {
  first: DisplaySegment;
  second: DisplaySegment;
  overlap: number;
}

/**
 * Collects visible collinear overlap pairs independently from any repair
 * strategy. Keeping this geometry-only prevents candidate builders and
 * transaction evaluators from depending on one another.
 */
export const collectExactThresholdResidualPairs = (
  edges: Edge[],
): DisplayExactThresholdResidualPair[] => {
  const segments = extractDisplaySegments(edges);
  const paths = edges.map(getDisplayComputedPath);
  const pairs: DisplayExactThresholdResidualPair[] = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      const related = displayEdgesRelated(edges[first.edgeIndex], edges[second.edgeIndex]);
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      const protectedSharedTrunk = related && isProtectedDisplaySharedTrunkPair(
        first,
        paths[first.edgeIndex],
        edges[first.edgeIndex],
        second,
        paths[second.edgeIndex],
        edges[second.edgeIndex],
      );
      if (!oppositeDirection && protectedSharedTrunk) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap < 24) continue;
      pairs.push({ first, second, overlap });
    }
  }
  return pairs.toSorted((first, second) => second.overlap - first.overlap);
};
