import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  BASE_DISPLAY_ROUTING_VERSION,
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseReactFlowDisplayOutputRouteSignature,
  readBaseReactFlowDisplayEdgesCacheEntry,
  writeBaseReactFlowDisplayEdgesCache,
} from './baseReactFlowDisplayEdgeCore';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  disposeBaseReactFlowDisplayWorker,
  prewarmBaseReactFlowDisplayWorker,
  repairBaseReactFlowDisplayEdgesInWorker,
  resolveBaseReactFlowDisplayedEdges,
  resolveBaseReactFlowDisplayQualityPolicy,
  scheduleBaseReactFlowDisplayCacheWrite,
  scheduleBaseReactFlowDisplayQuality,
  type DeferredDisplayEdges,
  type DisplayRoutingInput,
  updateDisplayRoutingDebugState,
} from './baseReactFlowDisplayWorkerClient';
import {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  resolveBaseReactFlowDisplayCacheReplaySignature,
} from './baseReactFlowDisplayRoutingTransaction';
import { resolveBaseReactFlowDisplayCandidate } from './baseReactFlowDisplayCandidateResolver';
import { computeBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
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
    disposeBaseReactFlowDisplayWorker(displayEdgeWorkerRef);
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

  const inputGeometryDigest = useMemo(() => (
    computeBaseReactFlowDisplayGeometryDigest({
      nodes: routingNodes,
      edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    })
  ), [edges, routingNodes, enableSmartEdges, smartEdgePadding, isLargeGraph]);

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

  const cachedDisplayCandidateEdges = useMemo(() => {
    if (!cachedFinalDisplayEntry || cachedFinalDisplayEntry.hardClean !== true) return null;
    return mergeTrustedBaseReactFlowDisplayCacheEntry(edges, cachedFinalDisplayEntry);
  }, [cachedFinalDisplayEntry, edges]);

  const [deferredDisplayEdges, setDeferredDisplayEdges] = useState<DeferredDisplayEdges | null>(null);

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
  ]);

  useEffect(() => {
    const routingInput = displayRoutingInputRef.current;
    const nodeCount = routingInput?.nodes.length ?? 0;
    const edgeCount = routingInput?.edges.length ?? 0;

    updateDisplayRoutingDebugState({
      stage: 'effect-enter',
      signature: displayEdgeCacheSignature,
      inputGeometryDigest,
      outputRouteSignature: undefined,
      routingVersion: BASE_DISPLAY_ROUTING_VERSION,
      workerResolution: undefined,
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
    const displayWorkerQualityMode = displayQualityPolicy.mode;

    if (cachedDisplayCandidateEdges) {
      updateDisplayRoutingDebugState({
        stage: 'cache-candidate-pending',
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
        cacheHitAt: Date.now(),
        workerStartCount: displayEdgeWorkerStartCountRef.current,
        workerAbortCount: displayEdgeWorkerAbortCountRef.current,
      });
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
    const cancelSchedule = scheduleBaseReactFlowDisplayQuality(async () => {
      if (cancelled) return;
      let activeRoutingInput = displayRoutingInputRef.current;
      if (!activeRoutingInput) return;
      if (
        activeRoutingInput.cacheSignature !== displayEdgeCacheSignature
        || activeRoutingInput.inputGeometryDigest !== inputGeometryDigest
      ) {
        updateDisplayRoutingDebugState({
          stage: 'skip-stale-schedule',
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
        });
        return;
      }
      if (!cachedDisplayCandidateEdges) {
        updateDisplayRoutingDebugState({
          stage: 'precompiled-candidate-loading',
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
        });
      }
      const candidateResolution = await resolveBaseReactFlowDisplayCandidate({
        input: {
          inputSignature: displayEdgeCacheSignature,
          inputGeometryDigest,
          nodes: activeRoutingInput.nodes,
          edges: activeRoutingInput.edges,
          enableSmartEdges: activeRoutingInput.enableSmartEdges,
          smartEdgePadding: activeRoutingInput.smartEdgePadding,
          isLargeGraph: activeRoutingInput.isLargeGraph,
        },
        persistentCandidateEdges: cachedDisplayCandidateEdges,
        signal: workerAbortController.signal,
        isCurrent: () => (
          !cancelled
          && displayRoutingInputRef.current?.cacheSignature === displayEdgeCacheSignature
          && displayRoutingInputRef.current?.inputGeometryDigest === inputGeometryDigest
        ),
      });
      if (!candidateResolution) return;
      activeRoutingInput = displayRoutingInputRef.current;
      if (
        !activeRoutingInput
        || activeRoutingInput.cacheSignature !== displayEdgeCacheSignature
        || activeRoutingInput.inputGeometryDigest !== inputGeometryDigest
        || workerAbortController.signal.aborted
      ) return;
      updateDisplayRoutingDebugState({
        stage: candidateResolution.source === 'miss'
          ? 'precompiled-candidate-miss'
          : `${candidateResolution.source}-candidate-ready`,
        signature: displayEdgeCacheSignature,
        nodeCount,
        edgeCount,
      });
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
        cachedCandidateEdges: candidateResolution.candidateEdges,
        candidateSource: candidateResolution.source === 'miss'
          ? undefined
          : candidateResolution.source,
        qualityMode: displayWorkerQualityMode,
        timeoutMs: displayQualityPolicy.timeoutMs,
        signal: workerAbortController.signal,
      }).then(async (workerResult) => {
        if (cancelled) return;
        const isRequestCurrent = () => (
          !cancelled
          && displayRoutingInputRef.current?.cacheSignature === displayEdgeCacheSignature
          && displayRoutingInputRef.current?.inputGeometryDigest === inputGeometryDigest
        );
        const workerRoutingPatches = createBaseReactFlowDisplayEdgePatches(
          workerResult.projectedEdges,
          workerResult.edges,
        );
        if (!workerRoutingPatches) {
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
        const latestRoutingInput = displayRoutingInputRef.current;
        if (!latestRoutingInput || !isRequestCurrent()) return;
        const mergedWorkerEdges = mergeBaseReactFlowDisplayEdgePatches(
          latestRoutingInput.edges,
          workerRoutingPatches,
        );
        if (!mergedWorkerEdges) {
          updateDisplayRoutingDebugState({
            stage: 'latest-shape-mismatch',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          return;
        }
        let resolvedWorkerResult = workerResult;
        if (workerResult.hardClean !== true) {
          const repairRequestId = `${requestId}:repair`;
          updateDisplayRoutingDebugState({
            stage: 'worker-fallback-loading',
            signature: displayEdgeCacheSignature,
            requestId: repairRequestId,
            nodeCount,
            edgeCount,
          });
          resolvedWorkerResult = await repairBaseReactFlowDisplayEdgesInWorker({
            workerRef: displayEdgeWorkerRef,
            requestId: repairRequestId,
            edges: mergedWorkerEdges,
            nodes: latestRoutingInput.nodes,
            timeoutMs: displayQualityPolicy.timeoutMs,
            signal: workerAbortController.signal,
          });
          if (!isRequestCurrent()) return;
          updateDisplayRoutingDebugState({
            stage: 'worker-fallback-repaired',
            signature: displayEdgeCacheSignature,
            requestId: repairRequestId,
            nodeCount,
            edgeCount: resolvedWorkerResult.edges.length,
          });
        }
        if (!isRequestCurrent()) return;
        workerCompleted = true;
        const reportedFinalEdges = resolvedWorkerResult.edges;
        const repairRoutingPatches = createBaseReactFlowDisplayEdgePatches(
          workerResult.hardClean === true
            ? mergedWorkerEdges
            : resolvedWorkerResult.projectedEdges,
          workerResult.hardClean === true
            ? mergedWorkerEdges
            : reportedFinalEdges,
        );
        if (!repairRoutingPatches) {
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
        const latestSourceEdges = displayRoutingInputRef.current?.edges;
        if (!latestSourceEdges) return;
        const mergedTransactions = mergeBaseReactFlowDisplayRoutingTransactions({
          latestSourceEdges,
          workerRoutingPatches,
          repairRoutingPatches,
        });
        if (!mergedTransactions) {
          updateDisplayRoutingDebugState({
            stage: 'latest-shape-mismatch',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          return;
        }
        const mergedFinalEdges = mergedTransactions.edges;
        const mergedOutputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(mergedFinalEdges);
        const trustedFinalHardClean = resolvedWorkerResult.hardClean === true
          && doBaseReactFlowDisplayRoutesMatchExactly(reportedFinalEdges, mergedFinalEdges);
        if (!trustedFinalHardClean) {
          updateDisplayRoutingDebugState({
            stage: 'final-quality-rejected',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          logBaseReactFlowEventBindingFailure(
            'displayEdgesFinalQuality',
            new Error('display-edge-worker-final-signature-mismatch'),
          );
          return;
        }
        const cacheReplaySignature = mergedTransactions.cachePatches
          ? resolveBaseReactFlowDisplayCacheReplaySignature({
            sourceEdges: latestSourceEdges,
            finalEdges: mergedFinalEdges,
            cachePatches: mergedTransactions.cachePatches,
            finalOutputRouteSignature: mergedOutputRouteSignature,
          })
          : null;
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
          workerResolution: resolvedWorkerResult.routeResolution,
          outputRouteSignature: mergedOutputRouteSignature ?? undefined,
        });
        setDeferredDisplayEdges({
          signature: displayEdgeCacheSignature,
          geometryDigest: inputGeometryDigest,
          displayPatches: mergedTransactions.displayPatches,
          hardClean: true,
        });
        if (cacheReplaySignature !== null && mergedTransactions.cachePatches) {
          const cachePatches = mergedTransactions.cachePatches;
          cancelCacheWrite = scheduleBaseReactFlowDisplayCacheWrite(() => {
            writeBaseReactFlowDisplayEdgesCache(displayEdgeCacheSignature, cachePatches, {
              hardClean: true,
              outputRouteSignature: cacheReplaySignature,
            });
          });
        }
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
    cachedDisplayCandidateEdges,
    displayEdgeCacheSignature,
    displayQualityPolicy,
    inputGeometryDigest,
    isContainerReady,
    routingGeometryReady,
  ]);

  const resolvedDisplayEdges = resolveBaseReactFlowDisplayedEdges({
    signature: displayEdgeCacheSignature,
    geometryDigest: inputGeometryDigest,
    policyMode: displayQualityPolicy.mode,
    deferred: deferredDisplayEdges,
    cached: null,
    immediate: edges,
  });

  return resolvedDisplayEdges;
};
