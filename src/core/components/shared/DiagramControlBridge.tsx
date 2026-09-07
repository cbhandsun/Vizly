import React, { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  coerceDiagramSidebarOffset,
  MIN_DIAGRAM_FULL_FIT_ZOOM,
} from './diagramControlFit';
import { computeDiagramNodeBounds } from './diagramNodeBounds';
import { logDiagramControlBridgeFailure } from './diagramControlLogging';
import {
  claimLayoutCommitFitRequest,
  DIAGRAM_CONTROL_REQUEST_EVENT,
  inspectLayoutCommitFitRequest,
  resolveLayoutCommitFitRequest,
} from './diagramControlRequest';
import { waitForDiagramControlViewportPaint } from './diagramControlPaint';
import { applyDiagramOverviewFit, readDiagramOverviewFitInput } from './diagramOverviewFit';
import { useBaseReactFlowViewportSemanticSync } from './baseReactFlowViewportSemanticContext';
import { registerReactFlowSnapshotProvider } from '../../rendering/reactFlowSnapshotRegistry';

interface DiagramControlBridgeProps {
  diagramId?: string;
}

// 统一桥接：监听标题栏/外层触发的视图控制事件，并作用于当前图的 ReactFlow 实例
const DiagramControlBridge: React.FC<DiagramControlBridgeProps> = ({ diagramId }) => {
  const rf = useReactFlow();
  const syncViewportSemanticState = useBaseReactFlowViewportSemanticSync();
  const markerRef = useRef<HTMLSpanElement | null>(null);

  const resolveSelfDiagramId = useCallback((): string | undefined => {
    if (diagramId) return diagramId;
    const el = markerRef.current;
    let cur: HTMLElement | null = el?.parentElement ?? null;
    let depth = 0;
    while (cur && depth < 10) {
      const idAttr = cur.id;
      if (idAttr && idAttr.startsWith('diagram-')) {
        return idAttr.replace('diagram-', '');
      }
      cur = cur.parentElement;
      depth++;
    }
    return undefined;
  }, [diagramId]);

  const resolveContainer = useCallback((): HTMLElement | null => {
    const id = resolveSelfDiagramId();
    if (id) {
      const byId = document.getElementById(`diagram-${id}`);
      if (byId) {
        const containerAncestor = byId.closest('.diagram-container');
        if (containerAncestor) return containerAncestor as HTMLElement;
        const previewAncestor = byId.closest('.diagram-preview-container');
        if (previewAncestor) return previewAncestor as HTMLElement;
        return byId;
      }
    }
    let cur = markerRef.current?.parentElement || null;
    let depth = 0;
    while (cur && depth < 10) {
      if (cur.id?.startsWith('diagram-')) return cur;
      if (cur.classList?.contains('react-flow')) return cur;
      cur = cur.parentElement;
      depth++;
    }
    return null;
  }, [resolveSelfDiagramId]);

  const applyOverviewFit = useCallback((container: HTMLElement | null, signal: AbortSignal, duration = 0) => (
    applyDiagramOverviewFit({
      readFitInput: () => readDiagramOverviewFitInput({ container, nodes: rf.getNodes(), edges: rf.getEdges(), viewport: rf.getViewport() }),
      getViewport: rf.getViewport,
      setViewport: (viewport, animationDuration) => rf.setViewport(viewport, animationDuration ? { duration: animationDuration } : undefined),
      fallbackFit: () => rf.fitView({ padding: 24, includeHiddenNodes: false, duration,
        minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1 }),
      syncSemanticViewport: syncViewportSemanticState ?? undefined,
      waitForPaint: () => waitForDiagramControlViewportPaint({ signal }),
      isCancelled: () => signal.aborted,
      duration,
    })
  ), [rf, syncViewportSemanticState]);

  // 将React Flow实例暴露到window对象，方便调试
  useEffect(() => {
    const runtimeWindow = window as Window & { reactFlowInstance?: typeof rf };
    if (rf) {
      runtimeWindow.reactFlowInstance = rf;
    }
    return () => {
      if (runtimeWindow.reactFlowInstance === rf) {
        delete runtimeWindow.reactFlowInstance;
      }
    };
  }, [rf]);

  useEffect(() => {
    const id = resolveSelfDiagramId();
    if (!id) return undefined;
    return registerReactFlowSnapshotProvider(id, () => ({
      nodes: rf.getNodes(),
      edges: rf.getEdges(),
      viewport: rf.getViewport(),
    }));
  }, [resolveSelfDiagramId, rf]);

  useEffect(() => {
    const pendingFits = new Set<AbortController>();

    const onControl = (e: Event) => {
      const { action, diagramId: targetId } = (e as CustomEvent).detail || {};
      const idToMatch = resolveSelfDiagramId();
      if (!action) return;
      if (idToMatch && targetId !== idToMatch) return;
      if (!idToMatch && targetId) return;

      if (action === 'fit') {
        pendingFits.forEach(pending => pending.abort());
        const controller = new AbortController();
        pendingFits.add(controller);
        void applyOverviewFit(resolveContainer(), controller.signal, 450)
          .catch(error => logDiagramControlBridgeFailure('fitFallback', error))
          .finally(() => pendingFits.delete(controller));
        return;
      }

      if (action === 'fullscreen') {
        const container = resolveContainer();
        if (!container) return;
        try {
          if (!document.fullscreenElement) {
            container.requestFullscreen?.();
          } else {
            document.exitFullscreen?.();
          }
        } catch (error) {
          logDiagramControlBridgeFailure('fullscreen', error);
        }
        return;
      }

      if (action === 'top') {
        pendingFits.forEach(pending => pending.abort());
        try {
          const container = resolveContainer();
          if (!container) {
            rf.fitView({ padding: 0.1, includeHiddenNodes: false, duration: 400, minZoom: 0.45, maxZoom: 1.15 });
            return;
          }

          const bounds = computeDiagramNodeBounds(rf.getNodes());
          if (!bounds) {
            rf.fitView({ padding: 0.1, includeHiddenNodes: false, duration: 400, minZoom: 0.45, maxZoom: 1.15 });
            return;
          }

          const viewportEl = (
            container.querySelector('.react-flow__renderer')
            ?? container.querySelector('.react-flow')
            ?? container
          ) as HTMLElement;
          const padding = 8;
          const rootStyle = getComputedStyle(document.documentElement);
          const safeLeft = coerceDiagramSidebarOffset(
            rootStyle.getPropertyValue('--left-sidebar-offset'),
            76,
          );
          const safeRight = coerceDiagramSidebarOffset(
            rootStyle.getPropertyValue('--right-sidebar-offset'),
          );
          const safeWidth = Math.max(1, viewportEl.clientWidth - safeLeft - safeRight - padding * 2);
          const zoom = Math.max(0.45, Math.min(1, safeWidth / bounds.width));
          const extraCenterX = Math.max(0, (safeWidth - bounds.width * zoom) / 2);
          const x = safeLeft + padding + extraCenterX - bounds.minX * zoom;
          const y = 84 + padding - bounds.minY * zoom;

          rf.setViewport({ x, y, zoom });
        } catch (error) {
          logDiagramControlBridgeFailure('top', error);
          rf.fitView({ padding: 0.1, includeHiddenNodes: false, duration: 400, minZoom: 0.45, maxZoom: 1.15 });
        }
        return;
      }
    };
    window.addEventListener('diagramControl', onControl as EventListener);
    return () => {
      window.removeEventListener('diagramControl', onControl as EventListener);
      pendingFits.forEach(pending => pending.abort());
      pendingFits.clear();
    };
  }, [diagramId, resolveContainer, rf, resolveSelfDiagramId, applyOverviewFit]);

  useEffect(() => {
    const activeFits = new Map<Event, AbortController>();
    const onLayoutCommitFitRequest = (event: Event) => {
      // Only the bridge mounted inside BaseReactFlow owns the exact semantic
      // zoom container. A page-level compatibility bridge must not claim this
      // awaited request before the canvas bridge sees it.
      const syncSemanticViewport = syncViewportSemanticState;
      if (!syncSemanticViewport) return;
      const inspected = inspectLayoutCommitFitRequest(event);
      if (!inspected) return;
      const idToMatch = resolveSelfDiagramId();
      if (idToMatch && inspected.diagramId !== idToMatch) return;
      if (!idToMatch && inspected.diagramId) return;
      const request = claimLayoutCommitFitRequest(event);
      if (!request) return;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal.addEventListener('abort', onAbort, { once: true });
      activeFits.set(event, controller);

      void (async () => {
        const container = resolveContainer();
        const applyFallback = async () => {
          const applied = await rf.fitView({
            padding: 24,
            includeHiddenNodes: false,
            duration: 0,
            minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM,
            maxZoom: 1.0,
          });
          if (!applied) throw new Error('layout-fit-not-applied');
        };

        try {
          const applied = await applyOverviewFit(container, controller.signal);
          resolveLayoutCommitFitRequest(event, applied ? 'applied' : 'failed');
        } catch (error) {
          if (controller.signal.aborted) {
            resolveLayoutCommitFitRequest(event, 'failed');
            return;
          }
          logDiagramControlBridgeFailure('fitFallback', error);
          try {
            await applyFallback();
            if (controller.signal.aborted) {
              resolveLayoutCommitFitRequest(event, 'failed');
              return;
            }
            syncSemanticViewport(rf.getViewport());
            const painted = await waitForDiagramControlViewportPaint({ signal: controller.signal });
            if (painted) syncSemanticViewport(rf.getViewport());
            resolveLayoutCommitFitRequest(event, painted ? 'applied' : 'failed');
          } catch (fallbackError) {
            if (!controller.signal.aborted) logDiagramControlBridgeFailure('fitFallback', fallbackError);
            resolveLayoutCommitFitRequest(event, 'failed');
          }
        } finally {
          request.signal.removeEventListener('abort', onAbort);
          activeFits.delete(event);
        }
      })();
    };

    window.addEventListener(DIAGRAM_CONTROL_REQUEST_EVENT, onLayoutCommitFitRequest);
    return () => {
      window.removeEventListener(DIAGRAM_CONTROL_REQUEST_EVENT, onLayoutCommitFitRequest);
      activeFits.forEach((controller, event) => {
        controller.abort();
        resolveLayoutCommitFitRequest(event, 'failed');
      });
      activeFits.clear();
    };
  }, [resolveContainer, resolveSelfDiagramId, applyOverviewFit, rf, syncViewportSemanticState]);

  return <span ref={markerRef} style={{ display: 'none' }} />;
};

export default DiagramControlBridge;
