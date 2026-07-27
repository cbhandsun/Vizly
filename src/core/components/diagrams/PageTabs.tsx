import React, { useState, useRef, useCallback } from 'react';
import { theme, Input, Tooltip, Popconfirm } from 'antd';
import type { InputRef } from 'antd';
import { PlusOutlined, CloseOutlined } from '@ant-design/icons';
import type { DiagramPage } from './hooks/useMultiPage';

interface PageTabsProps {
    pages: DiagramPage[];
    activePageId: string;
    onSwitchPage: (id: string) => void;
    onAddPage: () => void;
    onDeletePage: (id: string) => void;
    onRenamePage: (id: string, name: string) => void;
}

/**
 * 底部页面 Tab 栏 — 类似 Excel 的 sheet tabs
 */
export const PageTabs: React.FC<PageTabsProps> = React.memo(({
    pages, activePageId, onSwitchPage, onAddPage, onDeletePage, onRenamePage,
}) => {
    const { token } = theme.useToken();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const inputRef = useRef<InputRef>(null);

    const handleStartRename = useCallback((page: DiagramPage) => {
        setEditingId(page.id);
        setEditName(page.name);
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    const handleFinishRename = useCallback(() => {
        if (editingId && editName.trim()) {
            onRenamePage(editingId, editName.trim());
        }
        setEditingId(null);
    }, [editingId, editName, onRenamePage]);

    return (
        <>
            <style>{`.page-tabs-scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
            <div
                role="tablist"
                aria-label="页面"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.8))',
                    backdropFilter: 'var(--designer-blur, blur(20px) saturate(180%))',
                    WebkitBackdropFilter: 'var(--designer-blur, blur(20px) saturate(180%))',
                    borderRadius: '8px 8px 0 0',
                    padding: '4px 6px',
                    boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    borderLeft: `1px solid ${token.colorBorderSecondary}`,
                    borderRight: `1px solid ${token.colorBorderSecondary}`,
                    maxWidth: 'min(60vw, 600px)',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',       // Firefox
                    msOverflowStyle: 'none',       // IE/Edge
                    zIndex: 1010,
                }}
                className="page-tabs-scrollbar-hide"
            >
                {pages.map(page => {
                    const isActive = page.id === activePageId;
                    const isEditing = editingId === page.id;

                    return (
                        <div
                            key={page.id}
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            aria-selected={isActive}
                            aria-label={page.name}
                            onClick={() => !isEditing && onSwitchPage(page.id)}
                            onDoubleClick={() => handleStartRename(page)}
                            onKeyDown={(event) => {
                                if (isEditing || (event.key !== 'Enter' && event.key !== ' ')) return;
                                event.preventDefault();
                                onSwitchPage(page.id);
                            }}
                            style={{
                                position: 'relative',
                                padding: '4px 24px 4px 10px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: isActive ? 600 : 400,
                                color: isActive ? token.colorPrimary : token.colorTextSecondary,
                                background: isActive ? `${token.colorPrimary}12` : 'transparent',
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                                minWidth: 60,
                                userSelect: 'none',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => {
                                if (!isActive) e.currentTarget.style.background = `${token.colorPrimary}08`;
                            }}
                            onMouseLeave={e => {
                                if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            {isEditing ? (
                                <Input
                                    ref={inputRef}
                                    aria-label={`重命名页面 ${page.name}`}
                                    size="small"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onBlur={handleFinishRename}
                                    onPressEnter={handleFinishRename}
                                    style={{ width: 80, fontSize: 12, height: 20, padding: '0 4px' }}
                                />
                            ) : (
                                page.name
                            )}

                            {/* 关闭按钮（仅非唯一页时显示） */}
                            {pages.length > 1 && !isEditing && (
                                <Popconfirm
                                    title={`删除「${page.name}」？`}
                                    onConfirm={(e) => {
                                        e?.stopPropagation();
                                        onDeletePage(page.id);
                                    }}
                                    okText="删除"
                                    cancelText="取消"
                                >
                                    <button
                                        type="button"
                                        aria-label={`删除页面 ${page.name}`}
                                        onClick={event => event.stopPropagation()}
                                        style={{
                                            position: 'absolute',
                                            right: 4,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            width: 16,
                                            height: 16,
                                            border: 0,
                                            background: 'transparent',
                                            color: token.colorTextQuaternary,
                                            padding: 0,
                                            borderRadius: 2,
                                            transition: 'color 0.15s',
                                            cursor: 'pointer',
                                            display: 'grid',
                                            placeItems: 'center',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = token.colorError; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = token.colorTextQuaternary; }}
                                    >
                                        <CloseOutlined style={{ fontSize: 8 }} />
                                    </button>
                                </Popconfirm>
                            )}
                        </div>
                    );
                })}

                {/* 添加页面按钮 */}
                <Tooltip title="新建页面">
                    <button
                        type="button"
                        aria-label="新建页面"
                        onClick={onAddPage}
                        style={{
                            padding: '4px 6px',
                            border: 0,
                            borderRadius: 6,
                            cursor: 'pointer',
                            color: token.colorTextQuaternary,
                            background: 'transparent',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = token.colorPrimary;
                            e.currentTarget.style.background = `${token.colorPrimary}08`;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = token.colorTextQuaternary;
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <PlusOutlined style={{ fontSize: 12 }} />
                    </button>
                </Tooltip>
            </div>
        </>
    );
});
