import type { Edge, Node } from '@xyflow/react';

import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { refineGlobalEdgeWaypoints } from '../../strategies/shared/edgeGlobalWaypointRefinement';
import {
  createDetachedStrictCrossingRepairDiagnostics,
  type DetachedStrictCrossingRepairDiagnostics,
} from '../../strategies/shared/edgeDetachedStrictCrossingRepair';
import {
  chooseFewestStrictCrossings,
  countStrictEdgeCrossings,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { repairStrictBypassesIfNeeded } from './baseReactFlowDisplayObstacleRepair';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const repairDisplayQualityStrictClosure = (
  finalQualityCandidateEdges: Edge[],
  repairNodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): Edge[] => {
  const strictClosureTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure',
    candidateCount: finalQualityCandidateEdges.length,
    onTrace: onPhaseTrace,
  });
  const initialStrictScanTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure-initial-scan',
    candidateCount: finalQualityCandidateEdges.length,
    onTrace: onPhaseTrace,
  });
  const initialStrictCrossings = countStrictEdgeCrossings(finalQualityCandidateEdges);
  initialStrictScanTimer.finish(
    initialStrictCrossings === 0 ? 'skip' : 'accepted',
    0,
    { evaluationCount: 1 },
  );
  const finalQualityBaseEdges = initialStrictCrossings === 0
    ? finalQualityCandidateEdges
    : createStrictClosureBaseCandidate(finalQualityCandidateEdges, repairNodes, onPhaseTrace);

  let finalQualityEdges = finalQualityBaseEdges;
  for (let pass = 0; pass < 3; pass += 1) {
    const nextEdges = runStrictClosureLoopPass(
      finalQualityEdges,
      repairNodes,
      pass,
      onPhaseTrace,
    );
    if (nextEdges === finalQualityEdges) break;
    finalQualityEdges = nextEdges;
  }
  strictClosureTimer.finish(
    finalQualityEdges === finalQualityCandidateEdges ? 'skip' : 'accepted',
    finalQualityEdges === finalQualityCandidateEdges ? 0 : finalQualityEdges.length,
  );
  return finalQualityEdges;
};

const createStrictClosureBaseCandidate = (
  finalQualityCandidateEdges: Edge[],
  repairNodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): Edge[] => {
  const strictSweepTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure-sweep',
    candidateCount: finalQualityCandidateEdges.length,
    onTrace: onPhaseTrace,
  });
  const finalStrictSweepCandidate = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(finalQualityCandidateEdges, repairNodes),
    repairNodes,
  );
  strictSweepTimer.finish(
    finalStrictSweepCandidate === finalQualityCandidateEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(finalQualityCandidateEdges, finalStrictSweepCandidate),
  );
  const finalStrictEndpointLaneCandidate = createStrictEndpointLaneCandidate(
    finalQualityCandidateEdges,
    repairNodes,
    onPhaseTrace,
  );
  const {
    rawCandidate: finalStrictBypassRawCandidate,
    endpointCandidate: finalStrictBypassCandidate,
  } = createStrictBypassCandidate(finalQualityCandidateEdges, repairNodes, onPhaseTrace);
  const strictBaseEdges = chooseFewestStrictCrossings(
    finalQualityCandidateEdges,
    finalStrictSweepCandidate,
    finalStrictEndpointLaneCandidate,
    finalStrictBypassRawCandidate,
    finalStrictBypassCandidate,
  );
  const {
    rawCandidate: finalPostQualityStrictBypassRawCandidate,
    endpointCandidate: finalPostQualityStrictBypassCandidate,
  } = createStrictPostBypassCandidate(strictBaseEdges, repairNodes, onPhaseTrace);
  return chooseFewestStrictCrossings(
    strictBaseEdges,
    finalPostQualityStrictBypassRawCandidate,
    finalPostQualityStrictBypassCandidate,
  );
};

const createStrictEndpointLaneCandidate = (
  finalQualityCandidateEdges: Edge[],
  repairNodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): Edge[] => {
  const strictEndpointLaneTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure-endpoint-lane',
    candidateCount: finalQualityCandidateEdges.length,
    onTrace: onPhaseTrace,
  });
  const finalStrictEndpointLaneCandidate = repairEndpointOrthogonalPaths(
    repairEndpointLaneCrossings(finalQualityCandidateEdges, repairNodes),
    repairNodes,
  );
  strictEndpointLaneTimer.finish(
    finalStrictEndpointLaneCandidate === finalQualityCandidateEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(finalQualityCandidateEdges, finalStrictEndpointLaneCandidate),
  );
  return finalStrictEndpointLaneCandidate;
};

const createStrictBypassCandidate = (
  edges: Edge[],
  repairNodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): { rawCandidate: Edge[]; endpointCandidate: Edge[] } => {
  const diagnostics = createDetachedStrictCrossingRepairDiagnostics();
  const strictBypassTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure-bypass',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const rawCandidate = repairStrictBypassesIfNeeded(edges, repairNodes, diagnostics);
  const endpointCandidate = repairEndpointOrthogonalPaths(rawCandidate, repairNodes);
  strictBypassTimer.finish(
    endpointCandidate === edges && rawCandidate === edges ? 'skip' : 'accepted',
    Math.max(
      countChangedRoutingItems(edges, rawCandidate),
      countChangedRoutingItems(edges, endpointCandidate),
    ),
    strictBypassTraceMetrics(diagnostics),
  );
  return { rawCandidate, endpointCandidate };
};

const createStrictPostBypassCandidate = (
  edges: Edge[],
  repairNodes: Node[],
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): { rawCandidate: Edge[]; endpointCandidate: Edge[] } => {
  const diagnostics = createDetachedStrictCrossingRepairDiagnostics();
  const strictPostBypassTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure-post-bypass',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const rawCandidate = repairStrictBypassesIfNeeded(edges, repairNodes, diagnostics);
  const endpointCandidate = repairEndpointOrthogonalPaths(rawCandidate, repairNodes);
  strictPostBypassTimer.finish(
    endpointCandidate === edges && rawCandidate === edges ? 'skip' : 'accepted',
    Math.max(
      countChangedRoutingItems(edges, rawCandidate),
      countChangedRoutingItems(edges, endpointCandidate),
    ),
    strictBypassTraceMetrics(diagnostics),
  );
  return { rawCandidate, endpointCandidate };
};

const runStrictClosureLoopPass = (
  edges: Edge[],
  repairNodes: Node[],
  pass: number,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): Edge[] => {
  const strictClosureLoopTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure-loop',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const remainingStrictCrossings = countStrictEdgeCrossings(edges);
  if (remainingStrictCrossings === 0) {
    strictClosureLoopTimer.finish('skip', 0, {
      evaluationCount: 1,
      workItemCount: pass + 1,
    });
    return edges;
  }
  const diagnostics = createDetachedStrictCrossingRepairDiagnostics();
  const strictBypassRawCandidate = repairStrictBypassesIfNeeded(edges, repairNodes, diagnostics);
  const strictBypassCandidate = repairEndpointOrthogonalPaths(
    strictBypassRawCandidate,
    repairNodes,
  );
  const nextEdges = chooseFewestStrictCrossings(
    edges,
    strictBypassRawCandidate,
    strictBypassCandidate,
  );
  strictClosureLoopTimer.finish(
    nextEdges === edges ? 'skip' : 'accepted',
    nextEdges === edges ? 0 : countChangedRoutingItems(edges, nextEdges),
    {
      ...strictBypassTraceMetrics(diagnostics),
      evaluationCount: diagnostics.evaluatedCandidateCount + 1,
      workItemCount: pass + 1,
    },
  );
  return nextEdges;
};

const strictBypassTraceMetrics = (
  diagnostics: DetachedStrictCrossingRepairDiagnostics,
): {
  candidateCount: number;
  evaluationCount: number;
  cacheHitCount: number;
  workItemCount: number;
  minimumCandidateCount: number;
  maximumCandidateCount: number;
} => ({
  candidateCount: diagnostics.generatedCandidateCount,
  evaluationCount: diagnostics.evaluatedCandidateCount,
  cacheHitCount: diagnostics.cacheHitCount + diagnostics.deduplicatedCandidateCount,
  workItemCount: diagnostics.acceptedCandidateCount + diagnostics.iterationCount,
  minimumCandidateCount: diagnostics.minimumCandidateCount,
  maximumCandidateCount: diagnostics.maximumCandidateCount,
});
