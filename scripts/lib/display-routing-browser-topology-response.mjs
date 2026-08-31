export const displayRoutingTopologyRequestMatchesResponse = (request, response) => (
  request !== null
  && typeof request === 'object'
  && response !== null
  && typeof response === 'object'
  && typeof request.requestId === 'string'
  && request.requestId === response.requestId
  && (
    !Number.isSafeInteger(response.__browserRequestOrdinal)
    || request.__browserRequestOrdinal === response.__browserRequestOrdinal
  )
  && (
    !Number.isSafeInteger(response.__browserAttemptOrdinal)
    || request.__browserAttemptOrdinal === response.__browserAttemptOrdinal
  )
  && (
    typeof response.__browserWorkerInstanceId !== 'string'
    || request.__browserWorkerInstanceId === response.__browserWorkerInstanceId
  )
);

export const displayRoutingTopologyResponseIsFinal = (request, response) => (
  displayRoutingTopologyRequestMatchesResponse(request, response)
  && response?.hardClean === true
  && response?.hardReport?.hardClean === true
  && Array.isArray(response?.routingPatches)
);

/** Select the newest complete response for one captured attempt. Phase
 * notifications can arrive after the final response and intentionally carry
 * no hard report or routing patches, so array order alone is not authoritative. */
export const findDisplayRoutingTopologyFinalResponse = (request, responses) => {
  if (!Array.isArray(responses)) return null;
  for (let index = responses.length - 1; index >= 0; index -= 1) {
    const response = responses[index];
    if (displayRoutingTopologyResponseIsFinal(request, response)) return response;
  }
  return null;
};

export const countDisplayRoutingTopologyFinalResponses = (request, responses) => (
  Array.isArray(responses)
    ? responses.filter(response => displayRoutingTopologyResponseIsFinal(request, response)).length
    : 0
);
