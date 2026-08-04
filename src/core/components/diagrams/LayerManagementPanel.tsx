import React, { useMemo, useRef, useState } from 'react';
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
    BgColorsOutlined
} from '@ant-design/icons';
import type { LayerConfig } from './hooks/useLayerManagement';
import { isLayerNameAvailable, normalizeLayerNameInput } from '../../utils/layerName';
import { resolveLayerTouchTargetSize } from './layerInteractionMetrics';
import { getUiScale } from '../shared/viewportStore';

/** 预定义图层颜色 */
const LAYER_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
    '#6366f1', '#14b8a6', '#f59e0b', '#10b981',
];

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
}> = ({ current, onSelect, touchTargetSize }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: touchTargetSize * 4 + 18 }} aria-label="图层颜色" role="group">
        {LAYER_COLORS.map(c => (
            <button
                type="button"
                key={c}
                aria-label={`选择图层颜色 ${c}`}
                aria-pressed={c === current}
                onClick={() => onSelect(c)}
                style={{
                    width: touchTargetSize, height: touchTargetSize,
                    padding: 0,
                    borderRadius: 6,
                    background: c,
                    cursor: 'pointer',
                    border: c === current ? '2px solid #000' : '2px solid transparent',
                    transition: 'transform 0.1s, border-color 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            />
        ))}
        {/* 清除颜色 */}
        {current && (
            <button
                type="button"
                aria-label="清除图层颜色"
                onClick={() => onSelect(undefined)}
                style={{
                    width: touchTargetSize, height: touchTargetSize,
                    padding: 0,
                    borderRadius: 6,
                    background: '#f1f5f9',
                    cursor: 'pointer',
                    border: '1px dashed #94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#64748b',
                }}
            >
                ×
            </button>
        )}
    </div>
);

export const LayerManagementPanel: React.FC<LayerManagementPanelProps> = ({
    layers,
    activeLayerId,
    onSetActive,
    onToggleVisibility,
    onToggleLock,
    onRename,
    onCreate,
    onDelete,
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
                <div role="list" aria-label="图层列表">
                    {[...layers].reverse().map(layer => (
                        <div
                            key={layer.id}
                            role="listitem"
                            tabIndex={0}
                            aria-current={layer.id === activeLayerId ? 'true' : undefined}
                            style={{
                                background: layer.id === activeLayerId ? '#e6f7ff' : '#fff',
                                padding: '10px 12px',
                                marginBottom: 4,
                                borderRadius: 4,
                                border: layer.id === activeLayerId ? '1px solid #1890ff' : '1px solid #d9d9d9',
                                cursor: 'pointer',
                                borderLeft: layer.color ? `4px solid ${layer.color}` : undefined,
                            }}
                            onClick={() => onSetActive(layer.id)}
                            onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onSetActive(layer.id);
                                }
                            }}
                        >
                            {/* 垂直布局：名称在上，操作按钮在下 */}
                            <div style={{ width: '100%' }}>
                                {/* 图层名称 + 颜色圆点 */}
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
                                            onChange={(e) => {
                                                setEditName(e.target.value);
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
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span style={{
                                            fontWeight: layer.id === activeLayerId ? 600 : 400,
                                            color: layer.visible ? '#000' : '#999',
                                            fontSize: 13
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

                                {/* 操作按钮组 */}
                                <Space size={4}>
                                    <Tooltip title={layer.visible ? '隐藏' : '显示'}>
                                        <Button
                                            type="text"
                                            style={actionButtonStyle}
                                            aria-label={`${layer.visible ? '隐藏' : '显示'}图层：${layer.name}`}
                                            icon={layer.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleVisibility(layer.id);
                                            }}
                                        />
                                    </Tooltip>

                                    <Tooltip title={layer.locked ? '解锁' : '锁定'}>
                                        <Button
                                            type="text"
                                            style={actionButtonStyle}
                                            aria-label={`${layer.locked ? '解锁' : '锁定'}图层：${layer.name}`}
                                            icon={layer.locked ? <LockOutlined /> : <UnlockOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleLock(layer.id);
                                            }}
                                        />
                                    </Tooltip>

                                    {/* 颜色标记 */}
                                    {onSetColor && (
                                        <Popover
                                            content={
                                                <ColorPicker
                                                    current={layer.color}
                                                    onSelect={(c) => onSetColor(layer.id, c)}
                                                    touchTargetSize={touchTargetSize}
                                                />
                                            }
                                            trigger="click"
                                            placement="bottom"
                                        >
                                            <Tooltip title="颜色标记">
                                                <Button
                                                    type="text"
                                                    style={actionButtonStyle}
                                                    aria-label={`设置图层颜色：${layer.name}`}
                                                    icon={<BgColorsOutlined style={{ color: layer.color || undefined }} />}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </Tooltip>
                                        </Popover>
                                    )}

                                    {layer.id !== 'layer-0' && (
                                        <>
                                            <Tooltip title="重命名">
                                                <Button
                                                    type="text"
                                                    style={actionButtonStyle}
                                                    aria-label={`重命名图层：${layer.name}`}
                                                    icon={<EditOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
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
                                </Space>
                            </div>
                        </div>
                    ))}
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
