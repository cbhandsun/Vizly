import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';

import { createDisplayRoutingIdentity } from './baseReactFlowDisplayRoutingSession';
import { rememberDisplayWorkerSession } from './baseReactFlowDisplayWorkerSessionClient';
import { createBaseReactFlowDisplayEdgePatches } from './baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
import type {
  BaseReactFlowDisplayWorkerResult,
  requestBaseReactFlowDisplayEdgesWorker,
} from './baseReactFlowDisplayWorkerClient';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerRouteResolution,
} from './baseReactFlowDisplayWorkerProtocol';

export type BaseReactFlowLayoutRepairWorkerOptions = {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  stagedCandidateEdges: Edge[];
  fallbackCandidateEdges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  inputSignature: string;
  inputGeometryDigest: string;
  stopAfterObstacleFailure?: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
};

export const doesBaseReactFlowDisplayWorkerResolutionMatchOperation = (
  operation: DisplayEdgesWorkerRequest['operation'],
  routeResolution: DisplayEdgesWorkerRouteResolution,
): boolean => {
  if (operation === 'route') {
    return routeResolution === 'full-route' || routeResolution === 'full-route-repaired';
  }
  if (operation === 'repair') return routeResolution === 'repair';
  if (operation === 'repair-validate-or-route') {
    return routeResolution === 'repair'
      || routeResolution === 'validated-candidate'
      || routeResolution === 'repaired-candidate'
      || routeResolution === 'full-route'
      || routeResolution === 'full-route-repaired';
  }
  if (operation === 'incremental-route') {
    return routeResolution === 'incremental-route'
      || routeResolution === 'full-route'
      || routeResolution === 'full-route-repaired';
  }
  return routeResolution === 'validated-candidate'
    || routeResolution === 'repaired-candidate'
    || routeResolution === 'full-route'
    || routeResolution === 'full-route-repaired';
};

export const runBaseReactFlowLayoutRepairAndRouteInWorker = async (
  {
    workerRef,
    requestId,
    edges,
    nodes,
    stagedCandidateEdges,
    fallbackCandidateEdges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    inputSignature,
    inputGeometryDigest,
    stopAfterObstacleFailure = false,
    timeoutMs,
    signal,
  }: BaseReactFlowLayoutRepairWorkerOptions,
  requestWorker: typeof requestBaseReactFlowDisplayEdgesWorker,
): Promise<BaseReactFlowDisplayWorkerResult> => {
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
  const projectedStaged = projectBaseReactFlowDisplayWorkerInput({
    edges: stagedCandidateEdges,
    nodes,
  });
  const projectedFallback = projectBaseReactFlowDisplayWorkerInput({
    edges: fallbackCandidateEdges,
    nodes,
  });
  const candidatePatches = createBaseReactFlowDisplayEdgePatches(
    projectedInput.edges,
    projectedStaged.edges,
  );
  const fallbackCandidatePatches = createBaseReactFlowDisplayEdgePatches(
    projectedInput.edges,
    projectedFallback.edges,
  );
  if (!candidatePatches || !fallbackCandidatePatches) {
    throw new Error('display-edge-worker-invalid-candidate');
  }
  const result = await requestWorker({
    workerRef,
    request: {
      operation: 'repair-validate-or-route',
      requestId,
      edges: projectedInput.edges,
      nodes: projectedInput.nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      displayEdgeEpoch: 0,
      qualityMode: 'full',
      inputIdentity: createDisplayRoutingIdentity(inputSignature, inputGeometryDigest),
      candidatePatches,
      fallbackCandidatePatches,
      candidateSource: 'persistent',
      stopAfterObstacleFailure,
    },
    qualityMode: 'full',
    timeoutMs,
    signal,
  });
  rememberDisplayWorkerSession(workerRef.current, result.sessionRef);
  return { ...result, projectedEdges: projectedInput.edges };
};
