import type { Edge, Node } from '@xyflow/react';

import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  getDisplayHardQualityGateReportWithMetrics,
} from './baseReactFlowDisplayQualityGates';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import type { DisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';

type HardGateEvaluator = (
  edges: Edge[],
  nodes: Node[],
  candidate: BaseDisplayBoundedCandidateReport['candidate'],
  terminalSnapshot?: DisplayTerminalValidationSnapshot,
) => BaseDisplayBoundedCandidateReport;

export type BaseDisplayHardGateMemo = {
  getReport: HardGateEvaluator;
  getRememberedReport: (
    edges: readonly Edge[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ) => BaseDisplayBoundedCandidateReport | undefined;
  rememberReport: (
    edges: readonly Edge[],
    report: BaseDisplayBoundedCandidateReport,
  ) => boolean;
  readMetrics: () => Readonly<{
    evaluationCount: number;
    cacheHitCount: number;
    scannedNodeCount: number;
    scannedEdgePairCount: number;
  }>;
};

/**
 * Request-local memo for the exact hard-gate report of a rendered route.
 * The candidate label describes the pipeline stage; it does not participate in
 * any quality, obstacle, or terminal calculation, so one route can safely reuse
 * the same evidence across stage labels.
 */
export const createBaseDisplayHardGateMemo = (
  nodes: Node[],
  terminalSnapshot: DisplayTerminalValidationSnapshot,
  evaluateReport?: HardGateEvaluator,
): BaseDisplayHardGateMemo => {
  const reportByRoute = new Map<string, BaseDisplayBoundedCandidateReport>();
  let evaluationCount = 0;
  let cacheHitCount = 0;
  let scannedNodeCount = 0;
  let scannedEdgePairCount = 0;

  return {
    getRememberedReport(edges, candidate) {
      const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature([...edges]);
      if (!routeSignature) return undefined;
      const cached = reportByRoute.get(routeSignature);
      if (!cached) return undefined;
      cacheHitCount += 1;
      return cached.candidate === candidate ? cached : { ...cached, candidate };
    },
    rememberReport(edges, report) {
      const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature([...edges]);
      if (!routeSignature) return false;
      reportByRoute.set(routeSignature, report);
      return true;
    },
    getReport(edges, _nodes, candidate) {
      const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
      if (routeSignature) {
        const cached = reportByRoute.get(routeSignature);
        if (cached) {
          cacheHitCount += 1;
          return cached.candidate === candidate ? cached : { ...cached, candidate };
        }
      }

      evaluationCount += 1;
      const evaluated = evaluateReport
        ? { report: evaluateReport(edges, nodes, candidate, terminalSnapshot), scanMetrics: null }
        : getDisplayHardQualityGateReportWithMetrics(
          edges,
          nodes,
          candidate,
          terminalSnapshot,
        );
      const report = evaluated.report;
      scannedNodeCount += evaluated.scanMetrics?.scannedNodeCount ?? 0;
      scannedEdgePairCount += evaluated.scanMetrics?.scannedEdgePairCount ?? 0;
      if (routeSignature) reportByRoute.set(routeSignature, report);
      return report;
    },
    readMetrics: () => ({
      evaluationCount,
      cacheHitCount,
      scannedNodeCount,
      scannedEdgePairCount,
    }),
  };
};
