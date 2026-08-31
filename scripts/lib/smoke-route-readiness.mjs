import { setTimeout as delay } from 'node:timers/promises';
import { isRuntimeEvaluateTimeout } from '../smokeRouteBudgetUtils.mjs';

const createFailure = (routeName, details) => {
  const error = new Error(`Route smoke failed for ${routeName}`);
  error.details = details;
  return error;
};

const captureDiagnostics = async (session) => {
  let errorLogger = null;
  let rawErrorCapture = null;

  try {
    errorLogger = await session.evaluate(`
      typeof window.__errorLogger?.getLogs === 'function'
        ? window.__errorLogger.getLogs().slice(-20)
        : null
    `);
  } catch {
    // Best-effort diagnostics must not replace the route readiness failure.
  }

  try {
    rawErrorCapture = await session.evaluate('window.__smokeErrorCapture?.slice(-20) || null');
  } catch {
    // Best-effort diagnostics must not replace the route readiness failure.
  }

  if (session.pendingLogEnrichments.length > 0) {
    await Promise.allSettled(session.pendingLogEnrichments);
  }

  return { errorLogger, rawErrorCapture };
};

const waitWithinDeadline = async (deadline, now, wait, pollIntervalMs) => {
  const remainingMs = deadline - now();
  if (remainingMs <= 0) return;
  await wait(Math.min(pollIntervalMs, remainingMs));
};

/**
 * Poll a route until it is ready while treating only Runtime.evaluate command
 * timeouts as transient. The route's existing deadline remains the hard bound;
 * protocol errors and browser evaluation failures still surface immediately.
 */
export const waitForRouteReadiness = async (
  session,
  route,
  {
    now = Date.now,
    wait = delay,
    pollIntervalMs = 500,
  } = {},
) => {
  const deadline = now() + route.timeoutMs;
  let state;
  let evaluateTimeoutCount = 0;
  let lastEvaluateTimeout = null;
  // Catalog expressions are trusted, synchronous probes. Capture their timestamp
  // in the same browser task so later rendering cannot inflate readiness time.
  const timedExpression = `(() => {
    const state = (${route.expression});
    return state?.ready ? { ...state, readyAt: performance.now() } : state;
  })()`;

  while (now() < deadline) {
    try {
      state = await session.evaluate(timedExpression);
      if (state?.ready) {
        if (!Number.isFinite(state.readyAt) || state.readyAt < 0) {
          throw new Error('Invalid route readiness timestamp');
        }
        return state;
      }
      if (state?.errorBoundary) break;
    } catch (error) {
      if (!isRuntimeEvaluateTimeout(error)) throw error;
      evaluateTimeoutCount += 1;
      lastEvaluateTimeout = error.message;
    }

    await waitWithinDeadline(deadline, now, wait, pollIntervalMs);
  }

  const diagnostics = await captureDiagnostics(session);
  throw createFailure(route.name, {
    state,
    logs: session.logs.slice(-20),
    networkIssues: session.networkIssues.slice(-20),
    ...diagnostics,
    evaluateTimeoutCount,
    lastEvaluateTimeout,
  });
};
