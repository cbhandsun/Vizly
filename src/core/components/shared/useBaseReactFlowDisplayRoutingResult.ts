import type { Edge } from '@xyflow/react';
import type { DisplayRoutingRenderAuthority } from '../../routing/displayRoutingRenderAuthority';

import type {
  DeferredDisplayEdges,
  DisplayQualityPolicy,
} from './baseReactFlowDisplayWorkerClient';
import type { UseBaseReactFlowDisplayRoutingResult } from './baseReactFlowDisplayRoutingTypes';
import {
  useBaseReactFlowResolvedDisplayEdges,
  useBaseReactFlowResolvedOrDragFallbackEdges,
} from './useBaseReactFlowDisplayCandidateBootstrap';
import { useBaseReactFlowActiveRenderAuthority } from './useBaseReactFlowDisplayRenderAuthority';

/** Resolves the exact committed/fallback geometry and its matching render proof. */
export const useBaseReactFlowDisplayRoutingResult = ({
  sourceEdges,
  inputSignature,
  inputGeometryDigest,
  policyMode,
  deferred,
  cachedEdges,
  holdUnverifiedImmediateEdges,
  isNodeDragging,
  dragFallbackPending,
  nodeDragFallbackIds,
  committedRenderAuthority,
}: {
  sourceEdges: Edge[];
  inputSignature: string;
  inputGeometryDigest: string;
  policyMode: DisplayQualityPolicy['mode'];
  deferred: DeferredDisplayEdges | null;
  cachedEdges: Edge[] | null;
  holdUnverifiedImmediateEdges: boolean;
  isNodeDragging: boolean;
  dragFallbackPending: boolean;
  nodeDragFallbackIds: readonly string[];
  committedRenderAuthority: DisplayRoutingRenderAuthority | null;
}): UseBaseReactFlowDisplayRoutingResult => {
  const resolvedEdges = useBaseReactFlowResolvedDisplayEdges({
    edges: sourceEdges,
    inputSignature,
    inputGeometryDigest,
    policyMode,
    deferred,
    cached: cachedEdges,
    holdUnverifiedImmediateEdges,
  });
  const displayedEdges = useBaseReactFlowResolvedOrDragFallbackEdges({
    sourceEdges,
    resolvedEdges,
    isNodeDragging,
    dragFallbackPending,
    nodeDragFallbackIds,
  });
  return {
    edges: displayedEdges,
    renderAuthority: useBaseReactFlowActiveRenderAuthority({
      committedRenderAuthority,
      inputSignature,
      inputGeometryDigest,
      displayedEdges,
    }),
  };
};
