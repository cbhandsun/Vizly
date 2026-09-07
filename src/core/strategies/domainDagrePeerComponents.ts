import type { Edge } from '@xyflow/react';

export type DomainDagreComponentIndex = ReadonlyMap<string, number>;

/** A supplied whole-graph projection must cover the entire local scope. */
export const domainDagreComponentIndexCovers = (
  nodeIds: Iterable<string>,
  componentByNodeId: DomainDagreComponentIndex,
): boolean => {
  for (const component of componentByNodeId.values()) {
    if (!Number.isSafeInteger(component) || component < 0) return false;
  }
  for (const id of nodeIds) if (!componentByNodeId.has(id)) return false;
  return true;
};

/**
 * Returns weak graph components for visible layout leaves. A corridor is only
 * needed between peers that can be joined by a route; disconnected components
 * can use the same flow band in separate cross-axis lanes.
 */
export function domainDagrePeerComponentIndex(
  nodeIds: Iterable<string>,
  edges: readonly Pick<Edge, 'source' | 'target'>[],
): DomainDagreComponentIndex {
  const parents = new Map<string, string>();
  for (const id of nodeIds) parents.set(id, id);

  const root = (id: string): string => {
    let resolved = id;
    let parent = parents.get(resolved);
    while (parent !== undefined && parent !== resolved) {
      resolved = parent;
      parent = parents.get(resolved);
    }
    let current = id;
    while (current !== resolved) {
      const next = parents.get(current);
      if (next === undefined) break;
      parents.set(current, resolved);
      current = next;
    }
    return resolved;
  };
  for (const edge of edges) {
    if (!parents.has(edge.source) || !parents.has(edge.target)) continue;
    const sourceRoot = root(edge.source);
    const targetRoot = root(edge.target);
    if (sourceRoot !== targetRoot) parents.set(sourceRoot, targetRoot);
  }

  const componentNumbers = new Map<string, number>();
  const result = new Map<string, number>();
  for (const id of parents.keys()) {
    const componentRoot = root(id);
    if (!componentNumbers.has(componentRoot)) componentNumbers.set(componentRoot, componentNumbers.size);
    result.set(id, componentNumbers.get(componentRoot) ?? 0);
  }
  return result;
}
