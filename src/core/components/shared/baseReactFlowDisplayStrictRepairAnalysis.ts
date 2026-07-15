import type { Edge, Node } from '@xyflow/react';

import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';

export type FinalResidualStrictCrossingAnalysis = Readonly<{
  rawStrictCrossings: number;
  renderStrictCrossings: number;
}>;

/**
 * Skips the expensive residual repair only when the caller has exact, current
 * evidence that both the stored path and its render-normalized form are clean.
 */
export const repairFinalResidualStrictCrossingsFromKnownAnalysis = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  analysis: FinalResidualStrictCrossingAnalysis,
): T => (
  analysis.rawStrictCrossings === 0 && analysis.renderStrictCrossings === 0
    ? edges
    : repairFinalResidualStrictCrossings(edges, nodes)
);
