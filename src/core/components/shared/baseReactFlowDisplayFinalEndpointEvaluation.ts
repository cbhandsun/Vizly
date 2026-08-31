import type { Edge, Node } from '@xyflow/react';

import type { RoutingPatch } from '../../routing/routingPatch';
import {
  createBusinessNodeClearanceGeometryContext,
  type BusinessNodeClearanceGeometryContext,
} from '../../strategies/shared/edgeBusinessNodeClearanceGeometryContext';
import {
  auditFinalSameSideEndpointOrder,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  auditFinalSameSidePassageOrder,
} from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import {
  countRenderUnsafeEndpointStubs,
  repairRenderSafeEndpointStubs,
} from './baseReactFlowDisplayEndpointStubRepair';
import {
  computeBaseDisplayHardGateEvidenceSignature,
  createBaseDisplayHardGateMemo,
} from './baseReactFlowDisplayHardGateMemo';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';
import { getDisplayTerminalValidationReport } from './baseReactFlowTerminalValidation';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  createBaseReactFlowChangedHardReportEvaluation,
  type BaseReactFlowChangedHardReportEvaluation,
} from './baseReactFlowDisplayChangedHardReport';
import { createStrictCrossingRepairDiagnostics } from './baseReactFlowDisplayStrictResidualRepair';
import {
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayEdgePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import { createBaseReactFlowRequestMemo } from './baseReactFlowDisplayRequestMemo';

export type BaseReactFlowFinalEndpointEvaluation = Readonly<{
  nodes: Node[];
  businessNodeClearanceGeometry: BusinessNodeClearanceGeometryContext;
  endpointOrder: (edges: readonly Edge[]) => ReturnType<typeof auditFinalSameSideEndpointOrder>;
  hardReport: (edges: readonly Edge[]) => ReturnType<
    ReturnType<typeof createBaseDisplayHardGateMemo>['getReport']
  >;
  hardReportChanged: (
    baselineEdges: readonly Edge[],
    candidateEdges: readonly Edge[],
    changedEdgeIndexes: readonly number[],
  ) => ReturnType<ReturnType<typeof createBaseDisplayHardGateMemo>['getReport']>;
  passageOrder: (edges: readonly Edge[]) => ReturnType<typeof auditFinalSameSidePassageOrder>;
  repairRenderSafeEndpointStubs: (
    edges: Edge[],
    maxEvaluations?: number,
    allowStrictFallback?: boolean,
  ) => Edge[];
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
  scannedSegmentCount?: number;
  scannedEdgePairCount: number;
  workItemCount?: number;
}>;

const MAX_REQUEST_LOCAL_ROUTE_EVIDENCE = 256;
const MAX_REQUEST_LOCAL_STUB_REPAIR_EVIDENCE = 64;
const MAX_REQUEST_LOCAL_STUB_REPAIR_EDGE_SLOTS = 4_096;

type RenderSafeStubRepairEvidence = Readonly<{
  allowStrictFallback: boolean;
  baselineSignature: string | null;
  baselineEdges: readonly Edge[];
  maxEvaluations: number;
  repairedSignature: string | null;
  repairedEdges: Edge[];
  routingPatches: RoutingPatch[] | null;
}>;

const sameEdgeReferenceVector = (
  first: readonly Edge[],
  second: readonly Edge[],
): boolean => first.length === second.length
  && first.every((edge, index) => edge === second[index]);

/**
 * Endpoint and passage audits consume source-authored terminal policy in
 * addition to rendered geometry. Bind their request-local cache to both so a
 * copied immutable route can reuse evidence without treating a policy-only
 * change as the same input.
 */
const endpointAuditSignature = (edges: readonly Edge[]): string | null => {
  return computeBaseDisplayHardGateEvidenceSignature(edges);
};

const rememberBoundedRouteEvidence = <T>(
  evidenceBySignature: Map<string, T>,
  signature: string | null,
  evidence: T,
): void => {
  if (!signature) return;
  if (!evidenceBySignature.has(signature)
    && evidenceBySignature.size >= MAX_REQUEST_LOCAL_ROUTE_EVIDENCE) {
    const oldestSignature = evidenceBySignature.keys().next().value as string | undefined;
    if (oldestSignature !== undefined) evidenceBySignature.delete(oldestSignature);
  }
  evidenceBySignature.set(signature, evidence);
};

export const diffBaseReactFlowEvaluationMetrics = (
  before: BaseReactFlowEvaluationMetrics,
  after: BaseReactFlowEvaluationMetrics,
): BaseReactFlowEvaluationMetrics => ({
  evaluationCount: Math.max(0, after.evaluationCount - before.evaluationCount),
  cacheHitCount: Math.max(0, after.cacheHitCount - before.cacheHitCount),
  scannedNodeCount: Math.max(0, after.scannedNodeCount - before.scannedNodeCount),
  scannedSegmentCount: Math.max(
    0,
    (after.scannedSegmentCount ?? 0) - (before.scannedSegmentCount ?? 0),
  ),
  scannedEdgePairCount: Math.max(
    0,
    after.scannedEdgePairCount - before.scannedEdgePairCount,
  ),
  workItemCount: Math.max(
    0,
    (after.workItemCount ?? 0) - (before.workItemCount ?? 0),
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
  eligibleEdgeIds?: ReadonlySet<string>,
): BaseReactFlowFinalEndpointEvaluation => {
  const mutableEdgeIds = eligibleEdgeIds ? new Set(eligibleEdgeIds) : undefined;
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  const businessNodeClearanceGeometry = createBusinessNodeClearanceGeometryContext(nodes);
  const hardGateMemo = createBaseDisplayHardGateMemo(nodes, terminalSnapshot);
  let evaluationCount = 0;
  let cacheHitCount = 0;
  const getEndpointAuditSignature = createBaseReactFlowRequestMemo(endpointAuditSignature);
  const getOutputRouteSignature = createBaseReactFlowRequestMemo(
    computeBaseReactFlowDisplayOutputRouteSignature,
  );
  const endpointOrderByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof auditFinalSameSideEndpointOrder>
  >();
  const endpointOrderBySignature = new Map<
    string,
    ReturnType<typeof auditFinalSameSideEndpointOrder>
  >();
  const passageOrderByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof auditFinalSameSidePassageOrder>
  >();
  const passageOrderBySignature = new Map<
    string,
    ReturnType<typeof auditFinalSameSidePassageOrder>
  >();
  const terminalReportByEdges = new WeakMap<
    readonly Edge[],
    ReturnType<typeof getDisplayTerminalValidationReport>
  >();
  const terminalReportBySignature = new Map<
    string,
    ReturnType<typeof getDisplayTerminalValidationReport>
  >();
  const unsafeStubsByEdges = new WeakMap<readonly Edge[], number>();
  const unsafeStubsBySignature = new Map<string, number>();
  const changedHardReportByBaseline = new WeakMap<
    readonly Edge[],
    Readonly<{
      routeSignature: string;
      evaluation: BaseReactFlowChangedHardReportEvaluation;
    }>
  >();
  let changedHardReportEvaluationCount = 0;
  let changedHardReportScannedNodeCount = 0;
  let changedHardReportScannedEdgePairCount = 0;
  let stubStrictEvaluationCount = 0;
  let stubStrictCacheHitCount = 0;
  let stubStrictScannedSegmentCount = 0;
  let stubStrictScannedEdgePairCount = 0;
  let stubStrictWorkItemCount = 0;
  const renderSafeStubRepairs: RenderSafeStubRepairEvidence[] = [];
  let renderSafeStubRepairEdgeSlots = 0;
  const evaluateEndpointOrder = (
    edges: readonly Edge[],
  ): ReturnType<typeof auditFinalSameSideEndpointOrder> => {
    const cached = endpointOrderByEdges.get(edges);
    if (cached) {
      cacheHitCount += 1;
      return cached;
    }
    const signature = getEndpointAuditSignature(edges);
    const routeCached = signature ? endpointOrderBySignature.get(signature) : undefined;
    if (routeCached) {
      cacheHitCount += 1;
      endpointOrderByEdges.set(edges, routeCached);
      return routeCached;
    }
    evaluationCount += 1;
    const audit = auditFinalSameSideEndpointOrder(edges, nodes);
    endpointOrderByEdges.set(edges, audit);
    rememberBoundedRouteEvidence(endpointOrderBySignature, signature, audit);
    return audit;
  };

  return {
    nodes,
    businessNodeClearanceGeometry,
    rememberHardReport: (edges, report) => hardGateMemo.rememberImmutableReport(edges, report),
    endpointOrder: evaluateEndpointOrder,
    hardReport(edges) {
      return hardGateMemo.getImmutableReport(edges, 'polished');
    },
    hardReportChanged(baselineEdges, candidateEdges, changedEdgeIndexes) {
      const remembered = hardGateMemo.getRememberedImmutableReport(
        candidateEdges,
        'polished',
      );
      if (remembered) return remembered;
      const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature(baselineEdges);
      if (!routeSignature) return hardGateMemo.getImmutableReport(candidateEdges, 'polished');
      const cached = changedHardReportByBaseline.get(baselineEdges);
      const reusesEvaluation = cached?.routeSignature === routeSignature;
      const evaluation = reusesEvaluation
        ? cached.evaluation
        : createBaseReactFlowChangedHardReportEvaluation(
          [...baselineEdges],
          nodes,
          terminalSnapshot,
        );
      if (cached?.routeSignature !== routeSignature) {
        changedHardReportByBaseline.set(baselineEdges, { routeSignature, evaluation });
      }
      const before = reusesEvaluation
        ? evaluation.readMetrics()
        : { evaluationCount: 0, scannedNodeCount: 0, scannedEdgePairCount: 0 };
      const report = evaluation.evaluate(
        [...candidateEdges],
        changedEdgeIndexes,
        'polished',
      );
      const after = evaluation.readMetrics();
      changedHardReportEvaluationCount += Math.max(
        0,
        after.evaluationCount - before.evaluationCount,
      );
      changedHardReportScannedNodeCount += Math.max(
        0,
        after.scannedNodeCount - before.scannedNodeCount,
      );
      changedHardReportScannedEdgePairCount += Math.max(
        0,
        after.scannedEdgePairCount - before.scannedEdgePairCount,
      );
      if (!report) return hardGateMemo.getImmutableReport(candidateEdges, 'polished');
      hardGateMemo.rememberImmutableReport(candidateEdges, report);
      return report;
    },
    passageOrder(edges) {
      const cached = passageOrderByEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached;
      }
      const signature = getEndpointAuditSignature(edges);
      const routeCached = signature ? passageOrderBySignature.get(signature) : undefined;
      if (routeCached) {
        cacheHitCount += 1;
        passageOrderByEdges.set(edges, routeCached);
        return routeCached;
      }
      evaluationCount += 1;
      const audit = auditFinalSameSidePassageOrder(edges, nodes);
      passageOrderByEdges.set(edges, audit);
      rememberBoundedRouteEvidence(passageOrderBySignature, signature, audit);
      return audit;
    },
    repairRenderSafeEndpointStubs(
      edges,
      maxEvaluations = 64,
      allowStrictFallback = true,
    ) {
      const baselineSignature = getEndpointAuditSignature(edges);
      const cachedIndex = renderSafeStubRepairs.findIndex(entry => (
        entry.maxEvaluations === maxEvaluations
        && entry.allowStrictFallback === allowStrictFallback
        && (
          sameEdgeReferenceVector(entry.baselineEdges, edges)
          || (
            baselineSignature !== null
            && entry.baselineSignature === baselineSignature
          )
        )
      ));
      if (cachedIndex >= 0) {
        const [cached] = renderSafeStubRepairs.splice(cachedIndex, 1);
        renderSafeStubRepairs.push(cached);
        if (sameEdgeReferenceVector(cached.baselineEdges, cached.repairedEdges)) {
          cacheHitCount += 1;
          return edges;
        }
        if (sameEdgeReferenceVector(cached.baselineEdges, edges)) {
          cacheHitCount += 1;
          return cached.repairedEdges;
        }
        const replayed = cached.routingPatches
          ? mergeBaseReactFlowDisplayEdgePatches(edges, cached.routingPatches)
          : null;
        if (
          replayed
          && cached.repairedSignature !== null
          && getEndpointAuditSignature(replayed) === cached.repairedSignature
        ) {
          cacheHitCount += 1;
          return replayed;
        }
      }
      const strictDiagnostics = createStrictCrossingRepairDiagnostics();
      const repairedEdges = repairRenderSafeEndpointStubs(
        edges,
        nodes,
        maxEvaluations,
        evaluateEndpointOrder,
        terminalSnapshot,
        strictDiagnostics,
        allowStrictFallback,
        // Final display transactions preserve exact trunk lengths. Reject an
        // incompatible local preference before it discards other valid repairs
        // when the complete batch reaches the outer commit gate.
        'preserve-length',
        mutableEdgeIds,
      );
      stubStrictEvaluationCount += strictDiagnostics.qualityEvaluationCount;
      stubStrictCacheHitCount += strictDiagnostics.qualityContextCacheHitCount;
      stubStrictCacheHitCount += strictDiagnostics.qualityScoreCacheHitCount;
      stubStrictCacheHitCount += strictDiagnostics.pairCacheHitCount
        + strictDiagnostics.segmentQueryCacheHitCount
        + strictDiagnostics.duplicateVariantReferenceCount
        + strictDiagnostics.knownQualityStrictReuseCount;
      stubStrictScannedSegmentCount += strictDiagnostics.scannedSegmentCount;
      stubStrictScannedEdgePairCount += strictDiagnostics.scannedEdgePairCount;
      stubStrictWorkItemCount += strictDiagnostics.strictFallbackInvocationCount;
      if (edges.length <= MAX_REQUEST_LOCAL_STUB_REPAIR_EDGE_SLOTS) {
        while (
          renderSafeStubRepairs.length >= MAX_REQUEST_LOCAL_STUB_REPAIR_EVIDENCE
          || renderSafeStubRepairEdgeSlots + edges.length
            > MAX_REQUEST_LOCAL_STUB_REPAIR_EDGE_SLOTS
        ) {
          const evicted = renderSafeStubRepairs.shift();
          if (!evicted) break;
          renderSafeStubRepairEdgeSlots -= evicted.baselineEdges.length;
        }
        const repairedSignature = getEndpointAuditSignature(repairedEdges);
        renderSafeStubRepairs.push({
          allowStrictFallback,
          baselineSignature,
          baselineEdges: edges,
          maxEvaluations,
          repairedSignature,
          repairedEdges,
          routingPatches: sameEdgeReferenceVector(edges, repairedEdges)
            ? []
            : createBaseReactFlowDisplayEdgePatches(edges, repairedEdges),
        });
        renderSafeStubRepairEdgeSlots += edges.length;
      }
      return repairedEdges;
    },
    terminalReport(edges) {
      const cached = terminalReportByEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached;
      }
      const signature = getOutputRouteSignature(edges);
      const routeCached = signature ? terminalReportBySignature.get(signature) : undefined;
      if (routeCached) {
        cacheHitCount += 1;
        terminalReportByEdges.set(edges, routeCached);
        return routeCached;
      }
      evaluationCount += 1;
      const report = getDisplayTerminalValidationReport(edges.slice(), terminalSnapshot);
      terminalReportByEdges.set(edges, report);
      rememberBoundedRouteEvidence(terminalReportBySignature, signature, report);
      return report;
    },
    unsafeEndpointStubs(edges) {
      const cached = unsafeStubsByEdges.get(edges);
      if (typeof cached === 'number') {
        cacheHitCount += 1;
        return cached;
      }
      const signature = getOutputRouteSignature(edges);
      const routeCached = signature ? unsafeStubsBySignature.get(signature) : undefined;
      if (typeof routeCached === 'number') {
        cacheHitCount += 1;
        unsafeStubsByEdges.set(edges, routeCached);
        return routeCached;
      }
      evaluationCount += 1;
      const count = countRenderUnsafeEndpointStubs(edges.slice());
      unsafeStubsByEdges.set(edges, count);
      rememberBoundedRouteEvidence(unsafeStubsBySignature, signature, count);
      return count;
    },
    readMetrics() {
      const hardGateMetrics = hardGateMemo.readMetrics();
      return {
        evaluationCount: evaluationCount
          + hardGateMetrics.evaluationCount
          + changedHardReportEvaluationCount
          + stubStrictEvaluationCount,
        cacheHitCount: cacheHitCount
          + hardGateMetrics.cacheHitCount
          + stubStrictCacheHitCount,
        scannedNodeCount: hardGateMetrics.scannedNodeCount
          + changedHardReportScannedNodeCount,
        scannedSegmentCount: stubStrictScannedSegmentCount,
        scannedEdgePairCount: hardGateMetrics.scannedEdgePairCount
          + changedHardReportScannedEdgePairCount
          + stubStrictScannedEdgePairCount,
        workItemCount: stubStrictWorkItemCount,
      };
    },
  };
};
