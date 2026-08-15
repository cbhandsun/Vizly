export const DISPLAY_ROUTING_PHASE_NAMES = [
  'candidate-validation',
  'incremental-closure',
  'local-route',
  'hard-gate',
  'seed',
  'quality',
  'quality-global-route',
  'quality-topology',
  'quality-crossing-sweeps',
  'quality-strict-closure',
  'quality-polish',
  'post-render',
  'post-render-finalize',
  'post-render-soft-closure',
  'strict',
  'strict-primary',
  'strict-closure',
  'terminal',
  'finalizer',
  'measured-repair',
  'final-clearance',
  'final-hard-safety',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
  'final-safety-closure',
] as const;

export const DISPLAY_ROUTING_PHASE_RESOLUTIONS = [
  'hit',
  'skip',
  'accepted',
  'rejected',
  'fallback',
] as const;

export type DisplayRoutingPhaseName = typeof DISPLAY_ROUTING_PHASE_NAMES[number];
export type DisplayRoutingPhaseResolution =
  typeof DISPLAY_ROUTING_PHASE_RESOLUTIONS[number];

export type DisplayRoutingPhaseTrace = Readonly<{
  phase: DisplayRoutingPhaseName;
  durationMs: number;
  candidateCount: number;
  changedEdgeCount: number;
  resolution: DisplayRoutingPhaseResolution;
}>;

type DisplayRoutingPhaseTimer = Readonly<{
  finish: (
    resolution: DisplayRoutingPhaseResolution,
    changedEdgeCount?: number,
  ) => void;
}>;

const readMonotonicTime = (): number => (
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
);

const toBoundedCount = (value: number): number => (
  Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1_000_000) : 0
);

const toBoundedDuration = (value: number): number => (
  Number.isFinite(value)
    ? Math.max(0, Math.min(600_000, Math.round(value * 100) / 100))
    : 0
);

/**
 * Creates one aggregate-only phase measurement. It deliberately never accepts
 * graph IDs, labels, paths, or arbitrary metadata, so traces remain safe to
 * expose through local diagnostics and future telemetry adapters.
 */
export const startDisplayRoutingPhaseTrace = ({
  phase,
  candidateCount,
  onTrace,
}: {
  phase: DisplayRoutingPhaseName;
  candidateCount: number;
  onTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): DisplayRoutingPhaseTimer => {
  const startedAt = readMonotonicTime();
  let finished = false;
  return {
    finish: (resolution, changedEdgeCount = 0) => {
      if (finished) return;
      finished = true;
      onTrace?.({
        phase,
        durationMs: toBoundedDuration(readMonotonicTime() - startedAt),
        candidateCount: toBoundedCount(candidateCount),
        changedEdgeCount: toBoundedCount(changedEdgeCount),
        resolution,
      });
    },
  };
};
