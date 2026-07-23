// packages/core/src/components/custom-edges/renderers/AdvancedSmartEdgeGraphics.tsx
import React, { memo, useMemo, useRef, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps } from '@xyflow/react';
import { useEdgeTheme } from '../../diagrams/useEdgeUpdate';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { UseSmartEdgeRoutingReturn } from '../hooks/useSmartEdgeRouting';
import { UseEdgeLabelInteractionsReturn } from '../hooks/useEdgeLabelInteractions';
import { createRenderEdgeGeometryFromEdgeProps, getPathEndpoints } from '../../../rendering/edgeGeometry';
import type { EdgeLabelStyle } from '../../diagrams/EdgeLabelStyleMenu';

interface EdgeGraphicsData {
    label?: unknown;
    bundleInfo?: { bundleSize: number };
    stroke?: React.CSSProperties['stroke'];
    strokeWidth?: React.CSSProperties['strokeWidth'];
    strokeDasharray?: React.CSSProperties['strokeDasharray'];
    sourceUsage?: Partial<Record<'l' | 'r' | 't' | 'b', number>>;
    targetUsage?: Partial<Record<'l' | 'r' | 't' | 'b', number>>;
}

const LazyEdgeLabelDropdown = React.lazy(() =>
    import('./EdgeLabelDropdown').then((module) => ({ default: module.EdgeLabelDropdown }))
);

export interface AdvancedSmartEdgeGraphicsProps {
    props: EdgeProps;
    router: UseSmartEdgeRoutingReturn;
    labelManager: UseEdgeLabelInteractionsReturn;
}

const selectDebugEdge = (id: string) => {
    window.dispatchEvent(new CustomEvent('vizly:selectDebugEdge', { detail: { edgeId: id } }));
    const coord = EdgeRoutingCoordinator.getInstance() as unknown as {
        setDebugEdge(id: string | null): void;
        forceDebugReRoute(id: string | null): void;
    };
    coord.setDebugEdge(id);
    coord.forceDebugReRoute(id);
};

const InnerAdvancedSmartEdgeGraphics = ({ props, router, labelManager }: AdvancedSmartEdgeGraphicsProps) => {
    const { 
        id, label, style, markerStart, markerEnd, 
        labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius,
        source, target, sourceX, sourceY, targetX, targetY 
    } = props;
    
    const { 
        safeFinalPath, opacity, crossfadeOpacity, finalLabelX, finalLabelY, 
        nodesDragging,
        shouldRenderDebugVisuals, shouldRenderPortHeatmap, obstacles, centeredCoords, workerSmartLabelPos,
        workerSmartPoints
    } = router;

    const {
        isEditing, editText, isDraggingLabel,
        setEditText, handleLabelDoubleClick, handleLabelBlur,
        handleLabelMouseDown, handleLabelContextMenu, handleStyleChange, handleResetPosition
    } = labelManager;

    const edgeData = props.data as EdgeGraphicsData | undefined;
    const currentTheme = useEdgeTheme();
    const renderEdge = useMemo(
        () => createRenderEdgeGeometryFromEdgeProps(props, safeFinalPath, workerSmartPoints),
        [props, safeFinalPath, workerSmartPoints]
    );
    const visiblePathEndpoints = useMemo(() => getPathEndpoints(renderEdge.path), [renderEdge.path]);
    // [PERF] 消除双订阅：移除第二次 useSmartEdgeContext 调用
    // simpleNodeMap 仅在 debug heatmap 时使用，通过 router 传入
    // 这避免了每条边对 nodeLookup 进行两次订阅，显著减少拖动时的重算量
    const simpleNodeMap = router.simpleNodeMap;

    // ---------- Bus styling ----------
    const bundleInfo = edgeData?.bundleInfo;
    // busStyle: 纯净的持久化样式，不含任何 drag 状态覆盖（防止写入自动保存）
    const busStyle = useMemo<React.CSSProperties>(() => {
        // [FIX] style 可能为空（RF 格式数据跳过了 EdgeFactory），需从 edgeData 回退
        const resolvedStyle: React.CSSProperties = style?.stroke ? style : {
            stroke: edgeData?.stroke || style?.stroke || '#64748b',
            strokeWidth: edgeData?.strokeWidth || style?.strokeWidth || 1.8,
            strokeDasharray: edgeData?.strokeDasharray || style?.strokeDasharray,
            strokeLinecap: 'round' as const,
            strokeLinejoin: 'round' as const,
            ...style,
        };
        if (!bundleInfo || bundleInfo.bundleSize < 2) {
            if (typeof resolvedStyle.strokeWidth === 'number') {
                return { ...resolvedStyle, strokeWidth: String(resolvedStyle.strokeWidth), strokeLinecap: 'round', strokeLinejoin: 'round' };
            }
            return { ...resolvedStyle, strokeLinecap: 'round', strokeLinejoin: 'round' };
        }
        const bw = Math.min(6, Number(resolvedStyle.strokeWidth || 1) + (bundleInfo.bundleSize - 1) * 0.8);
        return { ...resolvedStyle, strokeWidth: String(bw), strokeLinecap: 'round', strokeLinejoin: 'round' };
    }, [style, bundleInfo, edgeData]);

    // dragOverlayStyle: 仅在渲染时临时叠加，绝不写入 edge.style 持久化数据
    // 使连线在拖动中仍清晰可见（用虚线区分预览态 vs 定型态）
    const dragOverlayStyle = useMemo(() => {
        if (!nodesDragging) return null;
        const baseStroke = style?.stroke;
        const isDefaultGrey = !baseStroke || baseStroke === '#b1b1b7';
        const baseWidth = Number(style?.strokeWidth || 1.5);
        return {
            stroke: isDefaultGrey ? '#6366f1' : baseStroke, // 默认用品牌色，更醒目
            strokeDasharray: '8 5',                          // 更细腻的虚线节奏
            strokeWidth: String(Math.max(2, baseWidth)),
            opacity: 0.85,                                   // 轻微透明感区分预览态
        };
    }, [nodesDragging, style?.stroke, style?.strokeWidth]);

    // ---------- Theme-aware label styling ----------
    const resolvedLabel = (label ?? edgeData?.label);
    const resolvedLabelText = (resolvedLabel === null || typeof resolvedLabel === 'undefined') ? '' : String(resolvedLabel);
    const labelColor = labelStyle?.fill ?? labelStyle?.color ?? busStyle.stroke ?? '#374151';
    const themeFontSize = currentTheme?.typography?.fontSize?.sm;
    const themeFontFamily = currentTheme?.typography?.fontFamily;
    const labelFontSize = labelStyle?.fontSize ?? themeFontSize ?? 13;
    const labelFontFamily = labelStyle?.fontFamily ?? (
        themeFontFamily ? String(themeFontFamily) : undefined
    );
    const labelFontWeight = labelStyle?.fontWeight;
    
    const labelPadding = (() => {
        if (!labelShowBg) return undefined;
        const p: unknown = labelBgPadding;
        if (typeof p === 'number' && isFinite(p)) return `${p}px`;
        if (Array.isArray(p) && p.length >= 2) {
            const x = Number(p[0]);
            const y = Number(p[1]);
            if (isFinite(x) && isFinite(y)) return `${y}px ${x}px`;
        }
        return '2px 4px';
    })();

    const currentLabelStyle: EdgeLabelStyle = {
        ...(typeof labelStyle?.fontWeight === 'string' ? { fontWeight: labelStyle.fontWeight } : {}),
        ...(typeof labelStyle?.color === 'string' ? { color: labelStyle.color } : {}),
        ...(typeof labelStyle?.fontSize === 'number' ? { fontSize: labelStyle.fontSize } : {}),
    };

    const handleClick = (e: React.MouseEvent) => {
        // [DEBUG] Alt+Click or Ctrl+Click → select this edge in the Routing Debugger
        if (e.altKey || (e.ctrlKey && !e.shiftKey && !e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            selectDebugEdge(id);
        }
    };

    const gRef = useRef<SVGGElement>(null);

    // [DEBUG] Use native DOM listener instead of React synthetic event so that
    // CDP-simulated clicks (which may lose altKey in synthetic event path) also work.
    useEffect(() => {
        const el = gRef.current;
        if (!el) return;
        const handler = (e: MouseEvent) => {
            if (e.altKey || (e.ctrlKey && !e.shiftKey && !e.metaKey)) {
                e.stopPropagation();
                selectDebugEdge(id);
            }
        };
        el.addEventListener('click', handler, { capture: true });
        return () => el.removeEventListener('click', handler, { capture: true });
    }, [id]);

    return (
        <g
            ref={gRef}
            className="edge-cyber-flow"
            onClick={handleClick}
            style={{ cursor: 'pointer', opacity: opacity * crossfadeOpacity, transition: nodesDragging ? 'none' : 'opacity 0.25s ease-in-out' }}
        >

            <BaseEdge
                id={id}
                path={renderEdge.path}
                markerStart={markerStart}
                markerEnd={markerEnd}
                // dragOverlayStyle 只在渲染时合并，不污染 edge.style 持久化数据
                style={dragOverlayStyle ? { ...busStyle, ...dragOverlayStyle } : busStyle}
                interactionWidth={40}
            />
            
            <g className="custom-edge-updater-group">
                <circle className="custom-edge-updater custom-edge-updater-source"
                    cx={visiblePathEndpoints?.source.x ?? (workerSmartPoints && workerSmartPoints.length > 0 ? workerSmartPoints[0].x : sourceX)}
                    cy={visiblePathEndpoints?.source.y ?? (workerSmartPoints && workerSmartPoints.length > 0 ? workerSmartPoints[0].y : sourceY)} />
                <circle className="custom-edge-updater custom-edge-updater-target"
                    cx={visiblePathEndpoints?.target.x ?? (workerSmartPoints && workerSmartPoints.length > 1 ? workerSmartPoints[workerSmartPoints.length - 1].x : targetX)}
                    cy={visiblePathEndpoints?.target.y ?? (workerSmartPoints && workerSmartPoints.length > 1 ? workerSmartPoints[workerSmartPoints.length - 1].y : targetY)} />
            </g>

            {resolvedLabelText && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${finalLabelX}px, ${finalLabelY}px)`,
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                            color: String(labelColor),
                            fontSize: labelFontSize,
                            fontFamily: labelFontFamily,
                            fontWeight: labelFontWeight,
                            // [FIX] Label 始终显示半透明胶囊背景以提升可读性（对齐专业图表标准）
                            background: labelShowBg
                                ? (labelBgStyle?.fill ?? labelBgStyle?.background ?? (currentTheme?.diagram?.canvas?.background ? String(currentTheme.diagram.canvas.background) : 'rgba(255,255,255,0.95)'))
                                : (currentTheme?.mode === 'dark' ? 'rgba(30,30,46,0.92)' : 'rgba(255,255,255,0.95)'),
                            padding: labelPadding || '2px 8px',
                            borderRadius: labelShowBg ? (labelBgBorderRadius ?? 6) : 6,
                            backdropFilter: 'blur(6px)',
                            border: `1px solid ${currentTheme?.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.03)',
                            opacity: opacity * crossfadeOpacity,
                            transition: nodesDragging ? 'none' : 'opacity 0.25s ease-in-out',
                            zIndex: 1,
                            ...labelStyle,
                        }}
                        className="nodrag nopan"
                    >
                        {isEditing ? (
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onBlur={handleLabelBlur}
                                autoFocus
                                aria-label="Edit Edge Label"
                                title="Edit Edge Label"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleLabelBlur();
                                    }
                                }}
                                style={{
                                    width: 'auto',
                                    minWidth: '60px',
                                    height: 'auto',
                                    resize: 'none',
                                    border: 'none',
                                    background: 'rgba(255,255,255,0.8)',
                                    outline: '2px solid #1677ff',
                                    borderRadius: 2,
                                    padding: 2,
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    color: 'inherit',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <React.Suspense
                                fallback={
                                    <div
                                        onDoubleClick={handleLabelDoubleClick}
                                        onMouseDown={handleLabelMouseDown}
                                        onContextMenu={handleLabelContextMenu}
                                        style={{
                                            cursor: isDraggingLabel ? 'grabbing' : 'grab',
                                            pointerEvents: 'auto',
                                            userSelect: 'none',
                                            fontWeight: currentLabelStyle.fontWeight || 'normal',
                                            color: currentLabelStyle.color || 'inherit',
                                            fontSize: currentLabelStyle.fontSize ? `${currentLabelStyle.fontSize}px` : 'inherit'
                                        }}
                                    >
                                        {resolvedLabelText}
                                    </div>
                                }
                            >
                                <LazyEdgeLabelDropdown
                                    edgeId={id}
                                    currentStyle={currentLabelStyle}
                                    onStyleChange={handleStyleChange}
                                    onResetPosition={handleResetPosition}
                                >
                                    <div
                                        onDoubleClick={handleLabelDoubleClick}
                                        onMouseDown={handleLabelMouseDown}
                                        onContextMenu={handleLabelContextMenu}
                                        style={{
                                            cursor: isDraggingLabel ? 'grabbing' : 'grab',
                                            pointerEvents: 'auto',
                                            userSelect: 'none',
                                            fontWeight: currentLabelStyle.fontWeight || 'normal',
                                            color: currentLabelStyle.color || 'inherit',
                                            fontSize: currentLabelStyle.fontSize ? `${currentLabelStyle.fontSize}px` : 'inherit'
                                        }}
                                    >
                                        {resolvedLabelText}
                                    </div>
                                </LazyEdgeLabelDropdown>
                            </React.Suspense>
                        )}
                    </div>
                </EdgeLabelRenderer>
            )}

            {shouldRenderDebugVisuals && (
                <g className="react-flow__edge-debug">
                    {obstacles?.map((o, i: number) => (
                        <rect key={`o-${i}`} x={o.x} y={o.y} width={o.width} height={o.height} fill="rgba(255,0,0,0.2)" stroke="red" strokeWidth={1} />
                    ))}
                    {centeredCoords?.busTrunkSource && <circle cx={centeredCoords.busTrunkSource.x} cy={centeredCoords.busTrunkSource.y} r={4} fill="blue" />}
                    {centeredCoords?.busTrunkTarget && <circle cx={centeredCoords.busTrunkTarget.x} cy={centeredCoords.busTrunkTarget.y} r={4} fill="green" />}
                    {workerSmartLabelPos && <circle cx={workerSmartLabelPos.x} cy={workerSmartLabelPos.y} r={2} fill="orange" />}
                </g>
            )}

            {shouldRenderPortHeatmap && (() => {
                const heatmapElements: React.ReactNode[] = [];
                const srcNode = simpleNodeMap?.get(source);
                const tgtNode = simpleNodeMap?.get(target);
                const getHeatColor = (usage: number) => {
                    if (usage <= 0) return 'rgba(0,255,0,0.5)';
                    if (usage <= 2) return 'rgba(255,255,0,0.6)';
                    if (usage <= 4) return 'rgba(255,165,0,0.7)';
                    return 'rgba(255,0,0,0.8)';
                };
                const portOffset = { l: [-8, 0], r: [8, 0], t: [0, -8], b: [0, 8] } as const;
                const ports = ['l', 'r', 't', 'b'] as const;

                if (srcNode) {
                    const sx = srcNode.x ?? srcNode.position.x;
                    const sy = srcNode.y ?? srcNode.position.y;
                    const sw = srcNode.measured.width ?? srcNode.width ?? 100;
                    const sh = srcNode.measured.height ?? srcNode.height ?? 40;
                    const srcCenter = { x: sx + sw / 2, y: sy + sh / 2 };
                    ports.forEach(p => {
                        const usage = edgeData?.sourceUsage?.[p] ?? 0;
                        const off = portOffset[p];
                        const px = p === 'l' ? sx : p === 'r' ? sx + sw : srcCenter.x;
                        const py = p === 't' ? sy : p === 'b' ? sy + sh : srcCenter.y;
                        heatmapElements.push(
                            <circle key={`src-${p}`} cx={px + off[0]} cy={py + off[1]} r={6 + usage} fill={getHeatColor(usage)} stroke="#333" strokeWidth={0.5}>
                                <title>Source {p.toUpperCase()}: {usage}</title>
                            </circle>
                        );
                    });
                }
                if (tgtNode) {
                    const tx = tgtNode.x ?? tgtNode.position.x;
                    const ty = tgtNode.y ?? tgtNode.position.y;
                    const tw = tgtNode.measured.width ?? tgtNode.width ?? 100;
                    const th = tgtNode.measured.height ?? tgtNode.height ?? 40;
                    const tgtCenter = { x: tx + tw / 2, y: ty + th / 2 };
                    ports.forEach(p => {
                        const usage = edgeData?.targetUsage?.[p] ?? 0;
                        const off = portOffset[p];
                        const px = p === 'l' ? tx : p === 'r' ? tx + tw : tgtCenter.x;
                        const py = p === 't' ? ty : p === 'b' ? ty + th : tgtCenter.y;
                        heatmapElements.push(
                            <circle key={`tgt-${p}`} cx={px + off[0]} cy={py + off[1]} r={6 + usage} fill={getHeatColor(usage)} stroke="#333" strokeWidth={0.5}>
                                <title>Target {p.toUpperCase()}: {usage}</title>
                            </circle>
                        );
                    });
                }
                return <g className="react-flow__edge-heatmap">{heatmapElements}</g>;
            })()}

        </g>
    );
};

export const AdvancedSmartEdgeGraphics = memo(InnerAdvancedSmartEdgeGraphics);
