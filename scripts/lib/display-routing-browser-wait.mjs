import { setTimeout as delay } from 'node:timers/promises';
import { displayRoutingBrowserLifecycleExpression } from './display-routing-browser-lifecycle.mjs';

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;

export const waitForDisplayRoutingBrowserValue = async (
  session,
  expression,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
  { stopOnQualityRejection = false, diagnosticsExpression = displayRoutingBrowserLifecycleExpression } = {},
) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 600_000) {
    throw new Error('Invalid browser wait timeout');
  }
  if (typeof expression !== 'string' || expression.length === 0 || expression.length > 1_000_000
    || typeof stopOnQualityRejection !== 'boolean'
    || typeof diagnosticsExpression !== 'string' || diagnosticsExpression.length === 0
    || diagnosticsExpression.length > 1_000_000) throw new Error('Invalid browser wait options');
  // A custom expression must be a trusted, content-safe projector, never graph
  // input. Keep its last result on the host under the same deadline contract.
  // Read evidence alongside an unsuccessful predicate, in the same renderer
  // task. Keep the last safe snapshot on the host if the renderer later hangs.
  const pollExpression = `(async () => {
    const evidence = () => ${diagnosticsExpression};
    try {
      const value = await (${expression});
      return { state: value ? 'ready' : 'waiting', value,
        diagnostics: value ? null : evidence() };
    } catch {
      return { state: 'predicate-failed', diagnostics: evidence() };
    }
  })()`;
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
  let lastObservedDiagnostics = null;
  while (Date.now() < deadline) {
    const result = await evaluateWithin(pollExpression, Math.max(0, deadline - Date.now()));
    if (result.status !== 'available') {
      waitStatus = result.status;
      break;
    }
    const observation = result.value;
    if (!observation || !['ready', 'waiting', 'predicate-failed'].includes(observation.state)) {
      waitStatus = 'invalid-evaluation';
      break;
    }
    if (observation.state === 'ready') return observation.value;
    lastObservedDiagnostics = observation.diagnostics;
    if (observation.state === 'predicate-failed') {
      waitStatus = 'predicate-failed';
      break;
    }
    if (stopOnQualityRejection && observation.diagnostics?.routing?.stage === 'final-quality-rejected') {
      waitStatus = 'quality-rejected';
      break;
    }
    await delay(Math.min(100, Math.max(0, deadline - Date.now())));
  }
  const evidence = await evaluateWithin(
    diagnosticsExpression, 1_000,
  );
  const diagnostics = evidence.status === 'available' ? evidence.value : null;
  throw new Error(
    `Browser state wait failed\n${JSON.stringify({
      waitStatus, evidenceStatus: evidence.status, diagnostics, lastObservedDiagnostics,
    }, null, 2)}`,
  );
};
