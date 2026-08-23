export const DISPLAY_ROUTING_PHASE_NAMES = [
  'candidate-validation',
  'incremental-closure',
  'local-route',
  'local-reconnect-seed',
  'local-reconnect-candidates',
  'local-fast-fallback',
  'hard-gate',
  'seed',
  'seed-interactive',
  'seed-interactive-route',
  'seed-interactive-normalize',
  'seed-interactive-endpoint-seed',
  'seed-interactive-trunk-seed',
  'seed-interactive-local-seed',
  'seed-interactive-crossing-repair',
  'seed-interactive-lane-repair',
  'seed-interactive-global-route',
  'seed-interactive-local-polish',
  'seed-interactive-detached-repair',
  'seed-interactive-endpoint-final',
  'seed-interactive-finish',
  'seed-interactive-finish-projection',
  'seed-interactive-finish-hard-gate',
  'seed-interactive-finish-micro',
  'seed-interactive-finish-local',
  'seed-interactive-finish-obstacle',
  'seed-interactive-finish-commit',
  'seed-interactive-terminal-cleanup',
  'seed-initial-gate',
  'seed-hard-safety',
  'seed-local-cleanup',
  'seed-strict',
  'seed-terminal-axis',
  'seed-terminal-gate',
  'quality',
  'quality-global-route',
  'quality-topology-seed',
  'quality-topology',
  'quality-crossing-sweeps',
  'quality-crossing-structural',
  'quality-crossing-global-refine',
  'quality-crossing-final-candidates',
  'quality-strict-closure',
  'quality-polish',
  'quality-polish-candidates',
  'quality-polish-local',
  'quality-polish-detached',
  'quality-polish-detached-micro',
  'quality-polish-detached-local',
  'quality-polish-endpoint',
  'quality-polish-micro',
  'quality-polish-selection',
  'quality-polish-residual',
  'residual-exact',
  'residual-loop-shortcut',
  'residual-exact-selection',
  'residual-polish-selection',
  'residual-micro-derivative',
  'residual-endpoint-derivative',
  'residual-obstacle-selection',
  'residual-detached-primary',
  'residual-detached-default',
  'residual-detached-extended',
  'residual-near-parallel',
  'quality-polish-obstacle-selection',
  'post-render',
  'post-render-finalize',
  'post-render-soft-closure',
  'post-render-micro',
  'post-render-soft-quality',
  'post-render-residual',
  'post-render-terminal-gate',
  'strict',
  'strict-primary',
  'strict-primary-overlap',
  'strict-primary-endpoint-target',
  'strict-primary-crossing',
  'strict-primary-cleanup-selection',
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
  'final-safety-hard-gate',
  'final-safety-stubs',
  'final-safety-endpoint-order',
  'final-safety-passage-order',
  'final-commercial-clearance',
  'final-commercial-terminal-preserving',
  'final-commercial-terminal-changing',
  'final-commercial-source-stairs',
  'final-commercial-evaluation',
  'final-commercial-safety-closure',
  'session-commit',
] as const;

// One aggregate entry per declared phase plus headroom for the small number of
// phases that can run under two explicit parents. Repeated work is folded by
// the Worker recorder, so the bound no longer truncates late final-gate phases.
export const DISPLAY_ROUTING_PHASE_TRACE_LIMIT = 112;

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

export type DisplayRoutingPhaseMetrics = Readonly<{
  candidateCount?: number;
  evaluationCount?: number;
  cacheHitCount?: number;
  scannedNodeCount?: number;
  scannedSegmentCount?: number;
  scannedEdgePairCount?: number;
}>;

export type DisplayRoutingPhaseTrace = Readonly<{
  phase: DisplayRoutingPhaseName;
  parentPhase?: DisplayRoutingPhaseName;
  durationMs: number;
  exclusiveDurationMs?: number;
  candidateCount: number;
  changedEdgeCount: number;
  evaluationCount?: number;
  cacheHitCount?: number;
  scannedNodeCount?: number;
  scannedSegmentCount?: number;
  scannedEdgePairCount?: number;
  resolution: DisplayRoutingPhaseResolution;
}>;

export const countChangedRoutingItems = <T>(
  before: readonly T[],
  after: readonly T[],
): number => {
  const sharedLength = Math.min(before.length, after.length);
  let changed = Math.abs(before.length - after.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (before[index] !== after[index]) changed += 1;
  }
  return changed;
};

type DisplayRoutingPhaseTimer = Readonly<{
  finish: (
    resolution: DisplayRoutingPhaseResolution,
    changedEdgeCount?: number,
    metrics?: DisplayRoutingPhaseMetrics,
  ) => void;
}>;

const DISPLAY_ROUTING_PHASE_PARENTS: Readonly<
  Partial<Record<DisplayRoutingPhaseName, DisplayRoutingPhaseName>>
> = Object.freeze({
  'local-reconnect-seed': 'local-route',
  'local-reconnect-candidates': 'local-route',
  'local-fast-fallback': 'local-route',
  'seed-interactive': 'seed',
  'seed-interactive-route': 'seed-interactive',
  'seed-interactive-normalize': 'seed-interactive-route',
  'seed-interactive-endpoint-seed': 'seed-interactive-route',
  'seed-interactive-trunk-seed': 'seed-interactive-route',
  'seed-interactive-local-seed': 'seed-interactive-route',
  'seed-interactive-crossing-repair': 'seed-interactive-route',
  'seed-interactive-lane-repair': 'seed-interactive-route',
  'seed-interactive-global-route': 'seed-interactive-route',
  'seed-interactive-local-polish': 'seed-interactive-route',
  'seed-interactive-detached-repair': 'seed-interactive-route',
  'seed-interactive-endpoint-final': 'seed-interactive-route',
  'seed-interactive-finish': 'seed-interactive-route',
  'seed-interactive-finish-projection': 'seed-interactive-finish',
  'seed-interactive-finish-hard-gate': 'seed-interactive-finish',
  'seed-interactive-finish-micro': 'seed-interactive-finish',
  'seed-interactive-finish-local': 'seed-interactive-finish',
  'seed-interactive-finish-obstacle': 'seed-interactive-finish',
  'seed-interactive-finish-commit': 'seed-interactive-finish',
  'seed-interactive-terminal-cleanup': 'seed-interactive',
  'seed-initial-gate': 'seed',
  'seed-hard-safety': 'seed',
  'seed-local-cleanup': 'seed',
  'seed-strict': 'seed',
  'seed-terminal-axis': 'seed',
  'seed-terminal-gate': 'seed',
  'quality-global-route': 'quality',
  'quality-topology-seed': 'quality',
  'quality-topology': 'quality',
  'quality-crossing-sweeps': 'quality',
  'quality-crossing-structural': 'quality-crossing-sweeps',
  'quality-crossing-global-refine': 'quality-crossing-sweeps',
  'quality-crossing-final-candidates': 'quality-crossing-sweeps',
  'quality-strict-closure': 'quality',
  'quality-polish': 'quality',
  'quality-polish-candidates': 'quality-polish',
  'quality-polish-local': 'quality-polish-candidates',
  'quality-polish-detached': 'quality-polish-candidates',
  'quality-polish-detached-micro': 'quality-polish-candidates',
  'quality-polish-detached-local': 'quality-polish-candidates',
  'quality-polish-endpoint': 'quality-polish-candidates',
  'quality-polish-micro': 'quality-polish-candidates',
  'quality-polish-selection': 'quality-polish',
  'quality-polish-residual': 'quality-polish',
  'quality-polish-obstacle-selection': 'quality-polish',
  'post-render-finalize': 'post-render',
  'post-render-soft-closure': 'post-render',
  'post-render-micro': 'post-render-soft-closure',
  'post-render-soft-quality': 'post-render-soft-closure',
  'post-render-residual': 'post-render-soft-closure',
  'post-render-terminal-gate': 'post-render-soft-closure',
  'strict-primary': 'strict',
  'strict-primary-overlap': 'strict-primary',
  'strict-primary-endpoint-target': 'strict-primary',
  'strict-primary-crossing': 'strict-primary',
  'strict-primary-cleanup-selection': 'strict-primary',
  'strict-closure': 'strict',
  'measured-repair': 'finalizer',
  'final-clearance': 'finalizer',
  'final-hard-safety': 'finalizer',
  'final-endpoint-seed': 'finalizer',
  'final-endpoint-topology': 'finalizer',
  'final-endpoint-order': 'finalizer',
  'final-endpoint-closure': 'finalizer',
  'final-safety-closure': 'finalizer',
  'final-safety-hard-gate': 'final-safety-closure',
  'final-safety-stubs': 'final-safety-closure',
  'final-safety-endpoint-order': 'final-safety-closure',
  'final-safety-passage-order': 'final-safety-closure',
  'final-commercial-clearance': 'finalizer',
  'final-commercial-terminal-preserving': 'finalizer',
  'final-commercial-terminal-changing': 'finalizer',
  'final-commercial-source-stairs': 'finalizer',
  'final-commercial-evaluation': 'finalizer',
  'final-commercial-safety-closure': 'finalizer',
});

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

export const getDisplayRoutingParentPhase = (
  phase: DisplayRoutingPhaseName,
): DisplayRoutingPhaseName | undefined => DISPLAY_ROUTING_PHASE_PARENTS[phase];

/**
 * Adds aggregate-exclusive durations without retaining graph identifiers or
 * relying on trace emission order. Some phases buffer child traces until the
 * parent finishes, so child time is distributed proportionally across repeated
 * parent samples. The aggregate exclusive total remains exact and non-negative.
 */
export const finalizeDisplayRoutingPhaseTrace = (
  traces: readonly DisplayRoutingPhaseTrace[],
): DisplayRoutingPhaseTrace[] => {
  const inclusiveByPhase = new Map<DisplayRoutingPhaseName, number>();
  const directChildByParent = new Map<DisplayRoutingPhaseName, number>();
  for (const trace of traces) {
    const durationMs = toBoundedDuration(trace.durationMs);
    inclusiveByPhase.set(
      trace.phase,
      (inclusiveByPhase.get(trace.phase) ?? 0) + durationMs,
    );
    const parentPhase = trace.parentPhase ?? getDisplayRoutingParentPhase(trace.phase);
    if (parentPhase) {
      directChildByParent.set(
        parentPhase,
        (directChildByParent.get(parentPhase) ?? 0) + durationMs,
      );
    }
  }
  return traces.map((trace) => {
    const durationMs = toBoundedDuration(trace.durationMs);
    const parentPhase = trace.parentPhase ?? getDisplayRoutingParentPhase(trace.phase);
    const phaseInclusive = inclusiveByPhase.get(trace.phase) ?? durationMs;
    const childTotal = directChildByParent.get(trace.phase) ?? 0;
    const allocatedChildDuration = phaseInclusive > 0
      ? childTotal * (durationMs / phaseInclusive)
      : 0;
    return {
      ...trace,
      ...(parentPhase ? { parentPhase } : {}),
      durationMs,
      exclusiveDurationMs: toBoundedDuration(
        Math.max(0, durationMs - allocatedChildDuration),
      ),
    };
  });
};

/**
 * Creates one aggregate-only phase measurement. It deliberately never accepts
 * graph IDs, labels, paths, or arbitrary metadata, so traces remain safe to
 * expose through local diagnostics and future telemetry adapters.
 */
export const startDisplayRoutingPhaseTrace = ({
  phase,
  parentPhase = getDisplayRoutingParentPhase(phase),
  candidateCount,
  onTrace,
}: {
  phase: DisplayRoutingPhaseName;
  parentPhase?: DisplayRoutingPhaseName;
  candidateCount: number;
  onTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): DisplayRoutingPhaseTimer => {
  const startedAt = readMonotonicTime();
  let finished = false;
  return {
    finish: (resolution, changedEdgeCount = 0, metrics = {}) => {
      if (finished) return;
      finished = true;
      onTrace?.({
        phase,
        ...(parentPhase ? { parentPhase } : {}),
        durationMs: toBoundedDuration(readMonotonicTime() - startedAt),
        candidateCount: toBoundedCount(metrics.candidateCount ?? candidateCount),
        changedEdgeCount: toBoundedCount(changedEdgeCount),
        evaluationCount: toBoundedCount(metrics.evaluationCount ?? 0),
        cacheHitCount: toBoundedCount(metrics.cacheHitCount ?? 0),
        scannedNodeCount: toBoundedCount(metrics.scannedNodeCount ?? 0),
        scannedSegmentCount: toBoundedCount(metrics.scannedSegmentCount ?? 0),
        scannedEdgePairCount: toBoundedCount(metrics.scannedEdgePairCount ?? 0),
        resolution,
      });
    },
  };
};
