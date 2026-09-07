import type { Node } from '@xyflow/react';
import type { LayoutGeometryConstraints } from '../../../algorithms/layoutGeometryConstraints';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';

/** Explicit domain order is an input constraint. Without one, preserve the
 * topology solver's chosen cross-axis order through the routing transaction. */
export const resolveLayoutStrategyGeometryConstraints = (
  strategy: string,
  direction: FlowchartLayoutDirection,
  nodes: readonly Node[],
  domainOrder: readonly string[] | undefined,
  originalNodes: readonly Node[] = nodes,
): LayoutGeometryConstraints | undefined => {
  if (strategy !== 'domain-lanes') return undefined;
  const cross = direction === 'LR' || direction === 'RL' ? 'y' : 'x';
  const rank = new Map((domainOrder ?? []).map((domain, index) => [domain.trim(), index]));
  const domainRank = (node: Node): number => typeof node.data.domain === 'string'
    ? rank.get(node.data.domain.trim()) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const lanes = nodes.filter(node => node.type === 'titleGroup' && !node.hidden && node.data.hidden !== true);
  const ordered = lanes.toSorted((a, b) => domainRank(a) - domainRank(b)
    || a.position[cross] - b.position[cross] || a.id.localeCompare(b.id));
  const originalById = new Map(originalNodes.map(node => [node.id, node]));
  const laneByDomain = new Map(lanes.flatMap(node => typeof node.data.domain === 'string'
    ? [[node.data.domain.trim(), node.id] as const] : []));
  const excluded = new Set(['titleGroup', 'subGroup', 'domain', 'group', 'mindmap', 'mindmap-boundary', 'sticky-note']);
  const memberships: Array<{ nodeId: string; laneId: string }> = [];
  for (const node of originalNodes) {
    if (excluded.has(node.type ?? '') || node.hidden || node.data.hidden === true) continue;
    let domain = typeof node.data.domain === 'string' ? node.data.domain.trim() : '';
    let originalLaneId: string | undefined;
    let parent = node.parentId ? originalById.get(node.parentId) : undefined;
    const visited = new Set([node.id]);
    while (parent && !visited.has(parent.id) && visited.size <= 64) {
      visited.add(parent.id);
      if (!domain && typeof parent.data.domain === 'string') domain = parent.data.domain.trim();
      if (parent.type === 'titleGroup') originalLaneId = parent.id;
      parent = parent.parentId ? originalById.get(parent.parentId) : undefined;
    }
    if (domain === '默认域' || domain === 'default') continue;
    if (!domain && !originalLaneId) continue;
    // A missing required lane fails constraint parsing; it must not silently
    // remove this member's original business affiliation from acceptance.
    memberships.push({ nodeId: node.id, laneId: domain ? laneByDomain.get(domain) ?? ''
      : lanes.find(lane => lane.id === originalLaneId)?.id ?? '' });
  }
  return { lanes: { direction, nodeIds: ordered.map(node => node.id),
    ...(memberships.length ? { memberships } : {}),
  } };
};
