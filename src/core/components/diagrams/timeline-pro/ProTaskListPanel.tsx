import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ProGanttTask } from '../../../hooks/useProTimelineEngine';
import { Dropdown, MenuProps } from 'antd';
import { CaretRightOutlined, CaretDownOutlined, CalendarOutlined, FlagFilled, ClockCircleOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons';
import { useTheme } from '../../../themes/useCoreTheme';

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
}

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;

const STATUS_COLORS = (theme: any) => ({
    done:    { bg: '#f6ffed', text: theme?.palette?.success?.main || '#52c41a', label: '已完成' },
    active:  { bg: '#e6f7ff', text: theme?.palette?.primary?.main || '#1890ff', label: '进行中' },
    pending: { bg: '#fff7e6', text: theme?.palette?.warning?.main || '#fa8c16', label: '待开始' },
});

const getTypeIcons = (theme: any): Record<string, React.ReactNode> => ({
    phase:     <CalendarOutlined style={{ fontSize: 13, color: theme?.palette?.success?.main || '#52c41a' }} />,
    event:     <ClockCircleOutlined style={{ fontSize: 13, color: theme?.palette?.primary?.main || '#1890ff' }} />,
    milestone: <FlagFilled style={{ fontSize: 13, color: theme?.palette?.error?.main || '#cf1322' }} />,
    summary:   <FolderOpenOutlined style={{ fontSize: 13, color: theme?.mode === 'dark' ? '#d9d9d9' : '#434343' }} />,
});

export default function ProTaskListPanel({
    tasks, width, onWidthChange, hoveredTaskId, onHoverTask, onClickTask, selectedTaskId, scrollTop, onScrollTopChange,
    onTaskExpandToggle, onTaskUpdate, onTaskAdd
}: ProTaskListPanelProps) {
    const [isResizing, setIsResizing] = useState(false);
    const [editingCell, setEditingCell] = useState<{ id: string, field: 'name' | 'startDate' | 'duration' } | null>(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [theme] = useTheme();

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
            if (editingCell.field === 'name') {
                inputRef.current.select();
            }
        }
    }, [editingCell]);

    // 计算每个任务的工期天数 (Helper for edit compute)
    const getDuration = useCallback((t: ProGanttTask) => {
        if (t.type === 'milestone') return 0;
        if (!t.startDate || !t.endDate) return null;
        const d1 = new Date(t.startDate).getTime();
        const d2 = new Date(t.endDate).getTime();
        return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
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
                    const d1 = new Date(editValue);
                    if (task.type === 'milestone') {
                        onTaskUpdate?.(id, { startDate: editValue, endDate: editValue });
                    } else {
                        d1.setDate(d1.getDate() + oldDur);
                        const newEnd = d1.toISOString().split('T')[0];
                        onTaskUpdate?.(id, { startDate: editValue, endDate: newEnd });
                    }
                } else if (field === 'duration') {
                    const num = parseInt(editValue, 10);
                    if (!isNaN(num) && num >= 0) {
                        const start = task.startDate || new Date().toISOString().split('T')[0];
                        const d1 = new Date(start);
                        d1.setDate(d1.getDate() + num);
                        const newEnd = d1.toISOString().split('T')[0];
                        onTaskUpdate?.(id, { startDate: start, endDate: newEnd });
                    }
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
            const newW = Math.max(200, Math.min(500, startW + (ev.clientX - startX)));
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
        <div style={{
            width, minWidth: 200, maxWidth: 500,
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
                <span style={{ flex: 1 }}>任务名称</span>
                <span style={{ width: 62, textAlign: 'right' }}>开始</span>
                <span style={{ width: 46, textAlign: 'right' }}>工期</span>
            </div>

            {/* 任务行 (可滚动) */}
            <div
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
                                style={{
                                    flex: 1, fontSize: 13, color: type === 'summary' ? summaryTextColor : rowTextColorPrimary,
                                    fontWeight: type === 'summary' || isSelected ? 600 : 400,
                                    margin: '0 8px', minWidth: 0,
                                    display: 'flex', alignItems: 'center', height: '100%',
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCell({ id: task.id, field: 'name' });
                                    setEditValue(task.name);
                                }}
                            >
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

                            {/* Hover Quick Add Menu */}
                            {isHovered && (
                                <Dropdown
                                    menu={{
                                        items: [
                                            { key: 'phase', icon: <FolderOpenOutlined />, label: '添加子阶段 (Phase)' },
                                            { key: 'milestone', icon: <FlagFilled />, label: '添加里程碑 (Milestone)' }
                                        ],
                                        onClick: ({ key }) => {
                                            if (onTaskAdd) onTaskAdd(task.id, key as any);
                                        }
                                    }}
                                    trigger={['click']}
                                    placement="bottomRight"
                                >
                                    <div 
                                        style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 4, color: primaryColor, opacity: 0.8 }}
                                        onClick={e => e.stopPropagation()}
                                        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : '#e6f7ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <PlusOutlined style={{ fontSize: 13 }} />
                                    </div>
                                </Dropdown>
                            )}

                            <div 
                                style={{
                                    width: 80, textAlign: 'right', fontSize: 11,
                                    color: hasChildren ? disabledTextColor : rowTextColorSecondary, fontVariantNumeric: 'tabular-nums',
                                    flexShrink: 0, paddingRight: 8, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                    cursor: hasChildren ? 'not-allowed' : 'text'
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (!hasChildren) {
                                        setEditingCell({ id: task.id, field: 'startDate' });
                                        setEditValue(task.startDate || new Date().toISOString().split('T')[0]);
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
                                    dateLabel
                                )}
                            </div>

                            {/* Duration */}
                            <div 
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
