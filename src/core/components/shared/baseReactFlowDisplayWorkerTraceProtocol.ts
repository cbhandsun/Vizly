import {
  DISPLAY_ROUTING_PHASE_NAMES,
  DISPLAY_ROUTING_PHASE_RESOLUTIONS,
  DISPLAY_ROUTING_PHASE_TRACE_LIMIT,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

const OPTIONAL_COUNT_KEYS = [
  'evaluationCount',
  'cacheHitCount',
  'scannedNodeCount',
  'scannedSegmentCount',
  'scannedEdgePairCount',
  'workItemCount',
  'budgetCount',
  'underBudgetCount',
  'minimumCandidateCount',
  'maximumCandidateCount',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && (
    Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null
  )
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isBoundedCount = (value: unknown): boolean => (
  Number.isSafeInteger(value)
  && (value as number) >= 0
  && (value as number) <= 1_000_000
);

export const isDisplayRoutingPhaseTrace = (
  value: unknown,
): value is DisplayRoutingPhaseTrace => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length >= 5
    && keys.length <= 17
    && keys.every(key => (
      key === 'phase'
      || key === 'parentPhase'
      || key === 'durationMs'
      || key === 'exclusiveDurationMs'
      || key === 'candidateCount'
      || key === 'changedEdgeCount'
      || OPTIONAL_COUNT_KEYS.includes(key as typeof OPTIONAL_COUNT_KEYS[number])
      || key === 'resolution'
    ))
    && (DISPLAY_ROUTING_PHASE_NAMES as readonly unknown[]).includes(value.phase)
    && (
      typeof value.parentPhase === 'undefined'
      || (
        (DISPLAY_ROUTING_PHASE_NAMES as readonly unknown[]).includes(value.parentPhase)
        && value.parentPhase !== value.phase
      )
    )
    && (DISPLAY_ROUTING_PHASE_RESOLUTIONS as readonly unknown[]).includes(value.resolution)
    && isFiniteNumber(value.durationMs)
    && value.durationMs >= 0
    && value.durationMs <= 600_000
    && (
      typeof value.exclusiveDurationMs === 'undefined'
      || (
        isFiniteNumber(value.exclusiveDurationMs)
        && value.exclusiveDurationMs >= 0
        && value.exclusiveDurationMs <= value.durationMs
      )
    )
    && isBoundedCount(value.candidateCount)
    && isBoundedCount(value.changedEdgeCount)
    && OPTIONAL_COUNT_KEYS.every(key => (
      typeof value[key] === 'undefined' || isBoundedCount(value[key])
    ));
};

export const parseDisplayRoutingPhaseTrace = (
  value: unknown,
): DisplayRoutingPhaseTrace[] | null => (
  Array.isArray(value)
  && value.length <= DISPLAY_ROUTING_PHASE_TRACE_LIMIT
  && value.every(isDisplayRoutingPhaseTrace)
    ? value
    : null
);
