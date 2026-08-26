import type { Edge } from '@xyflow/react';

import {
  displayAxisOf,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  shiftDisplayInternalSegment,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const MAX_TOPOLOGY_STRICT_HITS = 8;
const MAX_TOPOLOGY_STRICT_TRANSACTION_CANDIDATES = 32;

const rangesOverlap = (
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean => Math.max(
  Math.min(firstStart, firstEnd),
  Math.min(secondStart, secondEnd),
) <= Math.min(
  Math.max(firstStart, firstEnd),
  Math.max(secondStart, secondEnd),
) + 1;

const segmentsOverlapAlongAxis = (
  first: DisplaySegment,
  secondStart: DisplayPoint,
  secondEnd: DisplayPoint,
): boolean => first.axis === 'v'
  ? rangesOverlap(first.a.y, first.b.y, secondStart.y, secondEnd.y)
  : rangesOverlap(first.a.x, first.b.x, secondStart.x, secondEnd.x);

const alignedLaneValues = (
  edges: Edge[],
  moverIndex: number,
  segment: DisplaySegment,
): number[] => {
  const mover = edges[moverIndex];
  if (!mover) return [];
  const related = edges
    .flatMap((edge, edgeIndex) => edgeIndex === moverIndex ? [] : [{
      edge,
      relationRank: edge.target === mover.target ? 0 : edge.source === mover.source ? 1 : 2,
    }])
    .filter(item => item.relationRank < 2)
    .sort((first, second) => (
      first.relationRank - second.relationRank
      || first.edge.id.localeCompare(second.edge.id)
    ));
  const laneValues: number[] = [];
  for (const { edge } of related) {
    const path = getDisplayComputedPath(edge);
    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      const start = path[segmentIndex];
      const end = path[segmentIndex + 1];
      if (
        !start
        || !end
        || displayAxisOf(start, end) !== segment.axis
        || !segmentsOverlapAlongAxis(segment, start, end)
      ) continue;
      const lane = segment.axis === 'v' ? start.x : start.y;
      if (
        !Number.isFinite(lane)
        || Math.abs(lane - (segment.axis === 'v' ? segment.a.x : segment.a.y)) <= 1
      ) continue;
      laneValues.push(lane);
    }
  }
  return [...new Set(laneValues)].slice(0, 16);
};

/**
 * Aligns only a promoted crossing edge with a trusted same-target/source trunk.
 * The changed edge and every terminal handle remain untouched. Callers retain
 * ownership of boundary, exact hard, commercial-clearance, and final gates.
 */
export const buildBaseReactFlowTopologyStrictTransactionCandidates = <T extends Edge[]>({
  edges,
  changedEdgeIds,
  promotedEdgeIds,
}: {
  edges: T;
  changedEdgeIds: ReadonlySet<string>;
  promotedEdgeIds: ReadonlySet<string>;
}): T[] => {
  if (changedEdgeIds.size === 0 || promotedEdgeIds.size === 0) return [];
  const candidates: T[] = [];
  const seen = new Set<string>();
  for (const hit of findDisplayStrictCrossingHits(edges).slice(0, MAX_TOPOLOGY_STRICT_HITS)) {
    for (const [mover, opposite] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
      const moverEdge = edges[mover.edgeIndex];
      const oppositeEdge = edges[opposite.edgeIndex];
      const path = moverEdge ? getDisplayComputedPath(moverEdge) : [];
      if (
        !moverEdge
        || !oppositeEdge
        || !promotedEdgeIds.has(moverEdge.id)
        || !changedEdgeIds.has(oppositeEdge.id)
        || mover.segmentIndex <= 0
        || mover.segmentIndex >= path.length - 2
      ) continue;
      for (const lane of alignedLaneValues(edges, mover.edgeIndex, mover)) {
        const shiftedPath = shiftDisplayInternalSegment(
          path,
          mover.segmentIndex,
          mover.axis,
          lane,
        );
        if (!shiftedPath) continue;
        const signature = `${moverEdge.id}:${mover.segmentIndex}:${mover.axis}:${lane}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        candidates.push(edges.map((edge, edgeIndex) => (
          edgeIndex === mover.edgeIndex
            ? withDisplayComputedPath(edge, shiftedPath)
            : edge
        )) as T);
        if (candidates.length >= MAX_TOPOLOGY_STRICT_TRANSACTION_CANDIDATES) {
          return candidates;
        }
      }
    }
  }
  return candidates;
};
