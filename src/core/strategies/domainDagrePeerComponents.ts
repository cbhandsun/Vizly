import type { Edge } from '@xyflow/react';

/**
 * Returns weak graph components for visible layout leaves. A corridor is only
 * needed between peers that can be joined by a route; disconnected components
 * can use the same flow band in separate cross-axis lanes.
 */
export function domainDagrePeerComponentIndex(
  nodeIds: Iterable<string>,
  edges: readonly Pick<Edge, 'source' | 'target'>[],
): ReadonlyMap<string, number> {
  const parents = new Map<string, string>();
  for (const id of nodeIds) parents.set(id, id);

  const root = (id: string): string => {
    const parent = parents.get(id);
    if (!parent || parent === id) return id;
    const resolved = root(parent);
    parents.set(id, resolved);
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
