import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BASE_DISPLAY_ROUTING_VERSION,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from './baseReactFlowDisplayEdgeCore';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  prewarmBaseReactFlowDisplayWorker,
  resolveBaseReactFlowDisplayWorkerFailureStage,
  type DeferredDisplayEdges,
  type DisplayRoutingInput,
} from './baseReactFlowDisplayWorkerClient';
import {
  computeBaseReactFlowDisplayEdgesIncrementallyInWorker,
} from './baseReactFlowDisplayIncrementalWorkerClient';
import {
  readDisplayRoutingDebugState,
  resolveDisplayRoutingCommittedReuseTiming,
  resolveDisplayRoutingCommittedReuseTransactionEvidence,
  updateDisplayRoutingDebugState,
  updateDisplayRoutingFinalAppliedState,
  updateDisplayRoutingLifecycleState,
} from './baseReactFlowDisplayRoutingDebug';
import {
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayRoutingTransactions,
  resolveBaseReactFlowDisplayCacheReplaySignature,
} from './baseReactFlowDisplayRoutingTransaction';
import { resolveBaseReactFlowDisplayCandidate } from './baseReactFlowDisplayCandidateResolver';
import type { BaseReactFlowDisplayCandidateResolution } from './baseReactFlowDisplayCandidateResolver';
import { canCommitBaseReactFlowDisplayResult } from './baseReactFlowDisplayCommitPolicy';
import {
  consumeBaseReactFlowStagedLayoutSnapshotHandoff,
  readBaseReactFlowDisplayCommittedSnapshot,
} from './baseReactFlowDisplayCommittedSnapshot';
import { commitBaseReactFlowDisplaySessionResult } from './baseReactFlowDisplaySessionCommit';
import { resolveBaseReactFlowDisplayCommittedReuse } from './baseReactFlowDisplayCommittedReuse';
import { resolveDisplayGeometryBarrierPolicy, scheduleBaseReactFlowStableGeometry } from './baseReactFlowDisplayGeometryBarrier';
import { createBaseReactFlowDisplayIncrementalPlan } from './baseReactFlowDisplayIncrementalPlan';
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
import { settleBaseReactFlowDisplayEffectCleanup } from './baseReactFlowDisplayEffectCleanup';
import {
  useBaseReactFlowCachedDisplayCandidate,
  useBaseReactFlowPrecompiledPreviewGate,
} from './useBaseReactFlowDisplayCandidateBootstrap';
import { loadBaseReactFlowDocumentRouteCandidate } from './baseReactFlowDocumentRouteCandidate';
import { useBaseReactFlowDisplayRoutingInput } from './useBaseReactFlowDisplayRoutingInput';
import { useBaseReactFlowDisplayCommittedBaseline } from './useBaseReactFlowDisplayCommittedBaseline';
import {
  useBaseReactFlowCommittedRenderAuthority,
} from './useBaseReactFlowDisplayRenderAuthority';
import { useBaseReactFlowDisplayWorker } from './useBaseReactFlowDisplayWorker';
import { useBaseReactFlowDisplayRoutingResult } from './useBaseReactFlowDisplayRoutingResult';
import { useBaseReactFlowDisplayQualityPolicy } from './useBaseReactFlowDisplayQualityPolicy';

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
  onDisplayRoutingFinalApplied,
  routingSessionRuntime,
}: UseBaseReactFlowDisplayRoutingOptions): UseBaseReactFlowDisplayRoutingResult => {
  const displayEdgeWorkerStartCountRef = useRef(0);
  const displayEdgeWorkerAbortCountRef = useRef(0);
  const displayRoutingInputRef = useRef<DisplayRoutingInput | null>(null);
  const {
    nodeDragFallbackKey,
    displayEdgeCacheSignature,
    inputGeometryDigest,
  } = useBaseReactFlowDisplayRoutingInput({
    edges,
    routingNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    isNodeDragging,
    nodeDragFallbackIds,
    displayRoutingInputRef,
  });

  const {
    displayQualityPolicy,
    forceFreshFullRoute,
    precompiledRegenerationPresetId,
  } = useBaseReactFlowDisplayQualityPolicy({
    nodeCount: routingNodes.length,
    edgeCount: edges.length,
    isLargeGraph,
  });

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
  const committedSnapshotBaselineRef = useBaseReactFlowDisplayCommittedBaseline({
    committedEntry: committedFinalDisplayEntry,
    forceFreshFullRoute,
    inputSignature: displayEdgeCacheSignature,
    inputGeometryDigest,
  });

  const displayRoutingSessionRuntime = useBaseReactFlowDisplayWorker({
    shouldPrewarm: displayQualityPolicy.mode !== 'skip' && !committedFinalDisplayEntry,
    routingSessionRuntime,
  });
  const displayEdgeWorkerRef = displayRoutingSessionRuntime.workerRef;

  const cachedDisplayCandidateEdges = useBaseReactFlowCachedDisplayCandidate({
    routingGeometryReady,
    bypassReusableRoutes: forceFreshFullRoute,
    hasCommittedFinalDisplayEntry: Boolean(committedFinalDisplayEntry),
    inputSignature: displayEdgeCacheSignature,
    inputGeometryDigest,
    edges,
  });
  const documentDisplayCandidateEdges = useMemo(() => (
    routingGeometryReady && !forceFreshFullRoute && !committedFinalDisplayEntry
      ? loadBaseReactFlowDocumentRouteCandidate({
        inputSignature: displayEdgeCacheSignature,
        inputGeometryDigest,
        sourceEdges: edges,
      })
      : null
  ), [
    committedFinalDisplayEntry,
    displayEdgeCacheSignature,
    edges,
    forceFreshFullRoute,
    inputGeometryDigest,
    routingGeometryReady,
  ]);
  const holdUnverifiedImmediateEdges = useBaseReactFlowPrecompiledPreviewGate({
    routingGeometryReady,
    forceFreshFullRoute,
    hasCommittedFinalDisplayEntry: Boolean(committedFinalDisplayEntry),
    hasDocumentCandidate: Boolean(documentDisplayCandidateEdges),
    inputSignature: displayEdgeCacheSignature,
    inputGeometryDigest,
    nodes: routingNodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  const [deferredDisplayEdges, setDeferredDisplayEdges] = useState<DeferredDisplayEdges | null>(null);
  const {
    committedRenderAuthority,
    rememberCommittedRenderAuthority,
  } = useBaseReactFlowCommittedRenderAuthority();
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

    const {
      retainedEntry: retainedCommittedEntry,
      reusableEntry: reusableCommittedFinalDisplayEntry,
      authorityBaseline,
      authorityEdges,
      outputRouteSignature,
    } = resolveBaseReactFlowDisplayCommittedReuse({
      forceFreshFullRoute,
      retainedBaseline: committedSnapshotBaselineRef.current,
      committedEntry: committedFinalDisplayEntry,
      inputSignature: displayEdgeCacheSignature,
      inputGeometryDigest,
    });
    if (reusableCommittedFinalDisplayEntry || retainedCommittedEntry) {
      if (reusableCommittedFinalDisplayEntry?.trustedTransactionHandoff) {
        consumeBaseReactFlowStagedLayoutSnapshotHandoff(reusableCommittedFinalDisplayEntry);
      }
      if (authorityBaseline) {
        rememberCommittedRenderAuthority(authorityBaseline, authorityEdges);
      }
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
        ...resolveDisplayRoutingCommittedReuseTransactionEvidence(
          previousDebugState,
          reusableCommittedFinalDisplayEntry?.trustedTransactionHandoff === true,
        ),
        workerStartCount: displayEdgeWorkerStartCountRef.current,
        workerAbortCount: displayEdgeWorkerAbortCountRef.current,
      });
      if (isNodeDragFallbackPending) onNodeDragFallbackResolved();
      onDisplayRoutingFinalApplied?.();
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
    let routingJob: ReturnType<typeof displayRoutingSessionRuntime.beginJob> | null = null;
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
      routingJob = displayRoutingSessionRuntime.beginJob('display');
      const incrementalPlan = createBaseReactFlowDisplayIncrementalPlan({
        baseline: forceFreshFullRoute ? null : committedSnapshotBaselineRef.current,
        nextInputSignature: displayEdgeCacheSignature,
        nextInputGeometryDigest: inputGeometryDigest,
        nextNodes: activeRoutingInput.nodes,
        nextEdges: activeRoutingInput.edges,
        draggedNodeIds: nodeDragFallbackKey ? nodeDragFallbackKey.split('\0') : [],
      });
      updateDisplayRoutingDebugState({
        incrementalBaselineSignature:
          committedSnapshotBaselineRef.current?.identity.inputSignature,
        incrementalPlanStatus: incrementalPlan
          ? 'ready'
          : committedSnapshotBaselineRef.current
            ? 'rejected'
            : 'missing-baseline',
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
          documentCandidateEdges: documentDisplayCandidateEdges,
          persistentCandidateEdges: cachedDisplayCandidateEdges,
          allowExternalCandidates: !forceFreshFullRoute,
          signal: routingJob.signal,
          isCurrent: () => (
            !cancelled
            && routingJob !== null
            && displayRoutingSessionRuntime.isCurrentJob(routingJob)
            && displayRoutingInputRef.current?.cacheSignature === displayEdgeCacheSignature
            && displayRoutingInputRef.current?.inputGeometryDigest === inputGeometryDigest
          ),
        });
      }
      if (!candidateResolution) {
        displayRoutingSessionRuntime.finishJob(routingJob);
        return;
      }
      activeRoutingInput = displayRoutingInputRef.current;
      if (
        !activeRoutingInput
        || activeRoutingInput.cacheSignature !== displayEdgeCacheSignature
        || activeRoutingInput.inputGeometryDigest !== inputGeometryDigest
        || !displayRoutingSessionRuntime.isCurrentJob(routingJob)
      ) {
        displayRoutingSessionRuntime.cancelJob(routingJob);
        return;
      }
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
      const requestId = `${displayEdgeCacheSignature}:${routingJob.id}`;
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
          baselineInputSignature: incrementalPlan.baseline.identity.inputSignature,
          baselineInputGeometryDigest: incrementalPlan.baseline.identity.inputGeometryDigest,
          baselineNodes: incrementalPlan.baseline.projectedSourceGeometry.nodes,
          baselineSourceEdges: incrementalPlan.baseline.projectedSourceGeometry.edges,
          baselinePatches: incrementalPlan.baseline.routingPatches,
          baselineOutputRouteSignature: incrementalPlan.baseline.outputRouteSignature,
          baselineSessionRef: incrementalPlan.baseline.workerSessionRef,
          nextInputSignature: displayEdgeCacheSignature,
          nextInputGeometryDigest: inputGeometryDigest,
          changeSet: incrementalPlan.changeSet,
          mutableEdgeIds: incrementalPlan.affectedClosure.mutableEdgeIds,
          contextEdgeIds: incrementalPlan.affectedClosure.contextEdgeIds,
          timeoutMs: displayQualityPolicy.timeoutMs,
          signal: routingJob.signal,
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
            : candidateResolution.source === 'precompiled'
              ? 'precompiled'
              : 'persistent',
          qualityMode: displayWorkerQualityMode,
          timeoutMs: displayQualityPolicy.timeoutMs,
          signal: routingJob.signal,
        });
      workerRequest.then((workerResult) => {
        const completedRoutingJob = routingJob;
        if (cancelled || !completedRoutingJob) return;
        const isRequestCurrent = () => (
          !cancelled
          && displayRoutingSessionRuntime.isCurrentJob(completedRoutingJob)
          && displayRoutingInputRef.current?.cacheSignature === displayEdgeCacheSignature
          && displayRoutingInputRef.current?.inputGeometryDigest === inputGeometryDigest
        );
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
        if (!latestSourceEdges) {
          displayRoutingSessionRuntime.finishJob(completedRoutingJob);
          return;
        }
        const mergedTransactions = mergeBaseReactFlowDisplayRoutingTransactions({
          latestSourceEdges,
          workerRoutingPatches: workerResult.routingPatches,
        });
        if (!mergedTransactions) {
          updateDisplayRoutingDebugState({
            stage: 'latest-shape-mismatch',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          displayRoutingSessionRuntime.finishJob(completedRoutingJob);
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
        if (!canCommitFinalResult || workerResult.hardClean !== true || !workerResult.commitReceipt) {
          updateDisplayRoutingDebugState({
            stage: 'final-quality-rejected',
            signature: displayEdgeCacheSignature,
            requestId,
            nodeCount,
            edgeCount,
          });
          logBaseReactFlowQualityFallback('worker-final-signature-mismatch');
          displayRoutingSessionRuntime.finishJob(completedRoutingJob);
          return;
        }
        const finalHardReport = workerResult.commitReceipt.hardReport;
        const cacheReplaySignature = mergedTransactions.cachePatches
          ? resolveBaseReactFlowDisplayCacheReplaySignature({
            sourceEdges: latestSourceEdges,
            finalEdges: mergedFinalEdges,
            cachePatches: mergedTransactions.cachePatches,
            finalOutputRouteSignature: mergedOutputRouteSignature,
          })
          : null;
        const commitResult = commitBaseReactFlowDisplaySessionResult({
          runtime: displayRoutingSessionRuntime,
          job: completedRoutingJob,
          inputSignature: displayEdgeCacheSignature,
          inputGeometryDigest,
          sourceEdges: latestSourceEdges,
          sourceNodes: latestRoutingInput.nodes,
          finalEdges: mergedFinalEdges,
          displayPatches: mergedTransactions.displayPatches,
          cachePatches: mergedTransactions.cachePatches,
          cacheReplaySignature,
          outputRouteSignature: mergedOutputRouteSignature,
          commitReceipt: workerResult.commitReceipt,
          precompiledCapturePresetId: precompiledRegenerationPresetId,
          rememberCommittedBaseline: (baseline, committedEdges) => {
            committedSnapshotBaselineRef.current = baseline;
            rememberCommittedRenderAuthority(baseline, committedEdges);
          },
          applyFinalGeometry: () => {
            const finalAppliedAt = Date.now();
            updateDisplayRoutingFinalAppliedState({
              signature: displayEdgeCacheSignature,
              inputGeometryDigest,
              routingVersion: BASE_DISPLAY_ROUTING_VERSION,
              requestId,
              nodeCount,
              edgeCount: mergedFinalEdges.length,
              scheduledAt,
              workerStartedAt: workerStartedAt ?? undefined,
              workerResponseParsedAt: workerResult.workerResponseParsedAt,
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
              hardGateDiagnostics: finalHardReport,
            });
            setDeferredDisplayEdges({
              signature: displayEdgeCacheSignature,
              geometryDigest: inputGeometryDigest,
              displayPatches: mergedTransactions.displayPatches,
              hardClean: true,
            });
            if (isNodeDragFallbackPending) onNodeDragFallbackResolved();
            onDisplayRoutingFinalApplied?.();
          },
        });
        cancelCacheWrite = commitResult.cancelCacheWrite ?? null;
        if (!commitResult.committed) {
          logBaseReactFlowQualityFallback('worker-final-session-commit-rejected');
        }
      }).catch((error) => {
        if (cancelled) return;
        workerCompleted = true;
        if (routingJob) displayRoutingSessionRuntime.finishJob(routingJob);
        updateDisplayRoutingDebugState({
          stage: resolveBaseReactFlowDisplayWorkerFailureStage(error),
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
      settleBaseReactFlowDisplayEffectCleanup({
        workerStarted: workerStartedAt !== null,
        workerCompleted,
        abortPendingWork: () => {
          if (routingJob) displayRoutingSessionRuntime.cancelJob(routingJob);
        },
        cancelPendingCacheWrite: cancelCacheWrite ?? undefined,
        cancelGeometrySchedule: cancelSchedule,
        recordPendingWorkerCancellation: () => {
          displayEdgeWorkerAbortCountRef.current += 1;
        },
        recordCancelledLifecycle: () => updateDisplayRoutingDebugState({
          stage: 'cancelled',
          signature: displayEdgeCacheSignature,
          nodeCount,
          edgeCount,
          workerStartCount: displayEdgeWorkerStartCountRef.current,
          workerAbortCount: displayEdgeWorkerAbortCountRef.current,
        }),
      });
    };
  }, [
    cachedDisplayCandidateEdges,
    committedSnapshotBaselineRef,
    committedFinalDisplayEntry,
    displayEdgeCacheSignature,
    displayEdgeWorkerRef,
    displayRoutingSessionRuntime,
    displayQualityPolicy,
    documentDisplayCandidateEdges,
    forceFreshFullRoute,
    inputGeometryDigest,
    isContainerReady,
    isNodeDragFallbackPending,
    isNodeDragging,
    nodeDragFallbackKey,
    onNodeDragFallbackResolved,
    onDisplayRoutingFinalApplied,
    precompiledRegenerationPresetId,
    rememberCommittedRenderAuthority,
    routingGeometryReady,
    routingPaused,
  ]);

  return useBaseReactFlowDisplayRoutingResult({
    sourceEdges: edges,
    inputSignature: displayEdgeCacheSignature,
    inputGeometryDigest,
    policyMode: displayQualityPolicy.mode,
    deferred: deferredDisplayEdges,
    cachedEdges: committedFinalDisplayEntry?.edges ?? null,
    holdUnverifiedImmediateEdges,
    isNodeDragging,
    dragFallbackPending: isNodeDragFallbackPending,
    nodeDragFallbackIds,
    committedRenderAuthority,
  });
};
