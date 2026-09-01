import type { Edge } from '@xyflow/react';

import type { PathSegmentRef, Point } from './edgeDetachedOverlapGeometry';

export const edgesWithPaths = (
  edges: Edge[],
  paths: Point[][],
  changedIndexes?: readonly number[],
): Edge[] => {
  if (!changedIndexes) {
    return edges.map((edge, index) => ({
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: paths[index],
      },
    }));
  }
  const result = edges.slice();
  for (const index of new Set(changedIndexes)) {
    const edge = edges[index];
    if (!edge || !paths[index]) continue;
    result[index] = {
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: paths[index],
      },
    };
  }
  return result;
};

export const groupDetachedSegmentsByEdgeIndex = (
  segments: readonly PathSegmentRef[],
): ReadonlyMap<number, PathSegmentRef[]> => {
  const grouped = new Map<number, PathSegmentRef[]>();
  for (const segment of segments) {
    const edgeSegments = grouped.get(segment.edgeIndex);
    if (edgeSegments) edgeSegments.push(segment);
    else grouped.set(segment.edgeIndex, [segment]);
  }
  return grouped;
};

export const replaceDetachedPathAtIndex = (
  paths: Point[][],
  edgeIndex: number,
  candidatePath: Point[],
): Point[][] => {
  const candidatePaths = paths.slice();
  candidatePaths[edgeIndex] = candidatePath;
  return candidatePaths;
};
