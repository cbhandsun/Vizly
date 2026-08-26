import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  parseDisplayEdgesWorkerRequest,
  readDisplayEdgesWorkerRequestId,
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import {
  displayEdgesWorkerScope,
  postDisplayEdgesResponse,
  postTimedDisplayEdgesResponse,
} from './baseReactFlowDisplayWorkerScope';

type DisplayWorkerMessageHandler = (
  value: unknown,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
) => DisplayEdgesWorkerResponse;

type DisplayWorkerRequestHandler = (
  request: DisplayEdgesWorkerRequest,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
) => DisplayEdgesWorkerResponse;

/** Keeps the untrusted Worker message boundary outside the routing composition root. */
export const createBaseReactFlowDisplayWorkerMessageHandler = (
  handleRequest: DisplayWorkerRequestHandler,
): DisplayWorkerMessageHandler => (value, onBoundedCandidate) => {
  const request = parseDisplayEdgesWorkerRequest(value);
  if (!request) {
    return {
      requestId: readDisplayEdgesWorkerRequestId(value) ?? 'invalid-request',
      error: 'display-edge-worker-invalid-request',
    };
  }
  return handleRequest(request, onBoundedCandidate);
};

export const installBaseReactFlowDisplayWorkerTransport = (
  handleMessage: DisplayWorkerMessageHandler,
): void => {
  if (!displayEdgesWorkerScope) return;
  displayEdgesWorkerScope.onmessage = (event: MessageEvent<unknown>) => {
    const workerStartedAt = performance.now();
    const requestId = readDisplayEdgesWorkerRequestId(event.data) ?? 'invalid-request';
    try {
      const response = handleMessage(event.data, (boundedCandidate) => {
        if (!boundedCandidate.hardClean) {
          postDisplayEdgesResponse({ requestId, boundedCandidate });
        }
      });
      const transportRequest = parseDisplayEdgesWorkerRequest(event.data);
      postTimedDisplayEdgesResponse(
        response,
        workerStartedAt,
        transportRequest?.operation === 'incremental-route'
          ? transportRequest.edges
          : undefined,
      );
    } catch {
      postDisplayEdgesResponse({
        requestId,
        error: 'display-edge-worker-failed',
      });
    }
  };
};
