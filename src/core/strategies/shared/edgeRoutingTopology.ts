import type { Edge } from '@xyflow/react';
import type { BuddyGroup } from '../../algorithms/globalChannelRouting';

export interface EdgeTopologyStats {
  sourceFanOut: Map<string, number>;
  targetFanIn: Map<string, number>;
}

export function buildPipelineBuddyGroups(edges: Edge[]): BuddyGroup[] {
  const bySource = new Map<string, Set<string>>();
  const byTarget = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.id) continue;
    if (edge.source) {
      if (!bySource.has(edge.source)) bySource.set(edge.source, new Set());
      bySource.get(edge.source)!.add(edge.id);
    }
    if (edge.target) {
      if (!byTarget.has(edge.target)) byTarget.set(edge.target, new Set());
      byTarget.get(edge.target)!.add(edge.id);
    }
  }

  const groups: BuddyGroup[] = [];
  for (const edgeIds of bySource.values()) {
    if (edgeIds.size >= 2) groups.push({ type: 'o2m', edgeIds });
  }
  for (const edgeIds of byTarget.values()) {
    if (edgeIds.size >= 2) groups.push({ type: 'm2o', edgeIds });
  }
  return groups;
}

export function buildEdgeTopologyStats(edges: Edge[]): EdgeTopologyStats {
  const sourceFanOut = new Map<string, number>();
  const targetFanIn = new Map<string, number>();
  for (const edge of edges) {
    if (edge.source) sourceFanOut.set(edge.source, (sourceFanOut.get(edge.source) ?? 0) + 1);
    if (edge.target) targetFanIn.set(edge.target, (targetFanIn.get(edge.target) ?? 0) + 1);
  }
  return { sourceFanOut, targetFanIn };
}

export function edgeTopologyPriority(edge: Edge, stats: EdgeTopologyStats): number {
  const fanOut = stats.sourceFanOut.get(edge.source) ?? 0;
  const fanIn = stats.targetFanIn.get(edge.target) ?? 0;
  if (fanOut >= 2 && fanIn >= 2) return 0;
  if (fanOut >= 2 || fanIn >= 2) return 1;
  return 2;
}
