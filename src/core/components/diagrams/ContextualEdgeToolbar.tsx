import React, { useState, useRef, useEffect } from 'react';
import { Edge } from '@xyflow/react';
import type { EdgeDataUpdate } from '../../types/diagram-updates';
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
import {
    ToolbarContainer,
    ToolbarButton,
    ToolbarDivider,
} from '../shared/FloatingToolbar';

interface ContextualEdgeToolbarProps {
    edge: Edge;
    onUpdateEdge: (edgeId: string, updates: EdgeDataUpdate) => void;
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
    const getDashStyle = (s?: React.CSSProperties) => {
        const d = s?.strokeDasharray;
        if (!d || d === 'none') return 'solid';
        if (d === '2 4' || d === '2,4') return 'dotted';
        if (d === '12 4' || d === '12,4') return 'long-dash';
        if (d === '8 4 2 4' || d === '8,4,2,4') return 'dash-dot';
        return 'dashed';
    };
    const currentDash = getDashStyle(edge.style);
    const isDashed = currentDash !== 'solid';
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
        const timer = window.setTimeout(() => {
            setLabelText(edge.label as string || '');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [edge.label]);

    const toggleAnimation = () => {
        onUpdateEdge(edge.id, { animated: !isAnimated });
    };

    const toggleDashed = () => {
        const DASH_CYCLE: Record<string, string | undefined> = {
            'solid': '5 5',
            'dashed': '2 4',
            'dotted': '12 4',
            'long-dash': '8 4 2 4',
            'dash-dot': undefined,
        };
        onUpdateEdge(edge.id, {
            style: { ...edge.style, strokeDasharray: DASH_CYCLE[currentDash] }
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
            markerEnd: next.markerEnd,
            markerStart: next.markerStart,
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

    const DASH_LABELS: Record<string, string> = {
        'solid': '实线', 'dashed': '虚线', 'dotted': '点线',
        'long-dash': '长虚线', 'dash-dot': '点划线',
    };

    return (
        <ToolbarContainer>
            {/* 路由模式 */}
            <ToolbarButton
                icon={<PartitionOutlined />}
                label={isOrthogonal ? "切换至曲线" : "切换至正交"}
                onClick={toggleRouting}
                active={isOrthogonal}

            />

            <ToolbarDivider />

            {/* 线型循环 */}
            <ToolbarButton
                icon={isDashed ? <DashOutlined /> : <LineOutlined />}
                label={`线型：${DASH_LABELS[currentDash] || '实线'}（点击切换）`}
                onClick={toggleDashed}
                active={isDashed}

            />

            {/* 线宽 */}
            <ToolbarButton
                icon={
                    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ColumnWidthOutlined />
                        <span style={{
                            position: 'absolute', bottom: -4, right: -4,
                            fontSize: 8, lineHeight: 1, fontWeight: 700,
                            color: '#3b82f6',
                        }}>{currentWidth}</span>
                    </span>
                }
                label={`线宽: ${currentWidth}px`}
                onClick={cycleWidth}
            />

            {/* 流动动画 */}
            <ToolbarButton
                icon={<PlayCircleOutlined />}
                label={isAnimated ? "停止流动" : "开启流动动画"}
                onClick={toggleAnimation}
                active={isAnimated}

            />

            <ToolbarDivider />

            {/* 箭头样式 */}
            <ToolbarButton
                icon={<SwapOutlined />}
                label="切换箭头样式"
                onClick={cycleArrow}
            />

            {/* 颜色 */}
            <ToolbarButton
                icon={<FormatPainterOutlined />}
                label="切换颜色"
                onClick={toggleColor}

            />

            <ToolbarDivider />

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
                            border: '1px solid var(--ftb-divider-color, rgba(0,0,0,0.09))',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 12,
                            width: 100,
                            outline: 'none',
                            background: 'transparent',
                            color: 'inherit',
                        }}
                    />
                    <ToolbarButton icon={<CheckOutlined />} label="确认" onClick={confirmLabel} />
                    <ToolbarButton icon={<CloseOutlined />} label="取消" onClick={cancelLabel} danger />
                </div>
            ) : (
                <ToolbarButton
                    icon={<EditOutlined />}
                    label={edge.label ? `标签: ${edge.label}` : '添加标签'}
                    onClick={() => setIsEditingLabel(true)}
                    active={!!edge.label}

                />
            )}
        </ToolbarContainer>
    );
};
