import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;

const DISPLAY_ROUTING_TIMEOUT_DIAGNOSTICS_EXPRESSION = `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return {
    routing: {
      stage: routing.stage,
      workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      workerResolution: routing.workerResolution,
      fallbackLevel: routing.fallbackLevel,
      outputRouteSignaturePresent: typeof routing.outputRouteSignature === 'string',
    },
    requestCount: (window.__vizlyRoutingRequests || []).length,
    responseCount: (window.__vizlyRoutingResponses || []).length,
    requests: (window.__vizlyRoutingRequests || []).map(request => ({
      operation: request?.operation,
      edgeCount: Array.isArray(request?.edges) ? request.edges.length : null,
    })),
    responses: (window.__vizlyRoutingResponses || []).map(response => ({
      hardClean: response?.hardClean,
      routeResolution: response?.routeResolution,
      fallbackLevel: response?.fallbackLevel,
      edgeCount: Array.isArray(response?.edges)
        ? response.edges.length
        : (Array.isArray(response?.routingPatches) ? response.routingPatches.length : null),
    })),
    renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    renderedPathCount: document.querySelectorAll(
      '.react-flow__edge .react-flow__edge-path',
    ).length,
  };
})()`;

export const waitForDisplayRoutingBrowserValue = async (
  session,
  expression,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await session.evaluate(expression);
    if (value) return value;
    await delay(100);
  }
  const diagnostics = await session.evaluate(
    DISPLAY_ROUTING_TIMEOUT_DIAGNOSTICS_EXPRESSION,
  );
  throw new Error(
    `Timed out waiting for browser state\n${JSON.stringify(diagnostics, null, 2)}`,
  );
};
