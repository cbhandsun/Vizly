import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ProGanttTask, useProTimelineEngine } from '../../../hooks/useProTimelineEngine';
import { useTheme } from '../../../themes/useCoreTheme';
import { ProDependencyToolbar } from './ProDependencyToolbar';
import type { ProTimelineDependencyConnectionResult } from './proTimelineDependencyConnection';
import {
    getProTimelineDependencyAccessibleName,
    getProTimelineDependencyTaskName,
    getProTimelineDependencyViewportAnchor,
    isProTimelineDependencyActivationKey,
    isProTimelineDependencyDeleteKey,
} from './proTimelineDependencyInteraction';

export interface ProDependencyLayerProps {
    tasks: ProGanttTask[];
    hoveredTaskId?: string | null;
    onDeleteDependency?: (
        sourceId: string,
        targetId: string,
    ) => ProTimelineDependencyConnectionResult | void;
    onUpdateDependency?: (
        oldSourceId: string,
        oldTargetId: string,
        sourceId: string,
        targetId: string,
    ) => ProTimelineDependencyConnectionResult | void;
    criticalPathTaskIds?: Set<string>;
    cyclicTaskIds?: Set<string>;
}

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;
const BAR_HEIGHT = 28;
const BAR_TOP_MARGIN = (ROW_HEIGHT - BAR_HEIGHT) / 2;

interface SelectedDependency {
    sourceId: string;
    targetId: string;
    left: number;
    top: number;
}

interface DependencyFeedback {
    message: string;
    tone: 'error' | 'success';
}

export default function ProDependencyLayer({
    tasks,
    hoveredTaskId,
    onDeleteDependency,
    onUpdateDependency,
    criticalPathTaskIds,
    cyclicTaskIds,
}: ProDependencyLayerProps) {
    const { showCriticalPath } = useProTimelineEngine();
    const [theme] = useTheme();
    const [hoveredEdge, setHoveredEdge] = useState<{ sourceId: string; targetId: string } | null>(null);
    const [selectedDependency, setSelectedDependency] = useState<SelectedDependency | null>(null);
    const [feedback, setFeedback] = useState<DependencyFeedback | null>(null);
    const taskMap = new Map<string, { endX: number; midY: number; startX: number }>();
    const taskNameMap = new Map(tasks.map((task) => [task.id, getProTimelineDependencyTaskName(task.name)]));
    const canManageDependencies = Boolean(onDeleteDependency || onUpdateDependency);
    
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

    const activeSelectedDependency = selectedDependency && tasks.some((task) => (
        task.id === selectedDependency.targetId
        && task.dependencies?.includes(selectedDependency.sourceId)
    )) ? selectedDependency : null;

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
            const isEdgeHovered = hoveredEdge?.sourceId === depId && hoveredEdge?.targetId === task.id;
            const isSelected = selectedDependency?.sourceId === depId && selectedDependency.targetId === task.id;
            const isCriticalEdge = showCriticalPath && criticalPathTaskIds?.has(depId) && criticalPathTaskIds?.has(task.id);
            const isCyclicEdge = cyclicTaskIds?.has(depId) && cyclicTaskIds?.has(task.id);

            let strokeColor = inactiveColor;
            if (isSelected) {
                strokeColor = theme?.palette?.primary?.main || '#5936d5';
            } else if (isEdgeHovered) {
                strokeColor = theme?.palette?.error?.main || '#ff4d4f';
            } else if (isCyclicEdge) {
                strokeColor = '#faad14';
            } else if (isHighlighted) {
                strokeColor = activeColor;
            } else if (isCriticalEdge) {
                strokeColor = '#ff4d4f';
            }

            let strokeWidthVal = 1.5;
            if (isSelected) strokeWidthVal = 3;
            else if (isEdgeHovered) strokeWidthVal = 2.5;
            else if (isCyclicEdge || isHighlighted || isCriticalEdge) strokeWidthVal = 2;

            let strokeDashVal = 'none';
            if (isSelected || isHighlighted || isEdgeHovered) strokeDashVal = '6 4';
            else if (isCyclicEdge) strokeDashVal = '6 4';
            else if (isCriticalEdge) strokeDashVal = '5 5';

            let opacityVal = isDark ? 0.8 : 0.5;
            if (isSelected || isEdgeHovered || isHighlighted) opacityVal = 1;
            else if (isCyclicEdge || isCriticalEdge) opacityVal = 0.95;

            let markerVal = 'url(#dep-arrow)';
            if (isSelected) markerVal = 'url(#dep-arrow-selected)';
            else if (isEdgeHovered || isCriticalEdge) markerVal = 'url(#dep-arrow-err)';
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
                            animation: isSelected || isHighlighted || isEdgeHovered || isCriticalEdge || isCyclicEdge ? 'pro-timeline-dash-flow 1s linear infinite' : 'none',
                            pointerEvents: 'visibleStroke',
                        }}
                        aria-hidden="true"
                    />
                    {/* 宽路径同时承载指针和键盘语义。 */}
                    <path 
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(16, BAR_HEIGHT / 2)}
                        tabIndex={canManageDependencies ? 0 : undefined}
                        role={canManageDependencies ? 'button' : undefined}
                        aria-label={canManageDependencies ? getProTimelineDependencyAccessibleName(
                            taskNameMap.get(depId),
                            taskNameMap.get(task.id),
                        ) : undefined}
                        aria-pressed={canManageDependencies ? isSelected : undefined}
                        aria-keyshortcuts={canManageDependencies ? 'Enter Space Delete Backspace Escape' : undefined}
                        onFocus={(event) => {
                            if (!canManageDependencies) return;
                            const anchor = getProTimelineDependencyViewportAnchor(
                                event.currentTarget.getBoundingClientRect(),
                                window.innerWidth,
                                window.innerHeight,
                            );
                            setFeedback(null);
                            setSelectedDependency({ sourceId: depId, targetId: task.id, ...anchor });
                        }}
                        onClick={(event) => {
                            if (!canManageDependencies) return;
                            event.stopPropagation();
                            const anchor = getProTimelineDependencyViewportAnchor(
                                event.currentTarget.getBoundingClientRect(),
                                window.innerWidth,
                                window.innerHeight,
                            );
                            setFeedback(null);
                            setSelectedDependency({ sourceId: depId, targetId: task.id, ...anchor });
                        }}
                        onKeyDown={(event) => {
                            if (!canManageDependencies) return;
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                setSelectedDependency(null);
                                return;
                            }
                            if (isProTimelineDependencyActivationKey(event.key)) {
                                event.preventDefault();
                                const anchor = getProTimelineDependencyViewportAnchor(
                                    event.currentTarget.getBoundingClientRect(),
                                    window.innerWidth,
                                    window.innerHeight,
                                );
                                setFeedback(null);
                                setSelectedDependency({ sourceId: depId, targetId: task.id, ...anchor });
                                return;
                            }
                            if (!isProTimelineDependencyDeleteKey(event.key) || !onDeleteDependency) return;
                            event.preventDefault();
                            const result = onDeleteDependency(depId, task.id);
                            if (result && !result.ok) {
                                setFeedback({ message: result.message, tone: 'error' });
                                return;
                            }
                            setSelectedDependency(null);
                            setFeedback({ message: '依赖关系已删除，可使用撤销恢复。', tone: 'success' });
                        }}
                        style={{ pointerEvents: 'visibleStroke', cursor: canManageDependencies ? 'pointer' : 'default', outline: 'none' }}
                    />
                </g>
            );
        });
    });

    if (paths.length === 0 && !feedback) return null;

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
                <marker id="dep-arrow-selected" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 Z" fill={theme?.palette?.primary?.main || '#5936d5'} />
                </marker>
                <marker id="dep-arrow-cyclic" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M 0 1 L 7 4 L 0 7 Z" fill="#faad14" />
                </marker>
            </defs>
            {paths}
            {typeof document !== 'undefined' && createPortal(
                <>
                    {activeSelectedDependency && (
                        <ProDependencyToolbar
                            key={`${activeSelectedDependency.sourceId}-${activeSelectedDependency.targetId}`}
                            sourceId={activeSelectedDependency.sourceId}
                            targetId={activeSelectedDependency.targetId}
                            tasks={tasks}
                            left={activeSelectedDependency.left}
                            top={activeSelectedDependency.top}
                            onClose={() => setSelectedDependency(null)}
                            onDelete={() => {
                                if (!onDeleteDependency) return;
                                const result = onDeleteDependency(
                                    activeSelectedDependency.sourceId,
                                    activeSelectedDependency.targetId,
                                );
                                if (result && !result.ok) {
                                    setFeedback({ message: result.message, tone: 'error' });
                                    return;
                                }
                                setSelectedDependency(null);
                                setFeedback({ message: '依赖关系已删除，可使用撤销恢复。', tone: 'success' });
                            }}
                            onApply={(sourceId, targetId) => {
                                if (!onUpdateDependency) return;
                                const result = onUpdateDependency(
                                    activeSelectedDependency.sourceId,
                                    activeSelectedDependency.targetId,
                                    sourceId,
                                    targetId,
                                );
                                if (result && !result.ok) {
                                    setFeedback({ message: `${result.message} 请调整后重试。`, tone: 'error' });
                                    return;
                                }
                                setSelectedDependency((current) => current ? {
                                    ...current,
                                    sourceId,
                                    targetId,
                                } : null);
                                setFeedback({ message: '依赖关系已更新，可使用撤销恢复。', tone: 'success' });
                            }}
                        />
                    )}
                    {feedback && (
                        <div className={`pro-dependency-feedback pro-dependency-feedback--${feedback.tone}`} role="status">
                            {feedback.message}
                        </div>
                    )}
                </>,
                document.body,
            )}
        </svg>
    );
}
