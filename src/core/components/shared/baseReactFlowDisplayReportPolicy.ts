import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';

const hasNoNonTerminalDisplayDefects = (report: BaseDisplayBoundedCandidateReport): boolean => (
  report.obstacleHits === 0
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins === 0
);

export const displayReportOnlyNeedsTerminalAnchoring = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => (
  hasNoNonTerminalDisplayDefects(report)
  && report.terminalsAttached
  && !report.terminalsAnchored
  && report.quality.strictCrossings === 0
);

export const displayReportCanFinishWithAnchoringCluster = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => hasNoNonTerminalDisplayDefects(report);
