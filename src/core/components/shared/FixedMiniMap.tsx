import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useReactFlow, type Node } from '@xyflow/react';
import { extractValidNumber } from '../../utils/nodeValidation';
import { useConfigIntegration } from '../../hooks/useConfigIntegration';
import { getDomainTheme } from '../../utils/domainKey';
import { hexToRgba } from '../shared/layoutUtils';
import { subscribeViewport, getUiScale, type Viewport } from './viewportStore';
import { FaGripVertical } from 'react-icons/fa';
import './FixedMiniMap.css';

import { MinimapCollapseControl } from './MinimapCollapseControl';

import { safeNumber } from './hooks/useMinimapMath';
import { useMinimapOverlay } from './hooks/useMinimapOverlay';
import { useMinimapNavigation } from './hooks/useMinimapNavigation';
import type { Theme } from '../../themes/types/ThemeTypes';
import { logFixedMiniMapFailure } from './fixedMiniMapLogging';
import {
  resolveFixedMiniMapMessage,
  shouldFreezeFixedMiniMapDuringNodeDrag,
  type FixedMiniMapMessage,
} from './fixedMiniMapState';
import {
  resolveFixedMiniMapBottom,
  type ReservedBottomArea,
} from './fixedMiniMapPlacement';

interface FixedMiniMapProps {
  nodes: MinimapNode[];
  isNodeDragging: boolean;
  style?: React.CSSProperties;
  zoomable?: boolean;
  pannable?: boolean;
  defaultSize?: 'small' | 'medium' | 'large';
}

type MinimapNodeData = {
  domainClass?: unknown;
  domain?: unknown;
  label?: unknown;
  description?: unknown;
};

type MinimapNode = Node<MinimapNodeData>;

const readReservedBottomArea = (): ReservedBottomArea | null => {
  if (typeof document === 'undefined') return null;
  const pageTabs = document.querySelector<HTMLElement>('.page-tabs');
  if (!pageTabs) return null;
  const rect = pageTabs.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top };
};

const getNodeWidth = (node: MinimapNode): number => (
  extractValidNumber(node.measured?.width ?? node.width ?? node.style?.width, 200)
);

const getNodeHeight = (node: MinimapNode): number => (
  extractValidNumber(node.measured?.height ?? node.height ?? node.style?.height, 100)
);

const getNodeAbsolutePosition = (node: MinimapNode, nodeMap: Map<string, MinimapNode>): { x: number; y: number } => {
  let x = safeNumber(node.position?.x, 0);
  let y = safeNumber(node.position?.y, 0);
  let current: MinimapNode | undefined = node;
  let guard = 0;
  while (current?.parentId && guard < 20) {
    guard += 1;
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += safeNumber(parent.position?.x, 0);
    y += safeNumber(parent.position?.y, 0);
    current = parent;
  }
  return { x, y };
};

const getStringValue = (value: unknown): string | undefined => (
  typeof value === 'string' ? value : undefined
);

const FixedMiniMap: React.FC<FixedMiniMapProps> = ({
  nodes,
  isNodeDragging,
  style,
  zoomable = true,
  defaultSize = 'large'
}) => {
  const { t } = useTranslation();
  // 接入主题系统
  const [cfgState, cfgActions] = useConfigIntegration({ autoInitialize: true });
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(() => cfgActions.getCurrentTheme() ?? null);
  useEffect(() => {
    if (!cfgState.integration) return;
    const tm = cfgState.integration.getThemeManager?.();
    if (!tm) return;
    let cancelled = false;
    const t = tm.getCurrentTheme?.();
    if (t) {
      queueMicrotask(() => {
        if (!cancelled) setCurrentTheme(t);
      });
    }
    const unsubscribe = tm.addThemeChangeListener?.((newTheme) => {
      if (!cancelled) setCurrentTheme(newTheme ?? null);
    });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [cfgState.integration]);

  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const [minimapElement, setMinimapElement] = useState<HTMLDivElement | null>(null);
  const setMinimapRef = useCallback((node: HTMLDivElement | null) => {
    minimapRef.current = node;
    setMinimapElement(node);
  }, []);
  const anchorRef = useRef<HTMLDivElement>(null);

  const reactFlowInstance = useReactFlow<MinimapNode>();
  const renderMiniMapMessage = (message: Exclude<FixedMiniMapMessage, null>) => (
    <div style={{
      width: '100%', height: '100%', backgroundColor: 'transparent',
      borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', color: 'var(--color-slate-500, rgba(0,0,0,0.5))',
      pointerEvents: 'none'
    }}>
      {message === 'empty'
        ? t('designer.toolbar.minimapEmpty', 'No nodes on the canvas')
        : t('designer.toolbar.minimapLoading', 'Preparing minimap…')}
    </div>
  );

  // Overlay interactions controller
  const overlay = useMinimapOverlay(defaultSize, containerRef);
  
  // 缓存画布容器的 Bound 用于计算 Portal 绝对位置
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [canvasPixelSize, setCanvasPixelSize] = useState({ width: 800, height: 600 });
  const [reservedBottomArea, setReservedBottomArea] = useState<ReservedBottomArea | null>(readReservedBottomArea);

  useEffect(() => {
    const pageTabs = document.querySelector<HTMLElement>('.page-tabs');
    if (!pageTabs) return;

    const updateReservedArea = () => {
      const rect = pageTabs.getBoundingClientRect();
      setReservedBottomArea({ left: rect.left, right: rect.right, top: rect.top });
    };

    const resizeObserver = new ResizeObserver(updateReservedArea);
    resizeObserver.observe(pageTabs);
    window.addEventListener('resize', updateReservedArea);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateReservedArea);
    };
  }, []);

  // 订阅视口变化以驱动 minimap 缩略图矩形的实时更新
  const [viewportForRender, setViewportForRender] = useState<Viewport>(reactFlowInstance.getViewport());
  useEffect(() => {
    const unsubscribe = subscribeViewport((vp) => setViewportForRender(vp));
    return () => { if (unsubscribe) unsubscribe(); };
  }, []); // 移除 reactFlowInstance 依赖

  // MiniMap 渲染就绪状态
  const miniMapReady = useMemo(() => {
    if (!nodes.length) return true;
    let validCount = 0;
    for (const node of nodes) {
      const width = getNodeWidth(node);
      const height = getNodeHeight(node);
      const x = safeNumber(node.position?.x, NaN);
      const y = safeNumber(node.position?.y, NaN);
      if (width > 0 && height > 0 && isFinite(x) && isFinite(y)) {
        validCount++;
      }
    }
    const threshold = Math.max(1, Math.ceil(nodes.length * 0.3));
    return validCount >= threshold;
  }, [nodes]);

  // Navigation controller
  const nav = useMinimapNavigation(anchorRef, minimapRef, viewportForRender, getUiScale);
  const setOverlayOffset = overlay.setOffset;

  // 全局鼠标移动处理 - Container overlay
  useEffect(() => {
    if (!overlay.isDragging) return;
    const move = (e: MouseEvent) => overlay.handleMouseMove(e);
    const up = () => overlay.handleMouseUp(nav.cancelViewportAnimation);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [overlay, nav]);

  // 全局鼠标移动处理 - Canvas navigation
  useEffect(() => {
    if (!nav.isMinimapDragging) return;
    const move = (e: MouseEvent) => nav.handleMinimapMouseMove(e);
    const up = () => nav.handleMinimapMouseUp();
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [nav]);

  // 原生轮播放大
  useEffect(() => {
    const el = minimapElement;
    if (!el || !zoomable) return;
    const wheelHandler = (ev: WheelEvent) => nav.handleMiniMapWheel(ev);
    try {
      el.addEventListener('wheel', wheelHandler, { passive: false });
    } catch (error) {
      logFixedMiniMapFailure('bindWheelHandlerPassive', error);
      el.addEventListener('wheel', wheelHandler);
    }
    return () => {
      try {
        el.removeEventListener('wheel', wheelHandler);
      } catch (error) {
        logFixedMiniMapFailure('unbindWheelHandler', error);
      }
    };
  }, [minimapElement, zoomable, nav]);

  // 动态调整 Portal 位置，根据 container 边界变化实时更新 containerRect 缓存
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const container = anchor.closest('.react-flow') || anchor.offsetParent;
    if (!container) return;

    const updatePosition = () => {
      const rect = container.getBoundingClientRect();
      setContainerRect(rect);
      const rfRoot = anchor.closest('.react-flow') as HTMLElement | null;
      const rendererEl = (rfRoot?.querySelector?.('.react-flow__renderer') as HTMLElement | null) || rfRoot;
      if (rendererEl) {
        setCanvasPixelSize({
          width: Math.max(1, rendererEl.clientWidth || 800),
          height: Math.max(1, rendererEl.clientHeight || 600),
        });
      }

      // 如果容器尺寸收缩，自动纠正溢出边界的 relative offset
      setOverlayOffset(prev => {
        const getParentSize = () => {
          const parent = (container as HTMLElement).offsetParent as HTMLElement | null;
          if (parent) return { width: parent.clientWidth, height: parent.clientHeight };
          return { width: window.innerWidth, height: window.innerHeight };
        };
        const { width: parentWidth, height: parentHeight } = getParentSize();
        const miniMapRect = containerRef.current?.getBoundingClientRect();
        const containerWidth = miniMapRect?.width || 240;
        const containerHeight = miniMapRect?.height || 180;

        const maxLeft = Math.max(10, parentWidth - containerWidth - 10);
        const maxBottom = Math.max(10, parentHeight - containerHeight - 10);

        const nextLeft = Math.max(10, Math.min(prev.left, maxLeft));
        const nextBottom = Math.max(10, Math.min(prev.bottom, maxBottom));

        if (nextLeft !== prev.left || nextBottom !== prev.bottom) {
          return { left: nextLeft, bottom: nextBottom };
        }
        return prev;
      });
    };

    updatePosition();
    const ro = new ResizeObserver(updatePosition);
    ro.observe(container);
    window.addEventListener('resize', updatePosition);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [setOverlayOffset]);

  const sizeConfigs = {
    small: { width: 160, height: 120 },
    medium: { width: 200, height: 150 },
    large: { width: 240, height: 180 }
  };

  const currentSizeConfig = sizeConfigs[overlay.currentSize];
  const minimapWidth = extractValidNumber(style?.width, currentSizeConfig.width) - 4;
  const minimapHeight = extractValidNumber(style?.height, currentSizeConfig.height) - 32;

  // 通过 containerRect 与 container-relative offset 动态算出绝对的 screen 位置
  const absoluteLeft = containerRect 
    ? containerRect.left + overlay.offset.left 
    : 24;
  const absoluteBottom = containerRect 
    ? (window.innerHeight - containerRect.bottom) + overlay.offset.bottom 
    : 76;
  const resolvedBottom = resolveFixedMiniMapBottom({
    baseBottom: absoluteBottom,
    absoluteLeft,
    width: overlay.isMinimized ? 44 : currentSizeConfig.width,
    viewportHeight: window.innerHeight,
    reservedArea: reservedBottomArea,
  });

  const containerStyle: React.CSSProperties = {
    bottom: `${resolvedBottom}px`,
    left: `${absoluteLeft}px`,
    width: overlay.isMinimized ? '44px' : `${currentSizeConfig.width}px`,
    height: overlay.isMinimized ? '44px' : `${currentSizeConfig.height}px`,
    ...style
  };

  return (
    <>
      <div ref={anchorRef} style={{ display: 'none' }} />
      {createPortal(
        <div
          ref={containerRef}
          className={`fixed-minimap-container ${overlay.isMinimized ? 'minimized' : ''} ${overlay.isDragging ? 'dragging' : ''} ${isNodeDragging ? 'drag-frozen' : ''}`}
          style={containerStyle}
          onMouseDown={!overlay.isMinimized ? (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.minimap-drag-handle')) {
              overlay.handleDragStart(e, nav.cancelViewportAnimation);
            }
          } : undefined}
        >
          <MinimapCollapseControl
            expandLabel={t('designer.toolbar.expandMinimap', 'Expand minimap')}
            isMinimized={overlay.isMinimized}
            minimizeLabel={t('designer.toolbar.minimizeMinimap', 'Minimize minimap')}
            onToggle={overlay.toggleMinimize}
          />
          {!overlay.isMinimized && (
            <>
              <div className="minimap-drag-handle" title={t('designer.toolbar.dragMinimap')}>
                <FaGripVertical className="minimap-drag-icon" />
              </div>

              <div
                ref={setMinimapRef}
                style={{
                  position: 'absolute', top: '44px', left: '2px', right: '2px', bottom: '2px',
                  pointerEvents: 'auto', cursor: nav.isMinimapDragging ? 'grabbing' : 'crosshair'
                }}
                onClick={(e) => nav.handleMiniMapClick(e, overlay.isDragging)}
                onMouseDown={nav.handleMinimapMouseDown}
              >
                {miniMapReady && minimapElement ? (
                  (() => {
                    // [FIX] Build a lookup map and compute absolute positions by walking
                    // the parentId chain. internals.positionAbsolute is null at this
                    // call-site (getNodes() returns the external node array without
                    // internal resolution), so we must accumulate manually.
                    const nodeMap = new Map<string, MinimapNode>();
                    nodes.forEach(n => nodeMap.set(n.id, n));

                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    nodes.forEach(n => {
                      const abs = getNodeAbsolutePosition(n, nodeMap);
                      const w = getNodeWidth(n);
                      const h = getNodeHeight(n);
                      if (isFinite(abs.x) && isFinite(abs.y) && w > 0 && h > 0) {
                        minX = Math.min(minX, abs.x); minY = Math.min(minY, abs.y);
                        maxX = Math.max(maxX, abs.x + w); maxY = Math.max(maxY, abs.y + h);
                      }
                    });
                    const hasBounds = minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity;
                    const message = resolveFixedMiniMapMessage({
                      ready: miniMapReady,
                      nodeCount: nodes.length,
                      hasBounds,
                    });
                    if (message) {
                      return renderMiniMapMessage(message);
                    }
                    const viewport = viewportForRender;
                    const renderUiScale = getUiScale();
                    const visiblePixelWidth = Math.max(1, canvasPixelSize.width / renderUiScale);
                    const visiblePixelHeight = Math.max(1, canvasPixelSize.height / renderUiScale);
                    const zoom = safeNumber(viewport.zoom, 1);
                    const vxWorld = -safeNumber(viewport.x, 0) / zoom;
                    const vyWorld = -safeNumber(viewport.y, 0) / zoom;
                    const vWidthWorld = visiblePixelWidth / zoom;
                    const vHeightWorld = visiblePixelHeight / zoom;

                    const unionMinX = Math.min(minX, vxWorld);
                    const unionMinY = Math.min(minY, vyWorld);
                    const unionMaxX = Math.max(maxX, vxWorld + vWidthWorld);
                    const unionMaxY = Math.max(maxY, vyWorld + vHeightWorld);
                    const totalWidth = Math.max(1, safeNumber(unionMaxX - unionMinX, 1));
                    const totalHeight = Math.max(1, safeNumber(unionMaxY - unionMinY, 1));
                    const scaleX = minimapWidth / totalWidth;
                    const scaleY = minimapHeight / totalHeight;

                    const vx = (vxWorld - unionMinX) * scaleX;
                    const vy = (vyWorld - unionMinY) * scaleY;
                    const vWidth = vWidthWorld * scaleX;
                    const vHeight = vHeightWorld * scaleY;
                    const vxClamped = Math.max(0, vx);
                    const vyClamped = Math.max(0, vy);
                    const vWidthClamped = Math.max(1, Math.min(vWidth, minimapWidth - vxClamped));
                    const vHeightClamped = Math.max(1, Math.min(vHeight, minimapHeight - vyClamped));
                    return (
                      <svg width={minimapWidth} height={minimapHeight} style={{ display: 'block' }}>
                        {(() => {
                          const primary = String(currentTheme?.palette?.primary?.main || '#667EEA');
                          return (
                            <defs>
                              <filter id="minimapViewportShadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx={0} dy={1} stdDeviation={1.2} floodColor={primary} floodOpacity={0.25} />
                              </filter>
                            </defs>
                          );
                        })()}
                        <rect x={0} y={0} width={minimapWidth} height={minimapHeight} fill="var(--glass-bg, rgba(255, 255, 255, 0.45))" />
                        {nodes.map((n, idx) => {
                          // Use the same getAbsPos helper for consistent positioning
                          const abs = getNodeAbsolutePosition(n, nodeMap);
                          const x = abs.x;
                          const y = abs.y;
                          const w = getNodeWidth(n);
                          const h = getNodeHeight(n);
                          if (!isFinite(x) || !isFinite(y) || w <= 0 || h <= 0) return null;
                          const mx = (x - unionMinX) * scaleX;
                          const my = (y - unionMinY) * scaleY;
                          const mw = w * scaleX;
                          const mh = h * scaleY;
                          const domainClass = getStringValue(n.data?.domainClass);
                          const domainKey = getStringValue(n.data?.domain) ?? getStringValue(n.data?.label);
                          const description = getStringValue(n.data?.description);
                          const domainTheme = getDomainTheme(currentTheme, { domainClass, domain: domainKey || 'default', description });
                          const isTitleGroup = n.type === 'titleGroup';
                          const isSubGroup = n.type === 'subGroup';
                          const baseAlpha = isTitleGroup || isSubGroup ? (overlay.currentSize === 'small' ? 0.20 : overlay.currentSize === 'medium' ? 0.24 : 0.28) : (overlay.currentSize === 'small' ? 0.28 : overlay.currentSize === 'medium' ? 0.32 : 0.36);
                          const strokeAlpha = overlay.currentSize === 'small' ? 0.18 : overlay.currentSize === 'medium' ? 0.20 : 0.22;
                          const fill = hexToRgba(String(domainTheme?.main || domainTheme?.border || '#8a8a8a'), baseAlpha);
                          const stroke = hexToRgba(String(domainTheme?.border || domainTheme?.main || '#8a8a8a'), strokeAlpha);
                          return <rect key={n.id ?? idx} x={mx} y={my} width={mw} height={mh} fill={fill} stroke={stroke} strokeWidth={safeNumber(overlay.currentSize === 'small' ? 1 : overlay.currentSize === 'medium' ? 1.5 : 2, 1)} />;
                        })}
                        {(() => {
                          const primary = String(currentTheme?.palette?.primary?.main || '#667EEA');
                          const primaryBorder = String(currentTheme?.palette?.primary?.border || primary);
                          const fillAlpha = overlay.currentSize === 'small' ? 0.18 : overlay.currentSize === 'medium' ? 0.14 : 0.12;
                          const strokeAlpha = 0.38;
                          const rx = overlay.currentSize === 'small' ? 3 : overlay.currentSize === 'medium' ? 3.5 : 4;
                          return (
                            <rect x={vxClamped} y={vyClamped} width={vWidthClamped} height={vHeightClamped} rx={rx} ry={rx}
                              fill={hexToRgba(primary, fillAlpha)} stroke={hexToRgba(primaryBorder, strokeAlpha)} strokeWidth={1} filter="url(#minimapViewportShadow)" />
                          );
                        })()}
                      </svg>
                    );
                  })()
                ) : (
                  renderMiniMapMessage('loading')
                )}
              </div>
            </>
          )}
        </div>
        , (document.fullscreenElement as HTMLElement | null) || document.body
      )}
    </>
  );
};

const areFixedMiniMapPropsEqual = (
  previous: FixedMiniMapProps,
  next: FixedMiniMapProps,
): boolean => {
  if (shouldFreezeFixedMiniMapDuringNodeDrag({
    wasDragging: previous.isNodeDragging,
    isDragging: next.isNodeDragging,
  })) {
    return true;
  }
  return previous.nodes === next.nodes
    && previous.isNodeDragging === next.isNodeDragging
    && previous.style === next.style
    && previous.zoomable === next.zoomable
    && previous.pannable === next.pannable
    && previous.defaultSize === next.defaultSize;
};

export default React.memo(FixedMiniMap, areFixedMiniMapPropsEqual);
