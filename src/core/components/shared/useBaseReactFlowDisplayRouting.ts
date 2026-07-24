import { useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  BASE_DISPLAY_ROUTING_VERSION,
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseReactFlowDisplayOutputRouteSignature,
  readBaseReactFlowDisplayEdgesCacheEntry,
  withDisplayAbsolutePositions,
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
import {
  canCommitBaseReactFlowDisplayResult,
  shouldRepairBaseReactFlowDisplayResult,
} from './baseReactFlowDisplayCommitPolicy';
import { computeBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
import { createBaseReactFlowInteractiveFallbackEdges } from './baseReactFlowDisplayFallback';
import { logBaseReactFlowEventBindingFailure } from './baseReactFlowLogging';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalValidation';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import { getDisplayComputedPath, getDisplayNodeRect } from './baseReactFlowDisplayGeometry';

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
          const debugHost = typeof window !== 'undefined' ? window.location.hostname : '';
          if (debugHost === 'localhost' || debugHost === '127.0.0.1' || debugHost === '::1') {
            const terminalNodes = withDisplayAbsolutePositions(
              latestRoutingInput.nodes,
              new Map(latestRoutingInput.nodes.map(node => [node.id, node] as const)),
            );
            const terminalSnapshot = createDisplayTerminalValidationSnapshot(terminalNodes);
            const terminalReport = getDisplayTerminalValidationReport(
              workerResult.edges,
              terminalSnapshot,
            );
            const summarizeNode = (nodeId: string) => {
              const node = terminalNodes.find(item => item.id === nodeId);
              const rect = node ? getDisplayNodeRect(node) : null;
              return node && {
                id: node.id,
                position: rect ? { x: rect.x, y: rect.y } : node.position,
                width: rect?.width ?? node.width ?? node.measured?.width,
                height: rect?.height ?? node.height ?? node.measured?.height,
              };
            };
            const summarizeEdge = (edge: Edge) => {
              const data = (edge.data ?? {}) as Record<string, unknown>;
              return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
                sourcePortPolicy: data.sourcePortPolicy,
                targetPortPolicy: data.targetPortPolicy,
                layoutDirection: data.layoutDirection,
                path: data.computedPath,
                sourceNode: summarizeNode(edge.source),
                targetNode: summarizeNode(edge.target),
              };
            };
            const hairpinEdges = workerResult.edges.filter(edge => (
              calculateEdgePathQualityScore([edge]).hairpins > 0
            ));
            const terminalNodeById = new Map(terminalNodes.map(node => [node.id, node] as const));
            const declaredAxisMismatches = workerResult.edges.filter((edge) => {
              const sourceNode = terminalNodeById.get(edge.source);
              const targetNode = terminalNodeById.get(edge.target);
              if (!sourceNode || !targetNode) return true;
              const sourceRect = getDisplayNodeRect(sourceNode);
              const targetRect = getDisplayNodeRect(targetNode);
              if (!sourceRect || !targetRect) return true;
              const path = getDisplayComputedPath(edge);
              return displayTerminalRoleNeedsDeclaredAxisRepair(
                edge,
                path,
                'source',
                sourceRect,
              ) || displayTerminalRoleNeedsDeclaredAxisRepair(
                edge,
                path,
                'target',
                targetRect,
              );
            });
            const unexplainedPairs: Array<{ first: Edge; second: Edge; overlap: number }> = [];
            for (let firstIndex = 0; firstIndex < workerResult.edges.length; firstIndex += 1) {
              for (
                let secondIndex = firstIndex + 1;
                secondIndex < workerResult.edges.length;
                secondIndex += 1
              ) {
                const first = workerResult.edges[firstIndex];
                const second = workerResult.edges[secondIndex];
                const overlap = calculateEdgePathQualityScore(
                  [first, second],
                ).unexplainedRelatedOverlap;
                if (overlap > 0) unexplainedPairs.push({ first, second, overlap });
              }
            }
            updateDisplayRoutingDebugState({
              terminalDiagnostics: {
                unanchored: terminalReport.unanchoredEdgeIndexes.slice(0, 3).map(
                  index => summarizeEdge(workerResult.edges[index]),
                ),
                hairpins: hairpinEdges.slice(0, 3).map(summarizeEdge),
                declaredAxisMismatches: declaredAxisMismatches.slice(0, 3).map(summarizeEdge),
                unexplainedPairs: unexplainedPairs.slice(0, 3).map(pair => ({
                  first: summarizeEdge(pair.first),
                  second: summarizeEdge(pair.second),
                  overlap: pair.overlap,
                })),
              },
            });
          }
          if (shouldRepairBaseReactFlowDisplayResult({
            qualityMode: displayWorkerQualityMode,
            hardClean: workerResult.hardClean,
          })) {
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
        const routesMatchExactly = doBaseReactFlowDisplayRoutesMatchExactly(
          reportedFinalEdges,
          mergedFinalEdges,
        );
        const canCommitFinalResult = canCommitBaseReactFlowDisplayResult({
          qualityMode: displayWorkerQualityMode,
          hardClean: resolvedWorkerResult.hardClean,
          routeResolution: resolvedWorkerResult.routeResolution,
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
          hardClean: resolvedWorkerResult.hardClean === true,
        });
        if (
          resolvedWorkerResult.hardClean === true
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

  const immediateDisplayEdges = useMemo(
    () => displayQualityPolicy.mode === 'interactive'
      ? createBaseReactFlowInteractiveFallbackEdges(edges)
      : edges,
    [displayQualityPolicy.mode, edges],
  );

  const resolvedDisplayEdges = resolveBaseReactFlowDisplayedEdges({
    signature: displayEdgeCacheSignature,
    geometryDigest: inputGeometryDigest,
    policyMode: displayQualityPolicy.mode,
    deferred: deferredDisplayEdges,
    cached: null,
    immediate: immediateDisplayEdges,
  });

  return resolvedDisplayEdges;
};
