import React, { useMemo } from 'react';
import { Node } from '@xyflow/react';
import { Divider, Dropdown, ColorPicker, type MenuProps } from 'antd';
import type { LayerConfig } from './hooks/useLayerManagement';
import type { AggregationColor } from 'antd/es/color-picker/color';
import {
    FaTrash, FaCopy, FaLock, FaLockOpen, FaLayerGroup,
    FaArrowsAlt, FaShapes, FaStar, FaPaintBrush
} from 'react-icons/fa';
import {
    MdAlignHorizontalLeft, MdAlignHorizontalCenter, MdAlignHorizontalRight,
    MdAlignVerticalTop, MdAlignVerticalCenter, MdAlignVerticalBottom,
    MdVerticalDistribute, MdHorizontalDistribute, MdLineWeight
} from 'react-icons/md';
import { FaArrowUp, FaArrowDown, FaPercentage } from 'react-icons/fa';
import { useAlignment } from './hooks/useAlignment';
import { ShapePreview } from './ShapePreview';
import {
    ToolbarContainer,
    ToolbarButton,
    ToolbarColorSwatch,
    ToolbarDivider,
    ToolbarPopover,
    ToolbarOverflow,
    useFloatingPosition,
    useSelectedNodeBounds,
    useNodesDragging,
    type _OverflowItem,
} from '../shared/FloatingToolbar';

// ─── Constants ───────────────────────────────────────────────────────────────

const POPULAR_SHAPES = [
    { shape: 'rectangle', label: 'Process' },
    { shape: 'pill', label: 'Start/End' },
    { shape: 'diamond', label: 'Decision' },
    { shape: 'parallelogram', label: 'I/O' },
    { shape: 'database', label: 'Database' },
    { shape: 'document', label: 'Document' },
    { shape: 'ellipse', label: 'Ellipse' },
    { shape: 'hexagon', label: 'Hexagon' },
];

const DOMAIN_OPTIONS = [
    { value: 'none', label: '无领域 (Default)', color: '#D5D8DC' },
    { value: 'fe', label: '前端/交互域 (Frontend)', color: '#3498DB' },
    { value: 'ch', label: '触点渠道域 (Channel)', color: '#E91E63' },
    { value: 'mid', label: '业务中台域 (Middleware)', color: '#4CAF50' },
    { value: 'backend', label: '后台服务域 (Backend)', color: '#5C6BC0' },
    { value: 'be-scm', label: '供应链域 (SCM)', color: '#FF9800' },
    { value: 'data', label: '数据计算域 (Data)', color: '#607D8B' },
    { value: 'infra', label: '基础设施域 (Infra)', color: '#424242' },
];

// ─── Types (preserved for backward compatibility) ────────────────────────────

export type ToolbarFeature = 'color' | 'opacity' | 'shape' | 'domain' | 'align' | 'layer' | 'border' | 'copyStyle';

export interface FloatingContextToolbarProps {
    selectedNodes: Node[];
    onDelete: () => void;
    onDuplicate: () => void;
    onChangeColor: (color: string) => void;
    onChangeColorComplete?: (color: string) => void;
    onLock: (locked: boolean) => void;
    onOpacity: (opacity: number) => void;
    onBringToFront: () => void;
    onSendToBack: () => void;
    onUpdateStyle: (style: React.CSSProperties) => void;
    onUpdateNodes: (updates: { id: string, position: { x: number, y: number } }[]) => void;
    layers?: LayerConfig[];
    onMoveToLayer?: (layerId: string) => void;
    onChangeShape?: (shape: string) => void;
    /** 保存选中节点为组件模板 */
    onSaveAsComponent?: () => void;
    /** 业务域变更 */
    onChangeDomainClass?: (domainClass: string) => void;
    /** 格式刷相关 */
    onCopyStyle?: () => void;
    onPasteStyle?: () => void;
    hasCopiedStyle?: boolean;
    extraToolbarContent?: React.ReactNode; // Support for node-specific injected tools
    excludeToolbarFeatures?: ToolbarFeature[]; // Support for node-specific hiding of generic tools
    overrideDefaultToolbar?: boolean; // If true, replaces ALL default buttons and uses square borders
}

// ─── Popover Content Components ──────────────────────────────────────────────

const AlignPanel: React.FC<{
    onAlign: (dir: string) => void;
    onDistribute: (dir: string) => void;
    canAlign: boolean;
    canDistribute: boolean;
}> = ({ onAlign, onDistribute, canAlign, canDistribute }) => (
    <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 2 }}>
            <ToolbarButton icon={<MdAlignHorizontalLeft />} label="Align Left" onClick={() => onAlign('left')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignHorizontalCenter />} label="Align Center" onClick={() => onAlign('center')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignHorizontalRight />} label="Align Right" onClick={() => onAlign('right')} disabled={!canAlign} />
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
            <ToolbarButton icon={<MdAlignVerticalTop />} label="Align Top" onClick={() => onAlign('top')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignVerticalCenter />} label="Align Middle" onClick={() => onAlign('middle')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignVerticalBottom />} label="Align Bottom" onClick={() => onAlign('bottom')} disabled={!canAlign} />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div style={{ display: 'flex', gap: 2 }}>
            <ToolbarButton icon={<MdHorizontalDistribute />} label="Distribute Horizontally" onClick={() => onDistribute('horizontal')} disabled={!canDistribute} />
            <ToolbarButton icon={<MdVerticalDistribute />} label="Distribute Vertically" onClick={() => onDistribute('vertical')} disabled={!canDistribute} />
        </div>
    </div>
);

const ShapePanel: React.FC<{ onChangeShape: (shape: string) => void }> = ({ onChangeShape }) => (
    <div style={{ padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, width: 180 }}>
        {POPULAR_SHAPES.map(s => (
            <div
                key={s.shape}
                onClick={() => onChangeShape(s.shape)}
                style={{
                    padding: '6px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 4, borderRadius: 4, transition: 'background 0.2s',
                }}
                title={s.label}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--toolbar-btn-hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <div style={{ lineHeight: 0 }}><ShapePreview shape={s.shape as any} size={24} color="#64748b" /></div>
            </div>
        ))}
    </div>
);

const DomainClassPanel: React.FC<{ onChangeDomainClass: (domainClass: string) => void }> = ({ onChangeDomainClass }) => (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, width: 180 }}>
        <div style={{ fontSize: '12px', marginBottom: 4, color: '#666' }}>业务域色带配置</div>
        {DOMAIN_OPTIONS.map(opt => (
            <div
                key={opt.value}
                onClick={() => onChangeDomainClass(opt.value)}
                style={{
                    padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    borderRadius: 4, transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--toolbar-btn-hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: opt.color, border: '1px solid rgba(0,0,0,0.1)' }} />
                <span style={{ fontSize: '13px' }}>{opt.label}</span>
            </div>
        ))}
    </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export const FloatingContextToolbar: React.FC<FloatingContextToolbarProps> = React.memo(({
    selectedNodes, onDelete, onDuplicate, onChangeColor,
    onLock, onOpacity, onBringToFront, onSendToBack, onUpdateStyle, onUpdateNodes,
    layers, onMoveToLayer, onChangeShape, onSaveAsComponent, onChangeDomainClass,
    onCopyStyle, onPasteStyle, hasCopiedStyle, extraToolbarContent, excludeToolbarFeatures,
    overrideDefaultToolbar
}) => {
    // ─── Hooks (must be called unconditionally) ──────────────────────────────
    const selectedIds = useMemo(() => selectedNodes.map(n => n.id), [selectedNodes]);
    const worldBounds = useSelectedNodeBounds(selectedIds);
    const nodesDragging = useNodesDragging();

    const { handleAlign, handleDistribute, canAlign, canDistribute } = useAlignment({
        selectedNodes, onUpdateNodes,
    });

    // 图层菜单项
    const layerMenuItems: MenuProps['items'] = useMemo(() => {
        if (!layers || !onMoveToLayer) return [];
        return layers.map(layer => ({
            key: layer.id,
            label: layer.name,
            onClick: () => onMoveToLayer(layer.id),
        }));
    }, [layers, onMoveToLayer]);

    // (overflow items are now inline in the JSX ToolbarOverflow component)

    // 定位计算
    const { style: positionStyle, visible } = useFloatingPosition({
        worldBounds,
        placement: 'auto',
        offset: 20,
        hidden: nodesDragging || selectedNodes.length === 0,
    });

    // Early return AFTER all Hooks
    if (!visible) return null;

    // ─── Derived state ───────────────────────────────────────────────────────
    const isHide = (feature: ToolbarFeature) => excludeToolbarFeatures?.includes(feature);
    const allLocked = selectedNodes.every(n => n.draggable === false);

    const currentOpacity = selectedNodes.reduce((acc, n) => {
        const op = n.style?.opacity !== undefined ? Number(n.style.opacity) : 1;
        return acc + op;
    }, 0) / selectedNodes.length;

    const currentColor = (selectedNodes[0]?.data?.style as any)?.backgroundColor ||
        (selectedNodes[0]?.data?.theme as any)?.main || '#ffffff';

    const currentStrokeWidth = Number(selectedNodes[0]?.style?.strokeWidth || 1);
    const isDashed = selectedNodes[0]?.style?.strokeDasharray === '4,4';

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <ToolbarContainer
            positioning="positioned"
            square={overrideDefaultToolbar}
            style={positionStyle}
        >
            {overrideDefaultToolbar ? (
                <>{extraToolbarContent}</>
            ) : (
                <>
                    {/* ── 外观区 ── */}
                    {!isHide('color') && (
                        <ColorPicker
                            value={currentColor}
                            onChange={(color: AggregationColor | string) => {
                                const hex = typeof color === 'string' ? color : color.toHexString();
                                onChangeColor(hex);
                            }}
                            onChangeComplete={(color: AggregationColor) => {
                                if (onChangeColorComplete) {
                                    onChangeColorComplete(color.toHexString());
                                }
                            }}
                            disabledAlpha
                            presets={[{
                                label: 'Brand',
                                colors: ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#d946ef', '#8b5cf6'],
                            }, {
                                label: 'Neutral',
                                colors: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#ffffff', '#000000'],
                            }]}
                            trigger="click"
                        >
                            <span><ToolbarColorSwatch color={currentColor} label="颜色" /></span>
                        </ColorPicker>
                    )}

                    {!isHide('shape') && (
                        <ToolbarPopover icon={<FaShapes />} label="形状" content={<ShapePanel onChangeShape={onChangeShape || (() => {})} />} />
                    )}

                    {!isHide('align') && (
                        <ToolbarPopover icon={<FaArrowsAlt />} label="对齐" disabled={!canAlign}
                            content={<AlignPanel onAlign={handleAlign} onDistribute={handleDistribute} canAlign={canAlign} canDistribute={canDistribute} />}
                        />
                    )}

                    <ToolbarDivider />

                    {/* ── 操作区 ── */}
                    <ToolbarButton
                        icon={allLocked ? <FaLock /> : <FaLockOpen />}
                        label={allLocked ? "解锁" : "锁定"}
                        onClick={() => onLock(!allLocked)}
                        active={allLocked}
                    />
                    <ToolbarButton icon={<FaCopy />} label="复制 (Ctrl+D)" onClick={onDuplicate} />
                    <ToolbarButton icon={<FaTrash />} label="删除 (Del)" onClick={onDelete} danger />

                    {/* ── 更多 ── */}
                    <ToolbarDivider />
                    <ToolbarOverflow items={[
                        ...(!isHide('opacity') ? [{
                            key: 'opacity', icon: <FaPercentage />,
                            label: `透明度 ${Math.round(currentOpacity * 100)}%`,
                            onClick: () => {
                                const steps = [1, 0.8, 0.6, 0.4, 0.2];
                                const idx = steps.findIndex(s => Math.abs(s - currentOpacity) < 0.05);
                                onOpacity(steps[(idx + 1) % steps.length]);
                            },
                        }] : []),
                        ...(!isHide('layer') ? [
                            { key: 'bringFront', icon: <FaArrowUp />, label: '置顶', onClick: onBringToFront },
                            { key: 'sendBack', icon: <FaArrowDown />, label: '置底', onClick: onSendToBack },
                        ] : []),
                        ...(!isHide('border') ? [{
                            key: 'border', icon: <MdLineWeight />,
                            label: `边框 ${currentStrokeWidth}px${isDashed ? ' 虚线' : ''}`,
                            onClick: () => {
                                const widths = [0, 1, 2, 4];
                                const idx = widths.indexOf(currentStrokeWidth);
                                onUpdateStyle({ strokeWidth: widths[(idx + 1) % widths.length] });
                            },
                        }] : []),
                        ...(onSaveAsComponent ? [{ key: 'save', icon: <FaStar />, label: '保存为组件', onClick: onSaveAsComponent }] : []),
                        ...(onCopyStyle && onPasteStyle ? [{
                            key: 'format', icon: <FaPaintBrush />,
                            label: hasCopiedStyle ? '粘贴样式' : '复制样式',
                            onClick: hasCopiedStyle ? onPasteStyle : onCopyStyle,
                        }] : []),
                    ]} />

                    {/* 域 Popover — 仅在插件启用时显示 */}
                    {!isHide('domain') && onChangeDomainClass && (
                        <ToolbarPopover
                            icon={<div style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(135deg, #3b82f6, #ef4444)' }} />}
                            label="业务域"
                            content={<DomainClassPanel onChangeDomainClass={onChangeDomainClass} />}
                        />
                    )}

                    {/* 图层 dropdown */}
                    {!isHide('layer') && layers && layers.length > 0 && onMoveToLayer && (
                        <Dropdown menu={{ items: layerMenuItems }} trigger={['click']}>
                            <span><ToolbarButton icon={<FaLayerGroup />} label="移动到图层" /></span>
                        </Dropdown>
                    )}

                    {/* 插件注入 */}
                    {extraToolbarContent && (<><ToolbarDivider />{extraToolbarContent}</>)}
                </>
            )}
        </ToolbarContainer>
    );
});
