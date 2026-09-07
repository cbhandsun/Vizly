import {
  displayStrictCrossesHorizontal,
  displayStrictCrossesVertical,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { firstDisplayCrossingClusterStrictHits } from './baseReactFlowDisplayCrossingClusterGeometry';
import { DISPLAY_CROSSING_CLUSTER_MAX_EDGES, resolveDisplayCrossingClusterCandidateBudget } from './baseReactFlowDisplayCrossingClusterBudget';

const isFiniteSegment = (segment: DisplaySegment): boolean => (
  Number.isSafeInteger(segment.edgeIndex)
  && segment.edgeIndex >= 0
  && Number.isFinite(segment.segmentIndex)
  && Number.isFinite(segment.direction)
  && (segment.axis === 'h' || segment.axis === 'v')
  && Number.isFinite(segment.a.x)
  && Number.isFinite(segment.a.y)
  && Number.isFinite(segment.b.x)
  && Number.isFinite(segment.b.y)
);

const strictlyCrosses = (first: DisplaySegment, second: DisplaySegment): boolean => {
  if (
    !isFiniteSegment(first)
    || !isFiniteSegment(second)
    || first.edgeIndex === second.edgeIndex
    || first.axis === second.axis
  ) return false;
  return first.axis === 'h'
    ? displayStrictCrossesHorizontal(first.a, first.b, second)
    : displayStrictCrossesVertical(first.a, first.b, second);
};

/**
 * Finds the edge component rooted at the first strict crossing, without
 * constructing a graph of every possible segment pair.
 */
export const selectDisplayCrossingClusterScope = (
  segments: readonly DisplaySegment[],
  maxEdges: number,
): number[] => {
  if (!Number.isSafeInteger(maxEdges) || maxEdges <= 0) return [];

  let seed: readonly [DisplaySegment, DisplaySegment] | null = null;
  for (let firstIndex = 0; firstIndex < segments.length && !seed; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      if (!strictlyCrosses(segments[firstIndex], segments[secondIndex])) continue;
      seed = [segments[firstIndex], segments[secondIndex]];
      break;
    }
  }
  if (!seed) return [];

  const edgeIndexes = new Set<number>([seed[0].edgeIndex, seed[1].edgeIndex]);
  if (edgeIndexes.size > maxEdges) return [];

  const pendingEdges = [...edgeIndexes];
  for (let cursor = 0; cursor < pendingEdges.length; cursor += 1) {
    const currentEdgeIndex = pendingEdges[cursor];
    for (const segment of segments) {
      if (segment.edgeIndex !== currentEdgeIndex || !isFiniteSegment(segment)) continue;
      for (const other of segments) {
        if (edgeIndexes.has(other.edgeIndex) || !strictlyCrosses(segment, other)) continue;
        edgeIndexes.add(other.edgeIndex);
        if (edgeIndexes.size > maxEdges) return [];
        pendingEdges.push(other.edgeIndex);
      }
    }
  }
  return [...edgeIndexes].sort((first, second) => first - second);
};

/** Keeps the local search budget separate from the full collision context. */
export const resolveDisplayCrossingClusterSearch = (
  segments: readonly DisplaySegment[],
  edgeCount: number,
) => {
  const scope = edgeCount > DISPLAY_CROSSING_CLUSTER_MAX_EDGES
    ? selectDisplayCrossingClusterScope(segments, DISPLAY_CROSSING_CLUSTER_MAX_EDGES)
    : null;
  const budget = resolveDisplayCrossingClusterCandidateBudget(scope?.length ?? edgeCount);
  if (!budget) return null;
  const indexes = scope ? new Set(scope) : null;
  return {
    budget,
    hits: firstDisplayCrossingClusterStrictHits(indexes
      ? segments.filter(segment => indexes.has(segment.edgeIndex))
      : segments),
  };
};
