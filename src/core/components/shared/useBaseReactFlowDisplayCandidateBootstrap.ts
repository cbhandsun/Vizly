import type { Edge, Node } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';

import { readBaseReactFlowDisplayEdgesCacheEntry } from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowInteractiveFallbackEdges,
  createBaseReactFlowNodeDragFallbackEdges,
  shouldUseBaseReactFlowNodeDragFallback,
} from './baseReactFlowDisplayFallback';
import {
  hasBaseReactFlowPrecompiledRouteCandidate,
  loadBaseReactFlowPrecompiledRouteCandidate,
} from './baseReactFlowPrecompiledRouteRegistry';
import { mergeTrustedBaseReactFlowDisplayCacheEntry } from './baseReactFlowDisplayRoutingTransaction';
import { resolveBaseReactFlowPrecompiledRegenerationPresetId } from './baseReactFlowPrecompiledCaptureMode';
import {
  resolveBaseReactFlowDisplayedEdges,
  type DeferredDisplayEdges,
  type DisplayQualityMode,
} from './baseReactFlowDisplayWorkerClient';

export const isBaseReactFlowFreshRegenerationRequested = (): boolean => (
  typeof window !== 'undefined'
  && resolveBaseReactFlowPrecompiledRegenerationPresetId({
    search: window.location.search,
    hash: window.location.hash,
  }) !== null
);

export const useBaseReactFlowCachedDisplayCandidate = ({
  routingGeometryReady,
  bypassReusableRoutes,
  hasCommittedFinalDisplayEntry,
  inputSignature,
  edges,
}: {
  routingGeometryReady: boolean;
  bypassReusableRoutes: boolean;
  hasCommittedFinalDisplayEntry: boolean;
  inputSignature: string;
  edges: Edge[];
}): Edge[] | null => {
  const cachedEntry = useMemo(() => (
    routingGeometryReady && !bypassReusableRoutes && !hasCommittedFinalDisplayEntry
      ? readBaseReactFlowDisplayEdgesCacheEntry(inputSignature)
      : null
  ), [
    bypassReusableRoutes,
    hasCommittedFinalDisplayEntry,
    inputSignature,
    routingGeometryReady,
  ]);

  return useMemo(() => {
    if (!cachedEntry || cachedEntry.hardClean !== true) return null;
    return mergeTrustedBaseReactFlowDisplayCacheEntry(edges, cachedEntry);
  }, [cachedEntry, edges]);
};

export const useBaseReactFlowPrecompiledPreviewGate = ({
  routingGeometryReady,
  forceFreshFullRoute,
  hasCommittedFinalDisplayEntry,
  inputSignature,
  inputGeometryDigest,
  nodes,
  edges,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
}: {
  routingGeometryReady: boolean;
  forceFreshFullRoute: boolean;
  hasCommittedFinalDisplayEntry: boolean;
  inputSignature: string;
  inputGeometryDigest: string;
  nodes: Node[];
  edges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
}): boolean => {
  const identity = `${inputSignature}\0${inputGeometryDigest}`;
  const hasCandidate = routingGeometryReady
    && !forceFreshFullRoute
    && hasBaseReactFlowPrecompiledRouteCandidate(inputSignature, inputGeometryDigest);
  const [preview, setPreview] = useState<Readonly<{
    identity: string;
    status: 'ready' | 'miss';
  }> | null>(null);

  useEffect(() => {
    if (!hasCandidate || hasCommittedFinalDisplayEntry) return undefined;
    let cancelled = false;
    void loadBaseReactFlowPrecompiledRouteCandidate({
      inputSignature,
      inputGeometryDigest,
      nodes,
      edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    }).then((candidateEdges) => {
      if (cancelled) return;
      setPreview({
        identity,
        status: candidateEdges ? 'ready' : 'miss',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    edges,
    enableSmartEdges,
    hasCandidate,
    hasCommittedFinalDisplayEntry,
    identity,
    inputGeometryDigest,
    inputSignature,
    isLargeGraph,
    nodes,
    smartEdgePadding,
  ]);

  const currentPreview = preview?.identity === identity ? preview : null;
  return hasCandidate && currentPreview?.status !== 'miss';
};

export const useBaseReactFlowResolvedDisplayEdges = ({
  edges,
  inputSignature,
  inputGeometryDigest,
  policyMode,
  deferred,
  cached,
  holdUnverifiedImmediateEdges,
}: {
  edges: Edge[];
  inputSignature: string;
  inputGeometryDigest: string;
  policyMode: DisplayQualityMode | 'skip';
  deferred: DeferredDisplayEdges | null;
  cached: Edge[] | null;
  holdUnverifiedImmediateEdges: boolean;
}): Edge[] => {
  const immediate = useMemo(
    () => createBaseReactFlowInteractiveFallbackEdges(edges),
    [edges],
  );

  return resolveBaseReactFlowDisplayedEdges({
    signature: inputSignature,
    geometryDigest: inputGeometryDigest,
    policyMode,
    deferred,
    cached,
    source: edges,
    immediate: holdUnverifiedImmediateEdges ? [] : immediate,
  });
};

export const useBaseReactFlowResolvedOrDragFallbackEdges = ({
  sourceEdges,
  resolvedEdges,
  isNodeDragging,
  dragFallbackPending,
  nodeDragFallbackIds,
}: {
  sourceEdges: Edge[];
  resolvedEdges: Edge[];
  isNodeDragging: boolean;
  dragFallbackPending: boolean;
  nodeDragFallbackIds: readonly string[];
}): Edge[] => {
  const fallbackEdges = useMemo(
    () => createBaseReactFlowNodeDragFallbackEdges(sourceEdges, nodeDragFallbackIds),
    [sourceEdges, nodeDragFallbackIds],
  );
  return shouldUseBaseReactFlowNodeDragFallback({
    isNodeDragging,
    dragFallbackPending,
    hasResolvedEdges: sourceEdges.length === 0 || resolvedEdges.length > 0,
    sourceEdgeCount: sourceEdges.length,
  }) ? fallbackEdges : resolvedEdges;
};
