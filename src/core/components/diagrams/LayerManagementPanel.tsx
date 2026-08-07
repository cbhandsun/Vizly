import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Space, Input, Tooltip, Popover, Modal } from 'antd';
import type { InputRef } from 'antd';
import {
    EyeOutlined,
    EyeInvisibleOutlined,
    LockOutlined,
    UnlockOutlined,
    PlusOutlined,
    DeleteOutlined,
    EditOutlined,
    BgColorsOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
} from '@ant-design/icons';
import type { LayerConfig } from './hooks/useLayerManagement';
import { isLayerNameAvailable, normalizeLayerNameInput } from '../../utils/layerName';
import { resolveLayerTouchTargetSize } from './layerInteractionMetrics';
import { getUiScale } from '../shared/viewportStore';

/** 预定义图层颜色 */
const LAYER_COLORS = [
    { value: '#ef4444', label: '红色' },
    { value: '#f97316', label: '橙色' },
    { value: '#eab308', label: '黄色' },
    { value: '#22c55e', label: '绿色' },
    { value: '#3b82f6', label: '蓝色' },
    { value: '#8b5cf6', label: '紫色' },
    { value: '#ec4899', label: '粉色' },
    { value: '#06b6d4', label: '青色' },
    { value: '#6366f1', label: '靛蓝色' },
    { value: '#14b8a6', label: '蓝绿色' },
    { value: '#f59e0b', label: '琥珀色' },
    { value: '#10b981', label: '翠绿色' },
];

const COLOR_PICKER_VALUES = [...LAYER_COLORS.map(option => option.value), undefined] as const;

const CREATE_ERROR_ID = 'layer-create-name-error';
const EDIT_ERROR_ID = 'layer-edit-name-error';

interface LayerManagementPanelProps {
    layers: LayerConfig[];
    activeLayerId: string | null;
    onSetActive: (layerId: string) => void;
    onToggleVisibility: (layerId: string) => void;
    onToggleLock: (layerId: string) => void;
    onRename: (layerId: string, newName: string) => boolean | void;
    onCreate: (name: string) => boolean | void;
    onDelete: (layerId: string) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onSetColor?: (layerId: string, color: string | undefined) => void;
}

/** 颜色选择弹出面板 */
const ColorPicker: React.FC<{
    current?: string;
    onSelect: (color: string | undefined) => void;
    touchTargetSize: number;
}> = ({ current, onSelect, touchTargetSize }) => {
    const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

    const focusAndSelect = useCallback((value: string | undefined) => {
        onSelect(value);
        const key = value ?? 'none';
        requestAnimationFrame(() => buttonRefs.current.get(key)?.focus());
    }, [onSelect]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, value: string | undefined) => {
        const currentIndex = COLOR_PICKER_VALUES.findIndex(candidate => candidate === value);
        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % COLOR_PICKER_VALUES.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + COLOR_PICKER_VALUES.length) % COLOR_PICKER_VALUES.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = COLOR_PICKER_VALUES.length - 1;
        }
        if (nextIndex === null) return;
        event.preventDefault();
        focusAndSelect(COLOR_PICKER_VALUES[nextIndex]);
    }, [focusAndSelect]);

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: touchTargetSize * 4 + 18 }} aria-label="图层颜色" role="radiogroup">
        {LAYER_COLORS.map(({ value, label }) => (
            <button
                type="button"
                key={value}
                ref={(element) => {
                    if (element) buttonRefs.current.set(value, element);
                    else buttonRefs.current.delete(value);
                }}
                role="radio"
                tabIndex={value === current ? 0 : -1}
                aria-label={`图层颜色：${label}`}
                aria-checked={value === current}
                title={label}
                onClick={() => focusAndSelect(value)}
                onKeyDown={(event) => handleKeyDown(event, value)}
                style={{
                    width: touchTargetSize, height: touchTargetSize,
                    padding: 0,
                    borderRadius: 6,
                    background: value,
                    cursor: 'pointer',
                    border: value === current ? '2px solid #000' : '2px solid transparent',
                    transition: 'transform 0.1s, border-color 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            />
        ))}
        <button
            ref={(element) => {
                if (element) buttonRefs.current.set('none', element);
                else buttonRefs.current.delete('none');
            }}
            type="button"
            role="radio"
            tabIndex={current ? -1 : 0}
            aria-label="图层颜色：无颜色"
            aria-checked={!current}
            title="无颜色"
            onClick={() => focusAndSelect(undefined)}
            onKeyDown={(event) => handleKeyDown(event, undefined)}
            style={{
                width: touchTargetSize, height: touchTargetSize,
                padding: 0,
                borderRadius: 6,
                background: '#f1f5f9',
                cursor: 'pointer',
                border: !current ? '2px solid #000' : '1px dashed #94a3b8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#64748b',
            }}
        >
            ×
        </button>
    </div>
    );
};

export const LayerManagementPanel: React.FC<LayerManagementPanelProps> = ({
    layers,
    activeLayerId,
    onSetActive,
    onToggleVisibility,
    onToggleLock,
    onRename,
    onCreate,
    onDelete,
    onReorder,
    onSetColor,
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createError, setCreateError] = useState<string | null>(null);
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [pendingDeleteLayer, setPendingDeleteLayer] = useState<LayerConfig | null>(null);
    const createInputRef = useRef<InputRef>(null);
    const editInputRef = useRef<InputRef>(null);
    const skipNextEditBlurRef = useRef(false);
    const layerRowRefs = useRef(new Map<string, HTMLDivElement>());
    const touchTargetSize = useMemo(
        () => resolveLayerTouchTargetSize(getUiScale()),
        [],
    );
    const actionButtonStyle = useMemo<React.CSSProperties>(() => ({
        minWidth: touchTargetSize,
        width: touchTargetSize,
        height: touchTargetSize,
        padding: 0,
    }), [touchTargetSize]);
    const displayedLayers = useMemo(() => [...layers].reverse(), [layers]);
    const keyboardActiveLayerId = activeLayerId && layers.some(layer => layer.id === activeLayerId)
        ? activeLayerId
        : displayedLayers[0]?.id ?? null;

    const focusLayerRow = useCallback((layerId: string) => {
        requestAnimationFrame(() => layerRowRefs.current.get(layerId)?.focus());
    }, []);

    const moveLayer = useCallback((layer: LayerConfig, direction: 'up' | 'down') => {
        const fromIndex = layers.findIndex(candidate => candidate.id === layer.id);
        if (fromIndex < 0) return;
        const toIndex = direction === 'up' ? fromIndex + 1 : fromIndex - 1;
        if (toIndex < 0 || toIndex >= layers.length) return;
        onReorder(fromIndex, toIndex);
        focusLayerRow(layer.id);
    }, [focusLayerRow, layers, onReorder]);

    const handleLayerKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, displayIndex: number) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSetActive(displayedLayers[displayIndex].id);
            return;
        }
        let nextIndex: number | null = null;
        if (event.key === 'ArrowUp') nextIndex = Math.max(0, displayIndex - 1);
        else if (event.key === 'ArrowDown') nextIndex = Math.min(displayedLayers.length - 1, displayIndex + 1);
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = displayedLayers.length - 1;
        if (nextIndex === null || nextIndex === displayIndex) return;
        event.preventDefault();
        const nextLayer = displayedLayers[nextIndex];
        onSetActive(nextLayer.id);
        focusLayerRow(nextLayer.id);
    }, [displayedLayers, focusLayerRow, onSetActive]);

    const cancelCreate = () => {
        setIsCreating(false);
        setCreateName('');
        setCreateError(null);
    };

    const handleCreate = () => {
        const name = normalizeLayerNameInput(createName);
        if (!name) {
            setCreateError('请输入图层名称');
            createInputRef.current?.focus();
            return;
        }
        if (!isLayerNameAvailable(layers, name)) {
            setCreateError('图层名称不能重复');
            createInputRef.current?.focus();
            return;
        }
        if (onCreate(name) === false) {
            setCreateError('图层创建失败，请重试');
            createInputRef.current?.focus();
            return;
        }
        cancelCreate();
    };

    const startEdit = (layer: LayerConfig) => {
        skipNextEditBlurRef.current = false;
        setEditingLayerId(layer.id);
        setEditName(layer.name);
        setEditError(null);
    };

    const finishEdit = (layerId: string) => {
        const name = normalizeLayerNameInput(editName);
        if (!name) {
            setEditError('请输入图层名称');
            requestAnimationFrame(() => editInputRef.current?.focus());
            return;
        }
        if (!isLayerNameAvailable(layers, name, layerId)) {
            setEditError('图层名称不能重复');
            requestAnimationFrame(() => editInputRef.current?.focus());
            return;
        }
        if (onRename(layerId, name) === false) {
            setEditError('图层重命名失败，请重试');
            requestAnimationFrame(() => editInputRef.current?.focus());
            return;
        }
        setEditError(null);
        setEditingLayerId(null);
        setEditName('');
    };

    const cancelEdit = () => {
        skipNextEditBlurRef.current = true;
        setEditingLayerId(null);
        setEditName('');
        setEditError(null);
    };

    return (
        <div style={{ padding: 16, background: '#fafafa', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>图层</h3>
                {isCreating ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <Space.Compact>
                            <Input
                                ref={createInputRef}
                                value={createName}
                                autoFocus
                                maxLength={80}
                                aria-label="新图层名称"
                                aria-invalid={Boolean(createError)}
                                aria-describedby={createError ? CREATE_ERROR_ID : undefined}
                                placeholder="输入图层名称"
                                status={createError ? 'error' : undefined}
                                style={{ width: 180, minHeight: touchTargetSize }}
                                onChange={(event) => {
                                    setCreateName(event.target.value);
                                    if (createError) setCreateError(null);
                                }}
                                onPressEnter={handleCreate}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') cancelCreate();
                                }}
                            />
                            <Button
                                type="primary"
                                aria-label="创建图层"
                                style={{ minHeight: touchTargetSize }}
                                onClick={handleCreate}
                            >
                                创建
                            </Button>
                            <Button
                                aria-label="取消新建图层"
                                style={{ minHeight: touchTargetSize }}
                                onClick={cancelCreate}
                            >
                                取消
                            </Button>
                        </Space.Compact>
                        {createError ? (
                            <div id={CREATE_ERROR_ID} role="alert" style={{ color: '#cf1322', fontSize: 12 }}>
                                {createError}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        aria-label="新建图层"
                        style={{ minHeight: touchTargetSize }}
                        onClick={() => setIsCreating(true)}
                    >
                        新建
                    </Button>
                )}
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
                <span
                    id="layer-list-keyboard-help"
                    style={{
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        padding: 0,
                        margin: -1,
                        overflow: 'hidden',
                        clip: 'rect(0, 0, 0, 0)',
                        whiteSpace: 'nowrap',
                        border: 0,
                    }}
                >
                    使用上下方向键切换图层，Home 和 End 跳到首尾图层。
                </span>
                <div role="list" aria-label="图层列表">
                    {displayedLayers.map((layer, displayIndex) => {
                        const isActive = layer.id === keyboardActiveLayerId;
                        const sourceIndex = layers.findIndex(candidate => candidate.id === layer.id);
                        const canMoveUp = sourceIndex >= 0 && sourceIndex < layers.length - 1;
                        const canMoveDown = sourceIndex > 0;

                        return (
                            <div
                                key={layer.id}
                                ref={(element) => {
                                    if (element) layerRowRefs.current.set(layer.id, element);
                                    else layerRowRefs.current.delete(layer.id);
                                }}
                                role="listitem"
                                tabIndex={isActive ? 0 : -1}
                                aria-current={isActive ? 'true' : undefined}
                                aria-describedby="layer-list-keyboard-help"
                                style={{
                                    background: isActive ? '#e6f7ff' : '#fff',
                                    padding: '10px 12px',
                                    marginBottom: 4,
                                    borderRadius: 4,
                                    border: isActive ? '1px solid #1890ff' : '1px solid #d9d9d9',
                                    cursor: 'pointer',
                                    borderLeft: layer.color ? `4px solid ${layer.color}` : undefined,
                                }}
                                onClick={() => onSetActive(layer.id)}
                                onKeyDown={(event) => handleLayerKeyDown(event, displayIndex)}
                            >
                                <div style={{ width: '100%' }}>
                                    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {layer.color && (
                                            <div style={{
                                                width: 10, height: 10,
                                                borderRadius: '50%',
                                                background: layer.color,
                                                flexShrink: 0,
                                                boxShadow: `0 0 0 2px ${layer.color}33`,
                                            }} />
                                        )}
                                        {editingLayerId === layer.id ? (
                                            <Input
                                                ref={editInputRef}
                                                value={editName}
                                                onChange={(event) => {
                                                    setEditName(event.target.value);
                                                    if (editError) setEditError(null);
                                                }}
                                                onBlur={() => {
                                                    if (skipNextEditBlurRef.current) {
                                                        skipNextEditBlurRef.current = false;
                                                        return;
                                                    }
                                                    finishEdit(layer.id);
                                                }}
                                                onPressEnter={() => finishEdit(layer.id)}
                                                onKeyDown={(event) => {
                                                    if (event.key !== 'Escape') return;
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    cancelEdit();
                                                }}
                                                autoFocus
                                                maxLength={80}
                                                aria-label={`重命名图层：${layer.name}`}
                                                aria-invalid={Boolean(editError)}
                                                aria-describedby={editError ? EDIT_ERROR_ID : undefined}
                                                status={editError ? 'error' : undefined}
                                                data-preserve-drawer-on-escape="true"
                                                size="small"
                                                style={{ width: '100%' }}
                                                onClick={(event) => event.stopPropagation()}
                                            />
                                        ) : (
                                            <span style={{
                                                fontWeight: isActive ? 600 : 400,
                                                color: layer.visible ? '#000' : '#999',
                                                fontSize: 13,
                                            }}>
                                                {layer.name}
                                            </span>
                                        )}
                                    </div>
                                    {editingLayerId === layer.id && editError ? (
                                        <div
                                            id={EDIT_ERROR_ID}
                                            role="alert"
                                            style={{ color: '#cf1322', fontSize: 12, marginBottom: 8 }}
                                        >
                                            {editError}
                                        </div>
                                    ) : null}

                                    <Space size={4}>
                                        <Tooltip title={layer.visible ? '隐藏' : '显示'}>
                                            <Button
                                                type="text"
                                                tabIndex={isActive ? 0 : -1}
                                                style={actionButtonStyle}
                                                aria-label={`${layer.visible ? '隐藏' : '显示'}图层：${layer.name}`}
                                                icon={layer.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleVisibility(layer.id);
                                                }}
                                            />
                                        </Tooltip>

                                        <Tooltip title={layer.locked ? '解锁' : '锁定'}>
                                            <Button
                                                type="text"
                                                tabIndex={isActive ? 0 : -1}
                                                style={actionButtonStyle}
                                                aria-label={`${layer.locked ? '解锁' : '锁定'}图层：${layer.name}`}
                                                icon={layer.locked ? <LockOutlined /> : <UnlockOutlined />}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleLock(layer.id);
                                                }}
                                            />
                                        </Tooltip>

                                        {onSetColor && (
                                            <Popover
                                                content={
                                                    <ColorPicker
                                                        current={layer.color}
                                                        onSelect={(color) => onSetColor(layer.id, color)}
                                                        touchTargetSize={touchTargetSize}
                                                    />
                                                }
                                                trigger="click"
                                                placement="bottom"
                                            >
                                                <Tooltip title="颜色标记">
                                                    <Button
                                                        type="text"
                                                        tabIndex={isActive ? 0 : -1}
                                                        style={actionButtonStyle}
                                                        aria-label={`设置图层颜色：${layer.name}`}
                                                        icon={<BgColorsOutlined style={{ color: layer.color || undefined }} />}
                                                        onClick={(event) => event.stopPropagation()}
                                                    />
                                                </Tooltip>
                                            </Popover>
                                        )}

                                        {isActive && (
                                            <>
                                                <Tooltip title="上移图层">
                                                    <Button
                                                        type="text"
                                                        style={actionButtonStyle}
                                                        aria-label={`上移图层：${layer.name}`}
                                                        disabled={!canMoveUp}
                                                        icon={<ArrowUpOutlined />}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            moveLayer(layer, 'up');
                                                        }}
                                                    />
                                                </Tooltip>

                                                <Tooltip title="下移图层">
                                                    <Button
                                                        type="text"
                                                        style={actionButtonStyle}
                                                        aria-label={`下移图层：${layer.name}`}
                                                        disabled={!canMoveDown}
                                                        icon={<ArrowDownOutlined />}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            moveLayer(layer, 'down');
                                                        }}
                                                    />
                                                </Tooltip>

                                                {layer.id !== 'layer-0' && (
                                                    <>
                                                        <Tooltip title="重命名">
                                                            <Button
                                                                type="text"
                                                                style={actionButtonStyle}
                                                                aria-label={`重命名图层：${layer.name}`}
                                                                icon={<EditOutlined />}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    startEdit(layer);
                                                                }}
                                                            />
                                                        </Tooltip>

                                                        <Button
                                                            type="text"
                                                            style={actionButtonStyle}
                                                            danger
                                                            aria-label={`删除图层：${layer.name}`}
                                                            icon={<DeleteOutlined />}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setPendingDeleteLayer(layer);
                                                            }}
                                                        />
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </Space>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Modal
                open={Boolean(pendingDeleteLayer)}
                title={pendingDeleteLayer ? `删除图层“${pendingDeleteLayer.name}”？` : '删除图层？'}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true, 'aria-label': '确认删除图层' }}
                cancelButtonProps={{ 'aria-label': '取消删除图层' }}
                wrapClassName="commercial-viewport-modal"
                width={420}
                zIndex={1100}
                centered
                focusable={{ focusTriggerAfterClose: true }}
                onCancel={() => setPendingDeleteLayer(null)}
                onOk={() => {
                    if (!pendingDeleteLayer) return;
                    onDelete(pendingDeleteLayer.id);
                    setPendingDeleteLayer(null);
                }}
            >
                <p style={{ margin: 0 }}>此操作无法撤销。</p>
            </Modal>
        </div>
    );
};
