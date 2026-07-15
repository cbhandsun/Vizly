import React, { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { clampDiagramFullFitZoom, MIN_DIAGRAM_FULL_FIT_ZOOM } from './diagramControlFit';
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
    if (rf) {
      (window as any).reactFlowInstance = rf;
    }
    return () => {
      if ((window as any).reactFlowInstance === rf) {
        delete (window as any).reactFlowInstance;
      }
    };
  }, [rf]);

  useEffect(() => {
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
          // 若无法解析到容器，退化为内置fitView
          if (!container) {
            rf.fitView({ padding: 24, includeHiddenNodes: false, duration: 450, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1.15 });
            return;
          }

          const nodes = rf.getNodes();
          if (!nodes || nodes.length === 0) {
            rf.fitView({ padding: 24, includeHiddenNodes: false, duration: 450, minZoom: MIN_DIAGRAM_FULL_FIT_ZOOM, maxZoom: 1.15 });
            return;
          }

          // 视口参考改为图表内容区，确保与用户可视空间一致
          const viewportEl = (container.querySelector('.react-flow') as HTMLElement | null) ?? container;

          // 计算内容包围盒（基于节点绝对位置与尺寸）
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;

          nodes.forEach((n) => {
            const w = (n.width as number) ?? (n.style?.width as number) ?? 220;
            const h = (n.height as number) ?? (n.style?.height as number) ?? 120;
            const abs = (n as any).positionAbsolute ?? (n as any).computed?.positionAbsolute;
            let xVal = abs?.x;
            let yVal = abs?.y;
            if (typeof xVal !== 'number' || isNaN(xVal) || !isFinite(xVal) || typeof yVal !== 'number' || isNaN(yVal) || !isFinite(yVal)) {
              let x = n.position?.x ?? 0;
              let y = n.position?.y ?? 0;
              let curr = n;
              while (curr.parentId) {
                const parent = nodes.find(pn => pn.id === curr.parentId);
                if (!parent) break;
                x += parent.position?.x ?? 0;
                y += parent.position?.y ?? 0;
                curr = parent;
              }
              xVal = x;
              yVal = y;
            }
            const x1 = xVal;
            const y1 = yVal;
            const x2 = x1 + w;
            const y2 = y1 + h;
            if (x1 < minX) minX = x1;
            if (y1 < minY) minY = y1;
            if (x2 > maxX) maxX = x2;
            if (y2 > maxY) maxY = y2;
          });

          const bboxWidth = Math.max(1, maxX - minX);
          const bboxHeight = Math.max(1, maxY - minY);

          // 获取实际的图表容器尺寸（去掉diagram-viewer的16px边距）
          const containerWidth = viewportEl.clientWidth - 32; // 减去左右16px边距
          const containerHeight = viewportEl.clientHeight - 32; // 减去上下16px边距

          // 图表内部使用较小的padding，避免贴边
          const padding = 8;

          const availW = Math.max(1, containerWidth - padding * 2);
          const availH = Math.max(1, containerHeight - padding * 2);

          const SAFE_TOP = 64;
          const SAFE_LEFT = 56;
          const SAFE_RIGHT = 380; // 右侧属性面板宽度
          const SAFE_BOTTOM = 64; // 底部控制栏高度
          const RULER_THICKNESS = 20;
          
          // 考虑标尺的物理厚度，确保图形不和标尺发生重叠
          const OVERALL_SAFE_TOP = SAFE_TOP + RULER_THICKNESS;
          const OVERALL_SAFE_LEFT = SAFE_LEFT + RULER_THICKNESS;

          // 计算缩放：按宽高都适配，取较小的缩放，限制上限
          // 我们在此减去了周围浮动面板的占用，保证有效画布严格对应“视觉可见区域”
          const safeAvailW = Math.max(1, availW - OVERALL_SAFE_LEFT - SAFE_RIGHT);
          const safeAvailH = Math.max(1, availH - OVERALL_SAFE_TOP - SAFE_BOTTOM);
          const rawZoomW = safeAvailW / bboxWidth;
          const rawZoomH = safeAvailH / bboxHeight;
          const rawZoom = Math.min(rawZoomW, rawZoomH);
          const zoom = clampDiagramFullFitZoom(rawZoom); // 使用 1.0 作为上限，避免图形放大后显得比系统 UI 字体突兀

          // 设计行业尖端实践 (Figma/Miro)：真实的绝对居中（水平居中 + 垂直居中）
          // 修正：如果触发了最小缩放防线，图形可能比容器大。为了避免顶部或左侧被切掉，必须保证 extraCenter 大于等于 0
          const extraCenterX = Math.max(0, (safeAvailW - bboxWidth * zoom) / 2);
          const extraCenterY = Math.max(0, (safeAvailH - bboxHeight * zoom) / 2);
          const x = OVERALL_SAFE_LEFT + padding + extraCenterX - (minX * zoom);
          const y = OVERALL_SAFE_TOP + padding + extraCenterY - (minY * zoom);

          rf.setViewport({ x, y, zoom }, { duration: 450 });

          // 二次微调：等待容器尺寸稳定后再次应用，提升稳定性
          setTimeout(() => {
            try {
              const cw = viewportEl.clientWidth;
              const ch = viewportEl.clientHeight;
              const pad = padding;
              const aw = Math.max(1, cw - pad * 2 - OVERALL_SAFE_LEFT - SAFE_RIGHT);
              const ah = Math.max(1, ch - pad * 2 - OVERALL_SAFE_TOP - SAFE_BOTTOM);
              const rzW = aw / bboxWidth;
              const rzH = ah / bboxHeight;
              const rz = Math.min(rzW, rzH);
              const z = clampDiagramFullFitZoom(rz);
              const xc = OVERALL_SAFE_LEFT + pad + Math.max(0, (aw - bboxWidth * z) / 2) - (minX * z);
              const yc = OVERALL_SAFE_TOP + pad + Math.max(0, (ah - bboxHeight * z) / 2) - (minY * z);
              rf.setViewport({ x: xc, y: yc, zoom: z });
            } catch (error) {
              logDiagramControlBridgeFailure('fitRefine', error);
            }
          }, 250);
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

          const nodes = rf.getNodes();
          if (!nodes || nodes.length === 0) {
            rf.fitView({ padding: 0.1, includeHiddenNodes: false, duration: 400, minZoom: 0.45, maxZoom: 1.15 });
            return;
          }

          // 使用 react-flow__renderer 作为画布的可视空间进行计算
          const reactFlowRenderer = container.querySelector('.react-flow__renderer') as HTMLElement;
          const viewportEl = reactFlowRenderer || container;

          // 计算内容包围盒（基于节点绝对位置与尺寸）
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;

          nodes.forEach((n) => {
            const w = (n.width as number) ?? (n.style?.width as number) ?? 220;
            const h = (n.height as number) ?? (n.style?.height as number) ?? 120;
            const abs = (n as any).positionAbsolute ?? (n as any).computed?.positionAbsolute;
            let xVal = abs?.x;
            let yVal = abs?.y;
            if (typeof xVal !== 'number' || isNaN(xVal) || !isFinite(xVal) || typeof yVal !== 'number' || isNaN(yVal) || !isFinite(yVal)) {
              let x = n.position?.x ?? 0;
              let y = n.position?.y ?? 0;
              let curr = n;
              while (curr.parentId) {
                const parent = nodes.find(pn => pn.id === curr.parentId);
                if (!parent) break;
                x += parent.position?.x ?? 0;
                y += parent.position?.y ?? 0;
                curr = parent;
              }
              xVal = x;
              yVal = y;
            }
            const x1 = xVal;
            const y1 = yVal;
            const x2 = x1 + w;
            const y2 = y1 + h;
            if (x1 < minX) minX = x1;
            if (y1 < minY) minY = y1;
            if (x2 > maxX) maxX = x2;
            if (y2 > maxY) maxY = y2;
          });

          const bboxWidth = Math.max(1, maxX - minX);
          const _bboxHeight = Math.max(1, maxY - minY);

          // 使用实际的 react-flow__renderer 画布尺寸
          // 获取实际的图表容器尺寸（去掉diagram-viewer的16px边距）
          const containerWidth = viewportEl.clientWidth - 32; // 减去左右16px边距
          const _containerHeight = viewportEl.clientHeight - 32; // 减去上下16px边距

          // 图表内部使用较小的padding，避免贴边
          const padding = 8;
          const SAFE_TOP = 64;
          const SAFE_LEFT = 56;
          const SAFE_RIGHT = 380; // 右侧属性面板宽度
          const RULER_THICKNESS = 20;

          // 考虑标尺物理厚度
          const OVERALL_SAFE_TOP = SAFE_TOP + RULER_THICKNESS;
          const OVERALL_SAFE_LEFT = SAFE_LEFT + RULER_THICKNESS;

          // 计算按宽度适配的缩放比，并顶端对齐，限制上限为 1.0，并根据节点数动态限制最小缩放防线
          const safeAvailW = Math.max(1, containerWidth - OVERALL_SAFE_LEFT - SAFE_RIGHT);
          const MIN_FIT_ZOOM = 0.45;
          const zoom = Math.max(MIN_FIT_ZOOM, Math.min(1.0, safeAvailW / bboxWidth));
          const extraCenterX = Math.max(0, (safeAvailW - bboxWidth * zoom) / 2);
          const x = OVERALL_SAFE_LEFT + padding + extraCenterX - (minX * zoom);
          const y = OVERALL_SAFE_TOP + padding - (minY * zoom);

          rf.setViewport({ x, y, zoom });
        } catch (error) {
          logDiagramControlBridgeFailure('top', error);
          rf.fitView({ padding: 0.1, includeHiddenNodes: false, duration: 400, minZoom: 0.45, maxZoom: 1.15 });
        }
        return;
      }
    };
    window.addEventListener('diagramControl', onControl as EventListener);
    return () => window.removeEventListener('diagramControl', onControl as EventListener);
  }, [diagramId, rf, resolveSelfDiagramId]);

  return <span ref={markerRef} style={{ display: 'none' }} />;
};

export default DiagramControlBridge;
