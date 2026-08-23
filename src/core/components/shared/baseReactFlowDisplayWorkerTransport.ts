import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  parseDisplayEdgesWorkerRequest,
  readDisplayEdgesWorkerRequestId,
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
