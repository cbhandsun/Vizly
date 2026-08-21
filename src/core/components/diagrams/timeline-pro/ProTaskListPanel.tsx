import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Edge } from '@xyflow/react';
import { ProGanttTask, getWorkDays, addWorkDays, getWorkDaysSigned, useProTimelineEngine } from '../../../hooks/useProTimelineEngine';
import { Select, Tooltip } from 'antd';
import { CaretRightOutlined, CaretDownOutlined, CalendarOutlined, FlagFilled, ClockCircleOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useTheme } from '../../../themes/useCoreTheme';
import { todayDateOnly } from '../../../utils/dateOnly';
import type { Theme } from '../../../themes/types/ThemeTypes';
import {
    getProTaskAccessibleName,
    getProTaskListKeyboardWidth,
    normalizeProTaskListWidth,
    PRO_TASK_LIST_MAX_WIDTH,
    PRO_TASK_LIST_MIN_WIDTH,
    type ProTaskEditingCellState,
} from './proTaskListInteraction';
import { isProTimelineAdditiveSelection } from './proTimelineViewportInteraction';
import { getProTimelineDeletionFallbackId } from './proTimelineTaskTransactions';
import { ProTaskDeleteDialog } from './ProTaskDeleteDialog';
import { ProTaskRowActions } from './ProTaskRowActions';
import { PRO_TASK_ROW_HEIGHT as ROW_HEIGHT } from './proTaskLayerGeometry';
import {
    createPendingProTaskDeletion,
    PRO_TASK_DELETE_IMPACT_LABELS_ZH,
    type PendingProTaskDeletion,
} from './proTaskDeletionDialogModel';

export interface ProTaskListPanelProps {
    tasks: ProGanttTask[];
    edges?: readonly Edge[];
    width: number;
    onWidthChange: (w: number) => void;
    hoveredTaskId: string | null;
    onHoverTask: (id: string | null) => void;
    onClickTask: (id: string, additive?: boolean) => void;
    selectedTaskId: string | null;
    selectedTaskIds?: ReadonlySet<string>;
    scrollTop: number;
    onScrollTopChange: (y: number) => void;
    onTaskExpandToggle?: (id: string) => void;
    onTaskUpdate?: (id: string, updates: Partial<ProGanttTask>) => void;
    onTaskAdd?: (parentId: string | null, type: 'phase' | 'milestone') => void;
    onTaskDelete?: (id: string) => void;
    cyclicTaskIds?: Set<string>;
}

const HEADER_HEIGHT = 52;

const getTypeIcons = (theme: Theme | null): Record<string, React.ReactNode> => ({
    phase:     <CalendarOutlined style={{ fontSize: 13, color: theme?.palette?.success?.main || '#52c41a' }} />,
    event:     <ClockCircleOutlined style={{ fontSize: 13, color: theme?.palette?.primary?.main || '#1890ff' }} />,
    milestone: <FlagFilled style={{ fontSize: 13, color: theme?.palette?.error?.main || '#cf1322' }} />,
    summary:   <FolderOpenOutlined style={{ fontSize: 13, color: theme?.mode === 'dark' ? '#d9d9d9' : '#434343' }} />,
});

export default function ProTaskListPanel({
    tasks, edges = [], width, onWidthChange, hoveredTaskId, onHoverTask, onClickTask, selectedTaskId, selectedTaskIds, onScrollTopChange,
    onTaskExpandToggle, onTaskUpdate, onTaskAdd, onTaskDelete, cyclicTaskIds
}: ProTaskListPanelProps) {
    const [isResizing, setIsResizing] = useState(false);
    const [editingCell, setEditingCell] = useState<ProTaskEditingCellState | null>(null);
    const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
    const [pendingTaskDeletion, setPendingTaskDeletion] = useState<PendingProTaskDeletion | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const taskRowRefs = useRef(new Map<string, HTMLDivElement>());
    const deletionFocusTargetRef = useRef<string | null>(null);
    const editingOriginRef = useRef<HTMLDivElement | null>(null);
    const restoreEditingOriginFocusRef = useRef(false);
    const [theme] = useTheme();
    const { showBaseline } = useProTimelineEngine();
    const normalizedWidth = normalizeProTaskListWidth(width);

    const isDark = theme?.mode === 'dark';
    const panelBg = theme?.palette?.neutral?.background || (isDark ? '#141414' : '#fff');
    const borderColor = theme?.palette?.neutral?.border || (isDark ? '#303030' : '#e0e0e0');
    const rowBorderColor = isDark ? '#262626' : '#f5f5f5';
    const headerBg = isDark ? 'linear-gradient(180deg, #1f1f1f 0%, #141414 100%)' : 'linear-gradient(180deg, #fafbfc 0%, #f5f6f8 100%)';
    const headerTextColor = isDark ? 'rgba(255,255,255,0.65)' : '#595959';
    const rowTextColorPrimary = isDark ? 'rgba(255,255,255,0.85)' : '#434343';
    const rowTextColorSecondary = isDark ? 'rgba(255,255,255,0.45)' : '#8c8c8c';
    const summaryTextColor = isDark ? 'rgba(255,255,255,0.95)' : '#262626';
    const disabledTextColor = isDark ? 'rgba(255,255,255,0.25)' : '#bfbfbf';
    const primaryColor = theme?.palette?.primary?.main || '#1890ff';
    const typeIcons = getTypeIcons(theme);
    const editValue = editingCell?.value ?? '';
    const setEditValue = useCallback((value: string) => {
        setEditingCell(current => current ? { ...current, value } : current);
    }, []);

    // Focus input on edit start
    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            if (editingCell.field === 'name' || editingCell.field === 'assignee') {
                inputRef.current.setSelectionRange(0, editingCell.value.length);
            }
        }
    }, [editingCell]);

    useEffect(() => {
        if (editingCell || !restoreEditingOriginFocusRef.current) return;
        restoreEditingOriginFocusRef.current = false;
        editingOriginRef.current?.focus({ preventScroll: true });
    }, [editingCell]);

    useEffect(() => {
        const focusTargetId = deletionFocusTargetRef.current;
        if (!focusTargetId || !tasks.some(task => task.id === focusTargetId)) return;
        deletionFocusTargetRef.current = null;
        taskRowRefs.current.get(focusTargetId)?.focus({ preventScroll: true });
    }, [tasks]);

    const getAvatarColor = useCallback((name: string) => {
        const colors = [
            '#1890ff', '#2f54eb', '#722ed1', '#eb2f96', '#fa8c16',
            '#faad14', '#a0d911', '#52c41a', '#13c2c2'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const idx = Math.abs(hash) % colors.length;
        return colors[idx];
    }, []);

    const priorityTag = useCallback((priority?: 'high' | 'medium' | 'low') => {
        if (!priority) return <span style={{ color: disabledTextColor }}>—</span>;
        const config = {
            high: { bg: isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0', border: isDark ? 'rgba(255,77,79,0.3)' : '#ffa39e', text: '#ff4d4f', label: '高' },
            medium: { bg: isDark ? 'rgba(250,140,22,0.15)' : '#fff7e6', border: isDark ? 'rgba(250,140,22,0.3)' : '#ffd591', text: '#fa8c16', label: '中' },
            low: { bg: isDark ? 'rgba(24,144,255,0.15)' : '#e6f7ff', border: isDark ? 'rgba(24,144,255,0.3)' : '#91d5ff', text: '#1890ff', label: '低' },
        };
        const c = config[priority];
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                lineHeight: 1
            }}>
                {c.label}
            </span>
        );
    }, [isDark, disabledTextColor]);

    // 计算每个任务的工期天数 (Helper for edit compute)
    const getDuration = useCallback((t: ProGanttTask) => {
        if (t.type === 'milestone') return 0;
        if (!t.startDate || !t.endDate) return null;
        return getWorkDays(t.startDate, t.endDate);
    }, []);

    // Save and commit edit
    const commitEdit = useCallback(() => {
        if (editingCell) {
            const { id, field } = editingCell;
            const task = tasks.find(t => t.id === id);
            
            if (task) {
                if (field === 'name' && editValue.trim()) {
                    onTaskUpdate?.(id, { name: editValue.trim() });
                } else if (field === 'startDate' && editValue) {
                    const oldDur = getDuration(task) || 1;
                    if (task.type === 'milestone') {
                        onTaskUpdate?.(id, { startDate: editValue, endDate: editValue });
                    } else {
                        const newEnd = addWorkDays(editValue, oldDur);
                        onTaskUpdate?.(id, { startDate: editValue, endDate: newEnd });
                    }
                } else if (field === 'duration') {
                    const num = parseInt(editValue, 10);
                    if (!isNaN(num) && num >= 0) {
                        const start = task.startDate || todayDateOnly();
                        const newEnd = addWorkDays(start, num);
                        onTaskUpdate?.(id, { startDate: start, endDate: newEnd });
                    }
                } else if (field === 'assignee') {
                    onTaskUpdate?.(id, { assignee: editValue.trim() || undefined });
                } else if (field === 'priority') {
                    const priority = editValue === 'high' || editValue === 'medium' || editValue === 'low'
                        ? editValue
                        : undefined;
                    onTaskUpdate?.(id, { priority });
                }
            }
        }
        setEditingCell(null);
    }, [editingCell, editValue, onTaskUpdate, tasks, getDuration]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            restoreEditingOriginFocusRef.current = Boolean(editingOriginRef.current);
            commitEdit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            restoreEditingOriginFocusRef.current = Boolean(editingOriginRef.current);
            setEditingCell(null);
        }
    };

    // --- 拖拽调整宽度 ---
    const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const startW = normalizedWidth;

        const onMove = (ev: PointerEvent) => {
            const newW = normalizeProTaskListWidth(startW + (ev.clientX - startX));
            onWidthChange(newW);
        };
        const onUp = () => {
            setIsResizing(false);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [normalizedWidth, onWidthChange]);

    const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const nextWidth = getProTaskListKeyboardWidth(normalizedWidth, event.key);
        if (nextWidth === null) return;
        event.preventDefault();
        onWidthChange(nextWidth);
    }, [normalizedWidth, onWidthChange]);


    return (
        <div className="pro-timeline-task-list" style={{
            width: normalizedWidth, minWidth: PRO_TASK_LIST_MIN_WIDTH, maxWidth: PRO_TASK_LIST_MAX_WIDTH,
            borderRight: `1px solid ${borderColor}`,
            background: panelBg,
            display: 'flex', flexDirection: 'column',
            position: 'relative', zIndex: 2,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}>
            {/* 表头 */}
            <div style={{
                height: HEADER_HEIGHT, display: 'flex', alignItems: 'center',
                padding: '0 16px', borderBottom: `1px solid ${borderColor}`,
                background: headerBg,
                fontWeight: 600, fontSize: 12, color: headerTextColor,
                letterSpacing: '0.5px', textTransform: 'uppercase',
                flexShrink: 0,
            }}>
                <span className="pro-timeline-task-column--name" style={{ flex: 1, minWidth: 120 }}>任务名称</span>
                <span className="pro-timeline-task-column--secondary" style={{ width: 75, textAlign: 'left', paddingLeft: 8 }}>负责人</span>
                <span className="pro-timeline-task-column--secondary" style={{ width: 65, textAlign: 'center' }}>优先级</span>
                <span className="pro-timeline-task-column--secondary" style={{ width: 80, textAlign: 'right', paddingRight: 8 }}>开始</span>
                <span className="pro-timeline-task-column--secondary" style={{ width: 44, textAlign: 'right' }}>工期</span>
            </div>

            {/* 任务行 (可滚动) */}
            <div
                aria-label="项目任务列表"
                aria-multiselectable="true"
                role="listbox"
                style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
                onScroll={(e) => onScrollTopChange((e.target as HTMLDivElement).scrollTop)}
            >
                {tasks.map((task, idx) => {
                    const isHovered = hoveredTaskId === task.id;
                    const isSelected = selectedTaskIds?.has(task.id) ?? selectedTaskId === task.id;
                    const type = task.type || 'phase';
                    const duration = getDuration(task);
                    const dateLabel = task.startDate ? task.startDate.slice(5) : '--'; // MM-DD
                    
                    const depth = task._computed?.depth || 0;
                    const hasChildren = task._computed?.hasChildren;
                    const isExpanded = task.isExpanded !== false;
                    const isVisible = task._computed?.isVisible !== false;
                    const accessibleTaskName = getProTaskAccessibleName(task.name);
                    const showRowActions = isHovered || focusedTaskId === task.id;

                    if (!isVisible) return null; // Skip hidden rows

                    return (
                        <div
                            key={task.id}
                            ref={(element) => {
                                if (element) taskRowRefs.current.set(task.id, element);
                                else taskRowRefs.current.delete(task.id);
                            }}
                            aria-label={`${accessibleTaskName}，开始 ${task.startDate || '未设置'}，工期 ${duration ?? '未设置'} 天`}
                            aria-selected={isSelected}
                            aria-keyshortcuts="Enter Space Control+Enter Meta+Enter F2 ArrowLeft ArrowRight"
                            className="pro-timeline-task-row"
                            role="option"
                            tabIndex={0}
                            style={{
                                height: ROW_HEIGHT, display: 'flex', alignItems: 'center',
                                paddingRight: 16, cursor: 'pointer',
                                paddingLeft: 16 + depth * 22, // Hierarchy Indentation
                                borderBottom: `1px solid ${rowBorderColor}`,
                                background: isSelected
                                    ? (isDark ? 'linear-gradient(90deg, rgba(24,144,255,0.15) 0%, rgba(24,144,255,0.05) 100%)' : 'linear-gradient(90deg, #e6f7ff 0%, #f0f9ff 100%)')
                                    : isHovered
                                        ? (isDark ? 'rgba(255,255,255,0.08)' : '#fafafa')
                                        : idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : '#fcfcfd'),
                                transition: 'background 0.12s',
                            }}
                            onMouseEnter={() => onHoverTask(task.id)}
                            onMouseLeave={() => onHoverTask(null)}
                            onFocus={() => setFocusedTaskId(task.id)}
                            onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
                                    setFocusedTaskId(null);
                                }
                            }}
                            onClick={(event) => onClickTask(
                                task.id,
                                isProTimelineAdditiveSelection(event.ctrlKey, event.metaKey),
                            )}
                            onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onClickTask(
                                        task.id,
                                        isProTimelineAdditiveSelection(event.ctrlKey, event.metaKey),
                                    );
                                } else if (event.key === 'F2') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    editingOriginRef.current = event.currentTarget;
                                    setEditingCell({ id: task.id, field: 'name', value: accessibleTaskName === '未命名任务' ? '' : accessibleTaskName });
                                } else if (event.key === 'ArrowRight' && hasChildren && !isExpanded) {
                                    event.preventDefault();
                                    onTaskExpandToggle?.(task.id);
                                } else if (event.key === 'ArrowLeft' && hasChildren && isExpanded) {
                                    event.preventDefault();
                                    onTaskExpandToggle?.(task.id);
                                }
                            }}
                        >
                            {/* Expand/Collapse Toggle */}
                            <div style={{ width: 18, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                {hasChildren && (
                                    <button
                                        type="button"
                                        className="pro-timeline-task-hierarchy-toggle"
                                        aria-expanded={isExpanded}
                                        aria-label={`${isExpanded ? '收起' : '展开'}任务 ${accessibleTaskName}`}
                                        onClick={(e) => { e.stopPropagation(); onTaskExpandToggle?.(task.id); }}
                                        style={{ 
                                            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', color: rowTextColorSecondary, borderRadius: 4,
                                            border: 0, padding: 0, background: 'transparent',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {isExpanded ? <CaretDownOutlined aria-hidden style={{ fontSize: 10 }} /> : <CaretRightOutlined aria-hidden style={{ fontSize: 10 }} />}
                                    </button>
                                )}
                            </div>

                            {/* Icon */}
                            <span style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                {typeIcons[type] || typeIcons.phase}
                            </span>

                            {/* Name / Inline Editor */}
                            <div
                                className="pro-timeline-task-column--name"
                                style={{
                                    flex: 1, fontSize: 13, color: type === 'summary' ? summaryTextColor : rowTextColorPrimary,
                                    fontWeight: type === 'summary' || isSelected ? 600 : 400,
                                    margin: '0 8px', minWidth: 0,
                                    display: 'flex', alignItems: 'center', height: '100%',
                                    gap: 4,
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    editingOriginRef.current = null;
                                    setEditingCell({ id: task.id, field: 'name', value: accessibleTaskName === '未命名任务' ? '' : accessibleTaskName });
                                }}
                                title="双击编辑任务名称，或聚焦任务后按 F2"
                            >
                                {cyclicTaskIds?.has(task.id) && (
                                    <Tooltip title="检测到循环依赖关系！">
                                        <span style={{ color: '#faad14', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>⚠️</span>
                                    </Tooltip>
                                )}
                                {editingCell?.id === task.id && editingCell?.field === 'name' ? (
                                    <input
                                        ref={inputRef}
                                        aria-label={`编辑 ${accessibleTaskName} 的任务名称`}
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleKeyDown}
                                        style={{
                                            width: '100%', border: `1px solid ${primaryColor}`, borderRadius: 4, 
                                            padding: '2px 6px', fontSize: 13, outline: 'none',
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: type === 'summary' ? summaryTextColor : rowTextColorPrimary,
                                            boxShadow: `0 0 0 2px ${primaryColor}33`
                                        }}
                                    />
                                ) : (
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                        {accessibleTaskName}
                                    </span>
                                )}
                            </div>

                            {showRowActions ? (
                                <ProTaskRowActions
                                    taskName={accessibleTaskName}
                                    primaryColor={primaryColor}
                                    deleteColor={theme?.palette?.error?.main || '#ff4d4f'}
                                    onAdd={(type) => onTaskAdd?.(task.id, type)}
                                    onDelete={() => setPendingTaskDeletion(
                                        createPendingProTaskDeletion(tasks, edges, task.id, accessibleTaskName),
                                    )}
                                />
                            ) : null}

                            {/* Assignee */}
                            <div
                                className="pro-timeline-task-column--secondary"
                                style={{
                                    width: 75, height: '100%', display: 'flex', alignItems: 'center',
                                    paddingLeft: 8, flexShrink: 0, minWidth: 0,
                                }}
                            >
                                {editingCell?.id === task.id && editingCell?.field === 'assignee' ? (
                                    <input
                                        ref={inputRef}
                                        aria-label={`编辑 ${accessibleTaskName} 的负责人`}
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleKeyDown}
                                        style={{
                                            width: '100%', border: `1px solid ${primaryColor}`, borderRadius: 4, 
                                            padding: '2px 4px', fontSize: 12, outline: 'none',
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: rowTextColorPrimary,
                                            boxShadow: `0 0 0 2px ${primaryColor}33`
                                        }}
                                    />
                                ) : (
                                    <div 
                                        style={{ 
                                            display: 'flex', alignItems: 'center', gap: 6, 
                                            width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' 
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingCell({ id: task.id, field: 'assignee', value: task.assignee || '' });
                                        }}
                                    >
                                        {task.assignee ? (
                                            <>
                                                <div style={{
                                                    width: 20, height: 20, borderRadius: '50%',
                                                    backgroundColor: getAvatarColor(task.assignee),
                                                    color: '#fff', fontSize: 10, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    {task.assignee.trim().charAt(0).toUpperCase()}
                                                </div>
                                                <span style={{ fontSize: 12, color: rowTextColorPrimary, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {task.assignee}
                                                </span>
                                            </>
                                        ) : (
                                            <span style={{ color: disabledTextColor, fontSize: 12 }}>—</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Priority */}
                            <div
                                className="pro-timeline-task-column--secondary"
                                style={{
                                    width: 65, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                {editingCell?.id === task.id && editingCell?.field === 'priority' ? (
                                    <Select
                                        aria-label={`编辑 ${accessibleTaskName} 的优先级`}
                                        size="small"
                                        value={task.priority || undefined}
                                        bordered={false}
                                        open={true}
                                        onDropdownVisibleChange={(open) => {
                                            if (!open) {
                                                setTimeout(() => setEditingCell(null), 150);
                                            }
                                        }}
                                        onChange={(val) => {
                                            onTaskUpdate?.(task.id, { priority: val || undefined });
                                            setEditingCell(null);
                                        }}
                                        style={{ width: '100%', fontSize: 11 }}
                                        dropdownStyle={{ zIndex: 10000 }}
                                        placeholder="选择"
                                        allowClear
                                        options={[
                                            { value: 'high', label: '高' },
                                            { value: 'medium', label: '中' },
                                            { value: 'low', label: '低' },
                                        ]}
                                    />
                                ) : (
                                    <div 
                                        style={{ 
                                            display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%'
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setEditingCell({ id: task.id, field: 'priority', value: task.priority || '' });
                                        }}
                                    >
                                        {priorityTag(task.priority)}
                                    </div>
                                )}
                            </div>

                            <div
                                className="pro-timeline-task-column--secondary"
                                style={{
                                    width: 80, textAlign: 'right', fontSize: 11,
                                    color: hasChildren ? disabledTextColor : rowTextColorSecondary, fontVariantNumeric: 'tabular-nums',
                                    flexShrink: 0, paddingRight: 8, height: '100%', 
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
                                    cursor: hasChildren ? 'not-allowed' : 'text',
                                    lineHeight: 1.2
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (!hasChildren) {
                                        setEditingCell({ id: task.id, field: 'startDate', value: task.startDate || todayDateOnly() });
                                    }
                                }}
                            >
                                {editingCell?.id === task.id && editingCell?.field === 'startDate' ? (
                                    <input
                                        ref={inputRef}
                                        aria-label={`编辑 ${accessibleTaskName} 的开始日期`}
                                        type="date"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleKeyDown}
                                        style={{ 
                                            width: 100, fontSize: 11, padding: '2px', outline: 'none', 
                                            border: `1px solid ${primaryColor}`,
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: rowTextColorPrimary,
                                            colorScheme: isDark ? 'dark' : 'light'
                                        }}
                                    />
                                ) : (
                                    <>
                                        <div>{dateLabel}</div>
                                        {showBaseline && task.baselineStartDate && (() => {
                                            const diff = getWorkDaysSigned(task.baselineStartDate, task.startDate);
                                            if (diff > 0) return <div style={{ fontSize: 9, color: '#ff4d4f', whiteSpace: 'nowrap', marginTop: 1, fontWeight: 600 }}>迟 {diff} 天</div>;
                                            if (diff < 0) return <div style={{ fontSize: 9, color: '#52c41a', whiteSpace: 'nowrap', marginTop: 1, fontWeight: 600 }}>提 {-diff} 天</div>;
                                            return <div style={{ fontSize: 9, color: rowTextColorSecondary, opacity: 0.6, whiteSpace: 'nowrap', marginTop: 1 }}>对齐</div>;
                                        })()}
                                    </>
                                )}
                            </div>

                            {/* Duration */}
                            <div
                                className="pro-timeline-task-column--secondary"
                                style={{
                                    width: 44, textAlign: 'right', fontSize: 11,
                                    color: (duration !== null && !hasChildren) ? headerTextColor : disabledTextColor,
                                    fontWeight: duration !== null ? 500 : 400,
                                    flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                    cursor: hasChildren ? 'not-allowed' : 'text'
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (!hasChildren) {
                                        setEditingCell({ id: task.id, field: 'duration', value: String(duration ?? 1) });
                                    }
                                }}
                            >
                                {editingCell?.id === task.id && editingCell?.field === 'duration' ? (
                                    <input
                                        ref={inputRef}
                                        aria-label={`编辑 ${accessibleTaskName} 的工期`}
                                        type="number"
                                        min={0}
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleKeyDown}
                                        style={{ 
                                            width: 44, fontSize: 11, padding: '2px', outline: 'none', 
                                            border: `1px solid ${primaryColor}`, textAlign: 'right',
                                            background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                                            color: rowTextColorPrimary
                                        }}
                                    />
                                ) : (
                                    duration !== null ? `${duration}天` : '—'
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <ProTaskDeleteDialog
                open={Boolean(pendingTaskDeletion)}
                title={pendingTaskDeletion?.name ? `删除“${pendingTaskDeletion.name}”？` : '删除任务？'}
                description="将同时删除其所有子任务和相关依赖关系；删除后可使用撤销恢复。"
                impact={pendingTaskDeletion?.impact}
                impactLabels={PRO_TASK_DELETE_IMPACT_LABELS_ZH}
                confirmText="删除"
                cancelText="取消"
                onCancel={() => setPendingTaskDeletion(null)}
                onConfirm={() => {
                    if (!pendingTaskDeletion) return;
                    deletionFocusTargetRef.current = getProTimelineDeletionFallbackId(tasks, pendingTaskDeletion.id);
                    const taskId = pendingTaskDeletion.id;
                    setPendingTaskDeletion(null);
                    onTaskDelete?.(taskId);
                }}
            />

            {/* 拖拽调整宽度的分隔条 */}
            <div
                className="pro-timeline-task-resize-handle"
                role="separator"
                tabIndex={0}
                aria-label="调整任务列表宽度"
                aria-orientation="vertical"
                aria-valuemin={PRO_TASK_LIST_MIN_WIDTH}
                aria-valuemax={PRO_TASK_LIST_MAX_WIDTH}
                aria-valuenow={normalizedWidth}
                aria-keyshortcuts="ArrowLeft ArrowRight Home End"
                style={{
                    position: 'absolute', right: -3, top: 0, bottom: 0, width: 6,
                    cursor: 'col-resize', zIndex: 10,
                    background: isResizing ? `${primaryColor}26` : 'transparent',
                    transition: 'background 0.15s',
                }}
                onPointerDown={handleResizePointerDown}
                onKeyDown={handleResizeKeyDown}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = `${primaryColor}1A`; }}
                onMouseLeave={(e) => { if (!isResizing) (e.target as HTMLElement).style.background = 'transparent'; }}
            />
        </div>
    );
}
