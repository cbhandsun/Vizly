import { createStartupTrace, type StartupMilestone } from './applicationStartupTrace';

export type StartupFailureCode = 'runtime-initialization-failed' | 'application-readiness-failed'
  | 'application-readiness-timeout' | 'application-mount-failed';
type StartupStage = 'runtime' | 'readiness' | 'mount';
export interface StartupFailureSummary {
  schema: 'vizly-startup-failure-v1';
  stage: StartupStage;
  code: StartupFailureCode;
  elapsedMs: number | null;
  milestones?: readonly StartupMilestone[];
}

interface StartupOptions {
  initialize: () => void;
  ready: Promise<unknown>;
  mount: () => void;
  onFailure: (summary: StartupFailureSummary) => void;
  now?: () => number;
}

// This bounds an otherwise indefinite pre-React wait. It is not a routing budget.
export const APPLICATION_READINESS_TIMEOUT_MS = 30_000;

/** Owns only pre-React startup. A submitted render is not proof of first paint. */
export const startApplication = async ({ initialize, ready, mount, onFailure,
  now = () => performance.now() }: StartupOptions): Promise<boolean> => {
  let startedAt = NaN;
  try { startedAt = now(); } catch { /* Diagnostic clock failure must not block startup. */ }
  const trace = createStartupTrace(startedAt, now);
  let stage: StartupStage = 'runtime';
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Attach rejection handling before synchronous initialization can fail.
  const readiness = ready.then(() => 'ready' as const, () => 'rejected' as const);
  const fail = (code: StartupFailureCode): false => {
    const elapsedMs = trace.record('failed');
    onFailure({ schema: 'vizly-startup-failure-v1', stage, code,
      elapsedMs, milestones: trace.snapshot() });
    return false;
  };
  try {
    initialize();
    trace.record('runtime-ready');
  } catch {
    return fail('runtime-initialization-failed');
  }
  stage = 'readiness';
  let result: 'ready' | 'rejected' | 'timeout';
  try {
    result = await Promise.race([readiness, new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), APPLICATION_READINESS_TIMEOUT_MS);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (result !== 'ready') return fail(result === 'timeout'
    ? 'application-readiness-timeout' : 'application-readiness-failed');
  stage = 'mount';
  trace.record('readiness-ready');
  trace.record('mount-requested');
  try { mount(); } catch { return fail('application-mount-failed'); }
  trace.record('mount-submitted');
  return true;
};
