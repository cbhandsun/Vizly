import type { Edge } from '@xyflow/react';

import {
  computeBaseDisplayInputSignature,
  isBaseDisplayFinalized,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { closeBaseReactFlowFinalDisplayRoute } from './baseReactFlowDisplayFinalRouteClosure';
import {
  createBaseReactFlowDisplayExactReport,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import {
  createBaseReactFlowFullRouteEdges,
  type BaseReactFlowDisplayEdgesArgs,
} from './baseReactFlowDisplayFullRoutePipeline';
import { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';

export type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
export { repairBoundedReverseParallelOverlaps } from './baseReactFlowDisplayReverseParallelOverlapClosure';
export {
  baseReactFlowDisplayHardQualityIsClean,
  computeBaseReactFlowDisplayEdgeEpoch,
} from './baseReactFlowDisplayQualityGates';
export { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
export {
  repairBaseReactFlowMeasuredDisplayEdges,
  repairBaseReactFlowMeasuredDisplayEdgesWithReport,
} from './baseReactFlowDisplayMeasuredRepair';
export { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';

/**
 * Compatibility facade retained while tests migrate to the production Worker.
 * Production rendering must use the Worker-owned Routing Session transaction.
 */
export const createBaseReactFlowDisplayEdges = (
  args: BaseReactFlowDisplayEdgesArgs,
): Edge[] => {
  const inputSignature = computeBaseDisplayInputSignature({
    nodes: args.nodes,
    edges: args.edges,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
  });
  if (!args.skipFinalizedReuse && isBaseDisplayFinalized(args.edges, inputSignature)) {
    return args.edges;
  }
  const repairNodes = withDisplayAbsolutePositions(
    args.nodes,
    new Map(args.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const routedEdges = createBaseReactFlowFullRouteEdges({
    ...args,
    createPreDisplayFinalEdges: preDisplayArgs => {
      let boundedReport: import('./baseReactFlowDisplayEvaluation').BaseDisplayBoundedCandidateReport
        | undefined;
      const boundedEdges = createBaseReactFlowPreDisplayFinalEdges({
        ...preDisplayArgs,
        onBoundedCandidate: report => {
          boundedReport = report;
          preDisplayArgs.onBoundedCandidate?.(report);
        },
      });
      if (boundedReport) {
        exactReport = createBaseReactFlowDisplayExactReport(
          boundedEdges,
          args.nodes,
          repairNodes,
          boundedReport,
        );
      }
      return boundedEdges;
    },
  });
  return closeBaseReactFlowFinalDisplayRoute({
    args,
    routedEdges,
    repairNodes,
    inputSignature,
    exactReport,
  });
};
