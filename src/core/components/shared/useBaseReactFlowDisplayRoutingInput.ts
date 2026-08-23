import { useEffect, useMemo, type MutableRefObject } from 'react';

import {
  resolveBaseReactFlowDragAwareDisplayEpoch,
  resolveBaseReactFlowDragAwareInputIdentity,
} from './baseReactFlowDragRoutingFreeze';
import type { UseBaseReactFlowDisplayRoutingOptions } from './baseReactFlowDisplayRoutingTypes';
import type { DisplayRoutingInput } from './baseReactFlowDisplayWorkerClient';

type UseBaseReactFlowDisplayRoutingInputOptions = Pick<
  UseBaseReactFlowDisplayRoutingOptions,
  | 'edges'
  | 'routingNodes'
  | 'enableSmartEdges'
  | 'smartEdgePadding'
  | 'isLargeGraph'
  | 'isNodeDragging'
  | 'nodeDragFallbackIds'
> & Readonly<{
  displayRoutingInputRef: MutableRefObject<DisplayRoutingInput | null>;
}>;

export const useBaseReactFlowDisplayRoutingInput = ({
  edges,
  routingNodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  isNodeDragging,
  nodeDragFallbackIds,
  displayRoutingInputRef,
}: UseBaseReactFlowDisplayRoutingInputOptions): Readonly<{
  nodeDragFallbackKey: string;
  displayEdgeCacheSignature: string;
  inputGeometryDigest: string;
}> => {
  const nodeDragFallbackKey = useMemo(
    () => nodeDragFallbackIds.join('\0'),
    [nodeDragFallbackIds],
  );
  const displayEdgeEpoch = useMemo(() => (
    resolveBaseReactFlowDragAwareDisplayEpoch({
      isNodeDragging,
      nodes: routingNodes,
      edges,
    })
  ), [routingNodes, edges, isNodeDragging]);
  const displayInputIdentity = useMemo(() => (
    resolveBaseReactFlowDragAwareInputIdentity({
      isNodeDragging,
      nodes: routingNodes,
      edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    })
  ), [edges, routingNodes, enableSmartEdges, smartEdgePadding, isLargeGraph, isNodeDragging]);
  const {
    cacheSignature: displayEdgeCacheSignature,
    geometryDigest: inputGeometryDigest,
  } = displayInputIdentity;

  useEffect(() => {
    displayRoutingInputRef.current = {
      cacheSignature: displayEdgeCacheSignature,
      inputGeometryDigest,
      edges,
      nodes: routingNodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      displayEdgeEpoch,
    };
  }, [
    displayEdgeCacheSignature,
    inputGeometryDigest,
    edges,
    routingNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    displayEdgeEpoch,
    displayRoutingInputRef,
  ]);

  return {
    nodeDragFallbackKey,
    displayEdgeCacheSignature,
    inputGeometryDigest,
  };
};
