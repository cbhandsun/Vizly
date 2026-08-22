import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BASE_DISPLAY_ROUTING_VERSION,
  computeBaseReactFlowDisplayOutputRouteSignature,
  writeBaseReactFlowDisplayEdgesCache,
} from './baseReactFlowDisplayEdgeCore';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  disposeBaseReactFlowDisplayWorker,
  prewarmBaseReactFlowDisplayWorker,
  resolveBaseReactFlowDisplayQualityPolicy,
  scheduleBaseReactFlowDisplayCacheWrite,
  type DeferredDisplayEdges,
  type DisplayRoutingInput,
} from './baseReactFlowDisplayWorkerClient';
import {
  computeBaseReactFlowDisplayEdgesIncrementallyInWorker,
} from './baseReactFlowDisplayIncrementalWorkerClient';
import { resolveBaseReactFlowPrecompiledCapturePresetId } from './baseReactFlowPrecompiledCaptureMode';
import {
  readDisplayRoutingDebugState,
  resolveDisplayRoutingCommittedReuseTiming,
  updateDisplayRoutingDebugState,
  updateDisplayRoutingFinalAppliedState,
  updateDisplayRoutingLifecycleState,
} from './baseReactFlowDisplayRoutingDebug';
import {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayRoutingTransactions,
  resolveBaseReactFlowDisplayCacheReplaySignature,
} from './baseReactFlowDisplayRoutingTransaction';
import { resolveBaseReactFlowDisplayCandidate } from './baseReactFlowDisplayCandidateResolver';
import type { BaseReactFlowDisplayCandidateResolution } from './baseReactFlowDisplayCandidateResolver';
import { canCommitBaseReactFlowDisplayResult } from './baseReactFlowDisplayCommitPolicy';
import {
  commitBaseReactFlowDisplaySnapshot,
  doesBaseReactFlowDisplayCommittedBaselineMatchIdentity,
  readBaseReactFlowDisplayCommittedSnapshot,
  type BaseReactFlowDisplayCommittedSnapshotBaseline,
} from './baseReactFlowDisplayCommittedSnapshot';
import { resolveDisplayGeometryBarrierPolicy, scheduleBaseReactFlowStableGeometry } from './baseReactFlowDisplayGeometryBarrier';
import { createBaseReactFlowDisplayIncrementalPlan } from './baseReactFlowDisplayIncrementalPlan';
import {
  resolveBaseReactFlowDragAwareDisplayEpoch,
  resolveBaseReactFlowDragAwareInputIdentity,
} from './baseReactFlowDragRoutingFreeze';
import {
  logBaseReactFlowEventBindingFailure,
  logBaseReactFlowQualityFallback,
} from './baseReactFlowLogging';
import { isBaseReactFlowDisplayDiagnosticsEnabled } from './baseReactFlowDisplayDiagnostics';
import { recordBaseReactFlowRejectedDisplayDiagnostics } from './baseReactFlowDisplayRejectedDiagnostics';
import type {
  UseBaseReactFlowDisplayRoutingOptions,
  UseBaseReactFlowDisplayRoutingResult,
} from './baseReactFlowDisplayRoutingTypes';
import {
  isBaseReactFlowFreshRegenerationRequested,
  useBaseReactFlowCachedDisplayCandidate,
  useBaseReactFlowPrecompiledPreviewGate,
  useBaseReactFlowResolvedDisplayEdges,
  useBaseReactFlowResolvedOrDragFallbackEdges,
} from './useBaseReactFlowDisplayCandidateBootstrap';

export type {
  UseBaseReactFlowDisplayRoutingOptions,
  UseBaseReactFlowDisplayRoutingResult,
} from './baseReactFlowDisplayRoutingTypes';

/**
 * Owns the asynchronous display-routing lifecycle while the canvas component
 * remains a composition root. The hook intentionally keeps the worker, cache,
 * and final-commit order aligned with the original inline implementation.
 */
export const useBaseReactFlowDisplayRouting = ({
  edges,
  routingNodes,
  routingGeometryReady,
  routingPaused = false,
  isContainerReady,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  isNodeDragging,
  isNodeDragFallbackPending,
  nodeDragFallbackIds,
  onNodeDragFallbackResolved,
}: UseBaseReactFlowDisplayRoutingOptions): UseBaseReactFlowDisplayRoutingResult => {
  const displayEdgeWorkerRef = useRef<Worker | null>(null);
  const displayEdgeWorkerRequestSeqRef = useRef(0);
  const displayEdgeWorkerStartCountRef = useRef(0);
  const displayEdgeWorkerAbortCountRef = useRef(0);
  const displayRoutingInputRef = useRef<DisplayRoutingInput | null>(null);
  const committedSnapshotBaselineRef =
    useRef<BaseReactFlowDisplayCommittedSnapshotBaseline | null>(null);
  const nodeDragFallbackKey = useMemo(
    () => nodeDragFallbackIds.join('\0'),
    [nodeDragFallbackIds],
  );

  useEffect(() => () => {
    disposeBaseReactFlowDisplayWorker(displayEdgeWorkerRef);
  }, []);

  const displayEdgeEpoch = useMemo(() => {
    return resolveBaseReactFlowDragAwareDisplayEpoch({
      isNodeDragging,
      nodes: routingNodes,
      edges,
    });
  }, [routingNodes, edges, isNodeDragging]);

  const displayInputIdentity = useMemo(() => {
    return resolveBaseReactFlowDragAwareInputIdentity({
      isNodeDragging,
      nodes: routingNodes,
      edges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
    });
  }, [edges, routingNodes, enableSmartEdges, smartEdgePadding, isLargeGraph, isNodeDragging]);
  const {
    cacheSignature: displayEdgeCacheSignature,
    geometryDigest: inputGeometryDigest,
  } = displayInputIdentity;
  const forceFreshFullRoute = isBaseReactFlowFreshRegenerationRequested();

  const displayQualityPolicy = useMemo(() => (
    resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: routingNodes.length,
      edgeCount: edges.length,
      isLargeGraph,
      forceFullQuality: typeof window !== 'undefined'
        && resolveBaseReactFlowPrecompiledCapturePresetId({
          search: window.location.search,
          hash: window.location.hash,
        }) !== null,
    })
  ), [routingNodes.length, edges.length, isLargeGraph]);

  const committedFinalDisplayEntry = useMemo(() => (
    routingGeometryReady && !forceFreshFullRoute
      ? readBaseReactFlowDisplayCommittedSnapshot({
        inputSignature: displayEdgeCacheSignature,
        inputGeometryDigest,
        sourceEdges: edges,
      })
      : null
  ), [
    displayEdgeCacheSignature,
    edges,
    forceFreshFullRoute,
    inputGeometryDigest,
    routingGeometryReady,
  ]);

  useEffect(() => {
    if (forceFreshFullRoute) {
      committedSnapshotBaselineRef.current = null;
      return;
    }
    if (committedFinalDisplayEntry) {
      committedSnapshotBaselineRef.current = committedFinalDisplayEntry.baseline;
    }
  }, [committedFinalDisplayEntry, forceFreshFullRoute]);

  useEffect(() => {
    if (displayQualityPolicy.mode === 'skip' || committedFinalDisplayEntry) return;
    prewarmBaseReactFlowDisplayWorker(displayEdgeWorkerRef);
  }, [committedFinalDisplayEntry, displayQualityPolicy.mode]);

  const cachedDisplayCandidateEdges = useBaseReactFlowCachedDisplayCandidate({
    routingGeometryReady,
    bypassReusableRoutes: forceFreshFullRoute,
    hasCommittedFinalDisplayEntry: Boolean(committedFinalDisplayEntry),
    inputSignature: displayEdgeCacheSignature,
    edges,
  });
  const holdUnverifiedImmediateEdges = useBaseReactFlowPrecompiledPreviewGate({
    routingGeometryReady,
    forceFreshFullRoute,
    hasCommittedFinalDisplayEntry: Boolean(committedFinalDisplayEntry),
    inputSignature: displayEdgeCacheSignature,
    inputGeometryDigest,
    nodes: routingNodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
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
    const previousDebugState = readDisplayRoutingDebugState();
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
      updateDisplayRoutingLifecycleState('wait-geometry', displayEdgeCacheSignature, nodeCount, edgeCount);
      return undefined;
    }

    if (routingPaused) {
      updateDisplayRoutingLifecycleState('wait-layout-transaction', displayEdgeCacheSignature, nodeCount, edgeCount);
      return undefined;
    }

    if (displayQualityPolicy.mode === 'skip') {
      updateDisplayRoutingLifecycleState('skip-policy', displayEdgeCacheSignature, nodeCount, edgeCount);
      return undefined;
    }
    const displayWorkerQualityMode = displayQualityPolicy.mode;

    const retainedCommittedBaseline = forceFreshFullRoute
      ? null
      : committedSnapshotBaselineRef.current;
    const retainedCommittedEntry = doesBaseReactFlowDisplayCommittedBaselineMatchIdentity(
      retainedCommittedBaseline,
      displayEdgeCacheSignature,
      inputGeometryDigest,
    )
      ? retainedCommittedBaseline
      : null;
    if (committedFinalDisplayEntry || retainedCommittedEntry) {
      const outputRouteSignature = committedFinalDisplayEntry?.outputRouteSignature
        ?? retainedCommittedEntry?.outputRouteSignature;
      const committedReuseTiming = resolveDisplayRoutingCommittedReuseTiming({
        current: previousDebugState,
        signature: displayEdgeCacheSignature,
        inputGeometryDigest,
        outputRouteSignature,
        now: Date.now(),
      });
      updateDisplayRoutingFinalAppliedState({
        signature: displayEdgeCacheSignature,
        inputGeometryDigest,
        outputRouteSignature,
        routingVersion: BASE_DISPLAY_ROUTING_VERSION,
        cacheTrustLevel: 'runtime-committed',
        nodeCount,
        edgeCount,
        ...committedReuseTiming,
        workerStartCount: displayEdgeWorkerStartCountRef.current,
        workerAbortCount: displayEdgeWorkerAbortCountRef.current,
      });
      if (isNodeDragFallbackPending) onNodeDragFallbackResolved();
      return undefined;
    }

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
      updateDisplayRoutingLifecycleState('wait-container', displayEdgeCacheSignature, nodeCount, edgeCount);
      return undefined;
    }
    if (isNodeDragging) {
      updateDisplayRoutingLifecycleState('paused-node-drag', displayEdgeCacheSignature, nodeCount, edgeCount);
      return undefined;
    }

    // Re-prewarm after cancellation so the replacement compiles during geometry settle.
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
    const cancelSchedule = scheduleBaseReactFlowStableGeometry({
      ...resolveDisplayGeometryBarrierPolicy(Boolean(nodeDragFallbackKey)),
      readGeometryIdentity: () => {
        const current = displayRoutingInputRef.current;
        return current
          ? `${current.cacheSignature}\0${current.inputGeometryDigest}`
          : null;
      },
      run: async (geometryBarrier) => {
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
      updateDisplayRoutingDebugState({
        stage: 'geometry-stable',
        signature: displayEdgeCacheSignature,
        geometryBarrierResolution: geometryBarrier.resolution,
        geometryBarrierMs: geometryBarrier.durationMs,
        geometryBarrierSamples: geometryBarrier.sampleCount,
      });
      const incrementalPlan = createBaseReactFlowDisplayIncrementalPlan({
        baseline: forceFreshFullRoute ? null : committedSnapshotBaselineRef.current,
        nextInputSignature: displayEdgeCacheSignature,
        nextInputGeometryDigest: inputGeometryDigest,
        nextNodes: activeRoutingInput.nodes,
        nextEdges: activeRoutingInput.edges,
        draggedNodeIds: nodeDragFallbackKey ? nodeDragFallbackKey.split('\0') : [],
      });
      if (!incrementalPlan && !cachedDisplayCandidateEdges) {
        updateDisplayRoutingDebugState({
          stage: 'precompiled-candidate-loading',
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
        });
      }
      let candidateResolution: BaseReactFlowDisplayCandidateResolution | null;
      if (incrementalPlan) {
        candidateResolution = { candidateEdges: null, source: 'miss' };
        updateDisplayRoutingDebugState({
          stage: 'incremental-candidate-ready',
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
          affectedEdgeCount: incrementalPlan.affectedClosure.mutableEdgeIds.length,
        });
      } else {
        candidateResolution = await resolveBaseReactFlowDisplayCandidate({
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
          allowExternalCandidates: !forceFreshFullRoute,
          signal: workerAbortController.signal,
          isCurrent: () => (
            !cancelled
            && displayRoutingInputRef.current?.cacheSignature === displayEdgeCacheSignature
            && displayRoutingInputRef.current?.inputGeometryDigest === inputGeometryDigest
          ),
        });
      }
      if (!candidateResolution) return;
      activeRoutingInput = displayRoutingInputRef.current;
      if (
        !activeRoutingInput
        || activeRoutingInput.cacheSignature !== displayEdgeCacheSignature
        || activeRoutingInput.inputGeometryDigest !== inputGeometryDigest
        || workerAbortController.signal.aborted
      ) return;
      if (!incrementalPlan) {
        updateDisplayRoutingDebugState({
          stage: candidateResolution.source === 'miss'
            ? 'precompiled-candidate-miss'
            : `${candidateResolution.source}-candidate-ready`,
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
        });
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
        phaseProgressTrace: [],
        boundedCandidateTrace: [],
      });
      const workerRequest = incrementalPlan
        ? computeBaseReactFlowDisplayEdgesIncrementallyInWorker({
          workerRef: displayEdgeWorkerRef,
          requestId,
          edges: activeRoutingInput.edges,
          nodes: activeRoutingInput.nodes,
          enableSmartEdges: activeRoutingInput.enableSmartEdges,
          smartEdgePadding: activeRoutingInput.smartEdgePadding,
          isLargeGraph: activeRoutingInput.isLargeGraph,
          displayEdgeEpoch: activeRoutingInput.displayEdgeEpoch,
          baselineInputSignature: incrementalPlan.baseline.inputSignature,
          baselineInputGeometryDigest: incrementalPlan.baseline.inputGeometryDigest,
          baselineNodes: incrementalPlan.baseline.nodes,
          baselineSourceEdges: incrementalPlan.baseline.sourceEdges,
          baselinePatches: incrementalPlan.baseline.displayPatches,
          baselineOutputRouteSignature: incrementalPlan.baseline.outputRouteSignature,
          baselineSessionRef: incrementalPlan.baseline.workerSessionRef,
          nextInputSignature: displayEdgeCacheSignature,
          nextInputGeometryDigest: inputGeometryDigest,
          changeSet: incrementalPlan.changeSet,
          mutableEdgeIds: incrementalPlan.affectedClosure.mutableEdgeIds,
          contextEdgeIds: incrementalPlan.affectedClosure.contextEdgeIds,
          timeoutMs: displayQualityPolicy.timeoutMs,
          signal: workerAbortController.signal,
        })
        : computeBaseReactFlowDisplayEdgesInWorker({
          workerRef: displayEdgeWorkerRef,
          requestId,
          edges: activeRoutingInput.edges,
          nodes: activeRoutingInput.nodes,
          enableSmartEdges: activeRoutingInput.enableSmartEdges,
          smartEdgePadding: activeRoutingInput.smartEdgePadding,
          isLargeGraph: activeRoutingInput.isLargeGraph,
          displayEdgeEpoch: activeRoutingInput.displayEdgeEpoch,
          inputSignature: displayEdgeCacheSignature,
          inputGeometryDigest,
          cachedCandidateEdges: candidateResolution.candidateEdges,
          candidateSource: candidateResolution.source === 'miss'
            ? undefined
            : candidateResolution.source,
          qualityMode: displayWorkerQualityMode,
          timeoutMs: displayQualityPolicy.timeoutMs,
          signal: workerAbortController.signal,
        });
      workerRequest.then((workerResult) => {
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
        if (import.meta.env.DEV && workerResult.hardClean !== true) {
          if (isBaseReactFlowDisplayDiagnosticsEnabled()) {
            recordBaseReactFlowRejectedDisplayDiagnostics({
              edges: workerResult.edges,
              nodes: latestRoutingInput.nodes,
            });
          }
        }
        if (!isRequestCurrent()) return;
        workerCompleted = true;
        const reportedFinalEdges = workerResult.edges;
        const latestSourceEdges = displayRoutingInputRef.current?.edges;
        if (!latestSourceEdges) return;
        const mergedTransactions = mergeBaseReactFlowDisplayRoutingTransactions({
          latestSourceEdges,
          workerRoutingPatches,
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
        const routesMatchExactly = doBaseReactFlowDisplayRoutesMatchExactly(
          reportedFinalEdges,
          mergedFinalEdges,
        );
        const canCommitFinalResult = canCommitBaseReactFlowDisplayResult({
          qualityMode: displayWorkerQualityMode,
          hardClean: workerResult.hardClean,
          routeResolution: workerResult.routeResolution,
          routesMatch: routesMatchExactly,
        });
        if (!canCommitFinalResult) {
          updateDisplayRoutingDebugState({
            stage: 'final-quality-rejected',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          logBaseReactFlowQualityFallback('worker-final-signature-mismatch');
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
        if (workerResult.hardClean === true) {
          const committedBaseline = commitBaseReactFlowDisplaySnapshot({
            inputSignature: displayEdgeCacheSignature,
            inputGeometryDigest,
            sourceEdges: latestSourceEdges,
            sourceNodes: latestRoutingInput.nodes,
            displayPatches: mergedTransactions.displayPatches,
            outputRouteSignature: mergedOutputRouteSignature,
            workerSessionRef: workerResult.sessionRef,
          });
          if (committedBaseline) committedSnapshotBaselineRef.current = committedBaseline;
        }
        updateDisplayRoutingFinalAppliedState({
          signature: displayEdgeCacheSignature,
          inputGeometryDigest,
          routingVersion: BASE_DISPLAY_ROUTING_VERSION,
          requestId,
          nodeCount,
          edgeCount: mergedFinalEdges.length,
          scheduledAt,
          workerStartedAt: workerStartedAt ?? undefined,
          finalAppliedAt,
          routeMs: workerStartedAt === null ? undefined : finalAppliedAt - workerStartedAt,
          totalRouteMs: finalAppliedAt - scheduledAt,
          workerStartCount: displayEdgeWorkerStartCountRef.current,
          workerAbortCount: displayEdgeWorkerAbortCountRef.current,
          workerResolution: workerResult.routeResolution,
          cacheTrustLevel: candidateResolution.source === 'miss'
            ? (incrementalPlan ? 'runtime-committed' : 'miss')
            : 'external-candidate',
          outputRouteSignature: mergedOutputRouteSignature ?? undefined,
          phaseTrace: workerResult.phaseTrace,
          affectedEdgeCount: workerResult.affectedEdgeCount,
          fallbackLevel: workerResult.fallbackLevel,
          hardGateDiagnostics: workerResult.hardReport,
        });
        setDeferredDisplayEdges({
          signature: displayEdgeCacheSignature,
          geometryDigest: inputGeometryDigest,
          displayPatches: mergedTransactions.displayPatches,
          hardClean: workerResult.hardClean === true,
        });
        if (isNodeDragFallbackPending) onNodeDragFallbackResolved();
        if (
          workerResult.hardClean === true
          && cacheReplaySignature !== null
          && mergedTransactions.cachePatches
        ) {
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
      },
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
    committedFinalDisplayEntry,
    displayEdgeCacheSignature,
    displayQualityPolicy,
    forceFreshFullRoute,
    inputGeometryDigest,
    isContainerReady,
    isNodeDragFallbackPending,
    isNodeDragging,
    nodeDragFallbackKey,
    onNodeDragFallbackResolved,
    routingGeometryReady,
    routingPaused,
  ]);

  const resolvedDisplayEdges = useBaseReactFlowResolvedDisplayEdges({
    edges,
    inputSignature: displayEdgeCacheSignature,
    inputGeometryDigest,
    policyMode: displayQualityPolicy.mode,
    deferred: deferredDisplayEdges,
    cached: committedFinalDisplayEntry?.edges ?? null,
    holdUnverifiedImmediateEdges,
  });

  const displayedEdges = useBaseReactFlowResolvedOrDragFallbackEdges({
    sourceEdges: edges,
    resolvedEdges: resolvedDisplayEdges,
    isNodeDragging,
    dragFallbackPending: isNodeDragFallbackPending,
    nodeDragFallbackIds,
  });

  return {
    edges: displayedEdges,
    // BaseReactFlow is always canvas-owned, including the geometry bootstrap
    // window. Standalone custom edges retain the context default ('edge').
    routingOwner: 'canvas',
  };
};
