export const parseStartupFaultBaseUrl = value => {
  try {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048) throw new Error();
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.port === '0' || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new Error('Startup fault verification requires a local preview origin');
  }
};

export const startupFaultCases = [
  { id: 'entry-resource', kind: 'startup', code: 'entry-resource-failed', stage: 'resources',
    blockEntry: true, source: '' },
  { id: 'missing-root', kind: 'startup', code: 'application-mount-failed', stage: 'mount',
    source: `new MutationObserver((_, observer) => {
      const root = document.getElementById('root');
      if (root) { root.remove(); observer.disconnect(); }
    }).observe(document, { childList: true, subtree: true });` },
  { id: 'runtime-initialization', kind: 'startup', code: 'runtime-initialization-failed', stage: 'runtime',
    source: `const originalAdd = window.addEventListener;
      window.addEventListener = function(type, ...args) {
        if (type === 'unhandledrejection') throw new Error('private-fault-marker');
        return Reflect.apply(originalAdd, this, [type, ...args]);
      };` },
  ...[['creation', 'display-edge-worker-unavailable', 'worker-creation'],
    ['post', 'display-edge-worker-post-failed', 'request-post'],
    ['runtime', 'display-edge-worker-error', 'worker-runtime'],
    ['decode', 'display-edge-worker-message-error', 'response-decode'],
    ['invalid-response', 'display-edge-worker-invalid-response', 'response-validation']].map(([kind, code, stage]) => ({
    id: `worker-${kind}`, kind: 'worker', code, stage,
    source: `window.Worker = new Proxy(window.Worker, { construct(Target, args) {
      const displayWorker = String(args[0]).includes('baseReactFlowDisplayEdges');
      if (displayWorker && ${JSON.stringify(kind)} === 'creation') throw new Error('private-fault-marker');
      const worker = Reflect.construct(Target, args);
      if (displayWorker) worker.postMessage = message => {
        if (${JSON.stringify(kind)} === 'post') throw new Error('private-fault-marker');
        queueMicrotask(() => worker.dispatchEvent(${JSON.stringify(kind)} === 'runtime'
          ? new ErrorEvent('error', { message: 'private-fault-marker' })
          : ${JSON.stringify(kind)} === 'decode' ? new MessageEvent('messageerror')
            : new MessageEvent('message', { data: { requestId: message?.requestId, edges: 'invalid' } })));
      };
      return worker;
    }});`,
  })),
];

/** Browser-side projection; never return page text, graph data or raw exceptions. */
export const readStartupFaultRecovery = kind => {
  const panel = document.querySelector(kind === 'startup' ? '.startup-recovery' : '[data-display-routing-failure]');
  const textarea = panel?.querySelector('textarea');
  if (!textarea) return null;
  const details = panel.querySelector('details');
  if (details && !details.open) details.querySelector('summary')?.click();
  let summary;
  try { summary = JSON.parse(textarea.value); } catch { return { valid: false }; }
  const keys = kind === 'startup' ? ['schema', 'stage', 'code', 'elapsedMs'] : ['schema', 'reason', 'stage', 'code'];
  let milestonesValid = true;
  if (kind !== 'startup') {
    keys.push('observation');
    const trace = summary?.observation;
    const stages = ['job-started', 'job-cancelled', 'job-finished', 'failed', 'commit-accepted',
      'render-committed', 'render-frame-observed', 'worker-requested', 'worker-available',
      'worker-post-requested', 'worker-response-validated', 'worker-request-settled'];
    let lastTime = 0;
    milestonesValid = trace && typeof trace === 'object' && Object.keys(trace).length === 4
      && trace.schema === 'vizly-routing-observation-v1' && trace.owner === 'display' && trace.truncated === false
      && Array.isArray(trace.entries) && trace.entries.length >= 3 && trace.entries.length <= 32
      && trace.entries.every(entry => {
        if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 3
          || !stages.includes(entry.stage) || !Object.hasOwn(entry, 'elapsedMs')
          || !Object.hasOwn(entry, 'requestOrdinal')) return false;
        if (entry.requestOrdinal !== null && (!Number.isSafeInteger(entry.requestOrdinal)
          || entry.requestOrdinal < 1 || entry.requestOrdinal > 8)) return false;
        if (entry.stage.startsWith('worker-') !== (entry.requestOrdinal !== null)) return false;
        if (entry.elapsedMs !== null && (!Number.isSafeInteger(entry.elapsedMs)
          || entry.elapsedMs < lastTime || entry.elapsedMs > 600000)) return false;
        if (entry.elapsedMs !== null) lastTime = entry.elapsedMs;
        return true;
      }) && trace.entries[0].stage === 'job-started' && trace.entries.at(-1).stage === 'failed'
      && trace.entries.some(entry => entry.stage === 'worker-requested' && entry.requestOrdinal === 1)
      && (summary?.code === 'display-edge-worker-unavailable'
        || trace.entries.some(entry => entry.stage === 'worker-post-requested' && entry.requestOrdinal === 1));
  }
  if (kind === 'startup' && summary?.code !== 'entry-resource-failed') {
    keys.push('milestones');
    const stages = ['runtime-started', 'runtime-ready', 'readiness-ready', 'mount-requested', 'mount-submitted', 'failed'];
    const entries = summary?.milestones;
    let previousStage = -1;
    let previousTime = 0;
    milestonesValid = Array.isArray(entries) && entries.length >= 2 && entries.length <= stages.length
      && entries.every((entry, index) => {
        if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 2
          || !Object.hasOwn(entry, 'stage') || !Object.hasOwn(entry, 'elapsedMs')) return false;
        const ordinal = stages.indexOf(entry.stage);
        if (ordinal <= previousStage || (index === 0 && ordinal !== 0)) return false;
        const time = entry.elapsedMs;
        if (time !== null && (!Number.isSafeInteger(time) || time < previousTime || time > 600000)) return false;
        previousStage = ordinal;
        if (time !== null) previousTime = time;
        return true;
      }) && entries.at(-1).stage === 'failed';
    const expected = summary?.stage === 'mount'
      ? ['runtime-started', 'runtime-ready', 'readiness-ready', 'mount-requested', 'failed']
      : ['runtime-started', 'failed'];
    milestonesValid = milestonesValid && entries.length === expected.length
      && entries.every((entry, index) => entry.stage === expected[index])
      && entries.at(-1).elapsedMs === summary.elapsedMs;
  }
  const safeCodes = ['application-mount-failed', 'runtime-initialization-failed',
    'entry-resource-failed',
    'display-edge-worker-unavailable', 'display-edge-worker-post-failed', 'display-edge-worker-error',
    'display-edge-worker-message-error', 'display-edge-worker-invalid-response'];
  const safeStages = ['resources', 'mount', 'runtime', 'worker-creation', 'request-post',
    'worker-runtime', 'response-decode', 'response-validation'];
  const valid = summary && typeof summary === 'object' && !Array.isArray(summary)
    && Object.keys(summary).length === keys.length && keys.every(key => Object.hasOwn(summary, key))
    && safeCodes.includes(summary.code) && safeStages.includes(summary.stage)
    && summary.schema === (kind === 'startup' ? 'vizly-startup-failure-v1' : 'vizly-routing-failure-v1')
    && (kind === 'startup' ? Number.isFinite(summary.elapsedMs) && summary.elapsedMs >= 0 && summary.elapsedMs <= 600000
      : summary.reason === 'worker-failed');
  if (!valid || !milestonesValid) return { valid: false };
  const bounds = textarea.getBoundingClientRect();
  return { valid: true, code: summary.code, stage: summary.stage,
    unobscured: bounds.width > 100 && document.elementFromPoint(bounds.x + 20, bounds.y + 16) === textarea,
    readOnly: textarea.readOnly,
    nodesPreserved: kind === 'startup' || document.querySelectorAll('.react-flow__node').length > 0,
    privateContentAbsent: !(panel.textContent + textarea.value).includes('private-fault-marker') };
};

export const assertStartupFaultRecovery = (observation, fault) => {
  if (!observation || observation.valid !== true || observation.code !== fault.code
    || observation.stage !== fault.stage || observation.unobscured !== true
    || observation.readOnly !== true || observation.nodesPreserved !== true
    || observation.privateContentAbsent !== true) throw new Error('Startup fault recovery contract failed');
};
