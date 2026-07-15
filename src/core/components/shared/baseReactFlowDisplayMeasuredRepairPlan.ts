import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

export type BaseReactFlowMeasuredRepairNeeds = {
  obstacle: boolean;
  overlap: boolean;
  strict: boolean;
  terminal: boolean;
};

/**
 * Derives the minimum exact-repair stages required by a hard-gate report.
 * Stages may still be re-evaluated after an accepted edit because an edit can
 * expose a different defect, but a known-zero stage is never run speculatively.
 */
export const getBaseReactFlowMeasuredRepairNeeds = (
  report: BaseDisplayBoundedCandidateReport,
): BaseReactFlowMeasuredRepairNeeds => ({
  obstacle: report.obstacleHits > 0,
  overlap: report.quality.reverseOverlap > 0
    || report.quality.unrelatedOverlap > 0
    || report.quality.unexplainedRelatedOverlap > 0
    || report.quality.tinyInteriorDoglegs > 0
    || report.quality.hairpins > 0,
  strict: report.quality.strictCrossings > 0
    || report.quality.nonOrthogonalSegments > 0,
  terminal: !report.terminalsAnchored
    || report.quality.shortEndpointStubs > 0,
});
