import type { Node } from '@xyflow/react';
import { normalizeBaseReactFlowRenderableNodes } from './baseReactFlowRenderableNodes';

/** The same authored and semantic hierarchy used by container collapse. */
export const buildChildrenMap = (nodes: Node[]): Map<string, string[]> => {
  const children = new Map<string, Set<string>>();
  const add = (parent: string, child: string) => {
    const siblings = children.get(parent) ?? new Set<string>();
    siblings.add(child);
    children.set(parent, siblings);
  };
  const titles = nodes.filter(node => node.type === 'titleGroup');
  const groups = nodes.filter(node => node.type === 'subGroup');
  for (const node of nodes) if (node.parentId) add(node.parentId, node.id);
  const semanticNodes = [...groups, ...nodes.filter(node => node.type !== 'titleGroup' && node.type !== 'subGroup')];
  for (const node of semanticNodes) {
    if (!node.data?.domain) continue;
    const domain = node.data.domain;
    const subDomain = node.data.subDomain;
    const group = node.type !== 'subGroup' && subDomain
      ? groups.find(candidate => candidate.data?.domain === domain
        && (candidate.data?.subDomain === subDomain || candidate.data?.description === subDomain))
      : undefined;
    const parent = group ?? titles.find(candidate => candidate.data?.domain === domain);
    if (parent) add(parent.id, node.id);
  }
  return new Map([...children].map(([parent, ids]) => [parent, [...ids]]));
};

export const getDescendantIds = (
  nodes: Node[], parentId: string, prebuiltMap?: Map<string, string[]>,
): string[] => {
  const children = prebuiltMap ?? buildChildrenMap(nodes);
  const seen = new Set([parentId]);
  const queue = [parentId];
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index]) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return queue.slice(1);
};

/** Normalize the actual candidate before both geometry validation and state
 * publication. Hidden structural parents do not imply hidden children; only
 * explicit collapse propagates. The validator itself never invents visibility. */
export const normalizeBaseReactFlowLayoutVisibility = (nodes: Node[]): Node[] => {
  const normalized = normalizeBaseReactFlowRenderableNodes(nodes);
  const collapsed = normalized.filter(node => node.data?.collapsed === true);
  if (collapsed.length === 0) return normalized;
  const children = buildChildrenMap(normalized);
  const hidden = new Set<string>();
  const queue = collapsed.map(node => node.id);
  const visited = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index]) ?? []) {
      hidden.add(child);
      if (visited.has(child)) continue;
      visited.add(child);
      queue.push(child);
    }
  }
  let changed = false;
  const result = normalized.map(node => {
    if (!hidden.has(node.id) || node.hidden === true) return node;
    changed = true;
    return { ...node, hidden: true };
  });
  return changed ? result : normalized;
};
