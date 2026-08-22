import type { Edge, Node } from '@xyflow/react';
import type { MutableRefObject } from 'react';

import { projectBaseReactFlowDisplayWorkerInput } from './baseReactFlowDisplayWorkerProjection';
import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';
import {
  createDisplayRoutingIdentity,
  type RoutingWorkerSessionRef,
} from './baseReactFlowDisplayRoutingSession';
import {
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import {
  type BaseReactFlowDisplayWorkerResult,
  requestBaseReactFlowDisplayEdgesWorker,
} from './baseReactFlowDisplayWorkerClient';
import {
  displayWorkerKnowsSession,
  rememberDisplayWorkerSession,
} from './baseReactFlowDisplayWorkerSessionClient';
import { DISPLAY_WORKER_TIMEOUT_MS } from './baseReactFlowDisplayWorkerTimeout';

export const computeBaseReactFlowDisplayEdgesIncrementallyInWorker = async ({
  workerRef,
  requestId,
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
  baselineInputSignature,
  baselineInputGeometryDigest,
  baselineNodes,
  baselineSourceEdges,
  baselinePatches,
  baselineOutputRouteSignature,
  baselineSessionRef,
  nextInputSignature,
  nextInputGeometryDigest,
  changeSet,
  mutableEdgeIds,
  contextEdgeIds,
  timeoutMs = DISPLAY_WORKER_TIMEOUT_MS,
  signal,
}: {
  workerRef: MutableRefObject<Worker | null>;
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  baselineInputSignature: string;
  baselineInputGeometryDigest: string;
  baselineNodes: Node[];
  baselineSourceEdges: Edge[];
  baselinePatches: Edge[];
  baselineOutputRouteSignature: string;
  baselineSessionRef?: RoutingWorkerSessionRef;
  nextInputSignature: string;
  nextInputGeometryDigest: string;
  changeSet: BaseReactFlowRoutingChangeSet;
  mutableEdgeIds: string[];
  contextEdgeIds: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<BaseReactFlowDisplayWorkerResult> => {
  const projectedInput = projectBaseReactFlowDisplayWorkerInput({ edges, nodes });
  const projectedBaseline = projectBaseReactFlowDisplayWorkerInput({
    edges: baselineSourceEdges,
    nodes: baselineNodes,
  });
  const safeBaselinePatches = sanitizeBaseReactFlowTrustedDisplayPatches(
    projectedBaseline.edges,
    baselinePatches,
  );
  if (!safeBaselinePatches) {
    throw new Error('display-edge-worker-invalid-incremental-baseline');
  }
  const canUseWorkerSession = displayWorkerKnowsSession(
    workerRef.current,
    baselineSessionRef,
  );
  const result = await requestBaseReactFlowDisplayEdgesWorker({
    workerRef,
    request: {
      operation: 'incremental-route',
      requestId,
      edges: projectedInput.edges,
      nodes: projectedInput.nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      displayEdgeEpoch,
      qualityMode: 'full',
      inputIdentity: createDisplayRoutingIdentity(nextInputSignature, nextInputGeometryDigest),
      ...(baselineSessionRef ? { baselineSessionRef } : {}),
      baselineInputSignature,
      baselineInputGeometryDigest,
      ...(!canUseWorkerSession ? {
        baselineNodes: projectedBaseline.nodes,
        baselineSourceEdges: projectedBaseline.edges,
        baselinePatches: safeBaselinePatches,
      } : {}),
      baselineOutputRouteSignature,
      nextInputSignature,
      nextInputGeometryDigest,
      changeSet,
      mutableEdgeIds,
      contextEdgeIds,
    },
    qualityMode: 'full',
    timeoutMs,
    signal,
  });
  rememberDisplayWorkerSession(workerRef.current, result.sessionRef);
  return { ...result, projectedEdges: projectedInput.edges };
};
