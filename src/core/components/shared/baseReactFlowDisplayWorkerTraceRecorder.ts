import { DISPLAY_ROUTING_PHASE_TRACE_LIMIT } from './baseReactFlowDisplayRoutingTrace';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

// Keep live diagnostics responsive without serializing every tiny nested phase.
// The final Worker response still carries the complete aggregated phase trace.
const MIN_NESTED_PHASE_PROGRESS_DURATION_MS = 25;

export const shouldPublishDisplayRoutingPhaseProgress = (
  trace: DisplayRoutingPhaseTrace,
): boolean => trace.parentPhase === undefined
  || trace.durationMs >= MIN_NESTED_PHASE_PROGRESS_DURATION_MS
  || trace.resolution === 'rejected'
  || trace.resolution === 'fallback';

export const appendDisplayRoutingPhaseTrace = (
  phaseTrace: DisplayRoutingPhaseTrace[],
  trace: DisplayRoutingPhaseTrace,
): boolean => {
  const existingIndex = phaseTrace.findIndex(existing => (
    existing.phase === trace.phase
    && existing.parentPhase === trace.parentPhase
  ));
  if (existingIndex >= 0) {
    const existing = phaseTrace[existingIndex];
    const sumCount = (first: number | undefined, second: number | undefined): number => (
      Math.min(1_000_000, Math.max(0, first ?? 0) + Math.max(0, second ?? 0))
    );
    const sumOptionalCount = (
      first: number | undefined,
      second: number | undefined,
    ): number | undefined => (
      typeof first === 'undefined' && typeof second === 'undefined'
        ? undefined
        : sumCount(first, second)
    );
    const minimumCount = (
      first: number | undefined,
      second: number | undefined,
    ): number | undefined => {
      if (typeof first === 'undefined') return second;
      if (typeof second === 'undefined') return first;
      return Math.min(Math.max(0, first), Math.max(0, second));
    };
    const maximumCount = (
      first: number | undefined,
      second: number | undefined,
    ): number | undefined => {
      if (typeof first === 'undefined') return second;
      if (typeof second === 'undefined') return first;
      return Math.max(Math.max(0, first), Math.max(0, second));
    };
    const resolutionRank = {
      skip: 0,
      hit: 1,
      accepted: 2,
      rejected: 3,
      fallback: 4,
    } as const;
    const workItemCount = sumOptionalCount(existing.workItemCount, trace.workItemCount);
    const budgetCount = sumOptionalCount(existing.budgetCount, trace.budgetCount);
    const underBudgetCount = sumOptionalCount(
      existing.underBudgetCount,
      trace.underBudgetCount,
    );
    const minimumCandidateCount = minimumCount(
      existing.minimumCandidateCount,
      trace.minimumCandidateCount,
    );
    const maximumCandidateCount = maximumCount(
      existing.maximumCandidateCount,
      trace.maximumCandidateCount,
    );
    phaseTrace[existingIndex] = {
      ...existing,
      durationMs: Math.min(600_000, existing.durationMs + trace.durationMs),
      candidateCount: sumCount(existing.candidateCount, trace.candidateCount),
      changedEdgeCount: sumCount(existing.changedEdgeCount, trace.changedEdgeCount),
      evaluationCount: sumCount(existing.evaluationCount, trace.evaluationCount),
      cacheHitCount: sumCount(existing.cacheHitCount, trace.cacheHitCount),
      scannedNodeCount: sumCount(existing.scannedNodeCount, trace.scannedNodeCount),
      scannedSegmentCount: sumCount(
        existing.scannedSegmentCount,
        trace.scannedSegmentCount,
      ),
      scannedEdgePairCount: sumCount(
        existing.scannedEdgePairCount,
        trace.scannedEdgePairCount,
      ),
      ...(workItemCount !== undefined
        ? { workItemCount }
        : {}),
      ...(budgetCount !== undefined
        ? { budgetCount }
        : {}),
      ...(underBudgetCount !== undefined
        ? { underBudgetCount }
        : {}),
      ...(minimumCandidateCount !== undefined
        ? { minimumCandidateCount }
        : {}),
      ...(maximumCandidateCount !== undefined
        ? { maximumCandidateCount }
        : {}),
      resolution: resolutionRank[trace.resolution] > resolutionRank[existing.resolution]
        ? trace.resolution
        : existing.resolution,
    };
    return true;
  }
  if (phaseTrace.length >= DISPLAY_ROUTING_PHASE_TRACE_LIMIT) return false;
  phaseTrace.push(trace);
  return true;
};

export const createDisplayRoutingPhaseRecorder = ({
  requestId,
  phaseTrace,
  publish,
  publishProgress = true,
}: {
  requestId: string;
  phaseTrace: DisplayRoutingPhaseTrace[];
  publish: (response: DisplayEdgesWorkerResponse) => void;
  publishProgress?: boolean;
}): ((trace: DisplayRoutingPhaseTrace) => void) => (trace) => {
  appendDisplayRoutingPhaseTrace(phaseTrace, trace);
  if (publishProgress && shouldPublishDisplayRoutingPhaseProgress(trace)) {
    publish({ requestId, phaseProgress: trace });
  }
};

export const createDisplayRoutingFallbackMetadata = (
  request: DisplayEdgesWorkerRequest,
  affectedEdgeCount: number | undefined,
): Readonly<{ affectedEdgeCount?: number; fallbackLevel?: 'full' }> => (
  request.operation === 'incremental-route'
    ? { affectedEdgeCount: affectedEdgeCount ?? 0, fallbackLevel: 'full' }
    : {}
);
