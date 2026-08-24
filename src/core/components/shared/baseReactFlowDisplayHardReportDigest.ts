import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

const HARD_REPORT_DIGEST_PATTERN = /^hard-report-v1:[0-9a-f]{16}$/;
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

export type DisplayRoutingHardReportDigest = `hard-report-v1:${string}`;

export const isDisplayRoutingHardReportDigest = (
  value: unknown,
): value is DisplayRoutingHardReportDigest => (
  typeof value === 'string' && HARD_REPORT_DIGEST_PATTERN.test(value)
);

/**
 * Produces a bounded, content-free identity for the exact final quality report.
 * It is an integrity/equality token, not a cryptographic authentication token.
 */
export const computeDisplayRoutingHardReportDigest = (
  report: BaseDisplayBoundedCandidateReport,
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
  for (const edgeId of [...(report.minimumClearanceViolationEdgeIds ?? [])].sort()) {
    feed(edgeId);
  }
  feed(report.commercialClearanceViolations ?? -1);
  for (const key of QUALITY_KEYS) {
    feed(key);
    feed(report.quality[key]);
  }

  return `hard-report-v1:${(primary >>> 0).toString(16).padStart(8, '0')}${(
    secondary >>> 0
  ).toString(16).padStart(8, '0')}`;
};
