import type { Edge, Node } from '@xyflow/react';

/** True when every component can be represented as a directed rooted forest. */
export const isDirectedForestLayoutGraph = (
  nodes: readonly Node[],
  edges: readonly Edge[],
): boolean => {
  const nodeIds = new Set(nodes.map(node => node.id));
  const indegree = new Map<string, number>(nodes.map(node => [node.id, 0]));
  const children = new Map<string, string[]>();

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    if (edge.source === edge.target) return false;
    const targetIndegree = (indegree.get(edge.target) ?? 0) + 1;
    if (targetIndegree > 1) return false;
    indegree.set(edge.target, targetIndegree);
    const nextChildren = children.get(edge.source) ?? [];
    nextChildren.push(edge.target);
    children.set(edge.source, nextChildren);
  }

  const queue = nodes
    .filter(node => (indegree.get(node.id) ?? 0) === 0)
    .map(node => node.id);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    visited += 1;
    for (const childId of children.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) queue.push(childId);
    }
  }
  return visited === nodes.length;
};
