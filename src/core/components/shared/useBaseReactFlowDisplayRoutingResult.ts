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
import { displayFailureMatchesInput, type BaseReactFlowDisplayFailure } from './baseReactFlowDisplayFailure';

const FAILED_DISPLAY_EDGES: Edge[] = [];

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
  failure = null,
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
  failure?: BaseReactFlowDisplayFailure | null;
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
  const activeFailure = !isNodeDragging && displayFailureMatchesInput(failure, { inputSignature, inputGeometryDigest })
    ? failure : null;
  const finalEdges = activeFailure ? FAILED_DISPLAY_EDGES : displayedEdges;
  const renderAuthority = useBaseReactFlowActiveRenderAuthority({
      committedRenderAuthority,
      inputSignature,
      inputGeometryDigest,
      displayedEdges: finalEdges,
    });
  return {
    edges: finalEdges,
    renderAuthority: activeFailure ? null : renderAuthority,
    failure: activeFailure,
  };
};
