/** Browser-injected, content-free evidence shared by normal and cold captures.
 * Keep self-contained: never return identifiers, paths, messages or page text.
 */
export const readDisplayRoutingBrowserLifecycle = () => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(100_000, value) : null;
  const token = (value, allowed) => allowed.includes(value) ? value : 'unknown';
  const list = value => Array.isArray(value) ? value : [];
  const bootErrors = window.__vizlyBrowserBootErrors || {};
  const resolutions = ['full-route', 'full-route-repaired', 'incremental-route', 'validated-candidate'];
  const fallback = value => token(value, ['none', 'full', 'local', 'bounded']);
  const requests = Array.isArray(window.__vizlyRoutingRequests) ? window.__vizlyRoutingRequests
    : window.__vizlyPrecompiledRouteRequest ? [window.__vizlyPrecompiledRouteRequest] : [];
  const responses = Array.isArray(window.__vizlyRoutingResponses) ? window.__vizlyRoutingResponses
    : window.__vizlyPrecompiledRouteResponse ? [window.__vizlyPrecompiledRouteResponse] : [];
  const milestones = window.__vizlyBrowserBootMilestones || {};
  const rootChildren = count(document.querySelector('#root')?.childElementCount);
  const renderedNodes = count(document.querySelectorAll('.react-flow__node').length);
  const renderedPaths = count(document.querySelectorAll('.react-flow__edge .react-flow__edge-path').length);
  const stage = token(routing.stage, ['scheduled', 'routing', 'final-applied', 'worker-phase',
    'worker-post', 'worker-response', 'worker-response-error', 'worker-error',
    'worker-message-error', 'worker-cancelled', 'worker-timeout', 'worker-bounded-fallback',
    'final-quality-rejected', 'final-safety-rejected']);
  const failureStage = ['worker-response-error', 'worker-error', 'worker-message-error',
    'worker-cancelled', 'worker-timeout', 'final-quality-rejected', 'final-safety-rejected'].includes(stage);
  return {
    schema: 'browser-lifecycle-v1',
    // These describe observed boundaries, not inferred causes or Worker readiness.
    observation: failureStage ? 'routing-failed' : stage === 'final-applied'
      ? (renderedPaths > 0 ? 'committed-path-observed' : 'committed-no-path-observed')
      : responses.length ? 'worker-response-observed' : requests.length ? 'worker-request-observed'
      : renderedNodes > 0 ? 'nodes-observed' : rootChildren > 0 ? 'root-observed' : 'page-loading',
    milestones: Object.fromEntries([
      'domReadyMs', 'pageLoadedMs', 'rootObservedMs', 'workerConstructedMs',
      'workerRequestMs', 'workerResponseMs', 'pathObservedMs',
    ].map(name => [name, Number.isFinite(milestones[name]) && milestones[name] >= 0
      && milestones[name] <= 600_000 ? milestones[name] : null])),
    page: {
      readyState: token(document.readyState, ['loading', 'interactive', 'complete']),
      protocol: ['http:', 'https:', 'about:', 'chrome-error:'].includes(window.location?.protocol)
        ? window.location.protocol : 'other',
      captureInstalled: !!window.__vizlyBrowserBootErrors,
      rootChildCount: rootChildren,
      moduleScriptCount: count(document.querySelectorAll('script[type="module"]').length),
      renderedNodeCount: renderedNodes,
      scriptErrors: count(bootErrors.script), resourceErrors: count(bootErrors.resource),
      unhandledRejections: count(bootErrors.rejection),
    },
    routing: {
      stage, workerStartCount: count(routing.workerStartCount), workerAbortCount: count(routing.workerAbortCount),
      workerResolution: token(routing.workerResolution, resolutions), fallbackLevel: fallback(routing.fallbackLevel),
      outputRouteSignaturePresent: typeof routing.outputRouteSignature === 'string',
    },
    requestCount: count(requests.length), responseCount: count(responses.length),
    requests: requests.slice(-16).map(request => ({
      operation: token(request?.operation, ['route', 'validate-or-route', 'repair-validate-or-route', 'incremental-route', 'repair']),
      edgeCount: Array.isArray(request?.edges) ? count(request.edges.length) : null,
    })),
    responses: responses.slice(-16).map(response => ({
      hardClean: typeof response?.hardClean === 'boolean' ? response.hardClean : null,
      routeResolution: token(response?.routeResolution, resolutions), fallbackLevel: fallback(response?.fallbackLevel),
      edgeCount: Array.isArray(response?.edges) ? count(response.edges.length)
        : Array.isArray(response?.routingPatches) ? count(response.routingPatches.length) : null,
    })),
    workerErrorCount: count(list(window.__vizlyPrecompiledRouteWorkerErrors).length),
    legacyPageErrorCount: count(list(window.__vizlyPrecompiledRoutePageErrors).length),
    captureErrorCount: count(list(window.__vizlyPrecompiledRouteCaptureErrors).length),
    renderedEdgeCount: count(document.querySelectorAll('.react-flow__edge').length),
    renderedPathCount: renderedPaths,
  };
};

export const displayRoutingBrowserLifecycleExpression = `(${readDisplayRoutingBrowserLifecycle.toString()})()`;

/** Installed before app code. Does not retain exception contents or resource URLs. */
export const installDisplayRoutingBrowserBootProbe = (sampleDom = false) => {
  const startedAt = Date.now();
  const errors = { script: 0, resource: 0, rejection: 0 };
  const milestones = {};
  window.__vizlyBrowserBootErrors = errors;
  window.__vizlyBrowserBootMilestones = milestones;
  const names = ['domReadyMs', 'pageLoadedMs', 'rootObservedMs', 'workerConstructedMs',
    'workerRequestMs', 'workerResponseMs', 'pathObservedMs'];
  const mark = name => {
    if (!names.includes(name) || milestones[name] !== undefined) return;
    milestones[name] = Math.min(600_000, Math.max(0, Date.now() - startedAt));
  };
  window.addEventListener?.('DOMContentLoaded', () => mark('domReadyMs'), { once: true });
  window.addEventListener?.('load', () => mark('pageLoadedMs'), { once: true });
  window.addEventListener?.('error', event => {
    const key = event.target && event.target !== window ? 'resource' : 'script';
    errors[key] = Math.min(100_000, errors[key] + 1);
  }, true);
  window.addEventListener?.('unhandledrejection', () => {
    errors.rejection = Math.min(100_000, errors.rejection + 1);
  });
  if (sampleDom && typeof requestAnimationFrame === 'function') {
    const sample = () => {
      if (document.querySelector('#root')?.childElementCount > 0) mark('rootObservedMs');
      if (document.querySelector('.react-flow__edge .react-flow__edge-path')?.getAttribute('d')) {
        mark('pathObservedMs');
      }
      if (milestones.pathObservedMs === undefined && Date.now() - startedAt < 600_000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }
  return mark;
};
