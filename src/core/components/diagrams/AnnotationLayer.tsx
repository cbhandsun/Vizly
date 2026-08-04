import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { theme, Input, Button, Tooltip, Popconfirm } from 'antd';
import { CheckOutlined, DeleteOutlined, CloseOutlined } from '@ant-design/icons';
import type { CommentThread as Annotation } from '../../store/useDiagramStore';
import { useDiagramStore } from '../../store/useDiagramStore';
import { resolveAnnotationEditorPosition, type AnnotationEditorPoint } from './annotationEditorPosition';
import {
    getAnnotationContentErrorMessage,
    MAX_ANNOTATION_CONTENT_LENGTH,
    parseAnnotationContent,
    type AnnotationContentError,
} from './annotationContent';

const { TextArea } = Input;

const readViewportSize = () => ({
    width: typeof window === 'undefined' ? 320 : window.innerWidth,
    height: typeof window === 'undefined' ? 568 : window.innerHeight,
});

interface AnnotationLayerProps {
    annotations: Annotation[];
    annotationMode: boolean;
    onAdd: (x: number, y: number, text: string) => boolean | void;
    onUpdate: (id: string, updates: Partial<Pick<Annotation, 'content' | 'color' | 'x' | 'y'>>) => boolean | void;
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
    const globalActiveId = useDiagramStore(state => state.activeCommentId);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeEditorPoint, setActiveEditorPoint] = useState<AnnotationEditorPoint | null>(null);
    const [editText, setEditText] = useState('');
    const [editError, setEditError] = useState<AnnotationContentError | null>(null);
    const [pendingPos, setPendingPos] = useState<{
        canvasX: number;
        canvasY: number;
        clientX: number;
        clientY: number;
    } | null>(null);
    const [viewportSize, setViewportSize] = useState(readViewportSize);

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
        setViewportSize(readViewportSize());
        setPendingPos({ canvasX: x, canvasY: y, clientX: e.clientX, clientY: e.clientY });
        setEditText('');
        setEditError(null);
    }, [annotationMode]);

    // 提交新批注
    const handleSubmitNew = useCallback(() => {
        if (!pendingPos) return;
        const parsedContent = parseAnnotationContent(editText);
        if (!parsedContent.ok) {
            setEditError(parsedContent.error);
            return;
        }
        if (onAdd(pendingPos.canvasX, pendingPos.canvasY, parsedContent.value) === false) {
            setEditError('save_failed');
            return;
        }
        setPendingPos(null);
        setEditText('');
        setEditError(null);
    }, [pendingPos, editText, onAdd]);

    // 保存编辑
    const handleSaveEdit = useCallback(() => {
        if (!activeId) return;
        const parsedContent = parseAnnotationContent(editText);
        if (!parsedContent.ok) {
            setEditError(parsedContent.error);
            return;
        }
        if (onUpdate(activeId, { content: parsedContent.value }) === false) {
            setEditError('save_failed');
            return;
        }
        setEditError(null);
        setActiveId(null);
        setActiveEditorPoint(null);
    }, [activeId, editText, onUpdate]);

    const handleEditTextChange = useCallback((value: string) => {
        setEditText(value);
        const parsedContent = parseAnnotationContent(value);
        setEditError(parsedContent.ok ? null : parsedContent.error);
    }, []);

    const closeEditors = useCallback(() => {
        setActiveId(null);
        setActiveEditorPoint(null);
        setPendingPos(null);
        setEditError(null);
    }, []);

    // ESC 关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeEditors();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [closeEditors]);

    // 页面切换时重置编辑状态
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setActiveId(null);
            setActiveEditorPoint(null);
            setPendingPos(null);
            setEditText('');
            setEditError(null);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activePageId]);

    useEffect(() => {
        if (!pendingPos && !activeId) return;
        const handleResize = () => setViewportSize(readViewportSize());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeId, pendingPos]);

    const activeEditorPosition = activeEditorPoint && resolveAnnotationEditorPosition(
        activeEditorPoint,
        viewportSize,
        { maxWidth: 300, estimatedHeight: 280 },
    );

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
            isHighlighted={globalActiveId === ann.id}
            editText={editText}
            editError={editError}
            editorPosition={activeId === ann.id ? activeEditorPosition : null}
            onEditTextChange={handleEditTextChange}
            onOpen={(point) => {
                setViewportSize(readViewportSize());
                setActiveId(ann.id);
                setActiveEditorPoint(point);
                setEditText(ann.content);
                setPendingPos(null);
                setEditError(null);
            }}
            onSave={handleSaveEdit}
            onClose={closeEditors}
            onDelete={() => {
                onDelete(ann.id);
                closeEditors();
            }}
            onToggleResolved={() => onToggleResolved(ann.id)}
            onChangeColor={(color) => onUpdate(ann.id, { color })}
            colors={colors}
            token={token}
        />
    ));

    // 新建批注输入框
    const editorPosition = pendingPos && resolveAnnotationEditorPosition(
        { x: pendingPos.clientX, y: pendingPos.clientY },
        viewportSize,
    );
    const pendingEditor = pendingPos && editorPosition && createPortal(
        <div
            data-testid="pending-annotation-editor"
            style={{
                position: 'fixed',
                left: editorPosition.x,
                top: editorPosition.y,
                pointerEvents: 'auto',
                zIndex: 2200,
            }}
            onClick={e => e.stopPropagation()}
        >
            <AnnotationEditor
                text={editText}
                error={editError}
                onChange={handleEditTextChange}
                onSubmit={handleSubmitNew}
                onCancel={closeEditors}
                token={token}
                autoFocus
            />
        </div>,
        document.body,
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
    isHighlighted?: boolean;
    editText: string;
    editError: AnnotationContentError | null;
    editorPosition: AnnotationEditorPoint | null;
    onEditTextChange: (t: string) => void;
    onOpen: (point: AnnotationEditorPoint) => void;
    onSave: () => void;
    onClose: () => void;
    onDelete: () => void;
    onToggleResolved: () => void;
    onChangeColor: (color: string) => void;
    colors: string[];
    token: ReturnType<typeof theme.useToken>['token'];
}> = ({ annotation, isActive, isHighlighted, editText, editError, editorPosition, onEditTextChange, onOpen, onSave, onClose, onDelete, onToggleResolved, onChangeColor, colors, token }) => {
    const { x, y, color, content: text, isResolved: resolved } = annotation;
    const errorMessage = getAnnotationContentErrorMessage(editError);
    const contentIsValid = parseAnnotationContent(editText).ok;

    const editor = isActive && editorPosition && createPortal(
        <div
            data-testid="active-annotation-editor"
            style={{
                position: 'fixed',
                left: editorPosition.x,
                top: editorPosition.y,
                pointerEvents: 'auto',
                zIndex: 2200,
            }}
            onClick={event => event.stopPropagation()}
        >
            <div style={{
                background: token.colorBgElevated,
                borderRadius: 8,
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                border: `2px solid ${color}`,
                width: 'min(300px, calc(100vw - 24px))',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}>
                <div style={{
                    background: color,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {colors.map(c => (
                            <button
                                type="button"
                                key={c}
                                aria-label={`选择批注颜色 ${c}`}
                                aria-pressed={c === color}
                                onClick={() => onChangeColor(c)}
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    background: c,
                                    border: c === color ? '2px solid white' : '1px solid rgba(255,255,255,0.5)',
                                    cursor: 'pointer',
                                    padding: 0,
                                }}
                            />
                        ))}
                    </div>
                    <Button
                        type="text"
                        aria-label="关闭批注编辑器"
                        icon={<CloseOutlined style={{ fontSize: 10, color: '#fff' }} />}
                        onClick={onClose}
                        style={{ width: 44, height: 44, minWidth: 44 }}
                    />
                </div>

                <div style={{ padding: 8 }}>
                    <TextArea
                        value={editText}
                        onChange={e => onEditTextChange(e.target.value)}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        placeholder="输入批注内容..."
                        aria-label="批注内容"
                        aria-invalid={Boolean(errorMessage)}
                        aria-describedby={errorMessage ? 'annotation-edit-content-error' : undefined}
                        maxLength={MAX_ANNOTATION_CONTENT_LENGTH}
                        showCount
                        status={errorMessage ? 'error' : undefined}
                        style={{ fontSize: 12, marginBottom: errorMessage ? 2 : 6 }}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave();
                        }}
                    />
                    {errorMessage ? (
                        <div id="annotation-edit-content-error" role="alert" style={{ color: token.colorError, fontSize: 12, marginBottom: 6 }}>
                            {errorMessage}
                        </div>
                    ) : null}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <Tooltip title={resolved ? '标记未解决' : '标记已解决'}>
                                <Button
                                    aria-label={resolved ? '标记批注为未解决' : '标记批注为已解决'}
                                    type={resolved ? 'primary' : 'default'}
                                    icon={<CheckOutlined style={{ fontSize: 11 }} />}
                                    onClick={onToggleResolved}
                                    style={{ width: 44, height: 44, minWidth: 44 }}
                                />
                            </Tooltip>
                            <Popconfirm
                                title="删除此批注？"
                                description="删除后无法恢复。"
                                onConfirm={onDelete}
                                okText="删除"
                                cancelText="取消"
                            >
                                <Button
                                    aria-label="删除批注"
                                    danger
                                    icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                                    style={{ width: 44, height: 44, minWidth: 44 }}
                                />
                            </Popconfirm>
                        </div>
                        <Button type="primary" onClick={onSave} disabled={!contentIsValid} style={{ minWidth: 64, minHeight: 44 }}>
                            保存
                        </Button>
                    </div>
                </div>

                <div style={{ fontSize: 10, color: token.colorTextQuaternary, padding: '0 8px 4px', textAlign: 'right' }}>
                    Ctrl+Enter 保存 · Esc 关闭
                </div>
            </div>
        </div>,
        document.body,
    );

    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: 'translate(-12px, -12px)',
                pointerEvents: 'auto',
                zIndex: (isActive || isHighlighted) ? 10 : 6,
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* 图钉图标 */}
            {!isActive && (
                <Tooltip title={text || '空批注'} placement="top">
                    <button
                        type="button"
                        aria-label={`查看批注：${text || '空批注'}`}
                        onClick={event => onOpen({ x: event.clientX, y: event.clientY })}
                        style={{
                            width: 44,
                            height: 44,
                            border: 0,
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                        }}
                    >
                        <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50% 50% 50% 0',
                            background: resolved ? `${color}60` : color,
                            border: `2px solid ${isHighlighted ? '#f59e0b' : (resolved ? '#9ca3af' : 'white')}`,
                            boxShadow: isHighlighted ? '0 0 15px #f59e0b' : '0 2px 8px rgba(0,0,0,0.2)',
                            transform: 'rotate(-45deg)',
                            animation: isHighlighted ? 'pulse-highlight 1.5s infinite alternate' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {resolved ? (
                                <CheckOutlined style={{ transform: 'rotate(45deg)', fontSize: 10, color: '#fff' }} />
                            ) : (
                                <span style={{ transform: 'rotate(45deg)', fontSize: 9, color: '#fff', fontWeight: 800 }}>
                                    {(annotation.authorName || '?').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </span>
                    </button>
                </Tooltip>
            )}

            {editor}
        </div>
    );
};

/** 新建批注编辑器 */
const AnnotationEditor: React.FC<{
    text: string;
    error: AnnotationContentError | null;
    onChange: (t: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    token: ReturnType<typeof theme.useToken>['token'];
    autoFocus?: boolean;
}> = ({ text, error, onChange, onSubmit, onCancel, token, autoFocus }) => {
    const errorMessage = getAnnotationContentErrorMessage(error);
    const contentIsValid = parseAnnotationContent(text).ok;
    return (
    <div style={{
        background: token.colorBgElevated,
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: `2px solid #facc15`,
        width: 'min(280px, calc(100vw - 24px))',
        padding: 8,
        animation: 'toolbarFadeIn 0.15s ease-out',
    }}>
        <TextArea
            value={text}
            onChange={e => onChange(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="输入批注内容..."
            aria-label="新批注内容"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={errorMessage ? 'annotation-new-content-error' : undefined}
            maxLength={MAX_ANNOTATION_CONTENT_LENGTH}
            showCount
            status={errorMessage ? 'error' : undefined}
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
        {errorMessage ? (
            <div id="annotation-new-content-error" role="alert" style={{ color: token.colorError, fontSize: 12, marginBottom: 6 }}>
                {errorMessage}
            </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <Button onClick={onCancel} style={{ minWidth: 64, minHeight: 44 }}>取消</Button>
            <Button type="primary" onClick={onSubmit} disabled={!contentIsValid} style={{ minWidth: 64, minHeight: 44 }}>添加</Button>
        </div>
    </div>
    );
};
