import type { Edge, Node } from '@xyflow/react';

import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  getDisplayHardQualityGateReport,
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
  evaluateReport: HardGateEvaluator = getDisplayHardQualityGateReport,
): BaseDisplayHardGateMemo => {
  const reportByRoute = new Map<string, BaseDisplayBoundedCandidateReport>();

  return {
    getReport(edges, _nodes, candidate) {
      const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
      if (routeSignature) {
        const cached = reportByRoute.get(routeSignature);
        if (cached) {
          return cached.candidate === candidate ? cached : { ...cached, candidate };
        }
      }

      const report = evaluateReport(edges, nodes, candidate, terminalSnapshot);
      if (routeSignature) reportByRoute.set(routeSignature, report);
      return report;
    },
  };
};
