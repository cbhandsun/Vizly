import React, { useState, useCallback, useMemo } from 'react';
import { getWorkDays, ProGanttTask, useProTimelineEngine } from '../../../hooks/useProTimelineEngine';
import { CalendarOutlined, ClockCircleOutlined, FlagFilled, CaretRightFilled } from '@ant-design/icons';
import { useTheme } from '../../../themes/useCoreTheme';
import type { ProjectedProTimelineTask } from './proTimelineTaskProjection';
import { clampProTaskProgress, isProTaskSelected } from './proTaskPresentationModel';
import { ProTaskTooltip } from './ProTaskTooltip';
import { ProTaskInlineNameEditor } from './ProTaskInlineNameEditor';
import { getProTaskDependencyControlLeft, getProTaskLayerAccessibleName } from './proTaskLayerInteraction';
import { useProTaskLayerKeyboardInteractions } from './useProTaskLayerKeyboardInteractions';
import { ProTaskAssigneeAvatar } from './ProTaskAssigneeAvatar';
import { ProTaskDependencyControl, ProTaskDependencyFeedback } from './ProTaskDependencyControl';
import { useProTaskDependencyKeyboard } from './useProTaskDependencyKeyboard';
import type { ProTimelineDependencyConnectionResult } from './proTimelineDependencyConnection';
import { useProTaskInlineEditing } from './useProTaskInlineEditing';
import { isProTimelineAdditiveSelection } from './proTimelineViewportInteraction';

export interface ProTaskLayerProps {
    tasks: ProjectedProTimelineTask[];
    onTaskClick?: (taskId: string, additive?: boolean) => void;
    onTaskDragEnd?: (taskId: string, newStartDate: string, newEndDate: string) => void;
    hoveredTaskId?: string | null;
    onHoverTask?: (id: string | null) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<ProGanttTask>) => void;
    onTaskConnect?: (
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

interface DragState {
    taskId: string;
    mode: 'move' | 'resize-right' | 'progress' | 'connect';
    startMouseX: number;
    startMouseY: number;
    origX: number;
    origY?: number;
    origW: number;
    origProgress: number;
    targetTaskId?: string | null;
}

export default function ProTaskLayer({ 
    tasks, 
    onTaskClick, 
    onTaskDragEnd, 
    hoveredTaskId, 
    onHoverTask, 
    onTaskUpdate, 
    onTaskConnect,
    criticalPathTaskIds,
    cyclicTaskIds
}: ProTaskLayerProps) {
    const { xToDate, pixelsPerDay, dateToX, showBaseline, showCriticalPath } = useProTimelineEngine();
    const [theme] = useTheme();
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [dragDeltaX, setDragDeltaX] = useState(0);
    const [dragDeltaY, setDragDeltaY] = useState(0);
    const [dragDeltaW, setDragDeltaW] = useState(0);
    const [dragProgress, setDragProgress] = useState(0);
    const [tooltipState, setTooltipState] = useState<{ task: ProjectedProTimelineTask; x: number; y: number } | null>(null);
    const {
        cancelTaskNameEdit,
        commitEdit,
        editingTaskId,
        editingText,
        setEditingText,
        startTaskNameEdit,
    } = useProTaskInlineEditing({ onTaskUpdate });
    const {
        connectionAnnouncement,
        connectionState,
        connectTasks,
        handleTaskConnectionKeyDown,
        isConnectableTask,
        toggleConnection,
    } = useProTaskDependencyKeyboard({ tasks, onTaskConnect });

    const snapX = useCallback((rawX: number) => Math.round(rawX / pixelsPerDay) * pixelsPerDay, [pixelsPerDay]);

    const dragDateLabel = useMemo(() => {
        if (!dragState) return null;
        if (dragState.mode === 'progress' || dragState.mode === 'connect') return null; // 拖进度或连线不显示日期
        let x = dragState.origX;
        let w = dragState.origW;
        if (dragState.mode === 'move') { x = snapX(dragState.origX + dragDeltaX); }
        else { w = Math.max(pixelsPerDay, dragState.origW + dragDeltaW); }
        return { start: xToDate(x), end: xToDate(x + w) };
    }, [dragState, dragDeltaX, dragDeltaW, snapX, xToDate, pixelsPerDay]);

    const handleTaskPointerDown = useCallback((e: React.PointerEvent, task: ProjectedProTimelineTask, mode: DragState['mode']) => {
        if (!task._computed) return;
        if (task.type === 'summary') return; // 汇总条不允许拖动
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const origY = HEADER_HEIGHT + task._computed.laneIndex * ROW_HEIGHT + BAR_TOP_MARGIN;
        setDragState({ 
            taskId: task.id, mode, 
            startMouseX: e.clientX, startMouseY: e.clientY,
            origX: task._computed.x, origW: task._computed.w, 
            origY, origProgress: clampProTaskProgress(task.progress) ?? 0
        });
        setDragDeltaX(0);
        setDragDeltaY(0);
        setDragDeltaW(0);
        if (mode === 'progress') {
            setDragProgress(clampProTaskProgress(task.progress) ?? 0);
        }
        setTooltipState(null);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState) return;
        const dx = e.clientX - dragState.startMouseX;
        const dy = e.clientY - dragState.startMouseY;
        if (dragState.mode === 'move') setDragDeltaX(dx);
        else if (dragState.mode === 'resize-right') setDragDeltaW(dx);
        else if (dragState.mode === 'connect') {
            setDragDeltaX(dx);
            setDragDeltaY(dy);
        }
        else if (dragState.mode === 'progress') {
            // progress dx is capped by w. calculate visually
            const pDelta = (dx / dragState.origW) * 100;
            const newP = Math.min(100, Math.max(0, Math.round(dragState.origProgress + pDelta)));
            setDragProgress(newP);
        }
    }, [dragState]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!dragState) return;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        if (dragState.mode === 'move') {
            const newX = snapX(dragState.origX + dragDeltaX);
            const newStart = xToDate(newX);
            const newEnd = xToDate(newX + dragState.origW);
            onTaskDragEnd?.(dragState.taskId, newStart, newEnd);
        } else if (dragState.mode === 'resize-right') {
            const newW = Math.max(pixelsPerDay, snapX(dragState.origW + dragDeltaW));
            const newEnd = xToDate(dragState.origX + newW);
            const newStart = xToDate(dragState.origX);
            onTaskDragEnd?.(dragState.taskId, newStart, newEnd);
        } else if (dragState.mode === 'progress') {
            onTaskUpdate?.(dragState.taskId, { progress: dragProgress });
        } else if (dragState.mode === 'connect' && dragState.targetTaskId && dragState.targetTaskId !== dragState.taskId) {
            connectTasks(dragState.taskId, dragState.targetTaskId);
        }

        setDragState(null);
        setDragDeltaX(0);
        setDragDeltaY(0);
        setDragDeltaW(0);
    }, [connectTasks, dragState, dragDeltaX, dragDeltaW, dragProgress, snapX, xToDate, pixelsPerDay, onTaskDragEnd, onTaskUpdate]);

    const cancelDragInteraction = useCallback(() => {
        setDragState(null);
        setDragDeltaX(0);
        setDragDeltaY(0);
        setDragDeltaW(0);
        setTooltipState(null);
    }, []);

    const { handleTaskBarKeyDown, handleProgressKeyDown, handleResizeKeyDown } = useProTaskLayerKeyboardInteractions({
        cancelDragInteraction,
        handleTaskConnectionKeyDown,
        onTaskClick,
        onTaskDragEnd,
        onTaskUpdate,
        startTaskNameEdit,
    });

    const handleTaskMouseEnter = useCallback((e: React.MouseEvent, task: ProjectedProTimelineTask) => {
        if (dragState) {
            if (dragState.mode === 'connect' && task.id !== dragState.taskId) {
                setDragState(s => s ? { ...s, targetTaskId: task.id } : null);
            }
            return;
        }
        onHoverTask?.(task.id);
        setTooltipState({ task, x: e.clientX, y: e.clientY });
    }, [dragState, onHoverTask]);

    const handleTaskMouseLeave = useCallback((e: React.MouseEvent, task: ProjectedProTimelineTask) => {
        if (dragState) {
            if (dragState.mode === 'connect' && dragState.targetTaskId === task.id) {
                setDragState(s => s ? { ...s, targetTaskId: null } : null);
            }
            return;
        }
        onHoverTask?.(null);
        setTooltipState(null);
    }, [dragState, onHoverTask]);

    const handleTaskMouseMove = useCallback((e: React.MouseEvent) => {
        if (tooltipState) setTooltipState(s => s ? { ...s, x: e.clientX, y: e.clientY } : null);
    }, [tooltipState]);
    
    return (
        <div 
            style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelDragInteraction}
        >
            {tasks.map(task => {
                if (!task._computed || !task._computed.isVisible) return null;
                let { x, w } = task._computed;
                const { laneIndex } = task._computed;
                
                const isDragging = dragState?.taskId === task.id;
                let renderProgress = clampProTaskProgress(task.progress) ?? 0;
                
                if (isDragging) {
                    if (dragState.mode === 'move') x = snapX(dragState.origX + dragDeltaX);
                    else if (dragState.mode === 'resize-right') w = Math.max(pixelsPerDay, dragState.origW + dragDeltaW);
                    else if (dragState.mode === 'progress') renderProgress = dragProgress;
                }

                const y = HEADER_HEIGHT + laneIndex * ROW_HEIGHT + BAR_TOP_MARGIN;
                const isSelected = isProTaskSelected(task);
                const isHovered = hoveredTaskId === task.id && !isDragging;
                const type = task.type || 'phase';
                const accessibleTaskName = getProTaskLayerAccessibleName(task.name);
                const isConnectionSource = connectionState?.sourceTaskId === task.id;
                const isConnectionTarget = connectionState?.targetTaskId === task.id;
                const taskBarAccessibilityProps = {
                    className: `pro-timeline-task-bar${isConnectionSource ? ' pro-timeline-task-bar--connection-source' : ''}${isConnectionTarget ? ' pro-timeline-task-bar--connection-target' : ''}`,
                    role: 'group',
                    tabIndex: 0,
                    'aria-label': `${accessibleTaskName}，时间轴任务`,
                    'aria-current': isSelected ? 'true' : undefined,
                    'aria-keyshortcuts': 'Enter Space Control+Enter Meta+Enter F2 C ArrowLeft ArrowRight ArrowUp ArrowDown Home End Escape Shift+ArrowLeft Shift+ArrowRight',
                    'data-connection-source': isConnectionSource ? 'true' : undefined,
                    'data-connection-target': isConnectionTarget ? 'true' : undefined,
                    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => handleTaskBarKeyDown(event, task),
                } as const;
                
                // Color Mapping
                const defaultColors = {
                    phase: theme?.palette?.success?.main || '#52c41a',
                    event: theme?.palette?.primary?.main || '#1890ff',
                    milestone: theme?.palette?.error?.main || '#cf1322',
                    summary: theme?.palette?.neutral?.dark || (theme?.mode === 'dark' ? '#8c8c8c' : '#434343'),
                };
                // Enforce strictly theme mapped colors for valid semantic types, otherwise fallback to task.color
                const barColor = defaultColors[type as keyof typeof defaultColors] || task.color || defaultColors.phase;
                const isDarkTheme = theme?.mode === 'dark';
                const textColor = (type === 'event' || type === 'milestone') ? (isDarkTheme ? 'rgba(255,255,255,0.85)' : '#434343') : '#ffffff';

                const isCritical = showCriticalPath && criticalPathTaskIds?.has(task.id);

                // Render baseline bar under the task bar if enabled
                const renderBaselineBar = showBaseline && task.baselineStartDate && task.baselineEndDate && (type === 'phase' || type === 'event' || type === 'milestone');
                let baselineBarElement = null;
                if (renderBaselineBar) {
                    const bLeft = dateToX(task.baselineStartDate!);
                    const bRight = dateToX(task.baselineEndDate!);
                    const bWidth = Math.max(6, bRight - bLeft);
                    const bTop = y + 22;
                    baselineBarElement = (
                        <div
                            key={`${task.id}-baseline`}
                            style={{
                                position: 'absolute',
                                left: type === 'milestone' ? bLeft - 5 : bLeft,
                                top: bTop,
                                width: type === 'milestone' ? 10 : bWidth,
                                height: 6,
                                borderRadius: 3,
                                background: 'rgba(128, 128, 128, 0.45)',
                                border: '1.2px dashed rgba(120, 120, 120, 0.75)',
                                pointerEvents: 'none',
                                zIndex: 0,
                            }}
                        />
                    );
                }

                const mainBarElement = (() => {
                    // === Summary Bar (Roll-up bracket) ===
                    if (type === 'summary') {
                        return (
                            <div key={task.id} {...taskBarAccessibilityProps}
                                style={{
                                    position: 'absolute', left: x, top: y + 8, width: Math.max(4, w), height: 12,
                                    pointerEvents: 'auto', cursor: 'pointer',
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onTaskClick?.(
                                        task.id,
                                        isProTimelineAdditiveSelection(event.ctrlKey, event.metaKey),
                                    );
                                }}
                                onMouseEnter={(e) => handleTaskMouseEnter(e, task)}
                                onMouseLeave={(e) => handleTaskMouseLeave(e, task)}
                                onMouseMove={handleTaskMouseMove}
                            >
                                {/* Top Bar */}
                                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, background: barColor }} />
                                {/* Left Triangle */}
                                <div style={{
                                    position: 'absolute', left: 0, top: 0,
                                    width: 0, height: 0,
                                    borderTop: `12px solid ${barColor}`,
                                    borderRight: '8px solid transparent',
                                }} />
                                {/* Right Triangle */}
                                <div style={{
                                    position: 'absolute', right: 0, top: 0,
                                    width: 0, height: 0,
                                    borderTop: `12px solid ${barColor}`,
                                    borderLeft: '8px solid transparent',
                                }} />
                            </div>
                        );
                    }

                    // === Milestone ===
                    if (type === 'milestone') {
                        const isCyclic = cyclicTaskIds?.has(task.id);
                        const milestoneBorderColor = isCyclic ? '#faad14' : (isCritical ? '#ff4d4f' : barColor);
                        return (
                            <div key={task.id} {...taskBarAccessibilityProps}
                                style={{
                                    position: 'absolute', left: x - 14, top: y, width: 28, height: 28,
                                    pointerEvents: 'auto', cursor: isDragging ? 'grabbing' : 'grab',
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onTaskClick?.(
                                        task.id,
                                        isProTimelineAdditiveSelection(event.ctrlKey, event.metaKey),
                                    );
                                }}
                                onPointerDown={(e) => handleTaskPointerDown(e, task, 'move')}
                                onMouseEnter={(e) => handleTaskMouseEnter(e, task)}
                                onMouseLeave={(e) => handleTaskMouseLeave(e, task)}
                                onMouseMove={handleTaskMouseMove}
                            >
                                <div style={{
                                    position: 'absolute', left: 4, top: 4, width: 20, height: 20,
                                    backgroundColor: isSelected ? '#fff' : (isCyclic ? '#faad14' : (isCritical ? '#ff4d4f' : barColor)),
                                    border: isCyclic ? `2px dashed #faad14` : `2.5px solid ${milestoneBorderColor}`,
                                    transform: `rotate(45deg)${isDragging ? ' scale(1.15)' : isHovered ? ' scale(1.08)' : ''}`,
                                    boxShadow: isSelected
                                        ? `0 0 0 4px ${milestoneBorderColor}25, 0 4px 12px rgba(0,0,0,0.12)`
                                        : isHovered
                                            ? `0 0 12px ${milestoneBorderColor}40`
                                            : '0 2px 6px rgba(0,0,0,0.12)',
                                    transition: isDragging ? 'none' : 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    ...(isCyclic 
                                        ? { animation: 'pro-timeline-cyclic-glow 2s infinite ease-in-out' }
                                        : (isCritical ? { animation: 'pro-timeline-critical-glow 2s infinite ease-in-out' } : {}))
                                }}>
                                    <FlagFilled style={{ fontSize: 9, color: isSelected ? milestoneBorderColor : '#fff', transform: 'rotate(-45deg)' }} />
                                </div>
                                <div style={{
                                    position: 'absolute', left: 30, top: 6, width: 220, fontSize: 11,
                                    fontWeight: 600, color: textColor, whiteSpace: 'nowrap', pointerEvents: 'auto',
                                    textShadow: isDarkTheme ? '0 1px 3px rgba(0,0,0,0.8)' : '0 1px 3px #fff',
                                    display: 'flex', alignItems: 'center', gap: 4
                                }}>
                                    {task.priority && (
                                        <span style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            backgroundColor: task.priority === 'high' ? '#ff4d4f' : task.priority === 'medium' ? '#fa8c16' : '#1890ff',
                                            display: 'inline-block',
                                            flexShrink: 0
                                        }} />
                                    )}
                                    <ProTaskInlineNameEditor
                                        accessibleTaskName={accessibleTaskName} isEditing={editingTaskId === task.id}
                                        taskName={task.name} value={editingText} width="100%"
                                        onStart={() => startTaskNameEdit(task)} onChange={setEditingText}
                                        onCommit={commitEdit} onCancel={cancelTaskNameEdit}
                                    />
                                    {task.assignee && <ProTaskAssigneeAvatar assignee={task.assignee} />}
                                </div>
                            </div>
                        );
                    }

                    // === Event (Pill / Badge style) ===
                    if (type === 'event') {
                        const isCyclic = cyclicTaskIds?.has(task.id);
                        return (
                            <div key={task.id} {...taskBarAccessibilityProps}
                                style={{
                                    position: 'absolute', left: x, top: y, height: BAR_HEIGHT,
                                    pointerEvents: 'auto', cursor: isDragging && dragState.mode === 'move' ? 'grabbing' : 'grab',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '0 12px 0 4px',
                                    borderRadius: BAR_HEIGHT / 2,
                                    background: isSelected ? (isDarkTheme ? 'rgba(0,0,0,0.8)' : '#fff') : (isDarkTheme ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)'),
                                    backdropFilter: 'blur(4px)',
                                    border: isCyclic
                                        ? `2px dashed #faad14`
                                        : `1.5px solid ${isCritical ? '#ff4d4f' : barColor}`,
                                    boxShadow: isSelected 
                                        ? `0 0 0 3px ${isCyclic ? '#faad14' : barColor}30, 0 4px 12px rgba(0,0,0,0.1)` 
                                        : isHovered 
                                            ? '0 4px 12px rgba(0,0,0,0.08)' 
                                            : '0 1px 4px rgba(0,0,0,0.04)',
                                    color: textColor,
                                    fontSize: 12, fontWeight: 600,
                                    transition: isDragging ? 'none' : 'all 0.2s',
                                    transform: isDragging ? 'scale(1.02)' : isHovered ? 'translateY(-1px)' : 'none',
                                    whiteSpace: 'nowrap',
                                    zIndex: isHovered || isSelected ? 10 : 1,
                                    ...(isCyclic
                                        ? { animation: 'pro-timeline-cyclic-glow 2s infinite ease-in-out' }
                                        : (isCritical ? { animation: 'pro-timeline-critical-glow 2s infinite ease-in-out' } : {}))
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onTaskClick?.(
                                        task.id,
                                        isProTimelineAdditiveSelection(event.ctrlKey, event.metaKey),
                                    );
                                }}
                                onPointerDown={(e) => handleTaskPointerDown(e, task, 'move')}
                                onMouseEnter={(e) => handleTaskMouseEnter(e, task)}
                                onMouseLeave={(e) => handleTaskMouseLeave(e, task)}
                                onMouseMove={handleTaskMouseMove}
                            >
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: isCyclic ? '#faad14' : (isCritical ? '#ff4d4f' : barColor), color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <ClockCircleOutlined style={{ fontSize: 11 }} />
                                </div>
                                {task.priority && (
                                    <span style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        backgroundColor: task.priority === 'high' ? '#ff4d4f' : task.priority === 'medium' ? '#fa8c16' : '#1890ff',
                                        display: 'inline-block',
                                        flexShrink: 0
                                    }} />
                                )}
                                <span style={{ textShadow: isDarkTheme ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px #fff', pointerEvents: 'auto' }}>
                                    <ProTaskInlineNameEditor
                                        accessibleTaskName={accessibleTaskName} isEditing={editingTaskId === task.id}
                                        taskName={task.name} value={editingText} width={120}
                                        onStart={() => startTaskNameEdit(task)} onChange={setEditingText}
                                        onCommit={commitEdit} onCancel={cancelTaskNameEdit}
                                    />
                                </span>
                                {task.assignee && <ProTaskAssigneeAvatar assignee={task.assignee} withMargin />}
                            </div>
                        );
                    }

                    // === Phase / Default bar ===
                    const isCyclic = cyclicTaskIds?.has(task.id);
                    return (
                        <div key={task.id} {...taskBarAccessibilityProps}
                            style={{
                                position: 'absolute', left: x, top: y, width: Math.max(8, w), height: BAR_HEIGHT,
                                pointerEvents: 'auto', cursor: isDragging && dragState.mode === 'move' ? 'grabbing' : 'grab',
                                borderRadius:  6,
                                background: isCyclic
                                    ? `linear-gradient(180deg, #faad14F0 0%, #ffd666D8 100%)`
                                    : `linear-gradient(180deg, ${isCritical ? '#ff4d4f' : barColor}F0 0%, ${isCritical ? '#ff7875' : barColor}D8 100%)`,
                                boxShadow: isSelected
                                    ? `0 0 0 2px ${isDarkTheme ? '#141414' : '#fff'}, 0 0 0 4px ${isCyclic ? '#faad14' : (isCritical ? '#ff4d4f' : barColor)}60, 0 4px 16px rgba(0,0,0,0.12)`
                                    : isDragging
                                        ? `0 8px 24px rgba(0,0,0,0.18)`
                                        : isHovered
                                            ? `0 2px 12px ${isCyclic ? '#faad14' : (isCritical ? '#ff4d4f' : barColor)}30`
                                            : '0 1px 4px rgba(0,0,0,0.08)',
                                border: isCyclic
                                    ? `2px dashed #faad14`
                                    : `1px solid ${isCritical ? '#ff4d4f' : (isDarkTheme ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)')}`,
                                transition: isDragging ? 'none' : 'box-shadow 0.2s, transform 0.2s',
                                transform: isDragging ? 'scale(1.02)' : isHovered ? 'translateY(-1px)' : 'none',
                                overflow: 'hidden',
                                opacity: isDragging ? 0.92 : 1,
                                ...(isCyclic
                                    ? { animation: 'pro-timeline-cyclic-glow 2s infinite ease-in-out' }
                                    : (isCritical ? { animation: 'pro-timeline-critical-glow 2s infinite ease-in-out' } : {}))
                            }}
                            onClick={(event) => {
                                event.stopPropagation();
                                onTaskClick?.(
                                    task.id,
                                    isProTimelineAdditiveSelection(event.ctrlKey, event.metaKey),
                                );
                            }}
                            onPointerDown={(e) => handleTaskPointerDown(e, task, 'move')}
                            onMouseEnter={(e) => handleTaskMouseEnter(e, task)}
                            onMouseLeave={(e) => handleTaskMouseLeave(e, task)}
                            onMouseMove={handleTaskMouseMove}
                        >
                            {/* 进度条背景轨道 */}
                            <div style={{
                                position: 'absolute', left: 3, right: 3, bottom: 3, height: 4,
                                borderRadius: 2, background: 'rgba(0,0,0,0.15)', zIndex: 0,
                            }}>
                                <div style={{
                                    width: `${renderProgress}%`, height: '100%', borderRadius: 2,
                                    background: 'rgba(255,255,255,0.6)',
                                    transition: isDragging && dragState.mode === 'progress' ? 'none' : 'width 0.3s ease',
                                }} />

                                {/* 交互式进度手柄 */}
                                {type === 'phase' && (
                                    <div
                                        className="pro-timeline-task-progress-handle"
                                        role="slider"
                                        tabIndex={0}
                                        aria-label={`调整 ${accessibleTaskName} 的进度`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={renderProgress}
                                        aria-valuetext={`${renderProgress}%`}
                                        aria-keyshortcuts="ArrowLeft ArrowRight ArrowDown ArrowUp Home End Shift+ArrowLeft Shift+ArrowRight"
                                        style={{
                                            position: 'absolute', left: `${renderProgress}%`, top: -4, bottom: -4,
                                            width: 12, marginLeft: -6, cursor: 'col-resize', zIndex: 5,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                        onPointerDown={(e) => { e.stopPropagation(); handleTaskPointerDown(e, task, 'progress'); }}
                                        onKeyDown={(event) => handleProgressKeyDown(event, task)}
                                    >
                                        <CaretRightFilled style={{ 
                                            color: '#fff', fontSize: 10, transform: 'rotate(90deg)',
                                            opacity: isHovered || isDragging ? 1 : 0, transition: 'opacity 0.2s',
                                            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))'
                                        }} />
                                    </div>
                                )}
                            </div>

                            <div style={{
                                position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center',
                                gap: 5, padding: '0 8px', height: '100%', paddingBottom: 4,
                                color: '#ffffff', fontSize: 12, fontWeight: 500, pointerEvents: 'none',
                                textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                            }}>
                                <CalendarOutlined style={{ opacity: 0.85, fontSize: 11 }}/>
                                {task.priority && (
                                    <span style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        backgroundColor: task.priority === 'high' ? '#ff4d4f' : task.priority === 'medium' ? '#fa8c16' : '#1890ff',
                                        display: 'inline-block',
                                        flexShrink: 0
                                    }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, pointerEvents: 'auto' }}>
                                    <ProTaskInlineNameEditor
                                        accessibleTaskName={accessibleTaskName} isEditing={editingTaskId === task.id}
                                        taskName={task.name} value={editingText} width="100%"
                                        onStart={() => startTaskNameEdit(task)} onChange={setEditingText}
                                        onCommit={commitEdit} onCancel={cancelTaskNameEdit}
                                    />
                                </span>
                                {renderProgress > 0 && w > 80 && (
                                    <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 600 }}>{renderProgress}%</span>
                                )}
                                {task.assignee && <ProTaskAssigneeAvatar assignee={task.assignee} withMargin />}
                            </div>

                            {/* 右侧拉伸手柄 */}
                            {type === 'phase' && (
                                <div
                                    className="pro-timeline-task-resize-handle"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`调整 ${accessibleTaskName} 的工期，当前 ${Math.max(1, getWorkDays(task.startDate, task.endDate))} 个工作日`}
                                    aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
                                    style={{
                                        position: 'absolute', right: 0, top: 0, bottom: 0, width: 8,
                                        cursor: 'ew-resize', zIndex: 3,
                                        background: isHovered || isSelected ? 'rgba(255,255,255,0.2)' : 'transparent',
                                        borderRadius: '0 6px 6px 0',
                                        transition: 'background 0.15s',
                                    }}
                                    onPointerDown={(e) => { e.stopPropagation(); handleTaskPointerDown(e, task, 'resize-right'); }}
                                    onKeyDown={(event) => handleResizeKeyDown(event, task)}
                                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.35)'; }}
                                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = isHovered || isSelected ? 'rgba(255,255,255,0.2)' : 'transparent'; }}
                                />
                            )}

                        </div>
                    );
                })();

                const connectionControlElement = isConnectableTask(task) ? (
                    <ProTaskDependencyControl
                        active={isConnectionSource}
                        label={accessibleTaskName}
                        left={getProTaskDependencyControlLeft(type, x, w)}
                        top={y + 2}
                        onToggle={() => toggleConnection(task.id)}
                        onKeyDown={(event) => {
                            handleTaskConnectionKeyDown(event, task);
                        }}
                        onPointerDown={(event) => {
                            event.stopPropagation();
                            handleTaskPointerDown(event, task, 'connect');
                        }}
                    />
                ) : null;

                return (
                    <React.Fragment key={task.id}>
                        {mainBarElement}
                        {connectionControlElement}
                        {baselineBarElement}
                    </React.Fragment>
                );
            })}

            <ProTaskDependencyFeedback
                announcement={connectionAnnouncement}
                active={Boolean(connectionState)}
            />

            {/* SVG 连线草案 */}
            {dragState && dragState.mode === 'connect' && (() => {
                const targetTask = dragState.targetTaskId ? tasks.find(t => t.id === dragState.targetTaskId) : null;
                const srcX = dragState.origX + dragState.origW + 16;
                const srcY = (dragState.origY || 0) + BAR_HEIGHT / 2;
                const tgtX = targetTask?._computed ? targetTask._computed.x - 16 : dragState.origX + dragDeltaX;
                const tgtY = targetTask?._computed ? HEADER_HEIGHT + targetTask._computed.laneIndex * ROW_HEIGHT + BAR_TOP_MARGIN + BAR_HEIGHT / 2 : (dragState.origY || 0) + dragDeltaY;

                // 简单的两段折线或贝塞尔曲线
                const cX = (srcX + tgtX) / 2;
                const pathData = `M ${srcX} ${srcY} C ${cX} ${srcY}, ${cX} ${tgtY}, ${tgtX} ${tgtY}`;

                return (
                    <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 90, overflow: 'visible' }}>
                        <path d={pathData} fill="none" stroke="#faad14" strokeWidth={2} strokeDasharray="4 4" 
                            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
                        <circle cx={tgtX} cy={tgtY} r={4} fill="#faad14" />
                        {targetTask && (
                            <rect x={targetTask._computed!.x} y={HEADER_HEIGHT + targetTask._computed!.laneIndex * ROW_HEIGHT + BAR_TOP_MARGIN - 2} 
                                width={Math.max(8, targetTask._computed!.w)} height={BAR_HEIGHT + 4} 
                                fill="none" stroke="#faad14" strokeWidth={2} rx={6} />
                        )}
                    </svg>
                );
            })()}

            {/* 拖拽中数值浮标 */}
            {dragState && (() => {
                const task = tasks.find(t => t.id === dragState.taskId);
                if (!task?._computed) return null;
                
                if (dragState.mode === 'progress') {
                    // Progress Value Box
                    const px = task._computed.x + (task._computed.w * dragProgress / 100);
                    const py = HEADER_HEIGHT + task._computed.laneIndex * ROW_HEIGHT - 6;
                    return (
                        <div style={{
                            position: 'absolute', left: px, top: py,
                            background: '#1890ff', color: '#fff', fontSize: 11, fontWeight: 600,
                            padding: '3px 6px', borderRadius: 4, transform: 'translate(-50%, -100%)',
                            boxShadow: '0 2px 8px rgba(24,144,255,0.3)', pointerEvents: 'none', zIndex: 100
                        }}>{dragProgress}%</div>
                    );
                }

                if (dragDateLabel) {
                    // Date Format Box
                    const labelX = dragState.mode === 'move' ? snapX(dragState.origX + dragDeltaX) : dragState.origX;
                    const labelY = HEADER_HEIGHT + task._computed.laneIndex * ROW_HEIGHT - 6;
                    return (
                        <div style={{
                            position: 'absolute', left: labelX, top: labelY,
                            background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: 600,
                            padding: '3px 8px', borderRadius: 4,
                            fontVariantNumeric: 'tabular-nums',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap',
                            transform: 'translateY(-100%)',
                        }}>
                            {dragDateLabel.start} → {dragDateLabel.end}
                        </div>
                    );
                }
                return null;
            })()}

            {/* Tooltip */}
            {tooltipState && !dragState && <ProTaskTooltip task={tooltipState.task} x={tooltipState.x} y={tooltipState.y} theme={theme} />}
        </div>
    );
}
