import type { Edge, Node } from '@xyflow/react';
import type { DisplaySegment } from './baseReactFlowDisplayGeometry';
import { resolveDisplayCrossingClusterSearch } from './baseReactFlowDisplayCrossingClusterScope';
import { buildDisplaySegmentMazeCandidate } from './baseReactFlowDisplaySegmentMazeCandidate';

/** Per-search lazy alternatives, limited to the first two baseline crossing pairs.
 * Geometry is never recomputed for each beam state. Every consumer must evaluate
 * the cached alternative against its current full graph before accepting it.
 */
export const createDisplayCrossingClusterMazePool = (
  edges: Edge[],
  nodes: Node[],
  segments: readonly DisplaySegment[],
): ((edgeIndex: number) => Edge | null) => {
  const pairs = new Map<number, readonly [DisplaySegment, DisplaySegment]>();
  for (const hit of resolveDisplayCrossingClusterSearch(segments, edges.length)?.hits ?? []) {
    for (const [moving, opposing] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
      if (!pairs.has(moving.edgeIndex)) pairs.set(moving.edgeIndex, [moving, opposing]);
    }
  }
  const candidates = new Map<number, Edge | null>();
  return (edgeIndex) => {
    const pair = pairs.get(edgeIndex);
    if (!pair) return null;
    if (!candidates.has(edgeIndex)) {
      candidates.set(edgeIndex, buildDisplaySegmentMazeCandidate(edges, nodes, ...pair));
    }
    return candidates.get(edgeIndex) ?? null;
  };
};
