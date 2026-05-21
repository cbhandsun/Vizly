import React, { useState } from 'react';
import { ProGanttTask, useProTimelineEngine } from '../../../hooks/useProTimelineEngine';
import { useTheme } from '../../../themes/useCoreTheme';

export interface ProDependencyLayerProps {
    tasks: ProGanttTask[];
    hoveredTaskId?: string | null;
    onDeleteDependency?: (sourceId: string, targetId: string) => void;
    criticalPathTaskIds?: Set<string>;
    cyclicTaskIds?: Set<string>;
}

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;
const BAR_HEIGHT = 28;
const BAR_TOP_MARGIN = (ROW_HEIGHT - BAR_HEIGHT) / 2;

export default function ProDependencyLayer({ tasks, hoveredTaskId, onDeleteDependency, criticalPathTaskIds, cyclicTaskIds }: ProDependencyLayerProps) {
    const { showCriticalPath } = useProTimelineEngine();
    const [theme] = useTheme();
    const [hoveredEdge, setHoveredEdge] = useState<{ sourceId: string; targetId: string } | null>(null);
    const taskMap = new Map<string, { endX: number; midY: number; startX: number }>();
    
    const isDark = theme?.mode === 'dark';
    const inactiveColor = isDark ? 'rgba(255,255,255,0.2)' : '#bfbfbf';
    const activeColor = theme?.palette?.warning?.main || '#fa8c16';
    
    tasks.forEach(t => {
        if (!t._computed) return;
        const yTop = HEADER_HEIGHT + t._computed.laneIndex * ROW_HEIGHT + BAR_TOP_MARGIN;
        const midY = yTop + BAR_HEIGHT / 2;
        taskMap.set(t.id, {
            endX: t._computed.x + t._computed.w,
            startX: t._computed.x,
            midY,
        });
    });

    const paths: React.ReactNode[] = [];

    tasks.forEach(task => {
        if (!task.dependencies?.length || !taskMap.has(task.id)) return;
        const target = taskMap.get(task.id)!;
        
        task.dependencies.forEach(depId => {
            const source = taskMap.get(depId);
            if (!source) return;

            const x1 = source.endX + 2;
            const y1 = source.midY;
            const x2 = target.startX - 4;
            const y2 = target.midY;

            // Smooth cubic bezier curve
            let d: string;
            const dx = x2 - x1;
            let midX = (x1 + x2) / 2;
            let midY = (y1 + y2) / 2;
            
            if (dx > 20) {
                // Forward: smooth S-curve
                const cpOffset = Math.min(dx * 0.4, 60);
                d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
            } else {
                // Backward wrap: route below both tasks
                const dropY = Math.max(y1, y2) + BAR_HEIGHT + 8;
                d = `M ${x1} ${y1} C ${x1 + 15} ${y1}, ${x1 + 15} ${dropY}, ${x1} ${dropY} `
                  + `L ${x2} ${dropY} `
                  + `C ${x2 - 15} ${dropY}, ${x2 - 15} ${y2}, ${x2} ${y2}`;
                
                midY = dropY;
            }

            const isHighlighted = hoveredTaskId === task.id || hoveredTaskId === depId;
            const isEdgeHovered = hoveredEdge?.sourceId === depId && hoveredEdge?.targetId === task.id;
            const isCriticalEdge = showCriticalPath && criticalPathTaskIds?.has(depId) && criticalPathTaskIds?.has(task.id);
            const isCyclicEdge = cyclicTaskIds?.has(depId) && cyclicTaskIds?.has(task.id);

            let strokeColor = inactiveColor;
            if (isEdgeHovered) {
                strokeColor = theme?.palette?.error?.main || '#ff4d4f';
            } else if (isCyclicEdge) {
                strokeColor = '#faad14';
            } else if (isHighlighted) {
                strokeColor = activeColor;
            } else if (isCriticalEdge) {
                strokeColor = '#ff4d4f';
            }

            let strokeWidthVal = 1.5;
            if (isEdgeHovered) strokeWidthVal = 2.5;
            else if (isCyclicEdge || isHighlighted || isCriticalEdge) strokeWidthVal = 2;

            let strokeDashVal = 'none';
            if (isHighlighted || isEdgeHovered) strokeDashVal = '6 4';
            else if (isCyclicEdge) strokeDashVal = '6 4';
            else if (isCriticalEdge) strokeDashVal = '5 5';

            let opacityVal = isDark ? 0.8 : 0.5;
            if (isEdgeHovered || isHighlighted) opacityVal = 1;
            else if (isCyclicEdge || isCriticalEdge) opacityVal = 0.95;

            let markerVal = 'url(#dep-arrow)';
            if (isEdgeHovered || isCriticalEdge) markerVal = 'url(#dep-arrow-err)';
            else if (isCyclicEdge) markerVal = 'url(#dep-arrow-cyclic)';
            else if (isHighlighted) markerVal = 'url(#dep-arrow-hl)';

            paths.push(
                <g
                    key={`${task.id}-${depId}`}
                    onMouseEnter={() => setHoveredEdge({ sourceId: depId, targetId: task.id })}
                    onMouseLeave={() => setHoveredEdge(null)}
                    style={{ pointerEvents: 'all' }}
                >
                    {/* 真实连线 */}
                    <path 
                        d={d}
                        fill="none" 
                        stroke={strokeColor}
                        strokeWidth={strokeWidthVal}
                        opacity={opacityVal}
                        strokeDasharray={strokeDashVal}
                        markerEnd={markerVal}
                        style={{ 
                            transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s',
                            animation: isHighlighted || isEdgeHovered || isCriticalEdge || isCyclicEdge ? 'pro-timeline-dash-flow 1s linear infinite' : 'none',
                            pointerEvents: 'visibleStroke',
                        }}
                    />
                    {/* 隐式宽路径 Hover 触发区 */}
                    <path 
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={12}
                        style={{ pointerEvents: 'visibleStroke', cursor: 'pointer' }}
                    />
                    {/* 删除按钮 */}
                    {isEdgeHovered && (
                        <g 
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteDependency?.(depId, task.id);
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <circle 
                                cx={midX} 
                                cy={midY} 
                                r={8} 
                                fill={theme?.palette?.error?.main || '#ff4d4f'} 
                                style={{ 
                                    transition: 'transform 0.1s', 
                                    filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))' 
                                }}
                            />
                            <text 
                                x={midX} 
                                y={midY + 3} 
                                textAnchor="middle" 
                                fill="#fff" 
                                fontSize={10} 
                                fontWeight="bold" 
                                style={{ userSelect: 'none', pointerEvents: 'none' }}
                            >
                                ×
                            </text>
                        </g>
                    )}
                </g>
            );
        });
    });

    if (paths.length === 0) return null;

    return (
        <svg style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible', zIndex: 2,
        }}>
            <style>
                {`
                @keyframes pro-timeline-dash-flow {
                  to {
                    stroke-dashoffset: -20;
                  }
                }
                `}
            </style>
            <defs>
                <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 Z" fill={inactiveColor} />
                </marker>
                <marker id="dep-arrow-hl" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 Z" fill={activeColor} />
                </marker>
                <marker id="dep-arrow-err" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 Z" fill={theme?.palette?.error?.main || '#ff4d4f'} />
                </marker>
                <marker id="dep-arrow-cyclic" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 Z" fill="#faad14" />
                </marker>
            </defs>
            {paths}
        </svg>
    );
}
