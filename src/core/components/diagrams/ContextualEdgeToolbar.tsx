import React, { useState, useRef, useEffect } from 'react';
import { Button, Tooltip, Divider, InputNumber } from 'antd';
import { Edge } from '@xyflow/react';
import {
    LineOutlined,
    DashOutlined,
    PlayCircleOutlined,
    FormatPainterOutlined,
    PartitionOutlined,
    ColumnWidthOutlined,
    SwapOutlined,
    EditOutlined,
    CheckOutlined,
    CloseOutlined
} from '@ant-design/icons';

interface ContextualEdgeToolbarProps {
    edge: Edge;
    onUpdateEdge: (edgeId: string, updates: Partial<Edge>) => void;
}

// 箭头样式循环列表
const ARROW_STYLES = [
    { label: '单箭头', markerEnd: 'arrowclosed', markerStart: undefined },
    { label: '双箭头', markerEnd: 'arrowclosed', markerStart: 'arrowclosed' },
    { label: '无箭头', markerEnd: undefined, markerStart: undefined },
    { label: '圆点终端', markerEnd: 'dot', markerStart: undefined },
] as const;

export const ContextualEdgeToolbar: React.FC<ContextualEdgeToolbarProps> = ({ edge, onUpdateEdge }) => {
    // 根据边的数据解析当前状态
    const isAnimated = !!edge.animated;
    const isDashed = edge.style?.strokeDasharray === '5,5';
    const isOrthogonal = edge.type === 'smart';
    const currentWidth = (edge.style?.strokeWidth as number) || 2;

    // 标签编辑状态
    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [labelText, setLabelText] = useState(edge.label as string || '');
    const labelInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditingLabel && labelInputRef.current) {
            labelInputRef.current.focus();
            labelInputRef.current.select();
        }
    }, [isEditingLabel]);

    // 同步外部 edge.label 变更
    useEffect(() => {
        setLabelText(edge.label as string || '');
    }, [edge.label]);

    const toggleAnimation = () => {
        onUpdateEdge(edge.id, { animated: !isAnimated });
    };

    const toggleDashed = () => {
        onUpdateEdge(edge.id, {
            style: {
                ...edge.style,
                strokeDasharray: isDashed ? 'none' : '5,5'
            }
        });
    };

    const toggleRouting = () => {
        onUpdateEdge(edge.id, {
            type: isOrthogonal ? 'default' : 'smart'
        });
    };

    const toggleColor = () => {
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#94a3b8'];
        const currentColor = edge.style?.stroke as string || '#94a3b8';
        const nextIndex = (colors.indexOf(currentColor) + 1) % colors.length;
        
        onUpdateEdge(edge.id, {
            style: {
                ...edge.style,
                stroke: colors[nextIndex],
            }
        });
    };

    const cycleWidth = () => {
        const widths = [1, 2, 3];
        const nextIndex = (widths.indexOf(currentWidth) + 1) % widths.length;
        onUpdateEdge(edge.id, {
            style: {
                ...edge.style,
                strokeWidth: widths[nextIndex],
            }
        });
    };

    const cycleArrow = () => {
        // 判断当前箭头状态
        const currentEnd = typeof edge.markerEnd === 'object' ? edge.markerEnd?.type : edge.markerEnd;
        const currentStart = typeof edge.markerStart === 'object' ? edge.markerStart?.type : edge.markerStart;
        
        let currentIdx = 0;
        if (currentEnd && currentStart) currentIdx = 1;
        else if (!currentEnd && !currentStart) currentIdx = 2;
        else if (currentEnd === 'dot') currentIdx = 3;
        
        const next = ARROW_STYLES[(currentIdx + 1) % ARROW_STYLES.length];
        onUpdateEdge(edge.id, {
            markerEnd: next.markerEnd as any,
            markerStart: next.markerStart as any,
        });
    };

    const confirmLabel = () => {
        onUpdateEdge(edge.id, { label: labelText || undefined });
        setIsEditingLabel(false);
    };

    const cancelLabel = () => {
        setLabelText(edge.label as string || '');
        setIsEditingLabel(false);
    };

    return (
        <div 
            className="contextual-edge-toolbar"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px', // Reduce gap slightly
                padding: '4px 12px',
                background: 'rgba(255, 255, 255, 0.70)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                borderRadius: '99px',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.4) inset, 0 0 0 1px rgba(0, 0, 0, 0.05)',
                pointerEvents: 'all',
                transition: 'left 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), top 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
                animation: 'toolbarFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onPointerMoveCapture={(e) => e.stopPropagation()}
            onWheelCapture={(e) => e.stopPropagation()}
        >
            {/* 路由模式 */}
            <Tooltip title={isOrthogonal ? "切换至曲线" : "切换至正交"}>
                <Button 
                    type="text" 
                    size="small"
                    icon={<PartitionOutlined />}
                    onClick={toggleRouting}
                    style={{ color: isOrthogonal ? '#3b82f6' : '#64748b' }}
                />
            </Tooltip>

            <Divider type="vertical" style={{ margin: '0 2px' }} />

            {/* 线型 */}
            <Tooltip title={isDashed ? "实线" : "虚线"}>
                <Button 
                    type="text" 
                    size="small"
                    icon={isDashed ? <LineOutlined /> : <DashOutlined />}
                    onClick={toggleDashed}
                    style={{ color: '#64748b' }}
                />
            </Tooltip>

            {/* 线宽 */}
            <Tooltip title={`线宽: ${currentWidth}px`}>
                <Button
                    type="text"
                    size="small"
                    icon={<ColumnWidthOutlined />}
                    onClick={cycleWidth}
                    style={{ color: '#64748b', position: 'relative' }}
                >
                    <span style={{
                        position: 'absolute', bottom: 0, right: 2,
                        fontSize: 8, lineHeight: 1, fontWeight: 700,
                        color: '#3b82f6',
                    }}>{currentWidth}</span>
                </Button>
            </Tooltip>

            {/* 流动动画 */}
            <Tooltip title={isAnimated ? "停止流动" : "开启流动动画"}>
                <Button 
                    type="text" 
                    size="small"
                    icon={<PlayCircleOutlined />}
                    onClick={toggleAnimation}
                    style={{ color: isAnimated ? '#10b981' : '#64748b' }}
                />
            </Tooltip>

            <Divider type="vertical" style={{ margin: '0 2px' }} />

            {/* 箭头样式 */}
            <Tooltip title="切换箭头样式">
                <Button
                    type="text"
                    size="small"
                    icon={<SwapOutlined />}
                    onClick={cycleArrow}
                    style={{ color: '#64748b' }}
                />
            </Tooltip>

            {/* 颜色 */}
            <Tooltip title="切换颜色">
                <Button 
                    type="text" 
                    size="small"
                    icon={<FormatPainterOutlined />}
                    onClick={toggleColor}
                    style={{ color: edge.style?.stroke as string || '#64748b' }}
                />
            </Tooltip>

            <Divider type="vertical" style={{ margin: '0 2px' }} />

            {/* 标签编辑 */}
            {isEditingLabel ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <input 
                        ref={labelInputRef}
                        value={labelText}
                        onChange={e => setLabelText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') confirmLabel();
                            if (e.key === 'Escape') cancelLabel();
                        }}
                        placeholder="标签文本..."
                        style={{
                            border: '1px solid #d1d5db',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 12,
                            width: 100,
                            outline: 'none',
                            background: 'transparent',
                        }}
                    />
                    <Button type="text" size="small" icon={<CheckOutlined />}
                        onClick={confirmLabel} style={{ color: '#10b981' }} />
                    <Button type="text" size="small" icon={<CloseOutlined />}
                        onClick={cancelLabel} style={{ color: '#ef4444' }} />
                </div>
            ) : (
                <Tooltip title={edge.label ? `标签: ${edge.label}` : '添加标签'}>
                    <Button 
                        type="text" 
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setIsEditingLabel(true)}
                        style={{ color: edge.label ? '#3b82f6' : '#64748b' }}
                    />
                </Tooltip>
            )}
        </div>
    );
};
