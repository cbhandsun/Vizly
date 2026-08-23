import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { createBaseReactFlowDisplayEdgePatches } from './baseReactFlowDisplayRoutingTransaction';

interface DisplayEdgesWorkerScope {
  postMessage: (response: DisplayEdgesWorkerResponse) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

export const displayEdgesWorkerScope = typeof self !== 'undefined'
  && !('document' in self)
  ? self as unknown as DisplayEdgesWorkerScope
  : null;

export const postDisplayEdgesResponse = (response: DisplayEdgesWorkerResponse): void => {
  displayEdgesWorkerScope?.postMessage(response);
};

export const createDisplayEdgesTransportResponse = (
  response: DisplayEdgesWorkerResponse,
  incrementalSourceEdges?: import('@xyflow/react').Edge[],
): DisplayEdgesWorkerResponse => {
  const routingPatches = response.edges && incrementalSourceEdges
    ? createBaseReactFlowDisplayEdgePatches(incrementalSourceEdges, response.edges)
    : null;
  if (!routingPatches) return response;
  const { edges: _edges, ...metadata } = response;
  return { ...metadata, routingPatches };
};

export const postTimedDisplayEdgesResponse = (
  response: DisplayEdgesWorkerResponse,
  startedAt: number,
  incrementalSourceEdges?: import('@xyflow/react').Edge[],
): void => {
  const transportResponse = createDisplayEdgesTransportResponse(response, incrementalSourceEdges);
  postDisplayEdgesResponse({
    ...transportResponse,
    ...((response.edges || response.routingPatches)
      ? { workerDurationMs: Math.max(0, performance.now() - startedAt) }
      : {}),
  });
};
