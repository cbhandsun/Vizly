import type { Edge, Node } from '@xyflow/react';

import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  createGlobalEdgeWaypointNodeContext,
} from '../../strategies/shared/edgeGlobalWaypointNodeContext';
import {
  createGlobalEdgeWaypointRefinementDiagnostics,
  refineGlobalEdgeWaypoints,
} from '../../strategies/shared/edgeGlobalWaypointRefinement';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseName,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

type GlobalRefinePhase = Extract<
  DisplayRoutingPhaseName,
  | 'quality-crossing-global-refine-initial'
  | 'quality-crossing-global-refine-fixed-point'
  | 'quality-crossing-global-refine-dogleg'
  | 'quality-crossing-final-candidates-global'
  | 'quality-crossing-final-candidates-post-shared'
  | 'quality-crossing-final-candidates-post-lane'
>;

export type DisplayQualityGlobalRefineSession = Readonly<{
  run: (args: Readonly<{
    edges: Edge[];
    normalize?: boolean;
    phase: GlobalRefinePhase;
  }>) => Edge[];
}>;

export const createDisplayQualityGlobalRefineSession = ({
  nodes,
  onPhaseTrace,
}: {
  nodes: Node[];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): DisplayQualityGlobalRefineSession => {
  const normalizedFixedPoints = new Set<string>();
  const rawFixedPoints = new Set<string>();
  const nodeContext = createGlobalEdgeWaypointNodeContext(nodes);
  return {
    run: ({ edges, normalize = true, phase }) => {
      const timer = startDisplayRoutingPhaseTrace({
        phase,
        candidateCount: edges.length,
        onTrace: onPhaseTrace,
      });
      const fixedPoints = normalize ? normalizedFixedPoints : rawFixedPoints;
      const inputSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
      if (inputSignature && fixedPoints.has(inputSignature)) {
        timer.finish('hit', 0, { cacheHitCount: 1 });
        return edges;
      }
      const diagnostics = createGlobalEdgeWaypointRefinementDiagnostics();
      const refined = refineGlobalEdgeWaypoints(edges, nodes, { diagnostics, nodeContext });
      const result = normalize ? repairEndpointOrthogonalPaths(refined, nodes) : refined;
      if (
        inputSignature
        && computeBaseReactFlowDisplayOutputRouteSignature(result) === inputSignature
      ) fixedPoints.add(inputSignature);
      timer.finish(
        result === edges ? 'skip' : 'accepted',
        countChangedRoutingItems(edges, result),
        {
          evaluationCount: diagnostics.evaluationCount,
          scannedEdgePairCount: diagnostics.scannedEdgePairCount,
          scannedNodeCount: diagnostics.scannedNodeCount,
          scannedSegmentCount: diagnostics.scannedSegmentCount,
        },
      );
      return result;
    },
  };
};
