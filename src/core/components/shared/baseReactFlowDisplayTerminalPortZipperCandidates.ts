import type { Edge } from '@xyflow/react';

import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { buildStrictCrossingZipperCandidates } from './baseReactFlowStrictCrossingZipperRepair';
import {
  displayAxisOf,
  getDisplayComputedPath,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

export const buildSingleEdgeZipperCandidates = <T extends Edge[]>(
  edges: T,
  moverEdgeIndex: number,
  maxCandidates = 4,
): T[] => {
  const paths = edges.map(edge => getDisplayComputedPath(edge));
  const crossings = findStrictCrossings(paths, edges)
    .filter(crossing => (
      crossing.a.edgeIndex === moverEdgeIndex || crossing.b.edgeIndex === moverEdgeIndex
    ));
  const candidates: T[] = [];

  for (const crossing of crossings) {
    const segment = crossing.a.edgeIndex === moverEdgeIndex ? crossing.a : crossing.b;
    const other = crossing.a.edgeIndex === moverEdgeIndex ? crossing.b : crossing.a;
    const path = paths[moverEdgeIndex];
    if (
      !path
      || segment.axis === other.axis
      || segment.segIdx <= 0
      || segment.segIdx >= path.length - 2
    ) continue;
    const blockers = paths.flatMap((blockerPath, edgeIndex) => {
      if (edgeIndex === moverEdgeIndex || blockerPath.length < 2) return [];
      return blockerPath.slice(0, -1).flatMap((point, segmentIndex) => {
        const next = blockerPath[segmentIndex + 1];
        const axis = displayAxisOf(point, next);
        if (!axis || axis === segment.axis) return [];
        return [{
          path: blockerPath,
          segment: { segmentIndex, axis, a: point, b: next },
        }];
      });
    });
    for (const candidatePath of buildStrictCrossingZipperCandidates(
      path,
      {
        segmentIndex: segment.segIdx,
        axis: segment.axis,
        a: segment.a,
        b: segment.b,
      },
      blockers,
    )) {
      candidates.push(edges.map((edge, edgeIndex) => (
        edgeIndex === moverEdgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
      )) as T);
      if (candidates.length >= maxCandidates) return candidates;
    }
  }
  return candidates;
};
