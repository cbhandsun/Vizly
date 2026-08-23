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
import { getDisplayTerminalValidationReport } from './baseReactFlowTerminalValidation';

export type BaseReactFlowFinalEndpointEvaluation = Readonly<{
  nodes: Node[];
  endpointOrder: (edges: readonly Edge[]) => ReturnType<typeof auditFinalSameSideEndpointOrder>;
  hardReport: (edges: readonly Edge[]) => ReturnType<
    ReturnType<typeof createBaseDisplayHardGateMemo>['getReport']
  >;
  passageOrder: (edges: readonly Edge[]) => ReturnType<typeof auditFinalSameSidePassageOrder>;
  rememberHardReport: (
    edges: readonly Edge[],
    report: ReturnType<ReturnType<typeof createBaseDisplayHardGateMemo>['getReport']>,
  ) => boolean;
  terminalReport: (edges: readonly Edge[]) => ReturnType<typeof getDisplayTerminalValidationReport>;
  unsafeEndpointStubs: (edges: readonly Edge[]) => number;
  readMetrics: () => BaseReactFlowEvaluationMetrics;
}>;

export type BaseReactFlowEvaluationMetrics = Readonly<{
  evaluationCount: number;
  cacheHitCount: number;
  scannedNodeCount: number;
  scannedEdgePairCount: number;
}>;

export const diffBaseReactFlowEvaluationMetrics = (
  before: BaseReactFlowEvaluationMetrics,
  after: BaseReactFlowEvaluationMetrics,
): BaseReactFlowEvaluationMetrics => ({
  evaluationCount: Math.max(0, after.evaluationCount - before.evaluationCount),
  cacheHitCount: Math.max(0, after.cacheHitCount - before.cacheHitCount),
  scannedNodeCount: Math.max(0, after.scannedNodeCount - before.scannedNodeCount),
  scannedEdgePairCount: Math.max(
    0,
    after.scannedEdgePairCount - before.scannedEdgePairCount,
  ),
});

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
  let evaluationCount = 0;
  let cacheHitCount = 0;
  const endpointOrderByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof auditFinalSameSideEndpointOrder>
  >();
  const passageOrderByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof auditFinalSameSidePassageOrder>
  >();
  const terminalReportByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof getDisplayTerminalValidationReport>
  >();
  const unsafeStubsByEdges = new WeakMap<readonly Edge[], number>();

  return {
    nodes,
    rememberHardReport: (edges, report) => hardGateMemo.rememberReport(edges, report),
    endpointOrder(edges) {
      const cached = endpointOrderByEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached;
      }
      evaluationCount += 1;
      const audit = auditFinalSameSideEndpointOrder(edges, nodes);
      endpointOrderByEdges.set(edges, audit);
      return audit;
    },
    hardReport(edges) {
      return hardGateMemo.getReport(edges.slice(), nodes, 'polished');
    },
    passageOrder(edges) {
      const cached = passageOrderByEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached;
      }
      evaluationCount += 1;
      const audit = auditFinalSameSidePassageOrder(edges, nodes);
      passageOrderByEdges.set(edges, audit);
      return audit;
    },
    terminalReport(edges) {
      const cached = terminalReportByEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached;
      }
      evaluationCount += 1;
      const report = getDisplayTerminalValidationReport(edges.slice(), terminalSnapshot);
      terminalReportByEdges.set(edges, report);
      return report;
    },
    unsafeEndpointStubs(edges) {
      const cached = unsafeStubsByEdges.get(edges);
      if (typeof cached === 'number') {
        cacheHitCount += 1;
        return cached;
      }
      evaluationCount += 1;
      const count = countRenderUnsafeEndpointStubs(edges.slice());
      unsafeStubsByEdges.set(edges, count);
      return count;
    },
    readMetrics() {
      const hardGateMetrics = hardGateMemo.readMetrics();
      return {
        evaluationCount: evaluationCount + hardGateMetrics.evaluationCount,
        cacheHitCount: cacheHitCount + hardGateMetrics.cacheHitCount,
        scannedNodeCount: hardGateMetrics.scannedNodeCount,
        scannedEdgePairCount: hardGateMetrics.scannedEdgePairCount,
      };
    },
  };
};
