import { ROUTING_IDENTIFIER_MAX_LENGTH } from './routingBoundaryLimits';

const HARD_REPORT_DIGEST_PATTERN = /^hard-report-v1:[0-9a-f]{16}$/;
const MAX_COUNTER = 1_000_000_000;
const MAX_REPORT_EDGE_IDS = 300;
const QUALITY_KEYS = [
  'nonOrthogonalSegments', 'strictCrossings', 'reverseOverlap', 'unrelatedOverlap',
  'relatedOverlap', 'unexplainedRelatedOverlap', 'shortEndpointStubs',
  'tinyInteriorDoglegs', 'hairpins', 'backtrackPenalty', 'detourPenalty',
  'bends', 'totalLength',
] as const;

export type RoutingHardQualityScore = Readonly<Record<(typeof QUALITY_KEYS)[number], number>>;
export type RoutingHardReport = Readonly<{
  candidate: 'terminal-lane' | 'polished';
  hardClean: boolean;
  obstacleHits: number;
  terminalsAttached: boolean;
  terminalsAnchored: boolean;
  quality: RoutingHardQualityScore;
  minimumClearanceViolations?: number;
  minimumClearanceViolationEdgeIds?: readonly string[];
  commercialClearanceViolations?: number;
}>;
export type DisplayRoutingHardReportDigest = `hard-report-v1:${string}`;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const isBoundedMetric = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_COUNTER
);
const optionalMetric = (value: unknown): number | undefined | null => (
  typeof value === 'undefined' ? undefined : isBoundedMetric(value) ? value : null
);

export const cloneRoutingHardReport = (value: unknown): RoutingHardReport | null => {
  if (!isRecord(value) || !isRecord(value.quality)) return null;
  const qualityRecord = value.quality;
  if (
    (value.candidate !== 'terminal-lane' && value.candidate !== 'polished')
    || typeof value.hardClean !== 'boolean'
    || !isBoundedMetric(value.obstacleHits)
    || typeof value.terminalsAttached !== 'boolean'
    || typeof value.terminalsAnchored !== 'boolean'
  ) return null;
  const qualityEntries = QUALITY_KEYS.map((key) => {
    const metric = qualityRecord[key];
    return isBoundedMetric(metric) ? [key, metric] as const : null;
  });
  if (qualityEntries.some(entry => entry === null)) return null;
  const minimumClearanceViolations = optionalMetric(value.minimumClearanceViolations);
  const commercialClearanceViolations = optionalMetric(value.commercialClearanceViolations);
  if (minimumClearanceViolations === null || commercialClearanceViolations === null) return null;
  const edgeIds = typeof value.minimumClearanceViolationEdgeIds === 'undefined'
    ? undefined
    : Array.isArray(value.minimumClearanceViolationEdgeIds)
      && value.minimumClearanceViolationEdgeIds.length <= MAX_REPORT_EDGE_IDS
      && value.minimumClearanceViolationEdgeIds.every(edgeId => (
        typeof edgeId === 'string'
        && edgeId.length > 0
        && edgeId.length <= ROUTING_IDENTIFIER_MAX_LENGTH
      ))
      ? Object.freeze([...value.minimumClearanceViolationEdgeIds] as string[])
      : null;
  if (edgeIds === null) return null;
  const quality = Object.freeze(Object.fromEntries(
    qualityEntries as Array<readonly [string, number]>,
  )) as RoutingHardQualityScore;
  return Object.freeze({
    candidate: value.candidate,
    hardClean: value.hardClean,
    obstacleHits: value.obstacleHits,
    terminalsAttached: value.terminalsAttached,
    terminalsAnchored: value.terminalsAnchored,
    quality,
    ...(typeof minimumClearanceViolations === 'number' ? { minimumClearanceViolations } : {}),
    ...(edgeIds ? { minimumClearanceViolationEdgeIds: edgeIds } : {}),
    ...(typeof commercialClearanceViolations === 'number'
      ? { commercialClearanceViolations }
      : {}),
  });
};

export const isDisplayRoutingHardReportDigest = (
  value: unknown,
): value is DisplayRoutingHardReportDigest => (
  typeof value === 'string' && HARD_REPORT_DIGEST_PATTERN.test(value)
);

export const computeDisplayRoutingHardReportDigest = (
  report: RoutingHardReport,
): DisplayRoutingHardReportDigest => {
  let primary = 2166136261;
  let secondary = 2246822507;
  const feed = (value: unknown): void => {
    const text = `${typeof value}:${String(value ?? '')}`;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      primary ^= code;
      primary = Math.imul(primary, 16777619);
      secondary ^= code + index;
      secondary = Math.imul(secondary, 3266489909);
    }
  };
  feed(report.candidate);
  feed(report.hardClean);
  feed(report.obstacleHits);
  feed(report.terminalsAttached);
  feed(report.terminalsAnchored);
  feed(report.minimumClearanceViolations ?? -1);
  for (const edgeId of [...(report.minimumClearanceViolationEdgeIds ?? [])].sort()) feed(edgeId);
  feed(report.commercialClearanceViolations ?? -1);
  for (const key of QUALITY_KEYS) {
    feed(key);
    feed(report.quality[key]);
  }
  return `hard-report-v1:${(primary >>> 0).toString(16).padStart(8, '0')}${(
    secondary >>> 0
  ).toString(16).padStart(8, '0')}`;
};
