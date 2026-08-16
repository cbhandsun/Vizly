import type { Edge, Node } from '@xyflow/react';

import { isDirectedForestLayoutGraph } from './treeLayoutTopology';

export type ForceLayoutEngine = 'force' | 'elk-layered';

/**
 * The freeform force engine is retained for forests, where the zero-crossing
 * display contract is achievable without imposing ranks. Multi-parent and
 * feedback graphs use the layered engine because a force equilibrium can be
 * visually reasonable while still being impossible to commit under the hard
 * crossing gate.
 */
export const resolveForceLayoutEngine = (
  nodes: Node[],
  edges: Edge[],
): ForceLayoutEngine => (
  isDirectedForestLayoutGraph(nodes, edges) ? 'force' : 'elk-layered'
);
