import type { Edge, Node } from '@xyflow/react';

import {
  auditFinalSameSideEndpointOrder,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  auditFinalSameSidePassageOrder,
} from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { createBaseDisplayHardGateMemo } from './baseReactFlowDisplayHardGateMemo';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';

export type BaseReactFlowFinalEndpointEvaluation = Readonly<{
  nodes: Node[];
  endpointOrder: (edges: readonly Edge[]) => ReturnType<typeof auditFinalSameSideEndpointOrder>;
  hardReport: (edges: readonly Edge[]) => ReturnType<
    ReturnType<typeof createBaseDisplayHardGateMemo>['getReport']
  >;
  passageOrder: (edges: readonly Edge[]) => ReturnType<typeof auditFinalSameSidePassageOrder>;
  unsafeEndpointStubs: (edges: readonly Edge[]) => number;
}>;

/**
 * Request-local exact evidence for final endpoint transactions.
 *
 * Routing candidates are immutable arrays. Reusing evidence for the same
 * array avoids rebuilding terminal snapshots and rescanning an unchanged
 * baseline for every sibling candidate; distinct arrays still receive their
 * own complete hard/order evaluation.
 */
export const createBaseReactFlowFinalEndpointEvaluation = (
  nodes: Node[],
): BaseReactFlowFinalEndpointEvaluation => {
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  const hardGateMemo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot);
  const endpointOrderByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof auditFinalSameSideEndpointOrder>
  >();
  const passageOrderByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof auditFinalSameSidePassageOrder>
  >();
  const unsafeStubsByEdges = new WeakMap<readonly Edge[], number>();

  return {
    nodes,
    endpointOrder(edges) {
      const cached = endpointOrderByEdges.get(edges);
      if (cached) return cached;
      const audit = auditFinalSameSideEndpointOrder(edges, nodes);
      endpointOrderByEdges.set(edges, audit);
      return audit;
    },
    hardReport(edges) {
      return hardGateMemo.getReport(edges.slice(), nodes, 'polished');
    },
    passageOrder(edges) {
      const cached = passageOrderByEdges.get(edges);
      if (cached) return cached;
      const audit = auditFinalSameSidePassageOrder(edges, nodes);
      passageOrderByEdges.set(edges, audit);
      return audit;
    },
    unsafeEndpointStubs(edges) {
      const cached = unsafeStubsByEdges.get(edges);
      if (typeof cached === 'number') return cached;
      const count = countRenderUnsafeEndpointStubs(edges.slice());
      unsafeStubsByEdges.set(edges, count);
      return count;
    },
  };
};
