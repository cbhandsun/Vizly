import type { Edge } from '@xyflow/react';

const validLayoutEdges = (
  value: unknown,
  nodeIds: ReadonlySet<string>,
): Edge[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Edge => {
    if (!candidate || typeof candidate !== 'object') return false;
    const edge = candidate as Partial<Edge>;
    return typeof edge.source === 'string'
      && typeof edge.target === 'string'
      && nodeIds.has(edge.source)
      && nodeIds.has(edge.target);
  });
};

/**
 * Resolves the freshest edge collection at the layout boundary. React state
 * refs can lag one render behind an imported canvas, while the React Flow
 * instance may already contain the complete edge set.
 */
export const resolveLayoutSourceEdges = (
  referencedEdges: unknown,
  instanceEdges: unknown,
  nodeIds: ReadonlySet<string>,
): Edge[] => {
  const referenced = validLayoutEdges(referencedEdges, nodeIds);
  const instance = validLayoutEdges(instanceEdges, nodeIds);
  return instance.length > referenced.length ? instance : referenced;
};

/**
 * A layout strategy is expected to preserve edge cardinality. If it
 * unexpectedly returns no edges for a non-empty source collection, retain
 * the source edges so the canvas renderer can recompute their paths.
 */
export const preserveEdgesOnEmptyLayoutResult = (
  sourceEdges: readonly Edge[],
  resultEdges: unknown,
  nodeIds: ReadonlySet<string>,
): Edge[] => {
  const result = validLayoutEdges(resultEdges, nodeIds);
  if (result.length > 0 || sourceEdges.length === 0) return result;
  return [...sourceEdges];
};
