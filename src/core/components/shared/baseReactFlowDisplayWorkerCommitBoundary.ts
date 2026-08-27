import type { Edge } from '@xyflow/react';

import {
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
} from '../../routing/routingSessionIdentity';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

/** Binds a hard-clean Worker receipt to both the submitted identity and replayed geometry. */
export const displayWorkerCommitReceiptMatchesRequest = ({
  request,
  response,
  responseEdges,
}: {
  request: DisplayEdgesWorkerRequest;
  response: DisplayEdgesWorkerResponse;
  responseEdges: Edge[];
}): boolean => {
  if (response.hardClean !== true) return true;
  const expectedIdentity = request.operation === 'incremental-route'
    ? createDisplayRoutingIdentity(
      request.nextInputSignature,
      request.nextInputGeometryDigest,
    )
    : request.inputIdentity;
  return Boolean(
    expectedIdentity
    && response.commitReceipt
    && displayRoutingIdentitiesMatch(response.commitReceipt.identity, expectedIdentity)
    && computeBaseReactFlowDisplayOutputRouteSignature(responseEdges)
      === response.commitReceipt.outputRouteSignature,
  );
};
