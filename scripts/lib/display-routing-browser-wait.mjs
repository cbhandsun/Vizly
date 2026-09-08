import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;

const DISPLAY_ROUTING_TIMEOUT_DIAGNOSTICS_EXPRESSION = `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const boundedCount = value => Number.isSafeInteger(value) && value >= 0
    ? Math.min(100_000, value) : null;
  const bootErrors = window.__vizlyBrowserBootErrors || {};
  const token = (value, allowed) => allowed.includes(value) ? value : 'unknown';
  const resolutions = ['full-route', 'full-route-repaired', 'incremental-route', 'validated-candidate'];
  const fallback = value => token(value, ['none', 'full', 'local', 'bounded']);
  const requests = Array.isArray(window.__vizlyRoutingRequests) ? window.__vizlyRoutingRequests : [];
  const responses = Array.isArray(window.__vizlyRoutingResponses) ? window.__vizlyRoutingResponses : [];
  const milestones = window.__vizlyBrowserBootMilestones || {};
  return {
    milestones: Object.fromEntries([
      'domReadyMs', 'pageLoadedMs', 'rootObservedMs', 'workerConstructedMs',
      'workerRequestMs', 'workerResponseMs', 'pathObservedMs',
    ].map(name => [name, Number.isFinite(milestones[name]) && milestones[name] >= 0
      && milestones[name] <= 600_000 ? milestones[name] : null])),
    page: {
      readyState: ['loading', 'interactive', 'complete'].includes(document.readyState)
        ? document.readyState : 'unknown',
      protocol: ['http:', 'https:', 'about:', 'chrome-error:'].includes(window.location?.protocol)
        ? window.location.protocol : 'other',
      captureInstalled: !!window.__vizlyBrowserBootErrors,
      rootChildCount: boundedCount(document.querySelector('#root')?.childElementCount),
      moduleScriptCount: document.querySelectorAll('script[type="module"]').length,
      renderedNodeCount: document.querySelectorAll('.react-flow__node').length,
      scriptErrors: boundedCount(bootErrors.script),
      resourceErrors: boundedCount(bootErrors.resource),
      unhandledRejections: boundedCount(bootErrors.rejection),
    },
    routing: {
      stage: token(routing.stage, ['scheduled', 'routing', 'final-applied', 'worker-phase',
        'worker-post', 'worker-response', 'worker-response-error', 'worker-error',
        'worker-message-error', 'worker-cancelled', 'worker-timeout', 'worker-bounded-fallback']),
      workerStartCount: boundedCount(routing.workerStartCount),
      workerAbortCount: boundedCount(routing.workerAbortCount),
      workerResolution: token(routing.workerResolution, resolutions),
      fallbackLevel: fallback(routing.fallbackLevel),
      outputRouteSignaturePresent: typeof routing.outputRouteSignature === 'string',
    },
    requestCount: boundedCount(requests.length),
    responseCount: boundedCount(responses.length),
    requests: requests.slice(-16).map(request => ({
      operation: token(request?.operation, ['route', 'validate-or-route',
        'repair-validate-or-route', 'incremental-route', 'repair']),
      edgeCount: Array.isArray(request?.edges) ? boundedCount(request.edges.length) : null,
    })),
    responses: responses.slice(-16).map(response => ({
      hardClean: typeof response?.hardClean === 'boolean' ? response.hardClean : null,
      routeResolution: token(response?.routeResolution, resolutions),
      fallbackLevel: fallback(response?.fallbackLevel),
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
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 600_000) {
    throw new Error('Invalid browser wait timeout');
  }
  // CDP evaluation can itself hang when the renderer stops responding. Race
  // each call against the remaining budget, including the final evidence read.
  const evaluateWithin = async (source, budgetMs) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => session.evaluate(source)).then(
          value => ({ status: 'available', value }),
          () => ({ status: 'evaluation-failed' }),
        ),
        new Promise(resolve => {
          timer = setTimeout(() => resolve({ status: 'evaluation-timeout' }), budgetMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const deadline = Date.now() + timeoutMs;
  let waitStatus = 'not-ready';
  while (Date.now() < deadline) {
    const result = await evaluateWithin(expression, Math.max(0, deadline - Date.now()));
    if (result.status !== 'available') {
      waitStatus = result.status;
      break;
    }
    if (result.value) return result.value;
    await delay(Math.min(100, Math.max(0, deadline - Date.now())));
  }
  const evidence = await evaluateWithin(
    DISPLAY_ROUTING_TIMEOUT_DIAGNOSTICS_EXPRESSION, 1_000,
  );
  const diagnostics = evidence.status === 'available' ? evidence.value : null;
  throw new Error(
    `Timed out waiting for browser state\n${JSON.stringify({
      waitStatus, evidenceStatus: evidence.status, diagnostics,
    }, null, 2)}`,
  );
};
