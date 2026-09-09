import { displayRoutingBrowserLifecycleExpression } from './display-routing-browser-lifecycle.mjs';

const readDisplayRoutingFailureEnvelope = async (session, error) => {
  const message = error instanceof Error ? error.message : 'Display routing browser verification failed';
  let diagnostics = null;
  let evidenceStatus = 'evaluation-failed';
  try {
    diagnostics = await session.evaluate(displayRoutingBrowserLifecycleExpression);
    evidenceStatus = 'available';
  } catch {
    diagnostics = null;
  }
  return new Error(`${message}
Browser state wait failed
${JSON.stringify({
    waitStatus: 'predicate-failed',
    evidenceStatus,
    diagnostics,
    lastObservedDiagnostics: null,
  }, null, 2)}`);
};

export const withDisplayRoutingFailureEvidence = async (session, run) => {
  try {
    return await run();
  } catch (error) {
    throw await readDisplayRoutingFailureEnvelope(session, error);
  }
};
