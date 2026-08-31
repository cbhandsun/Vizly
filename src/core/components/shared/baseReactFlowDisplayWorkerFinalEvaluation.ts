import type { Edge, Node } from '@xyflow/react';

import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import { withExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import { baseReactFlowDisplayHardQualityIsClean } from './baseReactFlowDisplayQualityGates';
import {
  repairBaseReactFlowMinimumBusinessNodeClearance,
} from './baseReactFlowDisplayBusinessNodeClearance';

export type DisplayWorkerFinalizationOptions = Readonly<{
  commercialStabilizationPass?: number;
  eligibleEdgeIds?: ReadonlySet<string>;
  initialHardReport?: BaseDisplayBoundedCandidateReport;
  initialHardReportEdges?: ReadonlyArray<DisplayEdgesWorkerRequest['edges'][number]>;
  isLargeGraph: boolean;
  finalEvaluation?: DisplayWorkerFinalEvaluation;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  preferredEdges?: ReadonlyArray<DisplayEdgesWorkerRequest['edges'][number]>;
}>;

export type DisplayWorkerFinalEvaluation = Readonly<{
  repairNodes: Node[];
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  hardQualityIsClean: (edges: readonly Edge[]) => boolean;
}>;

export type TracedDisplayWorkerFinalEvaluation = DisplayWorkerFinalEvaluation & Readonly<{
  withExactHardReport: (
    response: DisplayEdgesWorkerResponse,
  ) => DisplayEdgesWorkerResponse;
}>;

/** Builds one final-evaluation scope and safely seeds exact Worker evidence. */
export const createDisplayWorkerFinalEvaluation = ({
  nodes,
  responseEdges,
  initialHardReport,
  initialHardReportEdges,
  eligibleEdgeIds,
}: Readonly<{
  nodes: Node[];
  responseEdges: Edge[];
  initialHardReport?: BaseDisplayBoundedCandidateReport;
  initialHardReportEdges?: readonly Edge[];
  eligibleEdgeIds?: ReadonlySet<string>;
}>): DisplayWorkerFinalEvaluation => {
  const repairNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(repairNodes, eligibleEdgeIds);
  if (initialHardReport && initialHardReportEdges === responseEdges) {
    evaluation.rememberHardReport(responseEdges, initialHardReport);
  }
  return {
    repairNodes,
    evaluation,
    hardQualityIsClean: edges => evaluation.hardReport(edges).hardClean,
  };
};

/** Owns final-evaluation tracing so the Worker composition root only orchestrates it. */
export const createTracedDisplayWorkerFinalEvaluation = ({
  nodes,
  responseEdges,
  options,
}: Readonly<{
  nodes: Node[];
  responseEdges: Edge[];
  options: DisplayWorkerFinalizationOptions;
}>): TracedDisplayWorkerFinalEvaluation => {
  const evaluationTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-evaluation-context',
    candidateCount: responseEdges.length,
    onTrace: options.onPhaseTrace,
  });
  const scope = options.finalEvaluation ?? createDisplayWorkerFinalEvaluation({
    nodes,
    responseEdges,
    initialHardReport: options.initialHardReport,
    initialHardReportEdges: options.initialHardReportEdges,
    eligibleEdgeIds: options.eligibleEdgeIds,
  });
  evaluationTimer.finish(options.finalEvaluation ? 'hit' : 'accepted');

  return {
    ...scope,
    withExactHardReport: response => {
      const reportTimer = startDisplayRoutingPhaseTrace({
        phase: 'final-exact-hard-report',
        candidateCount: response.edges?.length ?? 0,
        onTrace: options.onPhaseTrace,
      });
      const exactResponse = withExactDisplayHardReport(response, scope.repairNodes);
      reportTimer.finish(
        exactResponse.hardClean === true ? 'accepted' : 'rejected',
        exactResponse.edges?.length ?? 0,
      );
      return exactResponse;
    },
  };
};

/** Finishes the parent finalizer span against the response that will be committed. */
export const finishDisplayWorkerFinalization = (
  timer: ReturnType<typeof startDisplayRoutingPhaseTrace>,
  response: DisplayEdgesWorkerResponse,
  changedEdgeCount = response.edges?.length ?? 0,
): DisplayEdgesWorkerResponse => {
  timer.finish(
    response.hardClean === true ? 'accepted' : 'fallback',
    changedEdgeCount,
  );
  return response;
};

/** Applies the bounded-repair clearance gate before a repair response can commit. */
export const finalizeBoundedDisplayWorkerRepairResponse = (
  response: DisplayEdgesWorkerResponse,
  nodes: Node[],
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const repairNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const clearanceEdges = repairBaseReactFlowMinimumBusinessNodeClearance(
    response.edges,
    repairNodes,
    undefined,
    false,
  );
  const safeEdges = baseReactFlowDisplayHardQualityIsClean(clearanceEdges, repairNodes)
    ? clearanceEdges
    : response.edges;
  return withExactDisplayHardReport({ ...response, edges: safeEdges }, repairNodes);
};
