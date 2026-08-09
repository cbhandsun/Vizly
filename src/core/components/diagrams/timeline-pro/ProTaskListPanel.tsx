import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ProGanttTask, getWorkDays, addWorkDays, getWorkDaysSigned, useProTimelineEngine } from '../../../hooks/useProTimelineEngine';
import { Dropdown, Select, Tooltip } from 'antd';
import { CaretRightOutlined, CaretDownOutlined, CalendarOutlined, FlagFilled, ClockCircleOutlined, FolderOpenOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTheme } from '../../../themes/useCoreTheme';
import { todayDateOnly } from '../../../utils/dateOnly';
import type { Theme } from '../../../themes/types/ThemeTypes';

export interface ProTaskListPanelProps {
    tasks: ProGanttTask[];
    width: number;
    onWidthChange: (w: number) => void;
    hoveredTaskId: string | null;
    onHoverTask: (id: string | null) => void;
    onClickTask: (id: string) => void;
    selectedTaskId: string | null;
    scrollTop: number;
    onScrollTopChange: (y: number) => void;
    onTaskExpandToggle?: (id: string) => void;
    onTaskUpdate?: (id: string, updates: Partial<ProGanttTask>) => void;
    onTaskAdd?: (parentId: string | null, type: 'phase' | 'milestone') => void;
    onTaskDelete?: (id: string) => void;
    cyclicTaskIds?: Set<string>;
}

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;

const getTypeIcons = (theme: Theme | null): Record<string, React.ReactNode> => ({
    phase:     <CalendarOutlined style={{ fontSize: 13, color: theme?.palette?.success?.main || '#52c41a' }} />,
    event:     <ClockCircleOutlined style={{ fontSize: 13, color: theme?.palette?.primary?.main || '#1890ff' }} />,
    milestone: <FlagFilled style={{ fontSize: 13, color: theme?.palette?.error?.main || '#cf1322' }} />,
    summary:   <FolderOpenOutlined style={{ fontSize: 13, color: theme?.mode === 'dark' ? '#d9d9d9' : '#434343' }} />,
});

export default function ProTaskListPanel({
    tasks, width, onWidthChange, hoveredTaskId, onHoverTask, onClickTask, selectedTaskId, onScrollTopChange,
    onTaskExpandToggle, onTaskUpdate, onTaskAdd, onTaskDelete, cyclicTaskIds
}: ProTaskListPanelProps) {
    const [isResizing, setIsResizing] = useState(false);
    const [editingCell, setEditingCell] = useState<{ id: string, field: 'name' | 'startDate' | 'duration' | 'assignee' | 'priority' } | null>(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [theme] = useTheme();
    const { showBaseline } = useProTimelineEngine();

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

    // Focus input on edit start
    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            if (editingCell.field === 'name' || editingCell.field === 'assignee') {
                inputRef.current.select();
            }
        }
    }, [editingCell]);

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
        if (e.key === 'Enter') commitEdit();
        if (e.key === 'Escape') setEditingCell(null);
    };

    // --- 拖拽调整宽度 ---
    const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const startW = width;

        const onMove = (ev: PointerEvent) => {
            const newW = Math.max(280, Math.min(650, startW + (ev.clientX - startX)));
            onWidthChange(newW);
        };
        const onUp = () => {
            setIsResizing(false);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [width, onWidthChange]);


    return (
        <div className="pro-timeline-task-list" style={{
            width, minWidth: 280, maxWidth: 650,
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
                role="listbox"
                style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
                onScroll={(e) => onScrollTopChange((e.target as HTMLDivElement).scrollTop)}
            >
                {tasks.map((task, idx) => {
                    const isHovered = hoveredTaskId === task.id;
                    const isSelected = selectedTaskId === task.id;
                    const type = task.type || 'phase';
                    const duration = getDuration(task);
                    const dateLabel = task.startDate ? task.startDate.slice(5) : '--'; // MM-DD
                    
                    const depth = task._computed?.depth || 0;
                    const hasChildren = task._computed?.hasChildren;
                    const isExpanded = task.isExpanded !== false;
                    const isVisible = task._computed?.isVisible !== false;

                    if (!isVisible) return null; // Skip hidden rows

                    return (
                        <div
                            key={task.id}
                            aria-label={`${task.name}，开始 ${task.startDate || '未设置'}，工期 ${duration ?? '未设置'} 天`}
                            aria-selected={isSelected}
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
                            onClick={() => onClickTask(task.id)}
                            onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onClickTask(task.id);
                                }
                            }}
                        >
                            {/* Expand/Collapse Toggle */}
                            <div style={{ width: 18, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                {hasChildren && (
                                    <div 
                                        onClick={(e) => { e.stopPropagation(); onTaskExpandToggle?.(task.id); }}
                                        style={{ 
                                            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', color: rowTextColorSecondary, borderRadius: 4
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {isExpanded ? <CaretDownOutlined style={{ fontSize: 10 }} /> : <CaretRightOutlined style={{ fontSize: 10 }} />}
                                    </div>
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
                                    setEditingCell({ id: task.id, field: 'name' });
                                    setEditValue(task.name);
                                }}
                            >
                                {cyclicTaskIds?.has(task.id) && (
                                    <Tooltip title="检测到循环依赖关系！">
                                        <span style={{ color: '#faad14', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>⚠️</span>
                                    </Tooltip>
                                )}
                                {editingCell?.id === task.id && editingCell?.field === 'name' ? (
                                    <input
                                        ref={inputRef}
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
                                        {task.name}
                                    </span>
                                )}
                            </div>

                            {/* Hover Quick Add Menu & Delete Button */}
                            {isHovered && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                    <Dropdown
                                        menu={{
                                            items: [
                                                { key: 'phase', icon: <FolderOpenOutlined />, label: '添加子阶段 (Phase)' },
                                                { key: 'milestone', icon: <FlagFilled />, label: '添加里程碑 (Milestone)' }
                                            ],
                                            onClick: ({ key }) => {
                                                if (onTaskAdd && (key === 'phase' || key === 'milestone')) {
                                                    onTaskAdd(task.id, key);
                                                }
                                            }
                                        }}
                                        trigger={['click']}
                                        placement="bottomRight"
                                    >
                                        <div 
                                            style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 4, color: primaryColor, opacity: 0.8 }}
                                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e6f7ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            title="添加子项"
                                        >
                                            <PlusOutlined style={{ fontSize: 12 }} />
                                        </div>
                                    </Dropdown>

                                    <div 
                                        style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 4, color: theme?.palette?.error?.main || '#ff4d4f', opacity: 0.8 }}
                                        onClick={(e) => { e.stopPropagation(); onTaskDelete?.(task.id); }}
                                        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        title="删除该任务及其所有子任务"
                                    >
                                        <DeleteOutlined style={{ fontSize: 12 }} />
                                    </div>
                                </div>
                            )}

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
                                            setEditingCell({ id: task.id, field: 'assignee' });
                                            setEditValue(task.assignee || '');
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
                                            setEditingCell({ id: task.id, field: 'priority' });
                                            setEditValue(task.priority || '');
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
                                        setEditingCell({ id: task.id, field: 'startDate' });
                                        setEditValue(task.startDate || todayDateOnly());
                                    }
                                }}
                            >
                                {editingCell?.id === task.id && editingCell?.field === 'startDate' ? (
                                    <input
                                        ref={inputRef}
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
                                        setEditingCell({ id: task.id, field: 'duration' });
                                        setEditValue(String(duration ?? 1));
                                    }
                                }}
                            >
                                {editingCell?.id === task.id && editingCell?.field === 'duration' ? (
                                    <input
                                        ref={inputRef}
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

            {/* 拖拽调整宽度的分隔条 */}
            <div
                className="pro-timeline-task-resize-handle"
                style={{
                    position: 'absolute', right: -3, top: 0, bottom: 0, width: 6,
                    cursor: 'col-resize', zIndex: 10,
                    background: isResizing ? `${primaryColor}26` : 'transparent',
                    transition: 'background 0.15s',
                }}
                onPointerDown={handleResizePointerDown}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = `${primaryColor}1A`; }}
                onMouseLeave={(e) => { if (!isResizing) (e.target as HTMLElement).style.background = 'transparent'; }}
            />
        </div>
    );
}
