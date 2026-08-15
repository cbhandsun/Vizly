import type { Edge, Node } from '@xyflow/react';

import {
  synthesizeSharedEndpointTrunks,
  synthesizeSharedSourceTrunks,
  synthesizeSharedTargetTrunks,
} from '../../strategies/shared/edgeSharedTrunkSynthesis';

/**
 * Builds endpoint-local trunk candidates before the full two-ended synthesis.
 *
 * Keeping source and target transactions independent prevents a useful trunk
 * from being rejected when the opposite endpoint is quantized by a fraction of
 * a pixel. The caller owns the exact hard gate and true-trunk preservation.
 */
export const buildSharedEndpointTrunkSynthesisCandidates = (
  baseline: Edge[],
  nodes: Node[],
): Edge[][] => {
  const candidates: Edge[][] = [];
  for (const endpoint of ['source', 'target'] as const) {
    const indexesByNodeId = new Map<string, number[]>();
    baseline.forEach((edge, index) => {
      const indexes = indexesByNodeId.get(edge[endpoint]);
      if (indexes) indexes.push(index);
      else indexesByNodeId.set(edge[endpoint], [index]);
    });
    for (const indexes of indexesByNodeId.values()) {
      if (indexes.length < 2) continue;
      const subset = indexes.map(index => baseline[index]);
      const synthesized = endpoint === 'source'
        ? synthesizeSharedSourceTrunks(subset, { nodes })
        : synthesizeSharedTargetTrunks(subset, { nodes });
      if (synthesized.every((edge, index) => edge === subset[index])) continue;
      const candidate = baseline.slice();
      indexes.forEach((edgeIndex, subsetIndex) => {
        candidate[edgeIndex] = synthesized[subsetIndex];
      });
      candidates.push(candidate);
    }
  }
  return [
    ...candidates,
    synthesizeSharedEndpointTrunks(baseline, { nodes }),
  ];
};
