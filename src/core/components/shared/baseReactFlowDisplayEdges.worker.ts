import type { Edge, Node } from '@xyflow/react';

import {
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowDisplayExactReport,
  finalizeBaseReactFlowDisplayEdgesWithReport,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import { createBaseReactFlowFullRouteEdges } from './baseReactFlowDisplayFullRoutePipeline';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { baseReactFlowDisplayHardQualityIsClean } from './baseReactFlowDisplayQualityGates';
import { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';
import type { DisplayQualityMode } from './baseReactFlowDisplayWorkerClient';

export type DisplayEdgesWorkerRequest = {
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  qualityMode?: DisplayQualityMode;
};

export type DisplayEdgesWorkerResponse = {
  requestId: string;
  edges?: Edge[];
  hardClean?: boolean;
  error?: string;
  boundedCandidate?: BaseDisplayBoundedCandidateReport;
};

const postDisplayEdgesResponse = (response: DisplayEdgesWorkerResponse): void => {
  (self as any).postMessage(response);
};

export const computeBaseReactFlowDisplayEdgesWorkerResponse = (
  request: DisplayEdgesWorkerRequest,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  const commonInput = {
    edges: request.edges,
    nodes: request.nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
    displayEdgeEpoch: request.displayEdgeEpoch,
  };
  if (request.qualityMode === 'interactive') {
    const edges = createBaseReactFlowInteractiveDisplayEdges(commonInput);
    return {
      requestId: request.requestId,
      edges,
      hardClean: baseReactFlowDisplayHardQualityIsClean(edges, request.nodes),
    };
  }

  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
    createPreDisplayFinalEdges: (preDisplayArgs) => {
      let boundedReport: BaseDisplayBoundedCandidateReport | undefined;
      const boundedEdges = createBaseReactFlowPreDisplayFinalEdges({
        ...preDisplayArgs,
        onBoundedCandidate: (report) => {
          boundedReport = report;
          preDisplayArgs.onBoundedCandidate?.(report);
          onBoundedCandidate?.(report);
        },
      });
      if (boundedReport) {
        exactReport = createBaseReactFlowDisplayExactReport(
          boundedEdges,
          request.nodes,
          repairNodes,
          boundedReport,
        );
      }
      return boundedEdges;
    },
  });
  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    fullRouteEdges,
    request.nodes,
    exactReport,
  );
  return {
    requestId: request.requestId,
    edges: finalized.edges,
    hardClean: finalized.report.hardClean,
  };
};

const isDisplayEdgesWorkerScope = typeof self !== 'undefined'
  && typeof (self as any).postMessage === 'function'
  && typeof (self as any).document === 'undefined';

if (isDisplayEdgesWorkerScope) {
  (self as any).onmessage = (event: MessageEvent<DisplayEdgesWorkerRequest>) => {
    const request = event.data;
    try {
      const response = computeBaseReactFlowDisplayEdgesWorkerResponse(
        request,
        (boundedCandidate) => {
          if (!boundedCandidate.hardClean) {
            postDisplayEdgesResponse({ requestId: request.requestId, boundedCandidate });
          }
        },
      );
      postDisplayEdgesResponse(response);
    } catch {
      postDisplayEdgesResponse({
        requestId: request.requestId,
        error: 'display-edge-worker-failed',
      });
    }
  };
}
