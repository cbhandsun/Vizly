import {
  classifyDisplayLayoutTransactionError,
  updateDisplayRoutingDebugState,
  updateDisplayLayoutTransactionState,
  type DisplayLayoutTransactionErrorCode,
  type DisplayLayoutPhase,
  type DisplayLayoutPhaseTrace,
  type DisplayLayoutTransactionStatus,
} from '../../shared/baseReactFlowDisplayRoutingDebug';

const readLayoutMonotonicEpochMs = (): number => (
  typeof performance !== 'undefined'
    && Number.isFinite(performance.timeOrigin)
    && typeof performance.now === 'function'
    ? performance.timeOrigin + performance.now()
    : Date.now()
);

const toBoundedTimestamp = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(9_999_999_999_999, value)) : 0
);

const toBoundedDuration = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(600_000, Math.round(value * 100) / 100)) : 0
);

/** Keeps attempt-level details out of the layout strategy composition hook. */
export const createLayoutRoutingTransactionDiagnostics = (
  jobId: number,
  readTime: () => number = readLayoutMonotonicEpochMs,
  publish: typeof updateDisplayLayoutTransactionState = updateDisplayLayoutTransactionState,
) => {
  let attemptCount = 0;
  let phaseSequence = 0;
  const phaseTrace: DisplayLayoutPhaseTrace[] = [];
  const activePhaseIndexes = new Map<DisplayLayoutPhase, number>();
  const publishPhaseTrace = (): void => updateDisplayRoutingDebugState({
    layoutPhaseTrace: phaseTrace.map(trace => ({ ...trace })),
  });
  const update = (
    status: DisplayLayoutTransactionStatus,
    errorCode?: DisplayLayoutTransactionErrorCode,
  ): void => publish({
    jobId,
    status,
    attemptCount,
    errorCode,
  });

  const beginPhase = (phase: DisplayLayoutPhase): void => {
    const previousIndex = activePhaseIndexes.get(phase);
    if (previousIndex !== undefined) {
      const previous = phaseTrace[previousIndex];
      if (previous?.status === 'running') {
        phaseTrace[previousIndex] = {
          ...previous,
          status: 'failed',
          durationMs: toBoundedDuration(readTime() - previous.startedAt),
        };
      }
    }
    const trace: DisplayLayoutPhaseTrace = {
      sequence: phaseSequence += 1,
      phase,
      status: 'running',
      startedAt: toBoundedTimestamp(readTime()),
    };
    phaseTrace.push(trace);
    activePhaseIndexes.set(phase, phaseTrace.length - 1);
    publishPhaseTrace();
  };

  const finishPhase = (
    phase: DisplayLayoutPhase,
    status: 'completed' | 'failed' = 'completed',
  ): void => {
    const index = activePhaseIndexes.get(phase);
    if (index === undefined) return;
    const trace = phaseTrace[index];
    activePhaseIndexes.delete(phase);
    if (!trace || trace.status !== 'running') return;
    phaseTrace[index] = {
      ...trace,
      status,
      durationMs: toBoundedDuration(readTime() - trace.startedAt),
    };
    publishPhaseTrace();
  };

  const failActivePhases = (): void => {
    for (const phase of [...activePhaseIndexes.keys()]) finishPhase(phase, 'failed');
  };

  updateDisplayRoutingDebugState({ layoutPhaseTrace: [] });
  update('running');
  return {
    beginPhase,
    finishPhase,
    async measurePhase<T>(phase: DisplayLayoutPhase, work: () => Promise<T>): Promise<T> {
      beginPhase(phase);
      try {
        const result = await work();
        finishPhase(phase);
        return result;
      } catch (error) {
        finishPhase(phase, 'failed');
        throw error;
      }
    },
    measurePhaseSync<T>(phase: DisplayLayoutPhase, work: () => T): T {
      beginPhase(phase);
      try {
        const result = work();
        finishPhase(phase);
        return result;
      } catch (error) {
        finishPhase(phase, 'failed');
        throw error;
      }
    },
    beginAttempt(): void {
      attemptCount += 1;
      update('running');
    },
    committed(): void {
      update('committed');
    },
    failed(error: unknown): void {
      failActivePhases();
      update('failed', classifyDisplayLayoutTransactionError(error));
    },
    noLayoutableNodes(): void {
      failActivePhases();
      update('failed', 'no-layoutable-nodes');
    },
  };
};

export type LayoutRoutingTransactionDiagnostics = ReturnType<
  typeof createLayoutRoutingTransactionDiagnostics
>;
