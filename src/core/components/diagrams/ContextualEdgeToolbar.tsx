import React, { useState, useRef, useEffect } from 'react';
import { Edge } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
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
    { markerEnd: 'arrowclosed', markerStart: undefined },
    { markerEnd: 'arrowclosed', markerStart: 'arrowclosed' },
    { markerEnd: undefined, markerStart: undefined },
    { markerEnd: 'dot', markerStart: undefined },
] as const;

export const ContextualEdgeToolbar: React.FC<ContextualEdgeToolbarProps> = ({ edge, onUpdateEdge }) => {
    const { t } = useTranslation();
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

    const DASH_LABEL_KEYS: Record<string, string> = {
        'solid': 'edgeToolbar.dash.solid',
        'dashed': 'edgeToolbar.dash.dashed',
        'dotted': 'edgeToolbar.dash.dotted',
        'long-dash': 'edgeToolbar.dash.longDash',
        'dash-dot': 'edgeToolbar.dash.dashDot',
    };

    return (
        <ToolbarContainer className="contextual-edge-toolbar">
            {/* 路由模式 */}
            <ToolbarButton
                icon={<PartitionOutlined />}
                label={t(isOrthogonal ? 'edgeToolbar.switchToCurve' : 'edgeToolbar.switchToOrthogonal')}
                onClick={toggleRouting}
                active={isOrthogonal}

            />

            <ToolbarDivider />

            {/* 线型循环 */}
            <ToolbarButton
                icon={isDashed ? <DashOutlined /> : <LineOutlined />}
                label={t('edgeToolbar.dashStyle', {
                    style: t(DASH_LABEL_KEYS[currentDash] ?? 'edgeToolbar.dash.solid'),
                })}
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
                label={t('edgeToolbar.lineWidth', { width: currentWidth })}
                onClick={cycleWidth}
            />

            {/* 流动动画 */}
            <ToolbarButton
                icon={<PlayCircleOutlined />}
                label={t(isAnimated ? 'edgeToolbar.stopAnimation' : 'edgeToolbar.startAnimation')}
                onClick={toggleAnimation}
                active={isAnimated}

            />

            <ToolbarDivider />

            {/* 箭头样式 */}
            <ToolbarButton
                icon={<SwapOutlined />}
                label={t('edgeToolbar.switchArrowStyle')}
                onClick={cycleArrow}
            />

            {/* 颜色 */}
            <ToolbarButton
                icon={<FormatPainterOutlined />}
                label={t('edgeToolbar.switchColor')}
                onClick={toggleColor}

            />

            <ToolbarDivider />

            {/* 标签编辑 */}
            {isEditingLabel ? (
                <div className="contextual-edge-toolbar-label-editor">
                    <input 
                        ref={labelInputRef}
                        value={labelText}
                        onChange={e => setLabelText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') confirmLabel();
                            if (e.key === 'Escape') cancelLabel();
                        }}
                        aria-label={t('edgeToolbar.labelInput')}
                        placeholder={t('edgeToolbar.labelPlaceholder')}
                        className="contextual-edge-toolbar-label-input"
                    />
                    <ToolbarButton icon={<CheckOutlined />} label={t('edgeToolbar.confirm')} onClick={confirmLabel} />
                    <ToolbarButton icon={<CloseOutlined />} label={t('edgeToolbar.cancel')} onClick={cancelLabel} danger />
                </div>
            ) : (
                <ToolbarButton
                    icon={<EditOutlined />}
                    label={edge.label
                        ? t('edgeToolbar.currentLabel', { label: String(edge.label) })
                        : t('edgeToolbar.addLabel')}
                    onClick={() => setIsEditingLabel(true)}
                    active={!!edge.label}

                />
            )}
        </ToolbarContainer>
    );
};
