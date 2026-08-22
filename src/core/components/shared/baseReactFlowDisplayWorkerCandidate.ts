import type { Edge } from '@xyflow/react';

import { sanitizeBaseReactFlowPrecompiledRoutePatches } from './baseReactFlowPrecompiledRouteArtifact';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import type {
  DisplayEdgesWorkerCandidateSource,
  DisplayEdgesWorkerRequest,
} from './baseReactFlowDisplayWorkerProtocol';

export type DisplayWorkerCandidate = Readonly<{
  edges: Edge[] | null;
  source: DisplayEdgesWorkerCandidateSource | null;
}>;

export const resolveDisplayWorkerCandidate = (
  request: DisplayEdgesWorkerRequest,
): DisplayWorkerCandidate => {
  if (request.operation !== 'validate-or-route') return { edges: null, source: null };
  const safePatches = request.candidatePatches
    ? (request.candidateSource === 'precompiled'
      ? sanitizeBaseReactFlowPrecompiledRoutePatches(request.edges, request.candidatePatches)
      : sanitizeBaseReactFlowDisplayCachePatches(request.edges, request.candidatePatches))
    : null;
  return {
    edges: request.candidateEdges
      ?? (safePatches ? mergeBaseReactFlowDisplayEdgePatches(request.edges, safePatches) : null),
    source: request.candidateSource,
  };
};
