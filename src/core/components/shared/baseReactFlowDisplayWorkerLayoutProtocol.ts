import type { Edge, Node } from '@xyflow/react';

import type { RoutingPatch } from '../../routing/routingPatch';
import type { RoutingIdentity } from './baseReactFlowDisplayRoutingSession';

export type DisplayEdgesWorkerRepairRequest = {
  operation: 'repair';
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  inputIdentity?: RoutingIdentity;
  /** Bounded runs measured repair only; finalized also closes commercial safety. */
  repairMode: 'bounded' | 'finalized';
  /** Ends a disposable candidate pass once its obstacle stage remains dirty. */
  stopAfterObstacleFailure?: boolean;
};

export type DisplayEdgesWorkerValidatedRepairRequest = Omit<
  DisplayEdgesWorkerRepairRequest,
  'inputIdentity'
> & { inputIdentity: RoutingIdentity };

export type DisplayEdgesWorkerRepairValidateOrRouteRequest = {
  operation: 'repair-validate-or-route';
  requestId: string;
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
  qualityMode: 'full' | 'interactive';
  inputIdentity?: RoutingIdentity;
  candidateEdges?: Edge[];
  candidatePatches?: RoutingPatch[];
  fallbackCandidateEdges?: Edge[];
  fallbackCandidatePatches?: RoutingPatch[];
  candidateSource: 'persistent';
  stopAfterObstacleFailure?: boolean;
};

export type DisplayEdgesWorkerValidatedRepairValidateRequest = Omit<
  DisplayEdgesWorkerRepairValidateOrRouteRequest,
  'inputIdentity'
> & { inputIdentity: RoutingIdentity };

type ValidatedRouteFields = Omit<
  DisplayEdgesWorkerValidatedRepairValidateRequest,
  | 'operation'
  | 'candidateEdges'
  | 'candidatePatches'
  | 'fallbackCandidateEdges'
  | 'fallbackCandidatePatches'
  | 'candidateSource'
  | 'stopAfterObstacleFailure'
>;

export const parseDisplayWorkerLayoutRepairRequest = ({
  value,
  routeFields,
  isEdgeList,
}: {
  value: Record<string, unknown>;
  routeFields: ValidatedRouteFields;
  isEdgeList: (candidate: unknown) => candidate is Edge[];
}): DisplayEdgesWorkerValidatedRepairValidateRequest | null => {
  const hasCandidateEdges = typeof value.candidateEdges !== 'undefined';
  const hasCandidatePatches = typeof value.candidatePatches !== 'undefined';
  const hasFallbackEdges = typeof value.fallbackCandidateEdges !== 'undefined';
  const hasFallbackPatches = typeof value.fallbackCandidatePatches !== 'undefined';
  if (
    value.candidateSource !== 'persistent'
    || Number(hasCandidateEdges) + Number(hasCandidatePatches) !== 1
    || Number(hasFallbackEdges) + Number(hasFallbackPatches) !== 1
    || (hasCandidateEdges && !isEdgeList(value.candidateEdges))
    || (hasCandidatePatches && !isEdgeList(value.candidatePatches))
    || (hasFallbackEdges && !isEdgeList(value.fallbackCandidateEdges))
    || (hasFallbackPatches && !isEdgeList(value.fallbackCandidatePatches))
    || (
      value.stopAfterObstacleFailure !== undefined
      && typeof value.stopAfterObstacleFailure !== 'boolean'
    )
  ) return null;
  return {
    ...routeFields,
    operation: 'repair-validate-or-route',
    candidateSource: 'persistent',
    ...(hasCandidateEdges ? { candidateEdges: value.candidateEdges as Edge[] } : {}),
    ...(hasCandidatePatches ? { candidatePatches: value.candidatePatches as RoutingPatch[] } : {}),
    ...(hasFallbackEdges
      ? { fallbackCandidateEdges: value.fallbackCandidateEdges as Edge[] }
      : {}),
    ...(hasFallbackPatches
      ? { fallbackCandidatePatches: value.fallbackCandidatePatches as RoutingPatch[] }
      : {}),
    stopAfterObstacleFailure: value.stopAfterObstacleFailure === true,
  };
};
