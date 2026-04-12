// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useReactFlow } from '@xyflow/react';
import { extractValidNumber } from '../../utils/nodeValidation';
import { useConfigIntegration } from '../../hooks/useConfigIntegration';
import { getDomainTheme } from '../../utils/domainKey';
import { hexToRgba } from '../shared/layoutUtils';
import { subscribeViewport, getUiScale } from './viewportStore';
import { FaExpand, FaCompress, FaGripVertical } from 'react-icons/fa';
import './FixedMiniMap.css';

import { safeNumber } from './hooks/useMinimapMath';
import { useMinimapOverlay } from './hooks/useMinimapOverlay';
import { useMinimapNavigation } from './hooks/useMinimapNavigation';

interface FixedMiniMapProps {
  style?: React.CSSProperties;
  zoomable?: boolean;
  pannable?: boolean;
  defaultSize?: 'small' | 'medium' | 'large';
}

const FixedMiniMap: React.FC<FixedMiniMapProps> = ({
  style,
  zoomable = true,
  pannable = true,
  defaultSize = 'large'
}) => {
  // 接入主题系统
  const [cfgState, cfgActions] = useConfigIntegration({ autoInitialize: true });
  const [currentTheme, setCurrentTheme] = useState<any>(cfgActions.getCurrentTheme());
  useEffect(() => {
    if (!cfgState.integration) return;
    const tm = cfgState.integration.getThemeManager?.();
    if (!tm) return;
    const t = tm.getCurrentTheme?.();
    if (t) setCurrentTheme(t);
    const unsubscribe = tm.addThemeChangeListener?.((newTheme: any) => setCurrentTheme(newTheme));
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [cfgState.integration]);

  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const reactFlowInstance = useReactFlow();

  // Overlay interactions controller
  const overlay = useMinimapOverlay(defaultSize, containerRef);

  // 订阅视口变化以驱动 minimap 缩略图矩形的实时更新
  const [viewportForRender, setViewportForRender] = useState<{ x: number; y: number; zoom: number }>(reactFlowInstance.getViewport());
  useEffect(() => {
    const unsubscribe = subscribeViewport((vp) => setViewportForRender(vp));
    return () => { if (unsubscribe) unsubscribe(); };
  }, []); // 移除 reactFlowInstance 依赖

  // MiniMap 渲染就绪状态
  const [miniMapReady, setMiniMapReady] = useState(false);
  useEffect(() => {
    let stopped = false;
    const check = () => {
      if (stopped) return;
      const nodes = reactFlowInstance.getNodes?.() || [];
      if (!nodes.length) {
        requestAnimationFrame(check);
        return;
      }
      let validCount = 0;
      for (const node of nodes) {
        const width = extractValidNumber((node as any).width ?? (node as any).measured?.width ?? (node as any).style?.width, 200);
        const height = extractValidNumber((node as any).height ?? (node as any).measured?.height ?? (node as any).style?.height, 100);
        const x = safeNumber(node.position?.x, NaN);
        const y = safeNumber(node.position?.y, NaN);
        if (width > 0 && height > 0 && isFinite(x) && isFinite(y)) {
          validCount++;
        }
      }
      const threshold = Math.max(1, Math.ceil(nodes.length * 0.3));
      if (validCount >= threshold) {
        setMiniMapReady(true);
        stopped = true;
        return;
      }
      requestAnimationFrame(check);
    };
    check();
    return () => { stopped = true; };
  }, []); // 移除 reactFlowInstance 依赖

  // Navigation controller
  const nav = useMinimapNavigation(anchorRef, minimapRef, viewportForRender, getUiScale);

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
    const el = minimapRef.current;
    if (!el || !zoomable) return;
    const wheelHandler = (ev: WheelEvent) => nav.handleMiniMapWheel(ev);
    try {
      el.addEventListener('wheel', wheelHandler, { passive: false });
    } catch {
      el.addEventListener('wheel', wheelHandler as any);
    }
    return () => {
      try { el.removeEventListener('wheel', wheelHandler); } catch { return; }
    };
  }, [zoomable, nav]);

  // 动态调整 Portal 位置
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const container = anchor.closest('.react-flow') || anchor.offsetParent;
    if (!container) return;

    const updatePosition = () => {
      const rect = container.getBoundingClientRect();
      const distLeft = rect.left + 24;
      const distBottom = window.innerHeight - rect.bottom + 76;

      overlay.setPosition(prev => {
        if (Math.abs(prev.left - distLeft) > 1 || Math.abs(prev.bottom - distBottom) > 1) {
          return { left: Math.max(10, distLeft), bottom: Math.max(10, distBottom) };
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
  }, [overlay.setPosition]);

  const sizeConfigs = {
    small: { width: 160, height: 120 },
    medium: { width: 200, height: 150 },
    large: { width: 240, height: 180 }
  };

  const containerStyle: React.CSSProperties = {
    bottom: `${overlay.position.bottom}px`,
    left: `${overlay.position.left}px`,
    width: overlay.isMinimized ? '44px' : `${sizeConfigs[overlay.currentSize].width}px`,
    height: overlay.isMinimized ? '44px' : `${sizeConfigs[overlay.currentSize].height}px`,
    ...style
  };

  return (
    <>
      <div ref={anchorRef} style={{ display: 'none' }} />
      {createPortal(
        <div
          ref={containerRef}
          className={`fixed-minimap-container ${overlay.isMinimized ? 'minimized' : ''} ${overlay.isDragging ? 'dragging' : ''}`}
          style={containerStyle}
          onClick={overlay.isMinimized ? overlay.toggleMinimize : undefined}
          onMouseDown={!overlay.isMinimized ? (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.minimap-drag-handle')) {
              overlay.handleDragStart(e, nav.cancelViewportAnimation);
            }
          } : undefined}
        >
          {overlay.isMinimized ? (
            <span title="展开缩略图" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>
              <FaExpand />
            </span>
          ) : (
            <>
              <div className="minimap-drag-handle" title="拖拽移动缩略图">
                <FaGripVertical className="minimap-drag-icon" />
              </div>
              <div
                className="minimap-controls"
                style={{
                  position: 'absolute', top: '4px', right: '4px',
                  display: 'flex', gap: '4px', zIndex: 30, pointerEvents: 'auto'
                }}
              >
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); overlay.toggleMinimize(); }}
                  title="最小化小地图"
                  className="minimap-control-btn"
                  style={{ borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--color-slate-400)', boxShadow: 'none' }}
                  type="button"
                >
                  <FaCompress />
                </button>
              </div>

              <div
                ref={minimapRef}
                style={{
                  position: 'absolute', top: '30px', left: '2px', right: '2px', bottom: '2px',
                  pointerEvents: 'auto', cursor: nav.isMinimapDragging ? 'grabbing' : 'crosshair'
                }}
                onClick={(e) => nav.handleMiniMapClick(e, overlay.isDragging)}
                onMouseDown={nav.handleMinimapMouseDown}
              >
                {miniMapReady && minimapRef.current ? (
                  (() => {
                    const nodes = reactFlowInstance.getNodes();
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    nodes.forEach(n => {
                      const x = safeNumber(n.position?.x, 0);
                      const y = safeNumber(n.position?.y, 0);
                      const w = extractValidNumber((n as any).measured?.width ?? (n as any).width ?? (n as any).style?.width, 200);
                      const h = extractValidNumber((n as any).measured?.height ?? (n as any).height ?? (n as any).style?.height, 100);
                      if (isFinite(x) && isFinite(y) && w > 0 && h > 0) {
                        minX = Math.min(minX, x); minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
                      }
                    });
                    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
                      return (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          backgroundColor: 'transparent', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
                          fontSize: 11, color: 'var(--color-slate-500, rgba(0,0,0,0.5))', pointerEvents: 'none'
                        }}>初始化缩略图…</div>
                      );
                    }
                    const rect = minimapRef.current.getBoundingClientRect();
                    const viewport = viewportForRender;
                    const rfRoot = (anchorRef.current?.closest?.('.react-flow') as HTMLElement | null) || (document.querySelector('.react-flow') as HTMLElement | null);
                    const rendererEl = (rfRoot?.querySelector?.('.react-flow__renderer') as HTMLElement | null) || rfRoot;
                    const baseWidth = rendererEl?.clientWidth ?? rect.width;
                    const baseHeight = rendererEl?.clientHeight ?? rect.height;
                    const renderUiScale = getUiScale();
                    const visiblePixelWidth = Math.max(1, baseWidth / renderUiScale);
                    const visiblePixelHeight = Math.max(1, baseHeight / renderUiScale);
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
                    const scaleX = rect.width / totalWidth;
                    const scaleY = rect.height / totalHeight;

                    const vx = (vxWorld - unionMinX) * scaleX;
                    const vy = (vyWorld - unionMinY) * scaleY;
                    const vWidth = vWidthWorld * scaleX;
                    const vHeight = vHeightWorld * scaleY;
                    const vxClamped = Math.max(0, vx);
                    const vyClamped = Math.max(0, vy);
                    const vWidthClamped = Math.max(1, Math.min(vWidth, rect.width - vxClamped));
                    const vHeightClamped = Math.max(1, Math.min(vHeight, rect.height - vyClamped));
                    return (
                      <svg width={rect.width} height={rect.height} style={{ display: 'block' }}>
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
                        <rect x={0} y={0} width={rect.width} height={rect.height} fill="var(--glass-bg, rgba(255, 255, 255, 0.45))" />
                        {nodes.map((n, idx) => {
                          const x = safeNumber(n.position?.x, 0);
                          const y = safeNumber(n.position?.y, 0);
                          const w = extractValidNumber((n as any).measured?.width ?? (n as any).width ?? (n as any).style?.width, 200);
                          const h = extractValidNumber((n as any).measured?.height ?? (n as any).height ?? (n as any).style?.height, 100);
                          if (!isFinite(x) || !isFinite(y) || w <= 0 || h <= 0) return null;
                          const mx = (x - unionMinX) * scaleX;
                          const my = (y - unionMinY) * scaleY;
                          const mw = w * scaleX;
                          const mh = h * scaleY;
                          const domainClass = (n as any).data?.domainClass as string | undefined;
                          const domainKey = typeof (n as any).data?.domain === 'string' ? (n as any).data.domain : (typeof (n as any).data?.label === 'string' ? (n as any).data.label : undefined);
                          const domainTheme = getDomainTheme(currentTheme, { domainClass, domain: domainKey || 'default', description: (n as any).data?.description });
                          const isTitleGroup = (n as any)?.type === 'titleGroup';
                          const isSubGroup = (n as any)?.type === 'subGroup';
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
                  <div style={{
                    width: '100%', height: '100%', backgroundColor: 'transparent', borderBottomLeftRadius: '10px',
                    borderBottomRightRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', color: 'var(--color-slate-500, rgba(0,0,0,0.5))', pointerEvents: 'none'
                  }}>初始化缩略图…</div>
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

export default FixedMiniMap;
