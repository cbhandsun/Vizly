import type { Edge, Node } from '@xyflow/react';

import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import type { BaseDisplayHardGateMemo } from './baseReactFlowDisplayHardGateMemo';
import { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import type { BaseReactFlowPreDisplayFinalEdgesArgs } from './baseReactFlowDisplayFullRouteTypes';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { repairTerminalHandleHemisphereHairpins } from './baseReactFlowDisplayTerminalPortRepair';

export type BaseReactFlowInteractiveSeedResult = Readonly<{
  edges: Edge[];
  report: BaseDisplayBoundedCandidateReport;
}>;

const onlyNeedsHemisphereHairpinRepair = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => report.obstacleHits === 0
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins > 0;

export const createBaseReactFlowInteractiveSeedResult = ({
  args,
  repairNodes,
  getRouteHardQualityGateReport,
}: {
  args: BaseReactFlowPreDisplayFinalEdgesArgs;
  repairNodes: Node[];
  getRouteHardQualityGateReport: BaseDisplayHardGateMemo['getReport'];
}): BaseReactFlowInteractiveSeedResult => {
  const interactiveTimer = args.onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive',
        candidateCount: args.edges.length,
        onTrace: args.onPhaseTrace,
      })
    : null;
  const phaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPhaseTrace = args.onPhaseTrace
    ? (trace: DisplayRoutingPhaseTrace) => phaseTrace.push(trace)
    : undefined;
  const routeTimer = recordPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-route',
        candidateCount: args.edges.length,
        onTrace: recordPhaseTrace,
      })
    : null;
  const seed = args.preparedInteractiveEdges ?? createBaseReactFlowInteractiveDisplayEdges({
    edges: args.edges,
    nodes: args.nodes,
    enableSmartEdges: args.enableSmartEdges,
    smartEdgePadding: args.smartEdgePadding,
    isLargeGraph: args.isLargeGraph,
    displayEdgeEpoch: args.displayEdgeEpoch,
    deferOuterObstacleRepair: true,
    onPhaseTrace: recordPhaseTrace,
  });
  routeTimer?.finish(
    args.preparedInteractiveEdges ? 'hit' : 'accepted',
    seed === args.edges ? 0 : seed.length,
  );
  const cleanupTimer = recordPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-terminal-cleanup',
        candidateCount: seed.length,
        onTrace: recordPhaseTrace,
      })
    : null;
  const interactive = repairResidualHairpinBridges(
    compactDisplayEdgePaths(repairTerminalBoundaryStairs(seed, repairNodes)),
    repairNodes,
  );
  cleanupTimer?.finish(
    interactive === seed ? 'skip' : 'accepted',
    interactive === seed ? 0 : interactive.length,
  );
  interactiveTimer?.finish(interactive === seed ? 'skip' : 'accepted');
  phaseTrace.forEach(trace => args.onPhaseTrace?.(trace));
  const gateTimer = args.onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-initial-gate',
        candidateCount: interactive.length,
        onTrace: args.onPhaseTrace,
      })
    : null;
  const report = getRouteHardQualityGateReport(interactive, repairNodes, 'polished');
  gateTimer?.finish(report.hardClean ? 'accepted' : 'rejected');
  if (report.hardClean || !onlyNeedsHemisphereHairpinRepair(report)) {
    return { edges: interactive, report };
  }
  const repaired = repairTerminalHandleHemisphereHairpins(interactive, repairNodes);
  const repairedReport = getRouteHardQualityGateReport(repaired, repairNodes, 'terminal-lane');
  return repairedReport.hardClean
    ? { edges: repaired, report: repairedReport }
    : { edges: interactive, report };
};
