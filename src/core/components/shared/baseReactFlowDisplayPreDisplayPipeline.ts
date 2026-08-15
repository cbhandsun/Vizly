import type { Edge } from "@xyflow/react";

import { repairDetachedStrictCrossingBypasses } from "../../strategies/shared/edgeDetachedStrictCrossingRepair";
import { repairDisplayMicroArtifacts } from "../../strategies/shared/edgeDisplayMicroCleanup";
import { repairResidualHairpinBridges } from "../../strategies/shared/edgeHairpinBridgeWidenRepair";
import { repairLocalDoglegArtifacts } from "../../strategies/shared/edgeLocalDoglegRepair";
import { calculateEdgePathQualityScore } from "../../strategies/shared/edgeStrictCrossingGuard";
import { repairTerminalBoundaryStairs } from "../../strategies/shared/edgeTerminalBoundaryStairRepair";
import { repairBoundedPortAndInternalStrictCrossings } from "./baseReactFlowDisplayBoundedStrictRepair";
import { shouldStopAfterBoundedTerminalLaneSeed } from "./baseReactFlowDisplayBoundedSeedPolicy";
import {
  anchorComputedDisplayEdgeEndpoints,
  withDisplayAbsolutePositions,
} from "./baseReactFlowDisplayEdgeCore";
import {
  chooseDisplayStrictPolishCandidate,
  chooseFinalObstacleAwarePolishCandidate,
  hasHardDisplayOverlapRisk,
} from "./baseReactFlowDisplayEvaluation";
import { compactDisplayEdgePaths } from "./baseReactFlowDisplayGeometry";
import { createBaseDisplayHardGateMemo } from "./baseReactFlowDisplayHardGateMemo";
import { repairDisplayObstacleHits } from "./baseReactFlowDisplayObstacleRepair";
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  repairExactThresholdResidualOverlaps,
  repairNearParallelResidualOverlaps,
  repairResidualDisplayOverlaps,
} from "./baseReactFlowDisplayOverlapRepair";
import { createBaseReactFlowInteractiveDisplayEdges } from "./baseReactFlowDisplayQualitySeedPipeline";
import { DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS } from "./baseReactFlowDisplayRenderPipeline";
import { repairFinalResidualStrictCrossings } from "./baseReactFlowDisplayStrictResidualRepair";
import { finalStrictDisplaySweep } from "./baseReactFlowDisplayStrictSweepRepair";
import {
  repairAnchoredTerminalCrossingCluster,
  repairTerminalEndpointStrictCrossingStubs,
} from "./baseReactFlowDisplayStrictTerminalRepair";
import {
  repairAxisMismatchedTerminalsWithBoundedPortRoles,
  repairDetachedTerminalsWithBoundedPortRoles,
  repairTerminalHandleHemisphereHairpins,
} from "./baseReactFlowDisplayTerminalPortRepair";
import { repairBoundedReverseParallelOverlaps } from './baseReactFlowDisplayReverseParallelOverlapClosure';
import { repairFastDisplayHardSafety } from "./baseReactFlowFastEdgeSafety";
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
  keepNodeAnchoredTerminalCandidates,
  repairTerminalHandleAxisCrossings,
} from "./baseReactFlowTerminalAxisRepair";

import { createBaseReactFlowFullRouteEdges } from "./baseReactFlowDisplayFullRoutePipeline";
import {
  displayReportCanFinishWithAnchoringCluster,
  displayReportOnlyNeedsTerminalAnchoring,
} from './baseReactFlowDisplayReportPolicy';
import { readDisplayLayoutDirection } from './baseReactFlowDisplayDirection';
import { repairBaseReactFlowResidualOverlapAxisClosure } from './baseReactFlowDisplayResidualOverlapClosure';
import type { BaseReactFlowPreDisplayFinalEdgesArgs } from './baseReactFlowDisplayFullRouteTypes';

export const createBaseReactFlowPreDisplayFinalEdges = (
  args: BaseReactFlowPreDisplayFinalEdgesArgs,
): Edge[] => {
  const nodeById = new Map(args.nodes.map((node) => [node.id, node]));
  const repairNodes = withDisplayAbsolutePositions(args.nodes, nodeById);
  const terminalValidationSnapshot =
    createDisplayTerminalValidationSnapshot(repairNodes);
  const { getReport: getRouteHardQualityGateReport } =
    createBaseDisplayHardGateMemo(repairNodes, terminalValidationSnapshot);
  const routeTerminalsAreAttached = (edges: Edge[]): boolean =>
    getDisplayTerminalValidationReport(edges, terminalValidationSnapshot)
      .allAttached;
  const interactiveSeed =
    args.preparedInteractiveEdges ??
    createBaseReactFlowInteractiveDisplayEdges({
      edges: args.edges,
      nodes: args.nodes,
      enableSmartEdges: args.enableSmartEdges,
      smartEdgePadding: args.smartEdgePadding,
      isLargeGraph: args.isLargeGraph,
      displayEdgeEpoch: args.displayEdgeEpoch,
      deferOuterObstacleRepair: true,
    });
  const interactive = repairResidualHairpinBridges(
    compactDisplayEdgePaths(
      repairTerminalBoundaryStairs(interactiveSeed, repairNodes),
    ),
    repairNodes,
  );
  const interactiveReport = getRouteHardQualityGateReport(
    interactive,
    repairNodes,
    "polished",
  );
  if (interactiveReport.hardClean) {
    args.onBoundedCandidate?.(interactiveReport);
    return interactive;
  }
  const interactiveOnlyNeedsHemisphereHairpinRepair =
    interactiveReport.obstacleHits === 0 &&
    interactiveReport.quality.nonOrthogonalSegments === 0 &&
    interactiveReport.quality.strictCrossings === 0 &&
    interactiveReport.quality.reverseOverlap === 0 &&
    interactiveReport.quality.unrelatedOverlap === 0 &&
    interactiveReport.quality.unexplainedRelatedOverlap === 0 &&
    interactiveReport.quality.shortEndpointStubs === 0 &&
    interactiveReport.quality.tinyInteriorDoglegs === 0 &&
    interactiveReport.quality.hairpins > 0;
  if (interactiveOnlyNeedsHemisphereHairpinRepair) {
    const hemisphereOnlyRepaired = repairTerminalHandleHemisphereHairpins(
      interactive,
      repairNodes,
    );
    const hemisphereOnlyReport = getRouteHardQualityGateReport(
      hemisphereOnlyRepaired,
      repairNodes,
      "terminal-lane",
    );
    if (hemisphereOnlyReport.hardClean) {
      args.onBoundedCandidate?.(hemisphereOnlyReport);
      return hemisphereOnlyRepaired;
    }
  }
  const hardSafeRepaired = repairFastDisplayHardSafety(
    interactive,
    repairNodes,
  );
  const hemisphereRepaired = repairTerminalHandleHemisphereHairpins(
    hardSafeRepaired,
    repairNodes,
  );
  const microRepaired = repairDisplayMicroArtifacts(
    hemisphereRepaired,
  ) as Edge[];
  const localRepaired = repairLocalDoglegArtifacts(microRepaired, repairNodes);
  const strictRepaired = repairFinalResidualStrictCrossings(
    localRepaired,
    repairNodes,
  );
  const terminalStrictRepaired = repairTerminalEndpointStrictCrossingStubs(
    strictRepaired,
    repairNodes,
  );
  const terminalStrictQuality = calculateEdgePathQualityScore(
    terminalStrictRepaired,
  );
  const terminalLaneRepaired =
    terminalStrictQuality.strictCrossings > 0 ||
    terminalStrictQuality.reverseOverlap > 0 ||
    terminalStrictQuality.unrelatedOverlap > 0 ||
    terminalStrictQuality.unexplainedRelatedOverlap > 0
      ? repairTerminalHandleAxisCrossings(terminalStrictRepaired, repairNodes)
      : terminalStrictRepaired;
  const terminalLaneReport = getRouteHardQualityGateReport(
    terminalLaneRepaired,
    repairNodes,
    "terminal-lane",
  );
  if (terminalLaneReport.hardClean) {
    args.onBoundedCandidate?.(terminalLaneReport);
    return terminalLaneRepaired;
  }
  if (shouldStopAfterBoundedTerminalLaneSeed({
    skipFullRouteFallback: args.skipFullRouteFallback,
    edgeCount: args.edges.length,
    nodeCount: repairNodes.length,
  })) {
    args.onBoundedCandidate?.(terminalLaneReport);
    return terminalLaneRepaired;
  }
  const terminalOverlapRepaired = repairResidualDisplayOverlaps(
    terminalLaneRepaired,
    repairNodes,
    DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
    DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  );
  const terminalOverlapQuality = calculateEdgePathQualityScore(
    terminalOverlapRepaired,
  );
  const terminalOverlapStrictRepaired =
    terminalOverlapQuality.strictCrossings > 0
      ? repairTerminalEndpointStrictCrossingStubs(
          terminalOverlapRepaired,
          repairNodes,
          12,
        )
      : terminalOverlapRepaired;
  const terminalOverlapStrictReport = getRouteHardQualityGateReport(
    terminalOverlapStrictRepaired,
    repairNodes,
    "terminal-lane",
  );
  if (terminalOverlapStrictReport.hardClean) {
    args.onBoundedCandidate?.(terminalOverlapStrictReport);
    return terminalOverlapStrictRepaired;
  }
  const terminalOverlapInternalStrictRepaired =
    terminalOverlapStrictReport.quality.strictCrossings > 0
      ? repairBoundedPortAndInternalStrictCrossings(
          terminalOverlapStrictRepaired,
          repairNodes,
          8,
        )
      : terminalOverlapStrictRepaired;
  const terminalOverlapInternalStrictQuality = calculateEdgePathQualityScore(
    terminalOverlapInternalStrictRepaired,
  );
  const terminalOverlapInternalRepaired =
    terminalOverlapInternalStrictQuality.reverseOverlap > 0
      ? repairBoundedReverseParallelOverlaps(
          terminalOverlapInternalStrictRepaired,
          repairNodes,
          8,
        )
      : terminalOverlapInternalStrictRepaired;
  const terminalOverlapInternalAnchored = routeTerminalsAreAttached(
    terminalOverlapInternalRepaired,
  )
    ? terminalOverlapInternalRepaired
    : repairDetachedTerminalsWithBoundedPortRoles(
        terminalOverlapInternalRepaired,
        repairNodes,
        12,
      );
  const terminalOverlapInternalStrictReport = getRouteHardQualityGateReport(
    terminalOverlapInternalAnchored,
    repairNodes,
    "terminal-lane",
  );
  if (terminalOverlapInternalStrictReport.hardClean) {
    args.onBoundedCandidate?.(terminalOverlapInternalStrictReport);
    return terminalOverlapInternalAnchored;
  }
  if (
    displayReportOnlyNeedsTerminalAnchoring(terminalOverlapInternalStrictReport)
  ) {
    const terminalOverlapAxisAnchored =
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        terminalOverlapInternalAnchored,
        repairNodes,
        Math.min(192, Math.max(64, terminalOverlapInternalAnchored.length * 4)),
      );
    if (terminalOverlapAxisAnchored !== terminalOverlapInternalAnchored) {
      const terminalOverlapAxisReport = getRouteHardQualityGateReport(
        terminalOverlapAxisAnchored,
        repairNodes,
        "terminal-lane",
      );
      if (terminalOverlapAxisReport.hardClean) {
        args.onBoundedCandidate?.(terminalOverlapAxisReport);
        return terminalOverlapAxisAnchored;
      }
    }
  }
  // This stage is only an early-exit attempt. On larger diagrams a failed
  // attempt is discarded before the comprehensive obstacle pass, so avoid
  // paying for the same global search twice.
  if (
    args.edges.length <= 24 &&
    repairNodes.length <= 40 &&
    !(
      terminalOverlapInternalStrictReport.terminalsAttached &&
      !terminalOverlapInternalStrictReport.terminalsAnchored
    )
  ) {
    const terminalBoundedDetachedStrict =
      terminalOverlapInternalStrictReport.quality.strictCrossings > 0
        ? repairDetachedStrictCrossingBypasses(
            terminalOverlapInternalAnchored,
            repairNodes,
          )
        : terminalOverlapInternalAnchored;
    const terminalBoundedDetachedObstacle = repairDisplayObstacleHits(
      terminalBoundedDetachedStrict,
      repairNodes,
      readDisplayLayoutDirection(terminalBoundedDetachedStrict[0]),
      {
        maxEdges: 4,
        maxCandidatesPerEdge: 32,
        maxQualityEvaluations: 64,
        skipOuterFallback: true,
      },
    );
    const terminalBoundedDetachedAttached = routeTerminalsAreAttached(
      terminalBoundedDetachedObstacle,
    )
      ? terminalBoundedDetachedObstacle
      : repairDetachedTerminalsWithBoundedPortRoles(
          terminalBoundedDetachedObstacle,
          repairNodes,
          12,
        );
    const terminalBoundedDetachedReport = getRouteHardQualityGateReport(
      terminalBoundedDetachedAttached,
      repairNodes,
      "terminal-lane",
    );
    if (terminalBoundedDetachedReport.hardClean) {
      args.onBoundedCandidate?.(terminalBoundedDetachedReport);
      return terminalBoundedDetachedAttached;
    }
  }
  const terminalExactOverlapRepaired = repairExactThresholdResidualOverlaps(
    terminalOverlapInternalAnchored,
    repairNodes,
    16,
  );
  const terminalExactOverlapQuality = calculateEdgePathQualityScore(
    terminalExactOverlapRepaired,
  );
  const terminalNearParallelRepaired = hasHardDisplayOverlapRisk(
    terminalExactOverlapQuality,
  )
    ? repairNearParallelResidualOverlaps(
        terminalExactOverlapRepaired,
        repairNodes,
        16,
      )
    : terminalExactOverlapRepaired;
  const terminalNearParallelQuality = calculateEdgePathQualityScore(
    terminalNearParallelRepaired,
  );
  const terminalNearParallelFinal = hasHardDisplayOverlapRisk(
    terminalNearParallelQuality,
  )
    ? repairNearParallelResidualOverlaps(
        terminalNearParallelRepaired,
        repairNodes,
        16,
      )
    : terminalNearParallelRepaired;
  const terminalStrictBypassRaw = repairDetachedStrictCrossingBypasses(
    terminalNearParallelFinal,
    repairNodes,
  );
  const terminalObstacleCleaned = repairDisplayObstacleHits(
    terminalStrictBypassRaw,
    repairNodes,
    readDisplayLayoutDirection(terminalStrictBypassRaw[0]),
    {
      ...DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
      maxCandidatesPerEdge: 32,
      maxQualityEvaluations: 40,
    },
  );
  const terminalObstacleResidualCleaned = repairResidualDisplayOverlaps(
    terminalObstacleCleaned,
    repairNodes,
    DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
    DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  );
  const terminalObstacleStrictCleaned = repairFinalResidualStrictCrossings(
    terminalObstacleResidualCleaned,
    repairNodes,
  );
  const terminalObstacleMicroCleaned = compactDisplayEdgePaths(
    terminalObstacleStrictCleaned,
  );
  const terminalObstacleReport = getRouteHardQualityGateReport(
    terminalObstacleMicroCleaned,
    repairNodes,
    "terminal-lane",
  );
  if (terminalObstacleReport.hardClean) {
    args.onBoundedCandidate?.(terminalObstacleReport);
    return terminalObstacleMicroCleaned;
  }
  const terminalObstaclePortAttached = routeTerminalsAreAttached(
    terminalObstacleMicroCleaned,
  )
    ? terminalObstacleMicroCleaned
    : repairDetachedTerminalsWithBoundedPortRoles(
        terminalObstacleMicroCleaned,
        repairNodes,
        64,
      );
  const terminalObstaclePortAttachedReport = getRouteHardQualityGateReport(
    terminalObstaclePortAttached,
    repairNodes,
    "terminal-lane",
  );
  if (terminalObstaclePortAttachedReport.hardClean) {
    args.onBoundedCandidate?.(terminalObstaclePortAttachedReport);
    return terminalObstaclePortAttached;
  }
  if (
    (args.edges.length > 24 || repairNodes.length > 40) &&
    displayReportOnlyNeedsTerminalAnchoring(terminalObstaclePortAttachedReport)
  ) {
    const terminalObstacleAxisAttached =
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        terminalObstaclePortAttached,
        repairNodes,
        Math.min(256, Math.max(64, terminalObstaclePortAttached.length * 6)),
      );
    if (terminalObstacleAxisAttached !== terminalObstaclePortAttached) {
      const terminalObstacleAxisAttachedReport = getRouteHardQualityGateReport(
        terminalObstacleAxisAttached,
        repairNodes,
        "terminal-lane",
      );
      if (terminalObstacleAxisAttachedReport.hardClean) {
        args.onBoundedCandidate?.(terminalObstacleAxisAttachedReport);
        return terminalObstacleAxisAttached;
      }
    }
  }
  if (
    displayReportCanFinishWithAnchoringCluster(
      terminalObstaclePortAttachedReport,
    )
  ) {
    const terminalObstacleAnchored = anchorComputedDisplayEdgeEndpoints(
      terminalObstacleMicroCleaned,
      repairNodes,
    );
    const terminalObstacleClustered = repairAnchoredTerminalCrossingCluster(
      terminalObstacleAnchored,
      repairNodes,
    );
    const terminalObstacleClusteredReport = getRouteHardQualityGateReport(
      terminalObstacleClustered,
      repairNodes,
      "terminal-lane",
    );
    if (terminalObstacleClusteredReport.hardClean) {
      args.onBoundedCandidate?.(terminalObstacleClusteredReport);
      return terminalObstacleClustered;
    }
  }
  const terminalNearParallelFinalQuality =
    terminalNearParallelFinal === terminalNearParallelRepaired
      ? terminalNearParallelQuality
      : calculateEdgePathQualityScore(terminalNearParallelFinal);
  const terminalStrictPolished =
    terminalNearParallelFinalQuality.strictCrossings > 0
      ? finalStrictDisplaySweep(terminalNearParallelFinal, repairNodes)
      : terminalNearParallelFinal;
  const terminalStrictPolishedQuality =
    terminalStrictPolished === terminalNearParallelFinal
      ? terminalNearParallelFinalQuality
      : calculateEdgePathQualityScore(terminalStrictPolished);
  const terminalResidualStrictPolished =
    terminalStrictPolishedQuality.strictCrossings > 0
      ? repairFinalResidualStrictCrossings(terminalStrictPolished, repairNodes)
      : terminalStrictPolished;
  const terminalPolished = chooseDisplayStrictPolishCandidate(
    repairNodes,
    terminalLaneRepaired,
    terminalOverlapRepaired,
    terminalOverlapStrictRepaired,
    terminalOverlapInternalRepaired,
    terminalExactOverlapRepaired,
    terminalNearParallelRepaired,
    terminalNearParallelFinal,
    terminalStrictBypassRaw,
    terminalObstacleCleaned,
    terminalObstacleResidualCleaned,
    terminalObstacleStrictCleaned,
    terminalStrictPolished,
    terminalResidualStrictPolished,
  );
  const terminalPolishedReport = getRouteHardQualityGateReport(
    terminalPolished,
    repairNodes,
    "terminal-lane",
  );
  if (terminalPolishedReport.hardClean) {
    args.onBoundedCandidate?.(terminalPolishedReport);
    return terminalPolished;
  }
  if (
    !args.skipFullRouteFallback &&
    args.edges.length <= 24 &&
    repairNodes.length <= 40
  ) {
    if (displayReportOnlyNeedsTerminalAnchoring(terminalPolishedReport)) {
      const compactAxisCandidate =
        repairAxisMismatchedTerminalsWithBoundedPortRoles(
          terminalPolished,
          repairNodes,
          Math.min(64, Math.max(24, terminalPolished.length * 3)),
        );
      if (compactAxisCandidate !== terminalPolished) {
        const compactAxisReport = getRouteHardQualityGateReport(
          compactAxisCandidate,
          repairNodes,
          "polished",
        );
        if (compactAxisReport.hardClean) {
          args.onBoundedCandidate?.(compactAxisReport);
          return compactAxisCandidate;
        }
      }
    }
    // Keep FullRoute deferred to the terminal fallback below. Running it here
    // and then retrying after the remaining bounded repairs doubles the most
    // expensive stage whenever this early attempt is not hard-clean.
  }
  const selected = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    interactive,
    hardSafeRepaired,
    hemisphereRepaired,
    microRepaired,
    localRepaired,
    strictRepaired,
    terminalStrictRepaired,
    terminalLaneRepaired,
    terminalOverlapRepaired,
    terminalStrictPolished,
    terminalResidualStrictPolished,
  );
  const anchoredSelected = anchorComputedDisplayEdgeEndpoints(
    selected,
    repairNodes,
  );
  const clusteredSelected = repairAnchoredTerminalCrossingCluster(
    anchoredSelected,
    repairNodes,
  );
  const clusteredReport = getRouteHardQualityGateReport(
    clusteredSelected,
    repairNodes,
    "polished",
  );
  if (clusteredReport.hardClean) {
    args.onBoundedCandidate?.(clusteredReport);
    return clusteredSelected;
  }
  const strictAnchoredSelected =
    clusteredReport.quality.strictCrossings > 0
      ? repairFinalResidualStrictCrossings(clusteredSelected, repairNodes)
      : clusteredSelected;
  const exactSelected = repairExactThresholdResidualOverlaps(
    strictAnchoredSelected,
    repairNodes,
    16,
  );
  const terminalSelected = repairTerminalHandleAxisCrossings(
    exactSelected,
    repairNodes,
  );
  const finalStrictSelected = anchorComputedDisplayEdgeEndpoints(
    repairFinalResidualStrictCrossings(terminalSelected, repairNodes),
    repairNodes,
  );
  const finalObstacleSelected = repairDisplayObstacleHits(
    finalStrictSelected,
    repairNodes,
    readDisplayLayoutDirection(finalStrictSelected[0]),
    {
      maxEdges: 1,
      maxCandidatesPerEdge: 12,
      maxQualityEvaluations: 12,
      skipOuterFallback: true,
    },
  );
  const finalObstacleStrictSelected = anchorComputedDisplayEdgeEndpoints(
    repairFinalResidualStrictCrossings(finalObstacleSelected, repairNodes),
    repairNodes,
  );
  const anchoredExactSelected = keepNodeAnchoredTerminalCandidates(
    exactSelected,
    strictAnchoredSelected,
    repairNodes,
  );
  const anchoredTerminalSelected = keepNodeAnchoredTerminalCandidates(
    terminalSelected,
    anchoredExactSelected,
    repairNodes,
  );
  const finalSelected = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    strictAnchoredSelected,
    anchoredExactSelected,
    anchoredTerminalSelected,
    finalStrictSelected,
    finalObstacleSelected,
    finalObstacleStrictSelected,
    anchoredSelected,
  );
  const selectedReport = getRouteHardQualityGateReport(
    finalSelected,
    repairNodes,
    "polished",
  );
  args.onBoundedCandidate?.(selectedReport);
  if (selectedReport.hardClean) return finalSelected;
  const finalAttachedSelected = routeTerminalsAreAttached(finalSelected)
    ? finalSelected
    : repairAnchoredTerminalCrossingCluster(
        anchorComputedDisplayEdgeEndpoints(finalSelected, repairNodes),
        repairNodes,
      );
  const finalAttachedReport = getRouteHardQualityGateReport(
    finalAttachedSelected,
    repairNodes,
    "polished",
  );
  if (finalAttachedReport.hardClean) {
    args.onBoundedCandidate?.(finalAttachedReport);
    return finalAttachedSelected;
  }
  const finalAxisRepaired = repairAxisMismatchedTerminalsWithBoundedPortRoles(
    finalAttachedSelected,
    repairNodes,
    64,
  );
  let finalAxisPolished = finalAxisRepaired;
  if (finalAxisRepaired !== finalAttachedSelected) {
    let finalAxisReport = getRouteHardQualityGateReport(
      finalAxisPolished,
      repairNodes,
      "terminal-lane",
    );
    if (finalAxisReport.hardClean) {
      args.onBoundedCandidate?.(finalAxisReport);
      return finalAxisPolished;
    }
    if (finalAxisReport.quality.strictCrossings > 0) {
      const finalAxisResidualStrict = repairFinalResidualStrictCrossings(
        finalAxisPolished,
        repairNodes,
      );
      const finalAxisBoundedStrict =
        calculateEdgePathQualityScore(finalAxisResidualStrict).strictCrossings >
        0
          ? repairBoundedPortAndInternalStrictCrossings(
              finalAxisResidualStrict,
              repairNodes,
              8,
            )
          : finalAxisResidualStrict;
      finalAxisPolished = chooseDisplayStrictPolishCandidate(
        repairNodes,
        finalAxisPolished,
        finalAxisResidualStrict,
        finalAxisBoundedStrict,
      );
      finalAxisReport = getRouteHardQualityGateReport(
        finalAxisPolished,
        repairNodes,
        "terminal-lane",
      );
      if (finalAxisReport.hardClean) {
        args.onBoundedCandidate?.(finalAxisReport);
        return finalAxisPolished;
      }
    }
  }
  const fallbackSeed =
    finalAxisPolished !== finalAttachedSelected
      ? finalAxisPolished
      : terminalPolished;
  if (args.skipFullRouteFallback) {
    args.onBoundedCandidate?.(
      getRouteHardQualityGateReport(fallbackSeed, repairNodes, "polished"),
    );
    return fallbackSeed;
  }
  const fallback = createBaseReactFlowFullRouteEdges({
    ...args,
    edges: fallbackSeed,
    reusePreparedGlobalRouting: true,
    skipBoundedAttempt: true,
  });
  const fallbackReport = getRouteHardQualityGateReport(
    fallback,
    repairNodes,
    "polished",
  );
  if (displayReportOnlyNeedsTerminalAnchoring(fallbackReport)) {
    const fallbackAxisRepaired =
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        fallback,
        repairNodes,
        Math.min(128, Math.max(32, fallback.length * 3)),
      );
    if (fallbackAxisRepaired !== fallback) {
      const fallbackAxisReport = getRouteHardQualityGateReport(
        fallbackAxisRepaired,
        repairNodes,
        "polished",
      );
      if (fallbackAxisReport.hardClean) {
        args.onBoundedCandidate?.(fallbackAxisReport);
        return fallbackAxisRepaired;
      }
    }
  }
  const residualOverlapClosure = repairBaseReactFlowResidualOverlapAxisClosure(
    fallback,
    repairNodes,
    fallbackReport,
  );
  args.onBoundedCandidate?.(residualOverlapClosure.report);
  return residualOverlapClosure.edges;
};
