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
    mutableEdgeIndexes?: readonly number[];
    normalize?: boolean;
    phase: GlobalRefinePhase;
  }>) => Edge[];
}>;

const normalizeDisplayQualityMutableEdgeIndexes = (
  edgeCount: number,
  mutableEdgeIndexes: readonly number[] | undefined,
): number[] | undefined => {
  if (mutableEdgeIndexes === undefined) return undefined;
  return [...new Set(mutableEdgeIndexes)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < edgeCount)
    .sort((left, right) => left - right);
};

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
    run: ({ edges, mutableEdgeIndexes, normalize = true, phase }) => {
      const normalizedMutableEdgeIndexes = normalizeDisplayQualityMutableEdgeIndexes(
        edges.length,
        mutableEdgeIndexes,
      );
      const timer = startDisplayRoutingPhaseTrace({
        phase,
        candidateCount: normalizedMutableEdgeIndexes?.length ?? edges.length,
        onTrace: onPhaseTrace,
      });
      const fixedPoints = normalize ? normalizedFixedPoints : rawFixedPoints;
      const inputSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
      const fixedPointKey = inputSignature
        ? `${inputSignature}|${normalizedMutableEdgeIndexes?.join(',') ?? '*'}`
        : null;
      if (fixedPointKey && fixedPoints.has(fixedPointKey)) {
        timer.finish('hit', 0, { cacheHitCount: 1 });
        return edges;
      }
      const diagnostics = createGlobalEdgeWaypointRefinementDiagnostics();
      const refined = refineGlobalEdgeWaypoints(edges, nodes, {
        diagnostics,
        mutableEdgeIndexes: normalizedMutableEdgeIndexes,
        nodeContext,
      });
      const endpointRepaired = normalize
        ? repairEndpointOrthogonalPaths(refined, nodes)
        : refined;
      const mutableIndexSet = normalizedMutableEdgeIndexes
        ? new Set(normalizedMutableEdgeIndexes)
        : null;
      const result = mutableIndexSet && endpointRepaired !== refined
        ? endpointRepaired.map((edge, index) => (
          mutableIndexSet.has(index) ? edge : (refined[index] ?? edge)
        ))
        : endpointRepaired;
      if (
        fixedPointKey
        && computeBaseReactFlowDisplayOutputRouteSignature(result) === inputSignature
      ) fixedPoints.add(fixedPointKey);
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
