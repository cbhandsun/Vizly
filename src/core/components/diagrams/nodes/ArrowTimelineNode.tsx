import React, { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { useTheme } from '../../../themes/useCoreTheme';
import { Button, Tooltip, Divider, Popover, InputNumber, ColorPicker, Input, Space } from 'antd';
import { PlusOutlined, MinusOutlined, SwapOutlined, DatabaseOutlined, ExpandAltOutlined, AppstoreOutlined, MoreOutlined, DeleteOutlined, CopyOutlined, LockOutlined, UnlockOutlined, EllipsisOutlined } from '@ant-design/icons';

export interface ArrowTimelineEvent {
    date: string;
    label?: string;
    color: string;
}

export interface ArrowTimelineNodeData {
    events?: ArrowTimelineEvent[];
    variant?: 'arrow' | 'dot';
    spacing?: number;
}

const DEFAULT_EVENTS: ArrowTimelineEvent[] = [
    { date: '2024.02.19', color: '#52c41a' },
    { date: '2024.04.07', color: '#a0d911' },
    { date: '2025.05.07', color: '#fadb14' },
    { date: '2025.05.22', color: '#fa8c16' },
    { date: '2025.06.05', color: '#f5222d' },
    { date: '2025.06.11', color: '#eb2f96' },
    { date: '2025.07.02', color: '#722ed1' },
    { date: '2025.07.10', label: '河南和山西生鲜中心', color: '#5936d5' },
    { date: '2025.07.17', color: '#1890ff' },
    { date: '2025.07.24', label: '黑龙江生鲜物流中心', color: '#13c2c2' }
];

function ArrowTimelineNode({ id, data, selected, isDragging }: { id: string, data: ArrowTimelineNodeData, selected?: boolean, isDragging?: boolean }) {
    const { updateNodeData } = useReactFlow();
    const [theme] = useTheme();
    const isDark = theme?.mode === 'dark';
    
    // Interactions state
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [editing, setEditing] = useState<{index: number, field: 'date'|'label'} | null>(null);
    
    // If events array is explicitly set (even empty), respect it. Only fallback if undefined.
    const events = data?.events !== undefined ? data.events : DEFAULT_EVENTS;
    const variant = data?.variant || 'arrow';
    const isDot = variant === 'dot';
    
    const SEGMENT_WIDTH = data?.spacing !== undefined ? data.spacing : (isDot ? 120 : 100);
    const ARROW_TIP_WIDTH = isDot ? 0 : 24;
    const DOT_PADDING_X = isDot ? 60 : 0;
    
    const BAR_HEIGHT = 22;
    const NODE_HEIGHT = 140;
    const BAR_Y = (NODE_HEIGHT - BAR_HEIGHT) / 2;
    
    // Width calculation
    const SVG_WIDTH = isDot 
        ? DOT_PADDING_X * 2 + Math.max(0, events.length - 1) * SEGMENT_WIDTH 
        : events.length * SEGMENT_WIDTH + ARROW_TIP_WIDTH;

    return (
        <div className="shape-non-rect arrow-timeline-node" 
             style={{ 
                 width: SVG_WIDTH, height: NODE_HEIGHT, position: 'relative',
                 opacity: isDragging ? 0.7 : (isDark ? 0.9 : 1),
                 transition: 'opacity 0.15s ease-out',
             }}
             onDoubleClick={(e) => { e.stopPropagation(); }}
        >
            {/* 解决由于初始化或XYFlow默认行为导致的焦点错位与蓝色小方块问题 */}
            <style>
            {`
                /* 彻底屏蔽默认的 React Flow 选择框与轮廓 (提升 CSS 优先级) */
                div.react-flow__node.react-flow__node-arrowTimeline.selected,
                div.react-flow__node.react-flow__node-arrowTimeline:focus,
                div.react-flow__node.react-flow__node-arrowTimeline:focus-visible {
                    box-shadow: none !important;
                    outline: none !important;
                    border: none !important;
                    background: transparent !important;
                }
            `}
            </style>
            
            {/* 真正匹配时间线尺寸的高亮选择框 */}
            {selected && (
                <div style={{
                    position: 'absolute',
                    top: 0, 
                    left: -4,
                    width: SVG_WIDTH + 8, 
                    height: NODE_HEIGHT,
                    border: `1.5px solid ${theme?.palette?.primary?.main || '#1677ff'}`,
                    borderRadius: 8,
                    pointerEvents: 'none',
                    boxShadow: `0 0 0 4px ${(theme?.palette?.primary?.main || '#1677ff')}15`
                }} />
            )}

            {/* Draw SVG Track */}
            <svg width={SVG_WIDTH} height={NODE_HEIGHT} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
                {isDot && events.length > 0 && (
                    <line 
                        x1={DOT_PADDING_X} y1={NODE_HEIGHT / 2} 
                        x2={DOT_PADDING_X + (events.length - 1) * SEGMENT_WIDTH} y2={NODE_HEIGHT / 2} 
                        stroke={events[0].color || '#1890ff'} 
                        strokeWidth="3" 
                        opacity={isDark ? 0.8 : 0.6}
                    />
                )}
                
                {events.map((evt, i) => {
                    if (isDot) {
                        const x = DOT_PADDING_X + i * SEGMENT_WIDTH;
                        const defaultFill = isDark ? '#141414' : '#ffffff';
                        const dotFill = hoveredIndex === i ? evt.color : defaultFill;
                        return (
                            <g key={`seg-${i}`} style={{ pointerEvents: 'auto' }}>
                                {i < events.length - 1 && (
                                    <line 
                                        x1={x} y1={NODE_HEIGHT / 2} 
                                        x2={x + SEGMENT_WIDTH} y2={NODE_HEIGHT / 2} 
                                        stroke={events[i+1].color || '#1890ff'} 
                                        strokeWidth="3" 
                                        opacity={isDark ? 0.8 : 0.6}
                                        style={{ transition: 'all 0.3s' }}
                                    />
                                )}
                                <circle 
                                    cx={x} cy={NODE_HEIGHT / 2} r={hoveredIndex === i ? 7 : 6} 
                                    fill={dotFill} stroke={evt.color} strokeWidth="3"
                                    onMouseEnter={() => setHoveredIndex(i)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                    style={{ transition: 'all 0.2s', cursor: 'pointer' }}
                                />
                            </g>
                        );
                    } else {
                        // Arrow Variant
                        const isLast = i === events.length - 1;
                        const w = isLast ? SEGMENT_WIDTH + ARROW_TIP_WIDTH : SEGMENT_WIDTH;
                        const x = i * SEGMENT_WIDTH;
                        
                        let path = '';
                        // Fix for stroke overlapping causing distinct "box" shadows:
                        // Move x by 1px to perfectly overlap without edge conflict,
                        // and extend w slightly to cover any sub-pixel gaps.
                        const startX = i === 0 ? x : x - 1; 
                        
                        if (isLast) {
                            path = `M ${startX} ${BAR_Y} L ${x + SEGMENT_WIDTH} ${BAR_Y} L ${x + w} ${BAR_Y + BAR_HEIGHT/2} L ${x + SEGMENT_WIDTH} ${BAR_Y + BAR_HEIGHT} L ${startX} ${BAR_Y + BAR_HEIGHT} Z`;
                        } else {
                            // Non-last segments extend right by 1px to tuck Under the next segment
                            path = `M ${startX} ${BAR_Y} L ${x + w + 1} ${BAR_Y} L ${x + w + 1} ${BAR_Y + BAR_HEIGHT} L ${startX} ${BAR_Y + BAR_HEIGHT} Z`;
                        }
                        
                        const glowFill = isDark ? `${evt.color}2A` : `${evt.color}10`;
                        
                        return (
                            <g key={`seg-${i}`} style={{ pointerEvents: 'auto' }}>
                                <path 
                                    d={path} 
                                    fill={glowFill} 
                                    stroke={evt.color} 
                                    strokeWidth={hoveredIndex === i ? "4" : "2"}
                                    strokeOpacity={hoveredIndex === i ? 1 : 0.8}
                                    strokeLinejoin="round"
                                    onMouseEnter={() => setHoveredIndex(i)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                    style={{ transition: 'all 0.2s', cursor: 'pointer' }}
                                />
                                {/* removed the vertical line that caused the shadow artifact */}
                            </g>
                        );
                    }
                })}
            </svg>

            {/* Alternating Labels */}
            {events.map((evt, i) => {
                const isTop = i % 2 === 0;
                let xCenter = 0;
                let topComponent = null;
                let bottomComponent = null;
                
                // --- Reusable text renderers ---
                const renderDate = () => (
                    <div style={{ pointerEvents: 'auto' }}>
                        {editing?.index === i && editing?.field === 'date' ? (
                            <input 
                                autoFocus
                                className="nodrag nowheel"
                                defaultValue={evt.date}
                                onBlur={(e) => {
                                    setEditing(null);
                                    const newEvents = [...events];
                                    newEvents[i] = { ...newEvents[i], date: e.target.value };
                                    updateNodeData(id, { events: newEvents });
                                }}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') { e.currentTarget.blur(); }
                                }}
                                style={{
                                    width: SEGMENT_WIDTH, textAlign: 'center', background: 'transparent',
                                    border: `1px solid ${evt.color}`, borderRadius: 4, color: evt.color,
                                    fontWeight: 800, fontSize: 14, fontFamily: 'Roboto, Inter, sans-serif',
                                    outline: 'none', padding: '2px 0'
                                }}
                            />
                        ) : (
                            <div 
                                onDoubleClick={(e) => { e.stopPropagation(); setEditing({index: i, field: 'date'}); }}
                                onMouseEnter={() => setHoveredIndex(i)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                style={{ 
                                    color: evt.color, 
                                    fontWeight: 800, 
                                    fontSize: 14, 
                                    fontFamily: 'Roboto, Inter, sans-serif',
                                    textShadow: isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px #fff',
                                    cursor: 'text',
                                    padding: '0 4px',
                                    borderRadius: 4,
                                    transition: 'background 0.2s',
                                    background: hoveredIndex === i ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent'
                                }}>
                                {evt.date}
                            </div>
                        )}
                    </div>
                );

                const renderLabel = () => (
                    <div style={{ pointerEvents: 'auto' }}>
                        {editing?.index === i && editing?.field === 'label' ? (
                            <input 
                                autoFocus
                                className="nodrag nowheel"
                                defaultValue={evt.label || ''}
                                onBlur={(e) => {
                                    setEditing(null);
                                    const newEvents = [...events];
                                    newEvents[i] = { ...newEvents[i], label: e.target.value };
                                    updateNodeData(id, { events: newEvents });
                                }}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') { e.currentTarget.blur(); }
                                }}
                                style={{
                                    width: SEGMENT_WIDTH, textAlign: 'center', background: 'transparent',
                                    border: `1px dashed ${evt.color}`, borderRadius: 4,
                                    color: isDark ? 'rgba(255,255,255,0.85)' : '#595959',
                                    fontSize: 11.5, fontWeight: 500,
                                    marginTop: isDot && !isTop ? 2 : (isTop ? 0 : 2), 
                                    marginBottom: isDot && isTop ? 2 : (isTop ? 2 : 0),
                                    outline: 'none', padding: '2px 0'
                                }}
                            />
                        ) : (
                            <div 
                                onDoubleClick={(e) => { e.stopPropagation(); setEditing({index: i, field: 'label'}); }}
                                onMouseEnter={() => setHoveredIndex(i)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                style={{ 
                                    color: isDark ? 'rgba(255,255,255,0.65)' : '#595959', 
                                    fontSize: 11.5, 
                                    marginTop: isTop ? 0 : 2,
                                    marginBottom: isTop ? 2 : 0,
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    cursor: 'text',
                                    padding: '0 4px',
                                    minHeight: 16,
                                    minWidth: 40,
                                    borderRadius: 4,
                                    transition: 'background 0.2s',
                                    background: hoveredIndex === i ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent'
                                }}>
                                {evt.label || '双击编辑说明'}
                            </div>
                        )}
                    </div>
                );
                
                if (isDot) {
                    xCenter = DOT_PADDING_X + i * SEGMENT_WIDTH;
                    if (isTop) {
                        topComponent = renderDate();
                        bottomComponent = renderLabel();
                    } else {
                        topComponent = renderLabel();
                        bottomComponent = renderDate();
                    }
                } else {
                    xCenter = i * SEGMENT_WIDTH + (SEGMENT_WIDTH / 2);
                    if (isTop) {
                        topComponent = <>{renderDate()}{renderLabel()}</>;
                    } else {
                        bottomComponent = <>{renderDate()}{renderLabel()}</>;
                    }
                }

                return (
                    <React.Fragment key={`txt-${i}`}>
                        {topComponent && (
                            <div style={{
                                position: 'absolute',
                                left: xCenter,
                                bottom: NODE_HEIGHT/2 + (isDot ? 12 : BAR_HEIGHT/2 + 6),
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                pointerEvents: 'none',
                                width: SEGMENT_WIDTH * 1.5,
                                textAlign: 'center',
                                justifyContent: 'flex-end',
                            }}>
                                {topComponent}
                            </div>
                        )}
                        {bottomComponent && (
                            <div style={{
                                position: 'absolute',
                                left: xCenter,
                                top: NODE_HEIGHT/2 + (isDot ? 12 : BAR_HEIGHT/2 + 6),
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                pointerEvents: 'none',
                                width: SEGMENT_WIDTH * 1.5, 
                                textAlign: 'center',
                                justifyContent: 'flex-start',
                            }}>
                                {bottomComponent}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}

            {/* Selection Highlight Ring */}
            {selected && (
                <div style={{
                    position: 'absolute',
                    top: isDot ? NODE_HEIGHT/2 - 12 : BAR_Y - 4,
                    left: isDot ? DOT_PADDING_X - 12 : -4,
                    width: isDot ? SVG_WIDTH - DOT_PADDING_X*2 + 24 : SVG_WIDTH + 8,
                    height: isDot ? 24 : BAR_HEIGHT + 8,
                    border: `1px dashed ${theme?.palette?.primary?.main || '#1890ff'}`,
                    borderRadius: isDot ? 12 : 4,
                    pointerEvents: 'none',
                    zIndex: -1
                }} />
            )}

            {/* RF Flow Handles for connectivity */}
            <Handle type="target" position={Position.Left} style={{ top: NODE_HEIGHT/2, opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0 }} />
        </div>
    );
}

// ⭐ Component Isolation: Exporting the toolbar extensions directly attached to the Component!
const ArrowTimelineToolbarExtension = ({ node, updateNodesBatch }: any) => {
    const isDot = node.data?.variant === 'dot';
    const events = node.data?.events !== undefined ? node.data.events : DEFAULT_EVENTS;
    const spacing = node.data?.spacing !== undefined ? node.data.spacing : (isDot ? 120 : 100);

    // 数据编辑器 Popover 内容
    const DataEditorContent = (
        <div style={{ width: 340, maxHeight: 400, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderRadius: '8px 8px 0 0' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>事件数据</span>
                <span style={{ fontSize: 12, color: '#999', backgroundColor: '#f5f5f5', padding: '2px 8px', borderRadius: 10 }}>共 {events.length} 项</span>
            </div>
            
            <div className="custom-datascroll" style={{ padding: '8px 0', overflowY: 'auto', flex: 1, maxHeight: 300 }}>
                {events.map((evt: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #f8f8f8', transition: 'background 0.2s' }} className="data-row-hover">
                        <ColorPicker size="small" value={evt.color} onChangeComplete={(color) => {
                            const newEvents = [...events];
                            newEvents[i] = { ...evt, color: color.toHexString() };
                            updateNodesBatch([node.id], { events: newEvents });
                        }} />
                        <Input size="small" variant="filled" placeholder="日期" value={evt.date} onChange={(e) => {
                            const newEvents = [...events];
                            newEvents[i] = { ...evt, date: e.target.value };
                            updateNodesBatch([node.id], { events: newEvents });
                        }} style={{ width: 90 }} />
                        <Input size="small" variant="filled" placeholder="文本摘要" value={evt.label} onChange={(e) => {
                            const newEvents = [...events];
                            newEvents[i] = { ...evt, label: e.target.value };
                            updateNodesBatch([node.id], { events: newEvents });
                        }} style={{ flex: 1 }} />
                        <Tooltip title="移除节点">
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => {
                                const newEvents = [...events];
                                newEvents.splice(i, 1);
                                updateNodesBatch([node.id], { events: newEvents });
                            }} style={{ opacity: 0.6 }} className="delete-btn" />
                        </Tooltip>
                    </div>
                ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', position: 'sticky', bottom: 0, background: '#fff', borderRadius: '0 0 8px 8px' }}>
                <Button type="text" block icon={<PlusOutlined />} style={{ background: '#e6f4ff', color: '#1677ff', fontWeight: 500 }} onClick={() => {
                    const newEvent = events.length > 0
                        ? { ...events[events.length - 1], date: events[events.length - 1].date + ' (新)' }
                        : { date: 'New Date', color: '#1890ff', label: '' };
                    updateNodesBatch([node.id], { events: [...events, newEvent] } as any);
                }}>
                    添加事件节点
                </Button>
            </div>
            <style>{`
                .custom-datascroll::-webkit-scrollbar { width: 6px; }
                .custom-datascroll::-webkit-scrollbar-track { background: transparent; }
                .custom-datascroll::-webkit-scrollbar-thumb { background: #d9d9d9; border-radius: 4px; }
                .custom-datascroll::-webkit-scrollbar-thumb:hover { background: #bfbfbf; }
                .data-row-hover:hover { background-color: #fafafa; }
                .data-row-hover:hover .delete-btn { opacity: 1 !important; color: #ff4d4f !important; }
            `}</style>
        </div>
    );

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Popover content={
                <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, marginBottom: 8, color: '#666' }}>节点个数设定</div>
                    <InputNumber 
                        size="small" 
                        variant="filled"
                        controls={true}
                        min={1} 
                        value={events.length} 
                        onChange={(val: number | null) => {
                            if (!val || val === events.length) return;
                            const newEvents = [...events];
                            if (val > events.length) {
                                for (let i = events.length; i < val; i++) {
                                    newEvents.push({ date: `Date ${i+1}`, color: '#1890ff', label: '' });
                                }
                            } else {
                                newEvents.splice(val);
                            }
                            updateNodesBatch([node.id], { events: newEvents });
                        }} 
                        style={{ width: 100 }} 
                    />
                </div>
            } trigger="click" placement="bottom">
                <Tooltip title="调整节点个数">
                    <Button type="text" size="small" icon={<EllipsisOutlined />} style={{ color: '#555' }} />
                </Tooltip>
            </Popover>

            <Tooltip title={isDot ? "切换为箭头风格" : "切换为圆点风格"}>
                <Button 
                    type="text" 
                    size="small" 
                    icon={isDot ? <SwapOutlined /> : <AppstoreOutlined />} 
                    onClick={() => updateNodesBatch([node.id], { variant: isDot ? 'arrow' : 'dot' })} 
                />
            </Tooltip>

            <Popover content={
                <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, marginBottom: 8, color: '#666' }}>段间距 (px)</div>
                    <InputNumber 
                        size="small" 
                        variant="filled"
                        min={40} 
                        max={300} 
                        step={10}
                        value={spacing} 
                        onChange={(val: number | null) => {
                            if (val) updateNodesBatch([node.id], { spacing: val });
                        }} 
                        style={{ width: 100 }} 
                    />
                </div>
            } trigger="click" placement="bottom">
                <Tooltip title="调整间距">
                    <Button type="text" size="small" icon={<ExpandAltOutlined />} style={{ color: '#555' }} />
                </Tooltip>
            </Popover>

            <Divider orientation="vertical" style={{ margin: '0 2px' }} />

            <Popover content={DataEditorContent} trigger="click" placement="bottom">
                <Tooltip title="编辑明细数据">
                    <Button type="text" size="small" icon={<DatabaseOutlined />} style={{ color: '#1677ff' }} />
                </Tooltip>
            </Popover>
        </div>
    );
};

// ⭐ 标准规范：必须先 memo() 再挂载静态属性以防止吞没现象
const MemoizedArrowTimelineNode = React.memo(ArrowTimelineNode);

// 挂载独立工具栏组件
(MemoizedArrowTimelineNode as any).ToolbarExtension = ArrowTimelineToolbarExtension;

// 通过这两个配置告知上游提取胶囊工具栏：
// 设置为 true 使其独立享受胶囊包裹，彻底替换默认排版工具栏，实现针对性的时间线美化！
(MemoizedArrowTimelineNode as any).OverrideDefaultToolbar = true;

export default MemoizedArrowTimelineNode;
