import React, { useState } from 'react';
import { List, Button, Space, Input, Tooltip, Popconfirm, Popover } from 'antd';
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

/** 预定义图层颜色 */
const LAYER_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
    '#6366f1', '#14b8a6', '#f59e0b', '#10b981',
];

interface LayerManagementPanelProps {
    layers: LayerConfig[];
    activeLayerId: string | null;
    onSetActive: (layerId: string) => void;
    onToggleVisibility: (layerId: string) => void;
    onToggleLock: (layerId: string) => void;
    onRename: (layerId: string, newName: string) => void;
    onCreate: (name: string) => void;
    onDelete: (layerId: string) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onSetColor?: (layerId: string, color: string | undefined) => void;
}

/** 颜色选择弹出面板 */
const ColorPicker: React.FC<{
    current?: string;
    onSelect: (color: string | undefined) => void;
}> = ({ current, onSelect }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: 156 }}>
        {LAYER_COLORS.map(c => (
            <div
                key={c}
                onClick={() => onSelect(c)}
                style={{
                    width: 24, height: 24,
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
            <div
                onClick={() => onSelect(undefined)}
                style={{
                    width: 24, height: 24,
                    borderRadius: 6,
                    background: '#f1f5f9',
                    cursor: 'pointer',
                    border: '1px dashed #94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#64748b',
                }}
                title="清除颜色"
            >
                ×
            </div>
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
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleCreate = () => {
        const name = prompt('图层名称:');
        if (name) onCreate(name.trim());
    };

    const startEdit = (layer: LayerConfig) => {
        setEditingLayerId(layer.id);
        setEditName(layer.name);
    };

    const finishEdit = (layerId: string) => {
        if (editName.trim()) {
            onRename(layerId, editName.trim());
        }
        setEditingLayerId(null);
    };

    return (
        <div style={{ padding: 16, background: '#fafafa', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>图层</h3>
                <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleCreate}>
                    新建
                </Button>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
                <List
                    dataSource={[...layers].reverse()} // 顶部=最高zIndex
                    renderItem={(layer) => (
                        <List.Item
                            key={layer.id}
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
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onBlur={() => finishEdit(layer.id)}
                                            onPressEnter={() => finishEdit(layer.id)}
                                            autoFocus
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

                                {/* 操作按钮组 */}
                                <Space size={4}>
                                    <Tooltip title={layer.visible ? '隐藏' : '显示'}>
                                        <Button
                                            type="text"
                                            size="small"
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
                                            size="small"
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
                                                />
                                            }
                                            trigger="click"
                                            placement="bottom"
                                        >
                                            <Tooltip title="颜色标记">
                                                <Button
                                                    type="text"
                                                    size="small"
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
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startEdit(layer);
                                                    }}
                                                />
                                            </Tooltip>

                                            <Popconfirm
                                                title="确定删除此图层？"
                                                onConfirm={(e) => {
                                                    e?.stopPropagation();
                                                    onDelete(layer.id);
                                                }}
                                                okText="删除"
                                                cancelText="取消"
                                            >
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </Popconfirm>
                                        </>
                                    )}
                                </Space>
                            </div>
                        </List.Item>
                    )}
                />
            </div>
        </div>
    );
};
