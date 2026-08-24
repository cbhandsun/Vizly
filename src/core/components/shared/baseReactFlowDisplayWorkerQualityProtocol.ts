import { ROUTING_IDENTIFIER_MAX_LENGTH } from '../../routing/routingBoundaryLimits';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

const MAX_GRAPH_ITEMS = 10_000;
const MAX_QUALITY_METRIC = 1_000_000_000_000_000;
const QUALITY_KEYS = [
  'nonOrthogonalSegments',
  'strictCrossings',
  'reverseOverlap',
  'unrelatedOverlap',
  'relatedOverlap',
  'unexplainedRelatedOverlap',
  'shortEndpointStubs',
  'tinyInteriorDoglegs',
  'hairpins',
  'backtrackPenalty',
  'detourPenalty',
  'bends',
  'totalLength',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isBoundedIdentifier = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= ROUTING_IDENTIFIER_MAX_LENGTH
);

const isBoundedMetric = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && value <= MAX_QUALITY_METRIC
);

const isOptionalViolationCount = (value: unknown): boolean => (
  typeof value === 'undefined'
  || (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_GRAPH_ITEMS
  )
);

export const isDisplayWorkerBoundedCandidateReport = (
  value: unknown,
): value is BaseDisplayBoundedCandidateReport => {
  if (!isRecord(value)) return false;
  const quality = value.quality;
  if (!isRecord(quality)) return false;
  const qualityKeys = Object.keys(quality);
  if (
    (value.candidate !== 'terminal-lane' && value.candidate !== 'polished')
    || typeof value.hardClean !== 'boolean'
    || typeof value.terminalsAttached !== 'boolean'
    || typeof value.terminalsAnchored !== 'boolean'
    || !isBoundedMetric(value.obstacleHits)
    || qualityKeys.length !== QUALITY_KEYS.length
    || !qualityKeys.every(key => (QUALITY_KEYS as readonly string[]).includes(key))
    || !QUALITY_KEYS.every(key => isBoundedMetric(quality[key]))
    || !isOptionalViolationCount(value.minimumClearanceViolations)
    || !isOptionalViolationCount(value.commercialClearanceViolations)
  ) return false;
  if (
    typeof value.commercialClearanceViolations === 'number'
    && value.commercialClearanceViolations > 0
    && value.hardClean
  ) return false;
  const clearanceEdgeIds = value.minimumClearanceViolationEdgeIds;
  if (
    typeof clearanceEdgeIds !== 'undefined'
    && (
      !Array.isArray(clearanceEdgeIds)
      || clearanceEdgeIds.length > 32
      || !clearanceEdgeIds.every(isBoundedIdentifier)
    )
  ) return false;
  const pairs = value.unrelatedOverlapPairs;
  return typeof pairs === 'undefined' || (
    Array.isArray(pairs)
    && pairs.length <= MAX_GRAPH_ITEMS
    && pairs.every(pair => (
      isRecord(pair)
      && isBoundedIdentifier(pair.firstId)
      && isBoundedIdentifier(pair.secondId)
      && isBoundedMetric(pair.overlap)
    ))
  );
};
