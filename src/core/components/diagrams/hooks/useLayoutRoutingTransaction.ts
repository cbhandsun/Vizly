import { useCallback, useEffect, useRef } from 'react';
import type { Edge, Node } from '@xyflow/react';

import { runAfterLayoutRenderFrames } from '../../../utils/animateLayoutTransition';
import { flushObstacles } from '../../custom-edges/obstacleContext';
import {
  computeBaseReactFlowIsLargeGraph,
  readBaseReactFlowPerformanceConfig,
} from '../../shared/baseReactFlowRuntimeConfig';

type LayoutRoutingTransactionRequest = Readonly<{
  nodes: Node[];
  edges: Edge[];
  onCommitted?: () => void;
}>;

type UseLayoutRoutingTransactionOptions = Readonly<{
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setLayoutStable?: React.Dispatch<React.SetStateAction<boolean>>;
  nodesRef: React.MutableRefObject<Node[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
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
}: UseLayoutRoutingTransactionOptions) => {
  const workerRef = useRef<Worker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const disposeWorkerRef = useRef<((workerRef: React.MutableRefObject<Worker | null>) => void) | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      disposeWorkerRef.current?.(workerRef);
      disposeWorkerRef.current = null;
    };
  }, []);

  return useCallback(async ({
    nodes,
    edges,
    onCommitted,
  }: LayoutRoutingTransactionRequest): Promise<void> => {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Layout routing is an explicit interaction. Defer its worker, coordinator,
    // and full-quality transaction until that interaction instead of charging
    // every empty-canvas visit for the complete routing engine.
    const [
      { diagramConfigManager },
      { EdgeRoutingCoordinator },
      displayWorkerModule,
      { stageBaseReactFlowLayoutRouting },
    ] = await Promise.all([
      import('../../../config/DiagramConfig'),
      import('../../../services/EdgeRoutingCoordinator'),
      import('../../shared/baseReactFlowDisplayWorkerClient'),
      import('../../shared/baseReactFlowLayoutRoutingTransaction'),
    ]);
    disposeWorkerRef.current = displayWorkerModule.disposeBaseReactFlowDisplayWorker;
    if (abortController.signal.aborted) throw new Error('layout-routing-cancelled');

    let committedEdges = edges;
    if (edges.length > 0) {
      const performanceConfig = readBaseReactFlowPerformanceConfig({
        readConfig: () => diagramConfigManager.getConfig(),
      });
      const isLargeGraph = computeBaseReactFlowIsLargeGraph({
        nodeCount: nodes.length,
        edgeCount: edges.length,
        performanceConfig,
      });
      const staged = await stageBaseReactFlowLayoutRouting({
        workerRef,
        requestId: `layout:${requestSequenceRef.current += 1}`,
        sourceEdges: edges,
        sourceNodes: nodes,
        isLargeGraph,
        signal: abortController.signal,
      });
      committedEdges = staged.routedEdges;
    }

    if (abortController.signal.aborted) throw new Error('layout-routing-cancelled');

    setLayoutStable?.(false);
    try {
      takeSnapshot(nodesRef.current, edgesRef.current);
      EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
      // React 18 batches these state updates. The recorded trusted display
      // snapshot is already available when BaseReactFlow observes this graph.
      setNodes(nodes);
      setEdges(committedEdges);
      await runAfterLayoutRenderFrames(() => {
        flushObstacles();
        onCommitted?.();
      });
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setLayoutStable?.(true);
    }
  }, [edgesRef, nodesRef, setEdges, setLayoutStable, setNodes, takeSnapshot]);
};
