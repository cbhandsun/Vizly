import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

export type RoutingDefectPlan = Readonly<{
  hardClean: boolean;
  needsObstacleRepair: boolean;
  needsOverlapRepair: boolean;
  needsStrictCrossingRepair: boolean;
  needsTerminalRepair: boolean;
  needsMicroRepair: boolean;
  onlyTerminalAxisDefects: boolean;
}>;

export const createDisplayRoutingDefectPlan = (
  report: BaseDisplayBoundedCandidateReport,
): RoutingDefectPlan => {
  const quality = report.quality;
  const needsOverlapRepair = quality.reverseOverlap > 0
    || quality.unrelatedOverlap > 0
    || quality.unexplainedRelatedOverlap > 0;
  const needsTerminalRepair = !report.terminalsAttached
    || !report.terminalsAnchored
    || quality.shortEndpointStubs > 0;
  const needsMicroRepair = quality.nonOrthogonalSegments > 0
    || quality.tinyInteriorDoglegs > 0
    || quality.hairpins > 0;
  const onlyTerminalAxisDefects = report.terminalsAttached
    && !report.terminalsAnchored
    && report.obstacleHits === 0
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && !needsOverlapRepair
    && quality.shortEndpointStubs === 0
    && quality.tinyInteriorDoglegs === 0
    && quality.hairpins === 0;
  return {
    hardClean: report.hardClean,
    needsObstacleRepair: report.obstacleHits > 0,
    needsOverlapRepair,
    needsStrictCrossingRepair: quality.strictCrossings > 0,
    needsTerminalRepair,
    needsMicroRepair,
    onlyTerminalAxisDefects,
  };
};
