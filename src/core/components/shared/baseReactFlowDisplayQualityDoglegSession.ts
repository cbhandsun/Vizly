import type { Edge, Node } from '@xyflow/react';

import {
  repairLocalDoglegArtifacts,
  type LocalDoglegRepairDiagnostics,
} from '../../strategies/shared/edgeLocalDoglegRepair';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';

export type DisplayQualityDoglegRepairSession = Readonly<{
  run: (edges: Edge[], diagnostics?: LocalDoglegRepairDiagnostics) => Edge[];
}>;

/**
 * Retains only fixed-point proof inside one Worker job. A signature hit returns
 * the current edge array instead of an earlier candidate, so visual and business
 * metadata that is outside routing identity can never be restored from cache.
 */
export const createDisplayQualityDoglegRepairSession = (
  nodes: Node[],
): DisplayQualityDoglegRepairSession => {
  const fixedPointSignatures = new Set<string>();
  return {
    run: (edges, diagnostics) => {
      const inputSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
      if (inputSignature && fixedPointSignatures.has(inputSignature)) {
        if (diagnostics) diagnostics.cacheHitCount += 1;
        return edges;
      }

      const repaired = repairLocalDoglegArtifacts(edges, nodes, diagnostics);
      if (
        inputSignature
        && computeBaseReactFlowDisplayOutputRouteSignature(repaired) === inputSignature
      ) {
        fixedPointSignatures.add(inputSignature);
      }
      return repaired;
    },
  };
};
