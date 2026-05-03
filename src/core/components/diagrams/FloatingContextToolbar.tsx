import React, { useMemo, useState } from 'react';
import { Node, useViewport, useStore } from '@xyflow/react';
import { theme, Button, Tooltip, Divider, Popover, Slider, Input, Space, ColorPicker, Dropdown, type MenuProps } from 'antd';
import type { LayerConfig } from './hooks/useLayerManagement';
import {
    FaTrash, FaCopy, FaLock, FaLockOpen, FaLayerGroup,
    FaPalette, FaArrowsAlt, FaPercentage, FaArrowUp, FaArrowDown, FaShapes,
    FaStar, FaPaintBrush
} from 'react-icons/fa';
import {
    MdAlignHorizontalLeft, MdAlignHorizontalCenter, MdAlignHorizontalRight,
    MdAlignVerticalTop, MdAlignVerticalCenter, MdAlignVerticalBottom,
    MdVerticalDistribute, MdHorizontalDistribute, MdLineWeight
} from 'react-icons/md';
import { FaBorderNone } from 'react-icons/fa';
import { AggregationColor } from 'antd/es/color-picker/color';
import { useAlignment } from './hooks/useAlignment';
import { ShapePreview } from './ShapePreview';

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

export type ToolbarFeature = 'color' | 'opacity' | 'shape' | 'domain' | 'align' | 'layer' | 'border' | 'copyStyle';

export interface FloatingContextToolbarProps {
    selectedNodes: Node[];
    onDelete: () => void;
    onDuplicate: () => void;
    onChangeColor: (color: string) => void;
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

export const FloatingContextToolbar: React.FC<FloatingContextToolbarProps> = React.memo(({
    selectedNodes, onDelete, onDuplicate, onChangeColor,
    onLock, onOpacity, onBringToFront, onSendToBack, onUpdateStyle, onUpdateNodes,
    layers, onMoveToLayer, onChangeShape, onSaveAsComponent, onChangeDomainClass,
    onCopyStyle, onPasteStyle, hasCopiedStyle, extraToolbarContent, excludeToolbarFeatures,
    overrideDefaultToolbar
}) => {
    const { token } = theme.useToken();
    const { x: vX, y: vY, zoom } = useViewport();
    // [FIX] 拖拽时隐藏工具栏：节点位置通过 CSS transform 变化，不触发 re-render，
    // 工具栏 bounds 不更新导致留在原地。拖拽结束后自动重现在新位置。
    const nodesDragging = useStore((s: any) => !!s.nodesDragging);

    // Alignment Hook
    const { handleAlign, handleDistribute, canAlign, canDistribute } = useAlignment({
        selectedNodes,
        onUpdateNodes
    });

    // 图层菜单项 - 修复Hooks顺序问题:永远调用useMemo,避免条件性Hooks
    const layerMenuItems: MenuProps['items'] = useMemo(() => {
        // 条件逻辑移到useMemo内部
        if (!layers || !onMoveToLayer) return [];
        return layers.map(layer => ({
            key: layer.id,
            label: layer.name,
            onClick: () => onMoveToLayer(layer.id)
        }));
    }, [layers, onMoveToLayer]);

    // Compute bounds from store's latest positions (not from stale selectedNodes prop)
    // This ensures bounds update immediately after drag stop
    const selectedIds = useMemo(() => selectedNodes.map(n => n.id), [selectedNodes]);
    const bounds = useStore((s: any) => {
        if (selectedIds.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of selectedIds) {
            const n = s.nodeLookup?.get(id) || s.nodeInternals?.get(id);
            if (!n) continue;
            const abs = n.internals?.positionAbsolute || n.positionAbsolute || n.position;
            const x = abs?.x ?? 0;
            const y = abs?.y ?? 0;
            const w = n.measured?.width ?? n.width ?? 0;
            const h = n.measured?.height ?? n.height ?? 0;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + (typeof w === 'number' ? w : 0));
            maxY = Math.max(maxY, y + (typeof h === 'number' ? h : 0));
        }
        if (minX === Infinity) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    });

    // Early return AFTER all Hooks
    if (!bounds || nodesDragging) return null;

    // Smart Positioning — 世界坐标 → 屏幕坐标（ReactFlow children 在容器坐标系）
    // 公式: screenPos = worldPos * zoom + viewportOffset
    const screenCenterX = (bounds.x + bounds.w / 2) * zoom + vX;
    const screenTopY = bounds.y * zoom + vY;
    const screenBottomY = (bounds.y + bounds.h) * zoom + vY;

    const placeBelow = screenTopY < 140; // buffer for top UI (toolbar / hints)

    const style: React.CSSProperties = {
        position: 'absolute',
        left: screenCenterX,
        top: placeBelow
            ? screenBottomY + 20 // Below node, 20px gap
            : screenTopY - 20,   // Above node, 20px gap
        transform: `translate(-50%, ${placeBelow ? '0%' : '-100%'})`,
        transformOrigin: placeBelow ? 'top center' : 'bottom center',
        zIndex: 1005,
        // 平滑追踪位置变化
        transition: 'left 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), top 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), background-color 0.2s',
        animation: 'toolbarFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    };

    // Determine Lock State (if all selected are locked)
    const allLocked = selectedNodes.every(n => n.draggable === false);
    const isHide = (feature: ToolbarFeature) => excludeToolbarFeatures?.includes(feature);

    // Determine Opacity (avg of selected)
    const currentOpacity = selectedNodes.reduce((acc, n) => {
        const op = n.style?.opacity !== undefined ? Number(n.style.opacity) : 1;
        return acc + op;
    }, 0) / selectedNodes.length;

    // --- Popover Contents ---

    // Determine Color (first node)
    const currentColor = (selectedNodes[0]?.data?.style as any)?.backgroundColor ||
        (selectedNodes[0]?.data?.theme as any)?.main || '#ffffff';

    const OpacityContent = (
        <div style={{ padding: 8, width: 150 }}>
            <div style={{ marginBottom: 4 }}>Opacity: {Math.round(currentOpacity * 100)}%</div>
            <Slider
                min={0.1} max={1} step={0.1}
                value={currentOpacity}
                onChange={onOpacity}
            />
        </div>
    );

    const AlignContent = (
        <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Space>
                <Tooltip title="Align Left"><Button size="small" type="text" onClick={() => handleAlign('left')} disabled={!canAlign} icon={<MdAlignHorizontalLeft />} /></Tooltip>
                <Tooltip title="Align Center"><Button size="small" type="text" onClick={() => handleAlign('center')} disabled={!canAlign} icon={<MdAlignHorizontalCenter />} /></Tooltip>
                <Tooltip title="Align Right"><Button size="small" type="text" onClick={() => handleAlign('right')} disabled={!canAlign} icon={<MdAlignHorizontalRight />} /></Tooltip>
            </Space>
            <Space>
                <Tooltip title="Align Top"><Button size="small" type="text" onClick={() => handleAlign('top')} disabled={!canAlign} icon={<MdAlignVerticalTop />} /></Tooltip>
                <Tooltip title="Align Middle"><Button size="small" type="text" onClick={() => handleAlign('middle')} disabled={!canAlign} icon={<MdAlignVerticalCenter />} /></Tooltip>
                <Tooltip title="Align Bottom"><Button size="small" type="text" onClick={() => handleAlign('bottom')} disabled={!canAlign} icon={<MdAlignVerticalBottom />} /></Tooltip>
            </Space>
            <Divider style={{ margin: '4px 0' }} />
            <Space>
                <Tooltip title="Distribute Horizontally"><Button size="small" type="text" onClick={() => handleDistribute('horizontal')} disabled={!canDistribute} icon={<MdHorizontalDistribute />} /></Tooltip>
                <Tooltip title="Distribute Vertically"><Button size="small" type="text" onClick={() => handleDistribute('vertical')} disabled={!canDistribute} icon={<MdVerticalDistribute />} /></Tooltip>
            </Space>
        </div>
    );


    const LayerContent = (
        <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Button size="small" type="text" icon={<FaArrowUp />} onClick={onBringToFront} style={{ justifyContent: 'flex-start' }}>Bring to Front</Button>
            <Button size="small" type="text" icon={<FaArrowDown />} onClick={onSendToBack} style={{ justifyContent: 'flex-start' }}>Send to Back</Button>
        </div>
    );

    const currentStrokeWidth = Number(selectedNodes[0]?.style?.strokeWidth || 1);
    const isDashed = selectedNodes[0]?.style?.strokeDasharray === '4,4';

    const BorderContent = (
        <div style={{ padding: 8, width: 160 }}>
            <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '12px', marginBottom: 4 }}>Thickness: {currentStrokeWidth}px</div>
                <Slider
                    min={0} max={10} step={1}
                    value={currentStrokeWidth}
                    onChange={(val) => onUpdateStyle({ strokeWidth: val })}
                />
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', gap: 4 }}>
                <Button
                    size="small"
                    type={!isDashed ? 'primary' : 'default'}
                    onClick={() => onUpdateStyle({ strokeDasharray: 'none' })}
                    style={{ flex: 1 }}
                >Solid</Button>
                <Button
                    size="small"
                    type={isDashed ? 'primary' : 'default'}
                    onClick={() => onUpdateStyle({ strokeDasharray: '4,4' })}
                    style={{ flex: 1 }}
                >Dashed</Button>
            </div>
        </div>
    );

    const ShapeContent = (
        <div style={{ padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, width: 180 }}>
            {POPULAR_SHAPES.map(s => (
                <div
                    key={s.shape}
                    onClick={() => { onChangeShape?.(s.shape); }}
                    style={{
                        padding: '6px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, borderRadius: 4,
                        transition: 'background 0.2s'
                    }}
                    title={s.label}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <div style={{ lineHeight: 0 }}><ShapePreview shape={s.shape as any} size={24} color="#64748b" /></div>
                </div>
            ))}
        </div>
    );

    const DomainClassContent = (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, width: 180 }}>
            <div style={{ fontSize: '12px', marginBottom: 4, color: '#666' }}>业务域色带配置</div>
            {DOMAIN_OPTIONS.map(opt => (
                <div
                    key={opt.value}
                    onClick={() => { onChangeDomainClass?.(opt.value); }}
                    style={{
                        padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4,
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: opt.color, border: '1px solid rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: '13px', color: '#333' }}>{opt.label}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div style={style} className={`floating-toolbar flex items-center gap-0.5 pointer-events-auto border-none backdrop-blur-[24px] backdrop-saturate-[180%] bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.12)] ${overrideDefaultToolbar ? 'rounded-[12px] p-2' : 'rounded-full px-3 py-1'}`}>
            {overrideDefaultToolbar ? (
                <>{extraToolbarContent}</>
            ) : (
                <>
                    {!isHide('color') && (
                        <ColorPicker
                            value={currentColor}
                            onChange={(color: AggregationColor | string) => {
                                const hex = typeof color === 'string' ? color : color.toHexString();
                                onChangeColor(hex);
                            }}
                            disabledAlpha
                            presets={[
                                {
                                    label: 'Recommended',
                                    colors: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#64748b'],
                                },
                            ]}
                            trigger="click"
                        >
                            <Tooltip title="Color">
                                <Button type="text" size="small" icon={<FaPalette />} />
                            </Tooltip>
                        </ColorPicker>
                    )}

                    {!isHide('opacity') && <Popover content={OpacityContent} trigger="click">
                        <Tooltip title="Opacity">
                            <Button type="text" size="small" icon={<FaPercentage />} />
                        </Tooltip>
                    </Popover>}

                    {!isHide('shape') && <Popover content={ShapeContent} trigger="click" placement="bottom">
                        <Tooltip title="Change Shape">
                            <Button type="text" size="small" icon={<FaShapes />} />
                        </Tooltip>
                    </Popover>}

                    {!isHide('domain') && onChangeDomainClass && (
                        <Popover content={DomainClassContent} trigger="click" placement="bottom">
                            <Tooltip title="业务域 (Domain)">
                                <Button type="text" size="small" icon={<div style={{ width: 14, height: 14, borderRadius: 2, background: 'linear-gradient(135deg, #3498db, #e74c3c)' }} />} />
                            </Tooltip>
                        </Popover>
                    )}

                    {!isHide('align') && <Popover content={AlignContent} trigger="click" placement="bottom">
                        <Tooltip title="Alignments">
                            <Button type="text" size="small" icon={<FaArrowsAlt />} disabled={!canAlign} />
                        </Tooltip>
                    </Popover>}

                    {!isHide('layer') && <Popover content={LayerContent} trigger="click" placement="bottom">
                        <Tooltip title="Layers">
                            <Button type="text" size="small" icon={<FaLayerGroup />} />
                        </Tooltip>
                    </Popover>}

                    {!isHide('border') && <Popover content={BorderContent} trigger="click" placement="bottom">
                        <Tooltip title="Border & Stroke">
                            <Button type="text" size="small" icon={<MdLineWeight />} />
                        </Tooltip>
                    </Popover>}

                    <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />

                    {/* 图层移动功能也属于 layer 控制 */}
                    {!isHide('layer') && layers && layers.length > 0 && onMoveToLayer && (
                        <>
                            <Dropdown menu={{ items: layerMenuItems }} trigger={['click']}>
                                <Tooltip title="移动到图层">
                                    <Button type="text" size="small" icon={<FaLayerGroup />} />
                                </Tooltip>
                            </Dropdown>
                            <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />
                        </>
                    )}

                    <Tooltip title={allLocked ? "Unlock" : "Lock"}>
                        <Button
                            type="text"
                            size="small"
                            icon={allLocked ? <FaLock /> : <FaLockOpen />}
                            onClick={() => onLock(!allLocked)}
                            style={{ color: allLocked ? token.colorError : undefined }}
                        />
                    </Tooltip>

                    <Tooltip title="Duplicate (Ctrl+D)">
                        <Button type="text" size="small" icon={<FaCopy />} onClick={onDuplicate} />
                    </Tooltip>

                    {onSaveAsComponent && (
                        <Tooltip title="保存为组件">
                            <Button type="text" size="small" icon={<FaStar />} onClick={onSaveAsComponent} style={{ color: '#f59e0b' }} />
                        </Tooltip>
                    )}

                    {onCopyStyle && onPasteStyle && (
                        <Tooltip title={hasCopiedStyle ? "粘贴样式 (再次点击可连续)" : "复制样式 (进入格式刷状态)"}>
                            <Button 
                                type="text" 
                                size="small" 
                                icon={<FaPaintBrush />} 
                                onClick={hasCopiedStyle ? onPasteStyle : onCopyStyle} 
                                style={{ color: hasCopiedStyle ? '#3b82f6' : undefined, background: hasCopiedStyle ? 'rgba(59, 130, 246, 0.1)' : undefined }}
                            />
                        </Tooltip>
                    )}

                    {extraToolbarContent}

                    <Tooltip title="Delete (Del)">
                        <Button type="text" size="small" danger icon={<FaTrash />} onClick={onDelete} />
                    </Tooltip>
                </>
            )}
        </div>
    );
});
