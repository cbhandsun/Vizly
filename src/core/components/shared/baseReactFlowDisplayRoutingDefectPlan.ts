import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

type DisplayRoutingDefectQuality = BaseDisplayBoundedCandidateReport['quality'];

export type RoutingDefectStageName =
  | 'post-render-residual'
  | 'strict-primary-overlap';

export type RoutingDefectStageDecision = Readonly<{
  stage: RoutingDefectStageName;
  scheduled: boolean;
  defect: 'overlap';
}>;

export type RoutingDefectStagePlan = readonly RoutingDefectStageDecision[];

export type RoutingDefectPlan = Readonly<{
  hardClean: boolean;
  needsObstacleRepair: boolean;
  needsOverlapRepair: boolean;
  needsStrictCrossingRepair: boolean;
  needsTerminalRepair: boolean;
  needsMicroRepair: boolean;
  onlyTerminalAxisDefects: boolean;
  terminalClosureEligible: boolean;
  orderedStages: RoutingDefectStagePlan;
}>;

export const displayRoutingDefectStageIsScheduled = (
  plan: RoutingDefectStagePlan,
  stage: RoutingDefectStageName,
): boolean => plan.some(decision => (
  decision.stage === stage && decision.scheduled
));

export const displayRoutingDefectPlanNeedsStrictPrimaryCrossing = (
  plan: RoutingDefectPlan,
): boolean => plan.needsStrictCrossingRepair || plan.needsOverlapRepair;

export const createDisplayRoutingDefectStagePlan = (
  quality: DisplayRoutingDefectQuality,
): RoutingDefectStagePlan => {
  const needsOverlapRepair = quality.reverseOverlap > 0
    || quality.unrelatedOverlap > 0
    || quality.unexplainedRelatedOverlap > 0;
  return [
    {
      stage: 'post-render-residual',
      scheduled: needsOverlapRepair,
      defect: 'overlap',
    },
    {
      stage: 'strict-primary-overlap',
      scheduled: needsOverlapRepair,
      defect: 'overlap',
    },
  ];
};

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
    && report.obstacleHits === 0
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && !needsOverlapRepair
    && (
      needsTerminalRepair
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
    orderedStages: createDisplayRoutingDefectStagePlan(quality),
  };
};
