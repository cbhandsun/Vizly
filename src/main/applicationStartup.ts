export type StartupFailureCode = 'runtime-initialization-failed' | 'application-readiness-failed'
  | 'application-readiness-timeout' | 'application-mount-failed';
type StartupStage = 'runtime' | 'readiness' | 'mount';
export interface StartupFailureSummary {
  schema: 'vizly-startup-failure-v1';
  stage: StartupStage;
  code: StartupFailureCode;
  elapsedMs: number | null;
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
  const startedAt = now();
  let stage: StartupStage = 'runtime';
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Attach rejection handling before synchronous initialization can fail.
  const readiness = ready.then(() => 'ready' as const, () => 'rejected' as const);
  const fail = (code: StartupFailureCode): false => {
    const elapsed = now() - startedAt;
    onFailure({ schema: 'vizly-startup-failure-v1', stage, code,
      elapsedMs: Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 600_000
        ? Math.round(elapsed) : null });
    return false;
  };
  try {
    initialize();
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
  try { mount(); } catch { return fail('application-mount-failed'); }
  return true;
};
