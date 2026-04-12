import React from 'react';
import { ProGanttTask } from '../../../hooks/useProTimelineEngine';
import { useTheme } from '../../../themes/useCoreTheme';

export interface ProDependencyLayerProps {
    tasks: ProGanttTask[];
    hoveredTaskId?: string | null;
}

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;
const BAR_HEIGHT = 28;
const BAR_TOP_MARGIN = (ROW_HEIGHT - BAR_HEIGHT) / 2;

export default function ProDependencyLayer({ tasks, hoveredTaskId }: ProDependencyLayerProps) {
    const [theme] = useTheme();
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
            }

            const isHighlighted = hoveredTaskId === task.id || hoveredTaskId === depId;

            paths.push(
                <path 
                    key={`${task.id}-${depId}`} 
                    d={d}
                    fill="none" 
                    stroke={isHighlighted ? activeColor : inactiveColor}
                    strokeWidth={isHighlighted ? 2 : 1.5}
                    opacity={isHighlighted ? 1 : (isDark ? 0.8 : 0.5)}
                    strokeDasharray={isHighlighted ? '6 4' : 'none'}
                    markerEnd={isHighlighted ? "url(#dep-arrow-hl)" : "url(#dep-arrow)"}
                    style={{ 
                        transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s',
                        animation: isHighlighted ? 'pro-timeline-dash-flow 1s linear infinite' : 'none'
                    }}
                />
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
            </defs>
            {paths}
        </svg>
    );
}
