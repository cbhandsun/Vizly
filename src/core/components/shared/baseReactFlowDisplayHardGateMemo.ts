import type { Edge, Node } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
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
  getImmutableReport: (
    edges: readonly Edge[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ) => BaseDisplayBoundedCandidateReport;
  getRememberedImmutableReport: (
    edges: readonly Edge[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ) => BaseDisplayBoundedCandidateReport | undefined;
  getRememberedReport: (
    edges: readonly Edge[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ) => BaseDisplayBoundedCandidateReport | undefined;
  rememberReport: (
    edges: readonly Edge[],
    report: BaseDisplayBoundedCandidateReport,
  ) => boolean;
  rememberImmutableReport: (
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

const MAX_REQUEST_LOCAL_HARD_REPORTS = 256;

const terminalPolicyToken = (edge: Edge): string => (
  (['source', 'target'] as const).map((role) => {
    const policy = readEdgeTerminalPolicy(edge, role);
    return [
      policy.forbidden,
      policy.runtimeFixed,
      policy.sourceExactFixed,
      policy.positionFixed,
      policy.sideFixed,
    ].map(value => value ? '1' : '0').join('');
  }).join(':')
);

/** Exact geometry and terminal-policy identity consumed by every hard gate. */
export const computeBaseDisplayHardGateEvidenceSignature = (
  edges: readonly Edge[],
): string | null => {
  const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
  return routeSignature
    ? `${routeSignature}\u001f${edges.map(terminalPolicyToken).join('\u001e')}`
    : null;
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
  const reportByImmutableEdges = new WeakMap<
    readonly Edge[],
    BaseDisplayBoundedCandidateReport
  >();
  let evaluationCount = 0;
  let cacheHitCount = 0;
  let scannedNodeCount = 0;
  let scannedEdgePairCount = 0;

  const rememberBySignature = (
    routeSignature: string,
    report: BaseDisplayBoundedCandidateReport,
  ): void => {
    if (!reportByRoute.has(routeSignature)
      && reportByRoute.size >= MAX_REQUEST_LOCAL_HARD_REPORTS) {
      const oldestSignature = reportByRoute.keys().next().value as string | undefined;
      if (oldestSignature !== undefined) reportByRoute.delete(oldestSignature);
    }
    reportByRoute.set(routeSignature, report);
  };

  const getRememberedReport = (
    edges: readonly Edge[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ): BaseDisplayBoundedCandidateReport | undefined => {
    const routeSignature = computeBaseDisplayHardGateEvidenceSignature(edges);
    if (!routeSignature) return undefined;
    const cached = reportByRoute.get(routeSignature);
    if (!cached) return undefined;
    cacheHitCount += 1;
    return cached.candidate === candidate ? cached : { ...cached, candidate };
  };

  const rememberReport = (
    edges: readonly Edge[],
    report: BaseDisplayBoundedCandidateReport,
  ): boolean => {
    const routeSignature = computeBaseDisplayHardGateEvidenceSignature(edges);
    if (!routeSignature) return false;
    rememberBySignature(routeSignature, report);
    return true;
  };

  const getReportWithSignature = (
    edges: Edge[],
    candidate: BaseDisplayBoundedCandidateReport['candidate'],
  ): Readonly<{
    report: BaseDisplayBoundedCandidateReport;
    routeSignature: string | null;
  }> => {
    const routeSignature = computeBaseDisplayHardGateEvidenceSignature(edges);
    if (routeSignature) {
      const cached = reportByRoute.get(routeSignature);
      if (cached) {
        cacheHitCount += 1;
        return {
          report: cached.candidate === candidate ? cached : { ...cached, candidate },
          routeSignature,
        };
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
    if (routeSignature) rememberBySignature(routeSignature, report);
    return { report, routeSignature };
  };
  const getReport: HardGateEvaluator = (edges, _nodes, candidate) => (
    getReportWithSignature(edges, candidate).report
  );

  return {
    getRememberedReport,
    rememberReport,
    getReport,
    getRememberedImmutableReport(edges, candidate) {
      const cached = reportByImmutableEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached.candidate === candidate ? cached : { ...cached, candidate };
      }
      const report = getRememberedReport(edges, candidate);
      if (report) reportByImmutableEdges.set(edges, report);
      return report;
    },
    getImmutableReport(edges, candidate) {
      const cached = reportByImmutableEdges.get(edges);
      if (cached) {
        cacheHitCount += 1;
        return cached.candidate === candidate ? cached : { ...cached, candidate };
      }
      const { report, routeSignature } = getReportWithSignature([...edges], candidate);
      if (routeSignature) reportByImmutableEdges.set(edges, report);
      return report;
    },
    rememberImmutableReport(edges, report) {
      if (!rememberReport(edges, report)) return false;
      reportByImmutableEdges.set(edges, report);
      return true;
    },
    readMetrics: () => ({
      evaluationCount,
      cacheHitCount,
      scannedNodeCount,
      scannedEdgePairCount,
    }),
  };
};
