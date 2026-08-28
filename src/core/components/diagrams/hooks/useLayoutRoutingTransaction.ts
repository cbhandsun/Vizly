import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';

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

type LayoutRoutingTransactionRequest = Readonly<{
  nodes: Node[];
  edges: Edge[];
  routingJob: BaseReactFlowRoutingSessionJob;
  onCommitted?: () => void;
}>;

type UseLayoutRoutingTransactionOptions = Readonly<{
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setLayoutStable?: React.Dispatch<React.SetStateAction<boolean>>;
  nodesRef: React.MutableRefObject<Node[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
  routingSessionRuntime: BaseReactFlowRoutingSessionRuntime;
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
}: UseLayoutRoutingTransactionOptions) => {
  return useCallback(async ({
    nodes,
    edges,
    routingJob,
    onCommitted,
  }: LayoutRoutingTransactionRequest): Promise<void> => {
    if (routingJob.owner !== 'layout' || !routingSessionRuntime.isCurrentJob(routingJob)) {
      throw new Error('layout-routing-cancelled');
    }
    setLayoutStable?.(false);
    try {
      // Layout routing is an explicit interaction. Defer its worker and
      // full-quality transaction until that interaction instead of charging
      // every empty-canvas visit for the complete routing engine.
      const [
        { diagramConfigManager },
        displayWorkerModule,
        {
          clearBaseReactFlowLayoutNodeRuntimeGeometry,
          stageBaseReactFlowLayoutRouting,
        },
      ] = await Promise.all([
        import('../../../config/DiagramConfig'),
        import('../../shared/baseReactFlowDisplayWorkerClient'),
        import('../../shared/baseReactFlowLayoutRoutingTransaction'),
      ]);
      routingSessionRuntime.registerWorkerDisposer(
        displayWorkerModule.disposeBaseReactFlowDisplayWorker,
      );
      if (!routingSessionRuntime.isCurrentJob(routingJob)) {
        throw new Error('layout-routing-cancelled');
      }

      const targetNodes = clearBaseReactFlowLayoutNodeRuntimeGeometry(nodes);
      let committedEdges = edges;
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
        const staged = await stageBaseReactFlowLayoutRouting({
          workerRef: routingSessionRuntime.workerRef,
          requestId: `layout:${routingJob.id}`,
          sourceEdges: edges,
          sourceNodes: targetNodes,
          isLargeGraph,
          signal: routingJob.signal,
          forceFreshFullRoute: precompiledLayoutRegeneration !== null,
          fullRouteTimeoutMs: precompiledLayoutRegeneration
            ? PRECOMPILED_CAPTURE_WORKER_TIMEOUT_MS
            : undefined,
          precompiledLayoutRegeneration,
        });
        if (!routingSessionRuntime.isCurrentJob(routingJob)) {
          throw new Error('layout-routing-cancelled');
        }
        committedEdges = staged.committedSourceEdges;
        commitLayoutSnapshot = staged.commitSnapshot;
      }
      const commitResult = routingSessionRuntime.commitJob(routingJob, () => {
        if (!commitLayoutSnapshot(routingSessionRuntime)) {
          throw new Error('layout-routing-hard-quality-rejected');
        }
        takeSnapshot(nodesRef.current, edgesRef.current);
        // React 18 batches these state updates under the same routing epoch.
        setNodes(targetNodes);
        setEdges(committedEdges);
      });
      if (!commitResult.committed) throw new Error('layout-routing-cancelled');
      await runAfterLayoutRenderFrames(() => {
        flushObstacles();
        onCommitted?.();
      });
    } finally {
      setLayoutStable?.(true);
    }
  }, [
    edgesRef,
    nodesRef,
    routingSessionRuntime,
    setEdges,
    setLayoutStable,
    setNodes,
    takeSnapshot,
  ]);
};
