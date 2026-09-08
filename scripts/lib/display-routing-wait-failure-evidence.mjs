const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const token = (value, allowed) => allowed.includes(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? value : null;
const time = value => Number.isFinite(value) && value >= 0 && value <= 600_000 ? value : null;
const bool = value => typeof value === 'boolean' ? value : null;

const projectLifecycle = value => {
  const source = record(value);
  if (source.schema !== 'browser-lifecycle-v1') return null;
  const page = record(source.page), routing = record(source.routing), milestones = record(source.milestones);
  return {
    schema: 'browser-lifecycle-v1',
    observation: token(source.observation, ['routing-failed', 'committed-path-observed', 'committed-no-path-observed',
      'worker-response-observed', 'worker-request-observed', 'nodes-observed', 'root-observed', 'page-loading']),
    milestones: Object.fromEntries(['domReadyMs', 'pageLoadedMs', 'rootObservedMs', 'workerConstructedMs',
      'workerRequestMs', 'workerResponseMs', 'pathObservedMs'].map(key => [key, time(milestones[key])])),
    page: {
      readyState: token(page.readyState, ['loading', 'interactive', 'complete', 'unknown']),
      protocol: token(page.protocol, ['http:', 'https:', 'about:', 'chrome-error:', 'other']),
      captureInstalled: bool(page.captureInstalled),
      ...Object.fromEntries(['rootChildCount', 'moduleScriptCount', 'renderedNodeCount', 'scriptErrors',
        'resourceErrors', 'unhandledRejections'].map(key => [key, count(page[key])])),
    },
    routing: {
      stage: token(routing.stage, ['scheduled', 'routing', 'final-applied', 'worker-phase', 'worker-post',
        'worker-response', 'worker-response-error', 'worker-error', 'worker-message-error', 'worker-cancelled',
        'worker-timeout', 'worker-bounded-fallback', 'final-quality-rejected', 'final-safety-rejected', 'unknown']),
      workerStartCount: count(routing.workerStartCount), workerAbortCount: count(routing.workerAbortCount),
      outputRouteSignaturePresent: bool(routing.outputRouteSignaturePresent),
    },
    ...Object.fromEntries(['requestCount', 'responseCount', 'workerErrorCount', 'legacyPageErrorCount',
      'captureErrorCount', 'renderedEdgeCount', 'renderedPathCount'].map(key => [key, count(source[key])])),
  };
};

// Child stderr wraps the waiter's JSON envelope with Node stack text. Parse
// only its bounded, balanced object; never persist raw stderr or arbitrary keys.
const readEnvelope = message => {
  if (typeof message !== 'string' || message.length > 65_536) return null;
  const marker = /Browser state wait failed\r?\n/.exec(message);
  if (!marker) return null;
  const text = message.slice(marker.index + marker[0].length).trimStart();
  if (!text.startsWith('{')) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') { depth += 1; if (depth > 32) return null; }
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(0, index + 1)); } catch { return null; }
      }
    }
  }
  return null;
};

export const projectRoutingWaitFailureEvidence = error => {
  const envelope = record(error?.waitEvidence?.schema === 'routing-wait-failure-v1'
    ? error.waitEvidence : readEnvelope(error?.message));
  const waitStatus = token(envelope.waitStatus, ['not-ready', 'evaluation-failed', 'evaluation-timeout',
    'invalid-evaluation', 'predicate-failed', 'quality-rejected']);
  if (!waitStatus) return null;
  const diagnostics = projectLifecycle(envelope.diagnostics);
  const lastObservedDiagnostics = projectLifecycle(envelope.lastObservedDiagnostics);
  if (!diagnostics && !lastObservedDiagnostics) return null;
  return { schema: 'routing-wait-failure-v1', waitStatus,
    evidenceStatus: token(envelope.evidenceStatus, ['available', 'evaluation-failed', 'evaluation-timeout']),
    diagnostics, lastObservedDiagnostics };
};
