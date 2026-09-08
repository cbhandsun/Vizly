import type { Edge, Node } from '@xyflow/react';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { synthesizeSharedEndpointTrunks } from '../../strategies/shared/edgeSharedTrunkSynthesis';

/** Propose repairs only for endpoint groups with an existing unexplained overlap. */
export const buildDirtySharedTrunkCandidate = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  if (edges.length < 2 || edges.length > 256 || nodes.length === 0 || nodes.length > 256) return edges;
  const dirtyIds = new Set<string>();
  for (const role of ['source', 'target'] as const) {
    const groups = new Map<string, Edge[]>();
    for (const edge of edges) {
      const group = groups.get(edge[role]) ?? [];
      group.push(edge);
      groups.set(edge[role], group);
    }
    for (const group of groups.values()) {
      if (group.length > 1 && calculateEdgePathQualityScore(group).unexplainedRelatedOverlap > 0) {
        for (const edge of group) dirtyIds.add(edge.id);
      }
    }
  }
  if (dirtyIds.size === 0) return edges;
  // Synthesis needs the full graph to recognize existing trunks and hemispheres.
  // Only dirty groups may change; caller owns authored-port and final hard gates.
  const synthesized = synthesizeSharedEndpointTrunks(edges, { nodes });
  if (synthesized.length !== edges.length || synthesized.some((edge, index) => edge.id !== edges[index].id)) return edges;
  return edges.map((edge, index) => dirtyIds.has(edge.id) ? synthesized[index] : edge) as T;
};
