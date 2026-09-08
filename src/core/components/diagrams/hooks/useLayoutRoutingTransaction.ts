import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { createLayoutCandidateAcceptance, layoutCandidateAcceptanceMatches } from '../../../algorithms/layoutCandidateAcceptance';
import { evaluateLayoutGeometry, type LayoutGeometryConstraints } from '../../../algorithms/layoutGeometryConstraints';
import { updateDisplayRoutingDebugState } from '../../shared/baseReactFlowDisplayRoutingDebug';
import { normalizeBaseReactFlowLayoutVisibility } from '../../shared/baseReactFlowLayoutVisibility';

import { runAfterLayoutRenderFrames } from '../../../utils/animateLayoutTransition';
import { flushObstacles } from '../../custom-edges/obstacleContext';
import {
  computeBaseReactFlowIsLargeGraph,
  readBaseReactFlowPerformanceConfig,
} from '../../shared/baseReactFlowRuntimeConfig';
import type {
  BaseReactFlowRoutingSessionJob,
  BaseReactFlowRoutingSessionRuntime,
} from '../../shared/baseReactFlowRoutingSessionRuntime';
import { resolveBaseReactFlowPrecompiledLayoutRegenerationFromWindow } from '../../shared/baseReactFlowPrecompiledCaptureMode';
import { PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS } from '../../shared/baseReactFlowDisplayWorkerTimeout';
import type { LayoutRoutingTransactionDiagnostics } from './layoutRoutingTransactionDiagnostics';
import {
  stagePreferredLayoutCandidate,
  type LayoutCandidate,
  type RoutedLayoutCandidate,
} from './layoutCandidateSelection';

type LayoutRoutingTransactionRequest = Readonly<{
  nodes: Node[];
  edges: Edge[];
  routingJob: BaseReactFlowRoutingSessionJob;
  beforePreviewRelease?: () => Promise<unknown>;
  commitSelection?: () => void;
  layoutConstraints?: LayoutGeometryConstraints;
  rejectObstacleDirtyBoundedCandidate?: boolean;
  rejectUnanchoredFlatElkCandidate?: boolean;
  candidateRepairPolicy?: 'default' | 'skip-exact-clean';
  retainLayoutPreviewOnFailure?: boolean;
  diagnostics?: LayoutRoutingTransactionDiagnostics;
  alternative?: Readonly<{
    create: () => Promise<LayoutCandidate | null>;
    prefer: (baseline: RoutedLayoutCandidate, candidate: RoutedLayoutCandidate) => boolean;
  }>;
}>;

export type LayoutPresentationPreviewRequest = Readonly<{
  nodes: Node[];
  routingJob: BaseReactFlowRoutingSessionJob;
}>;

type UseLayoutRoutingTransactionOptions = Readonly<{
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setLayoutStable?: React.Dispatch<React.SetStateAction<boolean>>;
  nodesRef: React.MutableRefObject<Node[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
  routingSessionRuntime: BaseReactFlowRoutingSessionRuntime;
  publishLayoutPreview?: (request: LayoutPresentationPreviewRequest) => void;
  clearLayoutPreview?: (routingJob: BaseReactFlowRoutingSessionJob) => boolean | undefined;
}>;

/**
 * Keeps the current graph visible while target geometry is routed off-screen,
 * then commits nodes and trusted source edges in one React batch. During the
 * two-frame React Flow geometry reconciliation, the layout-stability context
 * suppresses transient edge paint and duplicate routing work.
 */
export const useLayoutRoutingTransaction = ({
  setNodes,
  setEdges,
  setLayoutStable,
  nodesRef,
  edgesRef,
  takeSnapshot,
  routingSessionRuntime,
  publishLayoutPreview,
  clearLayoutPreview,
}: UseLayoutRoutingTransactionOptions) => {
  return useCallback(async ({
    nodes,
    edges,
    routingJob,
    beforePreviewRelease,
    commitSelection,
    layoutConstraints,
    rejectObstacleDirtyBoundedCandidate,
    rejectUnanchoredFlatElkCandidate,
    candidateRepairPolicy,
    retainLayoutPreviewOnFailure = false,
    diagnostics,
    alternative,
  }: LayoutRoutingTransactionRequest): Promise<void> => {
    if (routingJob.owner !== 'layout' || !routingSessionRuntime.isCurrentJob(routingJob)) {
      throw new Error('layout-routing-cancelled');
    }
    let committed = false;
    try {
      // Layout routing is an explicit interaction. Defer its worker and
      // full-quality transaction until that interaction instead of charging
      // every empty-canvas visit for the complete routing engine.
      const loadRuntimeDependencies = () => Promise.all([
        import('../../../config/DiagramConfig'),
        import('../../shared/baseReactFlowDisplayWorkerClient'),
        import('../../shared/baseReactFlowLayoutRoutingTransaction'),
      ]);
      const [
        { diagramConfigManager },
        displayWorkerModule,
        {
          clearBaseReactFlowLayoutNodeRuntimeGeometry,
          stageBaseReactFlowLayoutRouting,
        },
      ] = diagnostics
        ? await diagnostics.measurePhase('dynamic-import', loadRuntimeDependencies)
        : await loadRuntimeDependencies();
      routingSessionRuntime.registerWorkerDisposer(
        displayWorkerModule.disposeBaseReactFlowDisplayWorker,
      );
      if (!routingSessionRuntime.isCurrentJob(routingJob)) {
        throw new Error('layout-routing-cancelled');
      }

      let targetNodes = clearBaseReactFlowLayoutNodeRuntimeGeometry(normalizeBaseReactFlowLayoutVisibility(nodes));
      let geometryAcceptance = createLayoutCandidateAcceptance(targetNodes, layoutConstraints, null);
      updateDisplayRoutingDebugState({ layoutGeometryReport: geometryAcceptance?.geometry
        ?? evaluateLayoutGeometry(targetNodes, layoutConstraints) });
      if (!geometryAcceptance) throw new Error('layout-routing-hard-quality-rejected');
      setLayoutStable?.(false);
      publishLayoutPreview?.({ nodes: targetNodes, routingJob });
      let committedEdges = edges;
      let committedRequestId: string | undefined;
      let commitLayoutSnapshot = (_runtime: BaseReactFlowRoutingSessionRuntime): boolean => true;
      if (edges.length > 0) {
        const performanceConfig = readBaseReactFlowPerformanceConfig({
          readConfig: () => diagramConfigManager.getConfig(),
        });
        const isLargeGraph = computeBaseReactFlowIsLargeGraph({
          nodeCount: targetNodes.length,
          edgeCount: edges.length,
          performanceConfig,
        });
        const precompiledLayoutRegeneration =
          resolveBaseReactFlowPrecompiledLayoutRegenerationFromWindow();
        const candidateAcceptances = new Map<Node[], NonNullable<typeof geometryAcceptance>>();
        const candidateRequestIds = new Map<Node[], string>();
        let candidateOrdinal = 0;
        const stageRouting = async (candidate: LayoutCandidate) => {
          const acceptance = createLayoutCandidateAcceptance(candidate.nodes, layoutConstraints, null);
          if (!acceptance) throw new Error('layout-routing-hard-quality-rejected');
          candidateAcceptances.set(candidate.nodes, acceptance);
          const requestId = `layout:${routingJob.id}${candidateOrdinal++ === 0 ? '' : ':alternative'}`;
          candidateRequestIds.set(candidate.nodes, requestId);
          const route = () => stageBaseReactFlowLayoutRouting({
            workerRef: routingSessionRuntime.workerRef,
            requestId,
            sourceEdges: candidate.edges,
            sourceNodes: candidate.nodes,
            layoutConstraints: layoutConstraints === undefined ? undefined : acceptance.constraints,
            isLargeGraph,
            signal: routingJob.signal,
            forceFreshFullRoute: precompiledLayoutRegeneration !== null,
            fullRouteTimeoutMs: precompiledLayoutRegeneration
              ? PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS
              : undefined,
            precompiledLayoutRegeneration,
            rejectObstacleDirtyBoundedCandidate,
            rejectUnanchoredFlatElkCandidate,
            candidateRepairPolicy,
          });
          const staged = diagnostics ? await diagnostics.measurePhase('worker-routing', route) : await route();
          if (!layoutCandidateAcceptanceMatches(acceptance, candidate.nodes, null)) {
            throw new Error('layout-routing-hard-quality-rejected');
          }
          return staged;
        };
        const select = () => stagePreferredLayoutCandidate({
          baseline: { nodes: targetNodes, edges },
          createAlternative: alternative ? async () => {
            const candidate = diagnostics
              ? await diagnostics.measurePhase('layout-calculation', alternative.create)
              : await alternative.create();
            return candidate && { ...candidate, nodes: clearBaseReactFlowLayoutNodeRuntimeGeometry(
              normalizeBaseReactFlowLayoutVisibility(candidate.nodes),
            ) };
          } : undefined,
          stage: stageRouting,
          preferAlternative: alternative?.prefer ?? (() => false),
          signal: routingJob.signal,
        });
        const selected = await select();
        if (!routingSessionRuntime.isCurrentJob(routingJob)) {
          throw new Error('layout-routing-cancelled');
        }
        // Keep candidate evaluation off the state writers. Only the selected
        // geometry, route receipt, and saved selection enter the same commit.
        if (selected.geometry.nodes !== targetNodes) {
          targetNodes = selected.geometry.nodes;
          geometryAcceptance = candidateAcceptances.get(targetNodes) ?? null;
          if (!geometryAcceptance) throw new Error('layout-routing-hard-quality-rejected');
          publishLayoutPreview?.({ nodes: targetNodes, routingJob });
          updateDisplayRoutingDebugState({ layoutGeometryReport: geometryAcceptance.geometry });
        }
        committedEdges = selected.staged.committedSourceEdges;
        commitLayoutSnapshot = selected.staged.commitSnapshot;
        committedRequestId = candidateRequestIds.get(selected.geometry.nodes);
      }
      const commit = () => routingSessionRuntime.commitJob(routingJob, () => {
        if (!layoutCandidateAcceptanceMatches(geometryAcceptance, targetNodes, null)) {
          updateDisplayRoutingDebugState({ layoutGeometryReport: evaluateLayoutGeometry(targetNodes, geometryAcceptance.constraints) });
          throw new Error('layout-routing-hard-quality-rejected');
        }
        if (!commitLayoutSnapshot(routingSessionRuntime)) {
          throw new Error('layout-routing-hard-quality-rejected');
        }
        if (committedRequestId) updateDisplayRoutingDebugState({ requestId: committedRequestId });
        if (edges.length === 0 && !routingSessionRuntime.commitLayoutAcceptance(geometryAcceptance, targetNodes, null)) {
          throw new Error('layout-routing-hard-quality-rejected');
        }
        takeSnapshot(nodesRef.current, edgesRef.current);
        // React 18 batches these state updates under the same routing epoch.
        setNodes(targetNodes);
        setEdges(committedEdges);
        commitSelection?.();
      });
      const commitResult = diagnostics
        ? diagnostics.measurePhaseSync('state-commit', commit)
        : commit();
      if (!commitResult.committed) throw new Error('layout-routing-cancelled');
      committed = true;
      const reconcileRender = () => runAfterLayoutRenderFrames(() => {
        flushObstacles();
      });
      if (diagnostics) {
        await diagnostics.measurePhase('render-reconcile', reconcileRender);
      } else {
        await reconcileRender();
      }
      if (beforePreviewRelease) {
        if (diagnostics) {
          await diagnostics.measurePhase('fit-request', beforePreviewRelease);
        } else {
          await beforePreviewRelease();
        }
      }
    } finally {
      if (committed || routingSessionRuntime.isCurrentJob(routingJob)) {
        // A job-level fallback owns the same preview and routing epoch. Keep
        // the target hidden transaction active between attempts so the old
        // committed display route cannot re-enter and immediately be paused
        // again when the fallback starts.
        const retainsPreviewForFallback = !committed && retainLayoutPreviewOnFailure;
        if (!retainsPreviewForFallback) {
          const released = clearLayoutPreview?.(routingJob) ?? true;
          if (released) setLayoutStable?.(true);
        }
      }
    }
  }, [
    edgesRef,
    nodesRef,
    clearLayoutPreview,
    publishLayoutPreview,
    routingSessionRuntime,
    setEdges,
    setLayoutStable,
    setNodes,
    takeSnapshot,
  ]);
};
