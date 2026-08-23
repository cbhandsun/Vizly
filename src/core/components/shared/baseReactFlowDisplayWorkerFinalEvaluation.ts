import type { Edge, Node } from '@xyflow/react';

import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type { DisplayEdgesWorkerRequest } from './baseReactFlowDisplayWorkerProtocol';

export type DisplayWorkerFinalizationOptions = Readonly<{
  commercialStabilizationPass?: number;
  eligibleEdgeIds?: ReadonlySet<string>;
  initialHardReport?: BaseDisplayBoundedCandidateReport;
  initialHardReportEdges?: ReadonlyArray<DisplayEdgesWorkerRequest['edges'][number]>;
  isLargeGraph: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  preferredEdges?: ReadonlyArray<DisplayEdgesWorkerRequest['edges'][number]>;
}>;

export type DisplayWorkerFinalEvaluation = Readonly<{
  repairNodes: Node[];
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  hardQualityIsClean: (edges: readonly Edge[]) => boolean;
}>;

/** Builds one final-evaluation scope and safely seeds exact Worker evidence. */
export const createDisplayWorkerFinalEvaluation = ({
  nodes,
  responseEdges,
  initialHardReport,
  initialHardReportEdges,
}: Readonly<{
  nodes: Node[];
  responseEdges: Edge[];
  initialHardReport?: BaseDisplayBoundedCandidateReport;
  initialHardReportEdges?: readonly Edge[];
}>): DisplayWorkerFinalEvaluation => {
  const repairNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  if (initialHardReport && initialHardReportEdges === responseEdges) {
    evaluation.rememberHardReport(responseEdges, initialHardReport);
  }
  return {
    repairNodes,
    evaluation,
    hardQualityIsClean: edges => evaluation.hardReport(edges).hardClean,
  };
};
