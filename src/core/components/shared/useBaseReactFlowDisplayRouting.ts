import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseReactFlowEndpointGeometryKey,
  computeBaseReactFlowDisplayOutputRouteSignature,
  readBaseReactFlowDisplayEdgesCacheEntry,
  writeBaseReactFlowDisplayEdgesCache,
} from './baseReactFlowDisplayEdgeCore';
import { repairBaseReactFlowMeasuredDisplayEdges } from './baseReactFlowDisplayEdges';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  prewarmBaseReactFlowDisplayWorker,
  resolveBaseReactFlowDisplayedEdges,
  resolveBaseReactFlowDisplayQualityPolicy,
  scheduleBaseReactFlowDisplayCacheWrite,
  scheduleBaseReactFlowDisplayQuality,
  type DeferredDisplayEdges,
  type DisplayRoutingInput,
  updateDisplayRoutingDebugState,
} from './baseReactFlowDisplayWorkerClient';
import { logBaseReactFlowEventBindingFailure } from './baseReactFlowLogging';

export type UseBaseReactFlowDisplayRoutingOptions = {
  edges: Edge[];
  routingNodes: Node[];
  routingGeometryReady: boolean;
  isContainerReady: boolean;
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
};

/**
 * Owns the asynchronous display-routing lifecycle while the canvas component
 * remains a composition root. The hook intentionally keeps the worker, cache,
 * and final-commit order aligned with the original inline implementation.
 */
export const useBaseReactFlowDisplayRouting = ({
  edges,
  routingNodes,
  routingGeometryReady,
  isContainerReady,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
}: UseBaseReactFlowDisplayRoutingOptions): Edge[] => {
  const displayEdgeWorkerRef = useRef<Worker | null>(null);
  const displayEdgeWorkerRequestSeqRef = useRef(0);
  const displayEdgeWorkerStartCountRef = useRef(0);
  const displayEdgeWorkerAbortCountRef = useRef(0);
  const displayRoutingInputRef = useRef<DisplayRoutingInput | null>(null);

  useEffect(() => () => {
    displayEdgeWorkerRef.current?.terminate();
    displayEdgeWorkerRef.current = null;
  }, []);

  const displayEdgeEpoch = useMemo(() => {
    return computeBaseReactFlowDisplayEdgeEpoch({
      nodes: routingNodes,
      edges,
    });
  }, [routingNodes, edges]);

  const displayEdgeCacheSignature = useMemo(() => {
    return computeBaseReactFlowDisplayCacheSignature({
      nodes: routingNodes,
      edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    });
  }, [edges, routingNodes, enableSmartEdges, smartEdgePadding, isLargeGraph]);

  const displayQualityPolicy = useMemo(() => (
    resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: routingNodes.length,
      edgeCount: edges.length,
      isLargeGraph,
    })
  ), [routingNodes.length, edges.length, isLargeGraph]);

  useEffect(() => {
    if (displayQualityPolicy.mode === 'skip') return;
    prewarmBaseReactFlowDisplayWorker(displayEdgeWorkerRef);
  }, [displayQualityPolicy.mode]);

  const cachedFinalDisplayEntry = useMemo(() => (
    routingGeometryReady
      ? readBaseReactFlowDisplayEdgesCacheEntry(displayEdgeCacheSignature)
      : null
  ), [displayEdgeCacheSignature, routingGeometryReady]);

  const safeCachedFinalDisplayEdges = useMemo(() => {
    if (!cachedFinalDisplayEntry) return null;
    return mergeTrustedBaseReactFlowDisplayCacheEntry(edges, cachedFinalDisplayEntry);
  }, [cachedFinalDisplayEntry, edges]);

  const [deferredDisplayEdges, setDeferredDisplayEdges] = useState<DeferredDisplayEdges | null>(null);

  useEffect(() => {
    displayRoutingInputRef.current = {
      cacheSignature: displayEdgeCacheSignature,
      edges,
      nodes: routingNodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      displayEdgeEpoch,
    };
  }, [
    displayEdgeCacheSignature,
    edges,
    routingNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    displayEdgeEpoch,
  ]);

  useEffect(() => {
    const routingInput = displayRoutingInputRef.current;
    const nodeCount = routingInput?.nodes.length ?? 0;
    const edgeCount = routingInput?.edges.length ?? 0;

    updateDisplayRoutingDebugState({
      stage: 'effect-enter',
      signature: displayEdgeCacheSignature,
      nodeCount,
      edgeCount,
    });
    if (!routingInput || nodeCount === 0 || edgeCount === 0) {
      updateDisplayRoutingDebugState({
        stage: 'skip-empty',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
      });
      return undefined;
    }

    if (!routingGeometryReady) {
      updateDisplayRoutingDebugState({
        stage: 'wait-geometry',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
      });
      return undefined;
    }

    if (displayQualityPolicy.mode === 'skip') {
      updateDisplayRoutingDebugState({
        stage: 'skip-policy',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
      });
      return undefined;
    }

    if (safeCachedFinalDisplayEdges) {
      const cacheHitAt = Date.now();
      updateDisplayRoutingDebugState({
        stage: 'cache-hit',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
        cacheHitAt,
        routeMs: 0,
        workerStartCount: displayEdgeWorkerStartCountRef.current,
        workerAbortCount: displayEdgeWorkerAbortCountRef.current,
      });
      return undefined;
    }

    if (!isContainerReady) {
      updateDisplayRoutingDebugState({
        stage: 'wait-container',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
      });
      return undefined;
    }

    // A cancelled in-flight request terminates its worker. Re-prewarm here so a
    // replacement can compile during the geometry-settle window without leaking
    // a new worker when the component is actually unmounting.
    prewarmBaseReactFlowDisplayWorker(displayEdgeWorkerRef);

    let cancelled = false;
    let workerStartedAt: number | null = null;
    let workerCompleted = false;
    let cancelCacheWrite: (() => void) | null = null;
    const workerAbortController = new AbortController();
    const scheduledAt = Date.now();
    updateDisplayRoutingDebugState({
      stage: 'scheduled',
      signature: displayEdgeCacheSignature,
      nodeCount,
      edgeCount,
      scheduledAt,
      workerStartCount: displayEdgeWorkerStartCountRef.current,
      workerAbortCount: displayEdgeWorkerAbortCountRef.current,
    });
    const cancelSchedule = scheduleBaseReactFlowDisplayQuality(() => {
      if (cancelled) return;
      const activeRoutingInput = displayRoutingInputRef.current;
      if (!activeRoutingInput) return;
      if (activeRoutingInput.cacheSignature !== displayEdgeCacheSignature) {
        updateDisplayRoutingDebugState({
          stage: 'skip-stale-schedule',
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
        });
        return;
      }
      const requestId = `${displayEdgeCacheSignature}:${displayEdgeWorkerRequestSeqRef.current += 1}`;
      workerStartedAt = Date.now();
      displayEdgeWorkerStartCountRef.current += 1;
      updateDisplayRoutingDebugState({
        stage: 'worker-start',
        signature: displayEdgeCacheSignature,
        requestId,
        nodeCount,
        edgeCount,
        workerStartedAt,
        workerStartCount: displayEdgeWorkerStartCountRef.current,
        workerAbortCount: displayEdgeWorkerAbortCountRef.current,
      });
      computeBaseReactFlowDisplayEdgesInWorker({
        workerRef: displayEdgeWorkerRef,
        requestId,
        edges: activeRoutingInput.edges,
        nodes: activeRoutingInput.nodes,
        enableSmartEdges: activeRoutingInput.enableSmartEdges,
        smartEdgePadding: activeRoutingInput.smartEdgePadding,
        isLargeGraph: activeRoutingInput.isLargeGraph,
        displayEdgeEpoch: activeRoutingInput.displayEdgeEpoch,
        qualityMode: displayQualityPolicy.mode,
        timeoutMs: displayQualityPolicy.timeoutMs,
        signal: workerAbortController.signal,
      }).then((workerResult) => {
        if (cancelled) return;
        workerCompleted = true;
        const finalEdges = workerResult.edges;
        const routingPatches = createBaseReactFlowDisplayEdgePatches(
          activeRoutingInput.edges,
          finalEdges,
        );
        if (!routingPatches) {
          updateDisplayRoutingDebugState({
            stage: 'shape-mismatch',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          logBaseReactFlowEventBindingFailure('displayEdgesShapeMismatch', new Error('Display edge shape mismatch'));
          return;
        }
        const latestSourceEdges = displayRoutingInputRef.current?.edges ?? activeRoutingInput.edges;
        const mergedFinalEdges = mergeBaseReactFlowDisplayEdgePatches(
          latestSourceEdges,
          routingPatches,
        );
        if (!mergedFinalEdges) {
          updateDisplayRoutingDebugState({
            stage: 'latest-shape-mismatch',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          return;
        }
        const workerOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(finalEdges);
        const mergedOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(mergedFinalEdges);
        const trustedWorkerHardClean = workerResult.hardClean === true
          && workerOutputRouteSignature !== null
          && workerOutputRouteSignature === mergedOutputRouteSignature;
        const finalAppliedAt = Date.now();
        updateDisplayRoutingDebugState({
          stage: 'final-applied',
          signature: displayEdgeCacheSignature,
          requestId,
          nodeCount,
          edgeCount: mergedFinalEdges.length,
          finalAppliedAt,
          routeMs: workerStartedAt === null ? undefined : finalAppliedAt - workerStartedAt,
          workerStartCount: displayEdgeWorkerStartCountRef.current,
          workerAbortCount: displayEdgeWorkerAbortCountRef.current,
        });
        setDeferredDisplayEdges({
          signature: displayEdgeCacheSignature,
          edges: mergedFinalEdges,
          hardClean: trustedWorkerHardClean,
        });
        cancelCacheWrite = scheduleBaseReactFlowDisplayCacheWrite(() => {
          writeBaseReactFlowDisplayEdgesCache(displayEdgeCacheSignature, routingPatches, {
            hardClean: trustedWorkerHardClean,
            outputRouteSignature: mergedOutputRouteSignature ?? undefined,
          });
        });
      }).catch((error) => {
        if (cancelled) return;
        workerCompleted = true;
        updateDisplayRoutingDebugState({
          stage: 'worker-rejected',
          signature: displayEdgeCacheSignature,
          requestId,
          error: error instanceof Error ? error.message : 'unknown-worker-error',
        });
        if (!(error instanceof Error) || error.message !== 'display-edge-worker-timeout') {
          logBaseReactFlowEventBindingFailure('computeDisplayEdges', error);
        }
      });
    });

    return () => {
      cancelled = true;
      if (workerStartedAt !== null && !workerCompleted) {
        displayEdgeWorkerAbortCountRef.current += 1;
      }
      workerAbortController.abort();
      cancelCacheWrite?.();
      updateDisplayRoutingDebugState({
        stage: 'cancelled',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
        workerStartCount: displayEdgeWorkerStartCountRef.current,
        workerAbortCount: displayEdgeWorkerAbortCountRef.current,
      });
      cancelSchedule();
    };
  }, [
    safeCachedFinalDisplayEdges,
    displayEdgeCacheSignature,
    displayQualityPolicy,
    isContainerReady,
    routingGeometryReady,
  ]);

  const resolvedDisplayEdges = resolveBaseReactFlowDisplayedEdges({
    signature: displayEdgeCacheSignature,
    policyMode: displayQualityPolicy.mode,
    deferred: deferredDisplayEdges,
    cached: safeCachedFinalDisplayEdges,
    immediate: edges,
  });
  const resolvedDisplayEdgesAreHardClean = deferredDisplayEdges?.signature === displayEdgeCacheSignature
    ? deferredDisplayEdges.hardClean
    : Boolean(safeCachedFinalDisplayEdges && cachedFinalDisplayEntry?.hardClean);
  const displayEndpointGeometryKey = useMemo(
    () => computeBaseReactFlowEndpointGeometryKey(routingNodes),
    [routingNodes],
  );
  const displayEdges = useMemo(
    () => resolvedDisplayEdgesAreHardClean
      ? resolvedDisplayEdges
      : repairBaseReactFlowMeasuredDisplayEdges(
        resolvedDisplayEdges,
        routingNodes,
      ),
    // The exact key represents every node field consumed by endpoint anchoring and hard safety.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedDisplayEdges, resolvedDisplayEdgesAreHardClean, displayEndpointGeometryKey],
  );

  return displayEdges;
};
