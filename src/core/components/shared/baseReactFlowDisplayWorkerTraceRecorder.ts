import { DISPLAY_ROUTING_PHASE_TRACE_LIMIT } from './baseReactFlowDisplayRoutingTrace';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';

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
    const resolutionRank = {
      skip: 0,
      hit: 1,
      accepted: 2,
      rejected: 3,
      fallback: 4,
    } as const;
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
  if (publishProgress) publish({ requestId, phaseProgress: trace });
};

export const createDisplayRoutingFallbackMetadata = (
  request: DisplayEdgesWorkerRequest,
  affectedEdgeCount: number | undefined,
): Readonly<{ affectedEdgeCount?: number; fallbackLevel?: 'full' }> => (
  request.operation === 'incremental-route'
    ? { affectedEdgeCount: affectedEdgeCount ?? 0, fallbackLevel: 'full' }
    : {}
);
