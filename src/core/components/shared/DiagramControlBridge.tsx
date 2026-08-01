import React, { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  coerceDiagramSidebarOffset,
  computeDiagramFitViewport,
  MIN_DIAGRAM_FULL_FIT_ZOOM,
  resolveDiagramFitLayout,
} from './diagramControlFit';
import { computeDiagramNodeBounds } from './diagramNodeBounds';
import { logDiagramControlBridgeFailure } from './diagramControlLogging';

interface DiagramControlBridgeProps {
  diagramId?: string;
}

// 统一桥接：监听标题栏/外层触发的视图控制事件，并作用于当前图的 ReactFlow 实例
const DiagramControlBridge: React.FC<DiagramControlBridgeProps> = ({ diagramId }) => {
  const rf = useReactFlow();
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
    const pendingTimeouts = new Set<number>();

    const onControl = (e: Event) => {
      const { action, diagramId: targetId } = (e as CustomEvent).detail || {};
      const idToMatch = resolveSelfDiagramId();
      if (!action) return;
      if (idToMatch && targetId !== idToMatch) return;
      if (!idToMatch && targetId) return;

      const resolveContainer = (): HTMLElement | null => {
        const id = resolveSelfDiagramId();
        if (id) {
          const byId = document.getElementById(`diagram-${id}`);
          if (byId) {
            // 优先选择最外层图表容器，以便全屏包含覆盖的按钮等元素
            const containerAncestor = byId.closest('.diagram-container');
            if (containerAncestor) return containerAncestor as HTMLElement;
            const previewAncestor = byId.closest('.diagram-preview-container');
            if (previewAncestor) return previewAncestor as HTMLElement;
            return byId;
          }
        }
        // 兜底：向上寻找最近的 react-flow 根元素
        let cur = markerRef.current?.parentElement || null;
        let depth = 0;
        while (cur && depth < 10) {
          if (cur.id?.startsWith('diagram-')) return cur;
          if (cur.classList?.contains('react-flow')) return cur;
          cur = cur.parentElement;
          depth++;
        }
        return null;
      };

      if (action === 'fit') {
        try {
          const container = resolveContainer();
          if (!container) {
            rf.fitView({ padding: 24, includeHiddenNodes: false, duration: 450, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1.15 });
            return;
          }

          const bounds = computeDiagramNodeBounds(rf.getNodes());
          if (!bounds) {
            rf.fitView({ padding: 24, includeHiddenNodes: false, duration: 450, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1.15 });
            return;
          }

          const viewportEl = (
            container.querySelector('.react-flow__renderer')
            ?? container.querySelector('.react-flow')
            ?? container
          ) as HTMLElement;
          const applyViewport = (duration?: number) => {
            const rootStyle = getComputedStyle(document.documentElement);
            const fitLayout = resolveDiagramFitLayout({
              viewportWidth: viewportEl.clientWidth,
              leftSidebarOffset: rootStyle.getPropertyValue('--left-sidebar-offset'),
              rightSidebarOffset: rootStyle.getPropertyValue('--right-sidebar-offset'),
            });
            const viewport = computeDiagramFitViewport({
              bounds,
              viewportWidth: viewportEl.clientWidth,
              viewportHeight: viewportEl.clientHeight,
              safeArea: fitLayout.safeArea,
              padding: fitLayout.padding,
            });
            if (!viewport) {
              rf.fitView({ padding: 24, includeHiddenNodes: false, duration, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1 });
              return;
            }
            rf.setViewport(viewport, duration ? { duration } : undefined);
          };

          applyViewport(450);
          const timeoutId = window.setTimeout(() => {
            pendingTimeouts.delete(timeoutId);
            try {
              applyViewport();
            } catch (error) {
              logDiagramControlBridgeFailure('fitRefine', error);
            }
          }, 250);
          pendingTimeouts.add(timeoutId);
        } catch (error) {
          logDiagramControlBridgeFailure('fitFallback', error);
          try {
            rf.fitView({ padding: 24, includeHiddenNodes: false, duration: 450, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1.0 });
          } catch (fallbackError) {
            logDiagramControlBridgeFailure('fitFallback', fallbackError);
          }
        }
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
      pendingTimeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
      pendingTimeouts.clear();
    };
  }, [diagramId, rf, resolveSelfDiagramId]);

  return <span ref={markerRef} style={{ display: 'none' }} />;
};

export default DiagramControlBridge;
