import type { Edge } from '@xyflow/react';

import { doesDisplayCandidateMatchSourceGraph } from './baseReactFlowDisplayCandidateValidation';
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
import { repairCrossedSpineWithOuterSkirt } from './baseReactFlowDisplayCrossedSpineSkirtRepair';
import { countRenderUnsafeEndpointStubs, repairRenderSafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { diffBaseReactFlowEvaluationMetrics } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayFinalEndpointOrder';
import { runBaseReactFlowFullRoutePostRenderPhase } from './baseReactFlowDisplayFullRoutePostRenderPhase';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';

/** Try the existing residual closure after a crossed spine is resolved. */
export const tryDisplayQualityEarlyClosure = (
  context: BaseReactFlowFullRouteContext,
  edges: Edge[],
): Edge[] | null => {
  if (edges.length === 0 || edges.length > 24 || context.useBoundedLargeRepair) return null;
  const evaluation = context.evaluationSession;
  const baselineReport = evaluation.hardReport(edges);
  const quality = baselineReport.quality;
  if (baselineReport.obstacleHits > 0 || !baselineReport.terminalsAttached
    || !baselineReport.terminalsAnchored || quality.strictCrossings === 0
    || quality.nonOrthogonalSegments > 0 || quality.shortEndpointStubs > 0
    || quality.hairpins > 0) return null;

  const timer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-early-closure',
    candidateCount: edges.length,
    onTrace: context.onPhaseTrace,
  });
  const metricsBefore = evaluation.readMetrics();
  const skirt = repairCrossedSpineWithOuterSkirt(edges, context.repairNodes);
  const skirtReport = evaluation.hardReport(skirt);
  let result: Edge[] | null = null;
  if (skirt !== edges && skirtReport.quality.strictCrossings === 0
    && skirtReport.obstacleHits === 0 && skirtReport.terminalsAttached
    && skirtReport.terminalsAnchored) {
    // This speculative phase owns one trace. The normal post-render phase is
    // still available if its candidate cannot satisfy all acceptance checks.
    const postRenderEdges = runBaseReactFlowFullRoutePostRenderPhase(
      { ...context, onPhaseTrace: undefined }, skirt, skirtReport,
    ).edges;
    const closed = repairRenderSafeEndpointStubs(
      postRenderEdges, context.repairNodes, 8, undefined, undefined, undefined, false,
    );
    if (doesDisplayCandidateMatchSourceGraph(edges, closed)
      && evaluation.hardReport(closed).hardClean
      && countRenderUnsafeEndpointStubs(closed) === 0
      && baseReactFlowDisplayCommercialQualityIsClean(closed)
      && finalSameSideTrueTrunksDoNotRegress(
        context.normalizedEdges, closed, context.repairNodes,
      )) result = closed;
  }
  timer.finish(result ? 'accepted' : 'fallback', result?.length ?? 0,
    diffBaseReactFlowEvaluationMetrics(metricsBefore, evaluation.readMetrics()));
  return result;
};
