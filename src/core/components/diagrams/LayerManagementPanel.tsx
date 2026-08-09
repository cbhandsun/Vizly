import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Space, Input, Tooltip, Popover, Modal } from 'antd';
import type { InputRef } from 'antd';
import { useTranslation } from 'react-i18next';
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
import './LayerManagementPanel.css';

/** 预定义图层颜色 */
const LAYER_COLORS = [
    { value: '#ef4444', labelKey: 'red' },
    { value: '#f97316', labelKey: 'orange' },
    { value: '#eab308', labelKey: 'yellow' },
    { value: '#22c55e', labelKey: 'green' },
    { value: '#3b82f6', labelKey: 'blue' },
    { value: '#8b5cf6', labelKey: 'purple' },
    { value: '#ec4899', labelKey: 'pink' },
    { value: '#06b6d4', labelKey: 'cyan' },
    { value: '#6366f1', labelKey: 'indigo' },
    { value: '#14b8a6', labelKey: 'teal' },
    { value: '#f59e0b', labelKey: 'amber' },
    { value: '#10b981', labelKey: 'emerald' },
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
    const { t } = useTranslation();
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: touchTargetSize * 4 + 18 }} aria-label={t('designer.layersPanel.colorGroup')} role="radiogroup">
        {LAYER_COLORS.map(({ value, labelKey }) => {
            const label = t(`designer.layersPanel.colors.${labelKey}`);
            return (
            <button
                type="button"
                key={value}
                ref={(element) => {
                    if (element) buttonRefs.current.set(value, element);
                    else buttonRefs.current.delete(value);
                }}
                role="radio"
                tabIndex={value === current ? 0 : -1}
                aria-label={t('designer.layersPanel.colorOption', { color: label })}
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
            );
        })}
        <button
            ref={(element) => {
                if (element) buttonRefs.current.set('none', element);
                else buttonRefs.current.delete('none');
            }}
            type="button"
            role="radio"
            tabIndex={current ? -1 : 0}
            aria-label={t('designer.layersPanel.colorOption', { color: t('designer.layersPanel.colors.none') })}
            aria-checked={!current}
            title={t('designer.layersPanel.colors.none')}
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
    const { t } = useTranslation();
    const [isCreating, setIsCreating] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createError, setCreateError] = useState<string | null>(null);
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [pendingDeleteLayer, setPendingDeleteLayer] = useState<LayerConfig | null>(null);
    const createTriggerRef = useRef<HTMLButtonElement>(null);
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
        requestAnimationFrame(() => createTriggerRef.current?.focus());
    };

    const handleCreate = () => {
        const name = normalizeLayerNameInput(createName);
        if (!name) {
            setCreateError(t('designer.layersPanel.errors.nameRequired'));
            createInputRef.current?.focus();
            return;
        }
        if (!isLayerNameAvailable(layers, name)) {
            setCreateError(t('designer.layersPanel.errors.nameDuplicate'));
            createInputRef.current?.focus();
            return;
        }
        if (onCreate(name) === false) {
            setCreateError(t('designer.layersPanel.errors.createFailed'));
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
            setEditError(t('designer.layersPanel.errors.nameRequired'));
            requestAnimationFrame(() => editInputRef.current?.focus());
            return;
        }
        if (!isLayerNameAvailable(layers, name, layerId)) {
            setEditError(t('designer.layersPanel.errors.nameDuplicate'));
            requestAnimationFrame(() => editInputRef.current?.focus());
            return;
        }
        if (onRename(layerId, name) === false) {
            setEditError(t('designer.layersPanel.errors.renameFailed'));
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
        <div className="layer-management-panel" style={{ padding: 16, background: '#fafafa', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="layer-management-panel__header">
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('designer.layersPanel.title')}</h3>
                {isCreating ? (
                    <div className="layer-management-panel__create">
                        <div className="layer-management-panel__create-controls">
                            <Input
                                ref={createInputRef}
                                className="layer-management-panel__create-input"
                                value={createName}
                                autoFocus
                                maxLength={80}
                                aria-label={t('designer.layersPanel.newLayerName')}
                                aria-invalid={Boolean(createError)}
                                aria-describedby={createError ? CREATE_ERROR_ID : undefined}
                                placeholder={t('designer.layersPanel.namePlaceholder')}
                                status={createError ? 'error' : undefined}
                                style={{ minHeight: touchTargetSize }}
                                data-preserve-drawer-on-escape="true"
                                onChange={(event) => {
                                    setCreateName(event.target.value);
                                    if (createError) setCreateError(null);
                                }}
                                onPressEnter={handleCreate}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Escape') return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    cancelCreate();
                                }}
                            />
                            <Button
                                type="primary"
                                aria-label={t('designer.layersPanel.createLayer')}
                                style={{ minHeight: touchTargetSize }}
                                onClick={handleCreate}
                            >
                                {t('designer.layersPanel.create')}
                            </Button>
                            <Button
                                aria-label={t('designer.layersPanel.cancelCreate')}
                                style={{ minHeight: touchTargetSize }}
                                onClick={cancelCreate}
                            >
                                {t('common.cancel')}
                            </Button>
                        </div>
                        {createError ? (
                            <div id={CREATE_ERROR_ID} role="alert" style={{ color: '#cf1322', fontSize: 12 }}>
                                {createError}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <Button
                        ref={createTriggerRef}
                        type="primary"
                        icon={<PlusOutlined />}
                        aria-label={t('designer.layersPanel.newLayer')}
                        style={{ minHeight: touchTargetSize }}
                        onClick={() => setIsCreating(true)}
                    >
                        {t('designer.layersPanel.new')}
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
                    {t('designer.layersPanel.keyboardHelp')}
                </span>
                <div role="list" aria-label={t('designer.layersPanel.layerList')}>
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
                                                aria-label={t('designer.layersPanel.renameLayer', { name: layer.name })}
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

                                    <Space className="layer-management-panel__actions" size={4} wrap>
                                        <Tooltip title={t(layer.visible ? 'designer.layersPanel.hide' : 'designer.layersPanel.show')}>
                                            <Button
                                                type="text"
                                                tabIndex={isActive ? 0 : -1}
                                                style={actionButtonStyle}
                                                aria-label={t(layer.visible ? 'designer.layersPanel.hideLayer' : 'designer.layersPanel.showLayer', { name: layer.name })}
                                                icon={layer.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleVisibility(layer.id);
                                                }}
                                            />
                                        </Tooltip>

                                        <Tooltip title={t(layer.locked ? 'designer.layersPanel.unlock' : 'designer.layersPanel.lock')}>
                                            <Button
                                                type="text"
                                                tabIndex={isActive ? 0 : -1}
                                                style={actionButtonStyle}
                                                aria-label={t(layer.locked ? 'designer.layersPanel.unlockLayer' : 'designer.layersPanel.lockLayer', { name: layer.name })}
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
                                                <Tooltip title={t('designer.layersPanel.colorMarker')}>
                                                    <Button
                                                        type="text"
                                                        tabIndex={isActive ? 0 : -1}
                                                        style={actionButtonStyle}
                                                        aria-label={t('designer.layersPanel.setLayerColor', { name: layer.name })}
                                                        icon={<BgColorsOutlined style={{ color: layer.color || undefined }} />}
                                                        onClick={(event) => event.stopPropagation()}
                                                    />
                                                </Tooltip>
                                            </Popover>
                                        )}

                                        {isActive && (
                                            <>
                                                <Tooltip title={t('designer.layersPanel.moveUp')}>
                                                    <Button
                                                        type="text"
                                                        style={actionButtonStyle}
                                                        aria-label={t('designer.layersPanel.moveLayerUp', { name: layer.name })}
                                                        disabled={!canMoveUp}
                                                        icon={<ArrowUpOutlined />}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            moveLayer(layer, 'up');
                                                        }}
                                                    />
                                                </Tooltip>

                                                <Tooltip title={t('designer.layersPanel.moveDown')}>
                                                    <Button
                                                        type="text"
                                                        style={actionButtonStyle}
                                                        aria-label={t('designer.layersPanel.moveLayerDown', { name: layer.name })}
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
                                                        <Tooltip title={t('designer.layersPanel.rename')}>
                                                            <Button
                                                                type="text"
                                                                style={actionButtonStyle}
                                                                aria-label={t('designer.layersPanel.renameLayer', { name: layer.name })}
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
                                                            aria-label={t('designer.layersPanel.deleteLayer', { name: layer.name })}
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
                title={pendingDeleteLayer
                    ? t('designer.layersPanel.deleteTitle', { name: pendingDeleteLayer.name })
                    : t('designer.layersPanel.deleteFallbackTitle')}
                okText={t('common.delete')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true, 'aria-label': t('designer.layersPanel.confirmDelete') }}
                cancelButtonProps={{ 'aria-label': t('designer.layersPanel.cancelDelete') }}
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
                <p style={{ margin: 0 }}>{t('designer.layersPanel.deleteWarning')}</p>
            </Modal>
        </div>
    );
};
