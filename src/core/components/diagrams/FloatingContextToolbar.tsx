import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Node } from '@xyflow/react';
import { Divider, Dropdown, ColorPicker, type MenuProps } from 'antd';
import type { LayerConfig } from './hooks/useLayerManagement';
import type { AggregationColor } from 'antd/es/color-picker/color';
import {
    FaTrash, FaCopy, FaLock, FaLockOpen, FaLayerGroup,
    FaArrowsAlt, FaShapes, FaStar, FaPaintBrush, FaObjectGroup, FaRegObjectGroup
} from 'react-icons/fa';
import {
    MdAlignHorizontalLeft, MdAlignHorizontalCenter, MdAlignHorizontalRight,
    MdAlignVerticalTop, MdAlignVerticalCenter, MdAlignVerticalBottom,
    MdVerticalDistribute, MdHorizontalDistribute, MdLineWeight
} from 'react-icons/md';
import { FaArrowUp, FaArrowDown, FaPercentage } from 'react-icons/fa';
import { useAlignment } from './hooks/useAlignment';
import { ShapePreview } from './ShapePreview';
import type { FlowchartShape } from '../../types/flowchart-node';
import { resolveFloatingContextToolbarOffset } from './floatingContextToolbarPosition';
import { hasMutationLockedNode } from './nodeLockPolicy';
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
} from '../shared/FloatingToolbar';

// ─── Constants ───────────────────────────────────────────────────────────────

const POPULAR_SHAPES: Array<{ shape: FlowchartShape; labelKey: string }> = [
    { shape: 'rectangle', labelKey: 'propertyPanel.options.shape.rectangle' },
    { shape: 'pill', labelKey: 'propertyPanel.options.shape.pill' },
    { shape: 'diamond', labelKey: 'propertyPanel.options.shape.diamond' },
    { shape: 'parallelogram', labelKey: 'propertyPanel.options.shape.parallelogram' },
    { shape: 'database', labelKey: 'propertyPanel.options.shape.database' },
    { shape: 'document', labelKey: 'propertyPanel.options.shape.document' },
    { shape: 'ellipse', labelKey: 'propertyPanel.options.shape.ellipse' },
    { shape: 'hexagon', labelKey: 'propertyPanel.options.shape.hexagon' },
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

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
    onChangeShape?: (shape: FlowchartShape) => void;
    /** 保存选中节点为组件模板 */
    onSaveAsComponent?: () => void;
    /** 业务域变更 */
    onChangeDomainClass?: (domainClass: string) => void;
    /** 格式刷相关 */
    onCopyStyle?: () => void;
    onPasteStyle?: () => void;
    hasCopiedStyle?: boolean;
    onGroup?: () => void;
    onUngroup?: () => void;
    extraToolbarContent?: React.ReactNode; // Support for node-specific injected tools
    excludeToolbarFeatures?: ToolbarFeature[]; // Support for node-specific hiding of generic tools
    overrideDefaultToolbar?: boolean; // If true, replaces ALL default buttons and uses square borders
}

// ─── Popover Content Components ──────────────────────────────────────────────

const AlignPanel: React.FC<{
    onAlign: (dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    onDistribute: (dir: 'horizontal' | 'vertical') => void;
    canAlign: boolean;
    canDistribute: boolean;
}> = ({ onAlign, onDistribute, canAlign, canDistribute }) => {
    const { t } = useTranslation();
    return <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 2 }}>
            <ToolbarButton icon={<MdAlignHorizontalLeft />} label={t('designer.toolbar.alignL')} onClick={() => onAlign('left')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignHorizontalCenter />} label={t('designer.toolbar.alignC')} onClick={() => onAlign('center')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignHorizontalRight />} label={t('designer.toolbar.alignR')} onClick={() => onAlign('right')} disabled={!canAlign} />
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
            <ToolbarButton icon={<MdAlignVerticalTop />} label={t('designer.toolbar.alignT')} onClick={() => onAlign('top')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignVerticalCenter />} label={t('designer.toolbar.alignM')} onClick={() => onAlign('middle')} disabled={!canAlign} />
            <ToolbarButton icon={<MdAlignVerticalBottom />} label={t('designer.toolbar.alignB')} onClick={() => onAlign('bottom')} disabled={!canAlign} />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div style={{ display: 'flex', gap: 2 }}>
            <ToolbarButton icon={<MdHorizontalDistribute />} label={t('designer.toolbar.distributeH')} onClick={() => onDistribute('horizontal')} disabled={!canDistribute} />
            <ToolbarButton icon={<MdVerticalDistribute />} label={t('designer.toolbar.distributeV')} onClick={() => onDistribute('vertical')} disabled={!canDistribute} />
        </div>
    </div>;
};

const ShapePanel: React.FC<{ onChangeShape: (shape: FlowchartShape) => void }> = ({ onChangeShape }) => {
    const { t } = useTranslation();
    return <div style={{ padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, width: 180 }}>
        {POPULAR_SHAPES.map(s => (
            <div
                key={s.shape}
                onClick={() => onChangeShape(s.shape)}
                style={{
                    padding: '6px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 4, borderRadius: 4, transition: 'background 0.2s',
                }}
                title={t(s.labelKey)}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--toolbar-btn-hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <div style={{ lineHeight: 0 }}><ShapePreview shape={s.shape} size={24} color="#64748b" /></div>
            </div>
        ))}
    </div>;
};

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
    onChangeColorComplete,
    onLock, onOpacity, onBringToFront, onSendToBack, onUpdateStyle, onUpdateNodes,
    layers, onMoveToLayer, onChangeShape, onSaveAsComponent, onChangeDomainClass,
    onCopyStyle, onPasteStyle, hasCopiedStyle, onGroup, onUngroup, extraToolbarContent, excludeToolbarFeatures,
    overrideDefaultToolbar
}) => {
    // ─── Hooks (must be called unconditionally) ──────────────────────────────
    const selectedIds = useMemo(() => selectedNodes.map(n => n.id), [selectedNodes]);
    const worldBounds = useSelectedNodeBounds(selectedIds);
    const nodesDragging = useNodesDragging();
    const toolbarOffset = resolveFloatingContextToolbarOffset(selectedNodes);

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
        offset: toolbarOffset,
        mobileLeftInset: 60,
        hidden: nodesDragging || selectedNodes.length === 0,
    });

    // Early return AFTER all Hooks
    if (!visible) return null;

    // ─── Derived state ───────────────────────────────────────────────────────
    const isHide = (feature: ToolbarFeature) => excludeToolbarFeatures?.includes(feature);
    const allLocked = selectedNodes.every(node => node.data?.locked === true || node.draggable === false);
    const hasLockedSelection = hasMutationLockedNode(selectedNodes);
    const hasUngroupableSelection = selectedNodes.some(node => node.type === 'titleGroup' || node.type === 'subGroup');
    const lockedActionLabel = (label: string) => hasLockedSelection ? `${label}（请先解锁）` : label;

    const currentOpacity = selectedNodes.reduce((acc, n) => {
        const op = n.style?.opacity !== undefined ? Number(n.style.opacity) : 1;
        return acc + op;
    }, 0) / selectedNodes.length;

    const selectedNodeData = selectedNodes[0]?.data;
    const selectedDataStyle = isRecord(selectedNodeData?.style) ? selectedNodeData.style : {};
    const selectedDataTheme = isRecord(selectedNodeData?.theme) ? selectedNodeData.theme : {};
    const currentColor = typeof selectedDataStyle.backgroundColor === 'string'
        ? selectedDataStyle.backgroundColor
        : typeof selectedDataTheme.main === 'string'
          ? selectedDataTheme.main
          : '#ffffff';

    const currentStrokeWidth = Number(selectedNodes[0]?.style?.strokeWidth || 1);
    const isDashed = selectedNodes[0]?.style?.strokeDasharray === '4,4';

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <ToolbarContainer
            className="floating-context-toolbar"
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
                            disabled={hasLockedSelection}
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
                        <ToolbarPopover icon={<FaShapes />} label={lockedActionLabel('形状')} disabled={hasLockedSelection} content={<ShapePanel onChangeShape={onChangeShape || (() => {})} />} />
                    )}

                    {!isHide('align') && (
                        <ToolbarPopover icon={<FaArrowsAlt />} label={lockedActionLabel('对齐')} disabled={!canAlign || hasLockedSelection}
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
                    <ToolbarButton icon={<FaCopy />} label={lockedActionLabel('复制 (Ctrl+D)')} onClick={onDuplicate} disabled={hasLockedSelection} />
                    <ToolbarButton icon={<FaTrash />} label={lockedActionLabel('删除 (Del)')} onClick={onDelete} disabled={hasLockedSelection} danger />

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
                            disabled: hasLockedSelection,
                        }] : []),
                        ...(!isHide('layer') ? [
                            { key: 'bringFront', icon: <FaArrowUp />, label: '置顶', onClick: onBringToFront, disabled: hasLockedSelection },
                            { key: 'sendBack', icon: <FaArrowDown />, label: '置底', onClick: onSendToBack, disabled: hasLockedSelection },
                        ] : []),
                        ...(!isHide('border') ? [{
                            key: 'border', icon: <MdLineWeight />,
                            label: `边框 ${currentStrokeWidth}px${isDashed ? ' 虚线' : ''}`,
                            onClick: () => {
                                const widths = [0, 1, 2, 4];
                                const idx = widths.indexOf(currentStrokeWidth);
                                onUpdateStyle({ strokeWidth: widths[(idx + 1) % widths.length] });
                            },
                            disabled: hasLockedSelection,
                        }] : []),
                        ...(onSaveAsComponent ? [{ key: 'save', icon: <FaStar />, label: '保存为组件', onClick: onSaveAsComponent }] : []),
                        ...(onGroup && selectedNodes.length > 1 ? [{
                            key: 'group', icon: <FaObjectGroup />, label: '组合 (Ctrl+G)', onClick: onGroup,
                            disabled: hasLockedSelection,
                        }] : []),
                        ...(onUngroup && hasUngroupableSelection ? [{
                            key: 'ungroup', icon: <FaRegObjectGroup />, label: '取消组合 (Ctrl+Shift+G)', onClick: onUngroup,
                            disabled: hasLockedSelection,
                        }] : []),
                        ...(onCopyStyle && onPasteStyle ? [{
                            key: 'format', icon: <FaPaintBrush />,
                            label: hasCopiedStyle ? '粘贴样式' : '复制样式',
                            onClick: hasCopiedStyle ? onPasteStyle : onCopyStyle,
                            disabled: hasCopiedStyle && hasLockedSelection,
                        }] : []),
                    ]} />

                    {/* 域 Popover — 仅在插件启用时显示 */}
                    {!isHide('domain') && onChangeDomainClass && (
                        <ToolbarPopover
                            icon={<div style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(135deg, #3b82f6, #ef4444)' }} />}
                            label="业务域"
                            disabled={hasLockedSelection}
                            content={<DomainClassPanel onChangeDomainClass={onChangeDomainClass} />}
                        />
                    )}

                    {/* 图层 dropdown */}
                    {!isHide('layer') && layers && layers.length > 0 && onMoveToLayer && (
                        <Dropdown disabled={hasLockedSelection} menu={{ items: layerMenuItems }} trigger={['click']}>
                            <span><ToolbarButton icon={<FaLayerGroup />} label={lockedActionLabel('移动到图层')} disabled={hasLockedSelection} /></span>
                        </Dropdown>
                    )}

                    {/* 插件注入 */}
                    {extraToolbarContent && (<><ToolbarDivider />{extraToolbarContent}</>)}
                </>
            )}
        </ToolbarContainer>
    );
});
