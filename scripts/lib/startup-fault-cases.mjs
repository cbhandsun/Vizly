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
  if (!valid) return { valid: false };
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
