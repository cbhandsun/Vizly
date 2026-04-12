import React, { useState, useRef, useEffect, useCallback } from 'react';
import { theme, Input, Button, Tooltip, Popconfirm } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, CloseOutlined } from '@ant-design/icons';
import type { Annotation } from './hooks/useAnnotations';

const { TextArea } = Input;

interface AnnotationLayerProps {
    annotations: Annotation[];
    annotationMode: boolean;
    onAdd: (x: number, y: number, text: string) => void;
    onUpdate: (id: string, updates: Partial<Pick<Annotation, 'text' | 'color' | 'x' | 'y'>>) => void;
    onDelete: (id: string) => void;
    onToggleResolved: (id: string) => void;
    colors: string[];
    /** 当前页面 ID — 页面切换时重置编辑状态 */
    activePageId?: string;
}

/**
 * 画布批注渲染层 — 渲染在 ReactFlow children 中，跟随画布坐标系
 */
export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
    annotations, annotationMode, onAdd, onUpdate, onDelete, onToggleResolved, colors, activePageId,
}) => {
    const { token } = theme.useToken();
    const [activeId, setActiveId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
    const textAreaRef = useRef<any>(null);

    // 批注模式下点击画布空白处创建新批注
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        if (!annotationMode) return;
        // 只响应直接点击在 layer 上，不响应冒泡
        if (e.target !== e.currentTarget) return;

        // 获取画布坐标 — AnnotationLayer 渲染在 ReactFlow 的 children 中，
        // 坐标系 = (clientPos - container.offset) / zoom - pan
        // 但由于我们在 ReactFlow children 中，div 已经处于变换后的坐标系，
        // 所以直接使用 offsetX/offsetY 即可获取画布坐标
        const rect = e.currentTarget.getBoundingClientRect();
        // nativeEvent.offsetX/Y 不可靠，用 client 坐标手动计算
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setPendingPos({ x, y });
        setEditText('');
    }, [annotationMode]);

    // 提交新批注
    const handleSubmitNew = useCallback(() => {
        if (!pendingPos || !editText.trim()) {
            setPendingPos(null);
            return;
        }
        onAdd(pendingPos.x, pendingPos.y, editText.trim());
        setPendingPos(null);
        setEditText('');
    }, [pendingPos, editText, onAdd]);

    // 打开编辑
    const handleOpenEdit = useCallback((ann: Annotation) => {
        setActiveId(ann.id);
        setEditText(ann.text);
        setPendingPos(null);
    }, []);

    // 保存编辑
    const handleSaveEdit = useCallback(() => {
        if (activeId) {
            onUpdate(activeId, { text: editText });
            setActiveId(null);
        }
    }, [activeId, editText, onUpdate]);

    // ESC 关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setActiveId(null);
                setPendingPos(null);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // 页面切换时重置编辑状态
    useEffect(() => {
        setActiveId(null);
        setPendingPos(null);
        setEditText('');
    }, [activePageId]);

    // 自动聚焦
    useEffect(() => {
        if (pendingPos && textAreaRef.current) {
            setTimeout(() => textAreaRef.current?.focus(), 50);
        }
    }, [pendingPos]);

    // 没有批注、不在批注模式且无待处理状态时，完全不渲染
    if (!annotationMode && annotations.length === 0 && !pendingPos && !activeId) {
        return null;
    }

    // 批注 pins（在任何模式下都渲染）
    const pins = annotations.map(ann => (
        <AnnotationPin
            key={ann.id}
            annotation={ann}
            isActive={activeId === ann.id}
            editText={editText}
            onEditTextChange={setEditText}
            onOpen={() => handleOpenEdit(ann)}
            onSave={handleSaveEdit}
            onClose={() => setActiveId(null)}
            onDelete={() => onDelete(ann.id)}
            onToggleResolved={() => onToggleResolved(ann.id)}
            onChangeColor={(color) => onUpdate(ann.id, { color })}
            colors={colors}
            token={token}
        />
    ));

    // 新建批注输入框
    const pendingEditor = pendingPos && (
        <div
            style={{
                position: 'absolute',
                left: pendingPos.x,
                top: pendingPos.y,
                transform: 'translate(-8px, -8px)',
                pointerEvents: 'auto',
                zIndex: 10,
            }}
            onClick={e => e.stopPropagation()}
        >
            <AnnotationEditor
                text={editText}
                onChange={setEditText}
                onSubmit={handleSubmitNew}
                onCancel={() => setPendingPos(null)}
                token={token}
                autoFocus
            />
        </div>
    );

    // 批注模式：渲染全画布覆盖层（捕获点击以创建新批注）
    if (annotationMode) {
        return (
            <div
                onClick={handleCanvasClick}
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'auto',
                    cursor: 'crosshair',
                    zIndex: 5,
                }}
            >
                {pins}
                {pendingEditor}
            </div>
        );
    }

    // 非批注模式：仅渲染 pins，不渲染覆盖层（避免干扰 ReactFlow 事件）
    return (
        <>
            {pins}
            {pendingEditor}
        </>
    );
};

/** 批注图钉 */
const AnnotationPin: React.FC<{
    annotation: Annotation;
    isActive: boolean;
    editText: string;
    onEditTextChange: (t: string) => void;
    onOpen: () => void;
    onSave: () => void;
    onClose: () => void;
    onDelete: () => void;
    onToggleResolved: () => void;
    onChangeColor: (color: string) => void;
    colors: string[];
    token: ReturnType<typeof theme.useToken>['token'];
}> = ({ annotation, isActive, editText, onEditTextChange, onOpen, onSave, onClose, onDelete, onToggleResolved, onChangeColor, colors, token }) => {
    const { x, y, color, text, resolved } = annotation;

    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: 'translate(-12px, -12px)',
                pointerEvents: 'auto',
                zIndex: isActive ? 10 : 6,
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* 图钉图标 */}
            {!isActive && (
                <Tooltip title={text || '空批注'} placement="top">
                    <div
                        onClick={onOpen}
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50% 50% 50% 0',
                            background: resolved ? `${color}60` : color,
                            border: `2px solid ${resolved ? '#9ca3af' : 'white'}`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            cursor: 'pointer',
                            transform: 'rotate(-45deg)',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'rotate(-45deg) scale(1.2)';
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'rotate(-45deg)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                        }}
                    >
                        {resolved && (
                            <CheckOutlined style={{ transform: 'rotate(45deg)', fontSize: 10, color: '#fff' }} />
                        )}
                    </div>
                </Tooltip>
            )}

            {/* 展开的编辑卡片 */}
            {isActive && (
                <div style={{
                    background: token.colorBgElevated,
                    borderRadius: 8,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    border: `2px solid ${color}`,
                    width: 240,
                    overflow: 'hidden',
                }}>
                    {/* 顶部色条 + 操作按钮 */}
                    <div style={{
                        background: color,
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        {/* 颜色选择 */}
                        <div style={{ display: 'flex', gap: 3 }}>
                            {colors.map(c => (
                                <div
                                    key={c}
                                    onClick={() => onChangeColor(c)}
                                    style={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: '50%',
                                        background: c,
                                        border: c === color ? '2px solid white' : '1px solid rgba(255,255,255,0.5)',
                                        cursor: 'pointer',
                                    }}
                                />
                            ))}
                        </div>
                        <Button
                            type="text"
                            size="small"
                            icon={<CloseOutlined style={{ fontSize: 10, color: '#fff' }} />}
                            onClick={onClose}
                            style={{ width: 20, height: 20, minWidth: 20 }}
                        />
                    </div>

                    {/* 编辑区 */}
                    <div style={{ padding: 8 }}>
                        <TextArea
                            value={editText}
                            onChange={e => onEditTextChange(e.target.value)}
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            placeholder="输入批注内容..."
                            style={{ fontSize: 12, marginBottom: 6 }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    onSave();
                                }
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <Tooltip title={resolved ? '标记未解决' : '标记已解决'}>
                                    <Button
                                        size="small"
                                        type={resolved ? 'primary' : 'default'}
                                        icon={<CheckOutlined style={{ fontSize: 11 }} />}
                                        onClick={onToggleResolved}
                                        style={{ width: 24, height: 24, minWidth: 24 }}
                                    />
                                </Tooltip>
                                <Popconfirm title="删除此批注？" onConfirm={onDelete} okText="删除" cancelText="取消">
                                    <Button
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                        style={{ width: 24, height: 24, minWidth: 24 }}
                                    />
                                </Popconfirm>
                            </div>
                            <Button size="small" type="primary" onClick={onSave}>
                                保存
                            </Button>
                        </div>
                    </div>

                    <div style={{ fontSize: 10, color: token.colorTextQuaternary, padding: '0 8px 4px', textAlign: 'right' }}>
                        Ctrl+Enter 保存 · Esc 关闭
                    </div>
                </div>
            )}
        </div>
    );
};

/** 新建批注编辑器 */
const AnnotationEditor: React.FC<{
    text: string;
    onChange: (t: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    token: ReturnType<typeof theme.useToken>['token'];
    autoFocus?: boolean;
}> = ({ text, onChange, onSubmit, onCancel, token, autoFocus }) => (
    <div style={{
        background: token.colorBgElevated,
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: `2px solid #facc15`,
        width: 220,
        padding: 8,
        animation: 'toolbarFadeIn 0.15s ease-out',
    }}>
        <TextArea
            value={text}
            onChange={e => onChange(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="输入批注内容..."
            autoFocus={autoFocus}
            style={{ fontSize: 12, marginBottom: 6 }}
            onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    onSubmit();
                }
                if (e.key === 'Escape') {
                    onCancel();
                }
            }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <Button size="small" onClick={onCancel}>取消</Button>
            <Button size="small" type="primary" onClick={onSubmit} disabled={!text.trim()}>添加</Button>
        </div>
    </div>
);
