// packages/core/src/components/custom-edges/renderers/AdvancedSmartEdgeGraphics.tsx
import React, { memo, useMemo, useRef, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps } from '@xyflow/react';
import { Dropdown } from 'antd';
import { getEdgeLabelStyleMenuItems } from '../../diagrams/EdgeLabelStyleMenu';
import { useEdgeTheme } from '../../diagrams/EdgeUpdateContext';
import { UseSmartEdgeRoutingReturn } from '../hooks/useSmartEdgeRouting';
import { UseEdgeLabelInteractionsReturn } from '../hooks/useEdgeLabelInteractions';

export interface AdvancedSmartEdgeGraphicsProps {
    props: EdgeProps;
    router: UseSmartEdgeRoutingReturn;
    labelManager: UseEdgeLabelInteractionsReturn;
}

const NUMBER_RE = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
const PATH_COMMAND_RE = /([MLACQST])([^MLACQST]*)/gi;

const getPathEndpoints = (path: string): { source: { x: number; y: number }; target: { x: number; y: number } } | null => {
    if (!path) return null;

    let source: { x: number; y: number } | null = null;
    let target: { x: number; y: number } | null = null;
    const matches = path.matchAll(PATH_COMMAND_RE);
    for (const match of matches) {
        const nums = [...match[2].matchAll(NUMBER_RE)].map(num => Number(num[0]));
        if (nums.length < 2 || nums.some(num => !Number.isFinite(num))) continue;

        const firstPair = { x: nums[0], y: nums[1] };
        const lastPair = { x: nums[nums.length - 2], y: nums[nums.length - 1] };
        if (!source) source = firstPair;
        target = lastPair;
    }

    return source && target ? { source, target } : null;
};

const InnerAdvancedSmartEdgeGraphics = ({ props, router, labelManager }: AdvancedSmartEdgeGraphicsProps) => {
    const { 
        id, label, style, markerStart, markerEnd, 
        labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius,
        source, target, sourceX, sourceY, targetX, targetY 
    } = props;
    
    const { 
        safeFinalPath, opacity, crossfadeOpacity, finalLabelX, finalLabelY, 
        nodesDragging, _isStale, _isBusEdge, _isLoading,
        shouldRenderDebugVisuals, shouldRenderPortHeatmap, obstacles, centeredCoords, workerSmartLabelPos,
        workerSmartPoints
    } = router;

    const {
        isEditing, editText, isDraggingLabel,
        setEditText, handleLabelDoubleClick, handleLabelBlur,
        handleLabelMouseDown, handleLabelContextMenu, handleStyleChange, handleResetPosition
    } = labelManager;

    const edgeData = props.data as Record<string, any> | undefined;
    const currentTheme = useEdgeTheme();
    const visiblePathEndpoints = useMemo(() => getPathEndpoints(safeFinalPath), [safeFinalPath]);
    // [PERF] 消除双订阅：移除第二次 useSmartEdgeContext 调用
    // simpleNodeMap 仅在 debug heatmap 时使用，通过 router 传入
    // 这避免了每条边对 nodeLookup 进行两次订阅，显著减少拖动时的重算量
    const simpleNodeMap = (router as any).simpleNodeMap as Map<string, any> | undefined;

    // ---------- Bus styling ----------
    const bundleInfo = edgeData?.bundleInfo;
    // busStyle: 纯净的持久化样式，不含任何 drag 状态覆盖（防止写入自动保存）
    const busStyle = useMemo(() => {
        // [FIX] style 可能为空（RF 格式数据跳过了 EdgeFactory），需从 edgeData 回退
        const resolvedStyle = (style && (style as any).stroke) ? style : {
            stroke: (edgeData as any)?.stroke || (style as any)?.stroke || '#64748b',
            strokeWidth: (edgeData as any)?.strokeWidth || (style as any)?.strokeWidth || 1.8,
            strokeDasharray: (edgeData as any)?.strokeDasharray || (style as any)?.strokeDasharray,
            strokeLinecap: 'round' as const,
            strokeLinejoin: 'round' as const,
            ...style,
        };
        if (!bundleInfo || bundleInfo.bundleSize < 2) {
            if (resolvedStyle && typeof (resolvedStyle as any).strokeWidth === 'number') {
                return { ...resolvedStyle, strokeWidth: String((resolvedStyle as any).strokeWidth), strokeLinecap: 'round', strokeLinejoin: 'round' };
            }
            return { ...resolvedStyle, strokeLinecap: 'round', strokeLinejoin: 'round' };
        }
        const bw = Math.min(6, Number((resolvedStyle as any)?.strokeWidth || 1) + (bundleInfo.bundleSize - 1) * 0.8);
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
    const labelColor = (labelStyle as any)?.fill ?? (labelStyle as any)?.color ?? (busStyle as any)?.stroke ?? '#374151';
    const themeFontSize = currentTheme?.typography?.fontSize?.sm;
    const themeFontFamily = currentTheme?.typography?.fontFamily;
    const labelFontSize = (labelStyle as any)?.fontSize ?? themeFontSize ?? 13;
    const labelFontFamily = (labelStyle as any)?.fontFamily ?? themeFontFamily;
    const labelFontWeight = (labelStyle as any)?.fontWeight;
    
    const labelPadding = (() => {
        if (!labelShowBg) return undefined;
        const p = labelBgPadding as any;
        if (typeof p === 'number' && isFinite(p)) return `${p}px`;
        if (Array.isArray(p) && p.length >= 2) {
            const x = Number(p[0]);
            const y = Number(p[1]);
            if (isFinite(x) && isFinite(y)) return `${y}px ${x}px`;
        }
        return '2px 4px';
    })();

    const currentLabelStyle = (labelStyle || {}) as any;

    const handleClick = (e: React.MouseEvent) => {
        // [DEBUG] Alt+Click or Ctrl+Click → select this edge in the Routing Debugger
        if (e.altKey || (e.ctrlKey && !e.shiftKey && !e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('vizly:selectDebugEdge', { detail: { edgeId: id } }));
            import('../../../services/EdgeRoutingCoordinator').then(({ EdgeRoutingCoordinator }) => {
                const coord = EdgeRoutingCoordinator.getInstance() as unknown as {
                    setDebugEdge(id: string | null): void;
                    forceDebugReRoute(id: string | null): void;
                };
                coord.setDebugEdge(id);
                coord.forceDebugReRoute(id);
            }).catch(() => {});
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
                window.dispatchEvent(new CustomEvent('vizly:selectDebugEdge', { detail: { edgeId: id } }));
                import('../../../services/EdgeRoutingCoordinator').then(({ EdgeRoutingCoordinator }) => {
                    const coord = EdgeRoutingCoordinator.getInstance() as unknown as {
                        setDebugEdge(id: string | null): void;
                        forceDebugReRoute(id: string | null): void;
                    };
                    coord.setDebugEdge(id);
                    coord.forceDebugReRoute(id);
                }).catch(() => {});
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

            <BaseEdge {...({
                id,
                path: safeFinalPath,
                markerStart: markerStart as any,
                markerEnd: markerEnd as any,
                // dragOverlayStyle 只在渲染时合并，不污染 edge.style 持久化数据
                style: dragOverlayStyle ? { ...busStyle, ...dragOverlayStyle } : busStyle,
                interactionWidth: 40
            } as any)} />
            
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
                                ? ((labelBgStyle as any)?.fill ?? (labelBgStyle as any)?.background ?? (currentTheme?.diagram?.canvas?.background ? String(currentTheme.diagram.canvas.background) : 'rgba(255,255,255,0.95)'))
                                : (currentTheme?.mode === 'dark' ? 'rgba(30,30,46,0.92)' : 'rgba(255,255,255,0.95)'),
                            padding: labelPadding || '2px 8px',
                            borderRadius: labelShowBg ? (labelBgBorderRadius ?? 6) : 6,
                            backdropFilter: 'blur(6px)',
                            border: `1px solid ${currentTheme?.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.03)',
                            opacity: opacity * crossfadeOpacity,
                            transition: nodesDragging ? 'none' : 'opacity 0.25s ease-in-out',
                            zIndex: 1,
                            ...(labelStyle as any),
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
                            <Dropdown
                                menu={{
                                    items: getEdgeLabelStyleMenuItems({
                                        edgeId: id,
                                        currentStyle: currentLabelStyle,
                                        onStyleChange: handleStyleChange,
                                        onResetPosition: handleResetPosition
                                    })
                                }}
                                trigger={['contextMenu']}
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
                            </Dropdown>
                        )}
                    </div>
                </EdgeLabelRenderer>
            )}

            {shouldRenderDebugVisuals && (
                <g className="react-flow__edge-debug">
                    {obstacles?.map((o: any, i: number) => (
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
                    const sn = srcNode as any;
                    const sx = sn.positionAbsolute?.x ?? sn.position?.x ?? 0;
                    const sy = sn.positionAbsolute?.y ?? sn.position?.y ?? 0;
                    const sw = sn.measured?.width ?? sn.width ?? 100;
                    const sh = sn.measured?.height ?? sn.height ?? 40;
                    const srcCenter = { x: sx + sw / 2, y: sy + sh / 2 };
                    ports.forEach(p => {
                        const usage = (props.data as any)?.sourceUsage?.[p] ?? 0;
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
                    const tn = tgtNode as any;
                    const tx = tn.positionAbsolute?.x ?? tn.position?.x ?? 0;
                    const ty = tn.positionAbsolute?.y ?? tn.position?.y ?? 0;
                    const tw = tn.measured?.width ?? tn.width ?? 100;
                    const th = tn.measured?.height ?? tn.height ?? 40;
                    const tgtCenter = { x: tx + tw / 2, y: ty + th / 2 };
                    ports.forEach(p => {
                        const usage = (props.data as any)?.targetUsage?.[p] ?? 0;
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
