import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

type DisplayRoutingDefectQuality = BaseDisplayBoundedCandidateReport['quality'];

export type RoutingDefectPlan = Readonly<{
  hardClean: boolean;
  needsObstacleRepair: boolean;
  needsOverlapRepair: boolean;
  needsStrictCrossingRepair: boolean;
  needsTerminalRepair: boolean;
  needsMicroRepair: boolean;
  onlyTerminalAxisDefects: boolean;
  terminalClosureEligible: boolean;
}>;

export const displayRoutingQualityNeedsMicroRepair = (
  quality: DisplayRoutingDefectQuality,
): boolean => quality.nonOrthogonalSegments > 0
  || quality.tinyInteriorDoglegs > 0
  || quality.hairpins > 0;

export const displayRoutingQualityNeedsTerminalRepair = (
  quality: DisplayRoutingDefectQuality,
): boolean => quality.shortEndpointStubs > 0;

export const createDisplayRoutingDefectPlan = (
  report: BaseDisplayBoundedCandidateReport,
): RoutingDefectPlan => {
  const quality = report.quality;
  const needsOverlapRepair = quality.reverseOverlap > 0
    || quality.unrelatedOverlap > 0
    || quality.unexplainedRelatedOverlap > 0;
  const needsTerminalRepair = !report.terminalsAttached
    || !report.terminalsAnchored
    || displayRoutingQualityNeedsTerminalRepair(quality);
  const needsMicroRepair = displayRoutingQualityNeedsMicroRepair(quality);
  const onlyTerminalAxisDefects = report.terminalsAttached
    && !report.terminalsAnchored
    && report.obstacleHits === 0
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && !needsOverlapRepair
    && quality.shortEndpointStubs === 0
    && quality.tinyInteriorDoglegs === 0
    && quality.hairpins === 0;
  const terminalClosureEligible = !report.hardClean
    && report.terminalsAttached
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && !needsOverlapRepair
    && (
      report.obstacleHits > 0
      || needsTerminalRepair
      || needsMicroRepair
    );
  return {
    hardClean: report.hardClean,
    needsObstacleRepair: report.obstacleHits > 0,
    needsOverlapRepair,
    needsStrictCrossingRepair: quality.strictCrossings > 0,
    needsTerminalRepair,
    needsMicroRepair,
    onlyTerminalAxisDefects,
    terminalClosureEligible,
  };
};
