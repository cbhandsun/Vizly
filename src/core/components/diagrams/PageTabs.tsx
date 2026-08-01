import React, { useCallback, useRef, useState } from 'react';
import { CloseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Input, Popconfirm, theme, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { useTranslation } from 'react-i18next';

import type { DiagramPage } from './hooks/useMultiPage';
import './PageTabs.css';

interface PageTabsProps {
    pages: DiagramPage[];
    activePageId: string;
    onSwitchPage: (id: string) => void;
    onAddPage: () => void;
    onDeletePage: (id: string) => void;
    onRenamePage: (id: string, name: string) => void;
}

/** 底部页面 Tab 栏 — 类似 Excel 的 sheet tabs。 */
export const PageTabs: React.FC<PageTabsProps> = React.memo(({
    pages, activePageId, onSwitchPage, onAddPage, onDeletePage, onRenamePage,
}) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [confirmingPageId, setConfirmingPageId] = useState<string | null>(null);
    const inputRef = useRef<InputRef>(null);

    const handleStartRename = useCallback((page: DiagramPage) => {
        setConfirmingPageId(null);
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
        <div
            role="tablist"
            aria-label={t('designer.pages.tabList', { defaultValue: '页面' })}
            className="page-tabs"
            style={{
                borderColor: token.colorBorderSecondary,
                '--page-tab-active-color': token.colorPrimary,
                '--page-tab-text-color': token.colorTextSecondary,
                '--page-tab-muted-color': token.colorTextQuaternary,
                '--page-tab-error-color': token.colorError,
                '--page-tab-active-bg': `${token.colorPrimary}12`,
                '--page-tab-hover-bg': `${token.colorPrimary}08`,
            } as React.CSSProperties}
        >
            {pages.map(page => {
                const isActive = page.id === activePageId;
                const isEditing = editingId === page.id;

                return (
                    <div key={page.id} className="page-tabs__item">
                        {isEditing ? (
                            <Input
                                ref={inputRef}
                                aria-label={t('designer.pages.rename', { name: page.name, defaultValue: '重命名页面 {{name}}' })}
                                size="small"
                                value={editName}
                                onChange={event => setEditName(event.target.value)}
                                onBlur={handleFinishRename}
                                onPressEnter={handleFinishRename}
                                className="page-tabs__rename"
                            />
                        ) : (
                            <button
                                type="button"
                                role="tab"
                                tabIndex={isActive ? 0 : -1}
                                aria-selected={isActive}
                                aria-label={page.name}
                                className={`page-tabs__tab${isActive ? ' page-tabs__tab--active' : ''}`}
                                onClick={() => onSwitchPage(page.id)}
                                onDoubleClick={() => handleStartRename(page)}
                                onKeyDown={event => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                    event.preventDefault();
                                    onSwitchPage(page.id);
                                }}
                            >
                                {page.name}
                            </button>
                        )}

                        {isActive && !isEditing && (
                            <Tooltip title={t('designer.pages.renameAction', { name: page.name, defaultValue: '重命名页面 {{name}}' })}>
                                <button
                                    type="button"
                                    aria-label={t('designer.pages.renameAction', { name: page.name, defaultValue: '重命名页面 {{name}}' })}
                                    className="page-tabs__rename-action"
                                    onClick={() => handleStartRename(page)}
                                >
                                    <EditOutlined aria-hidden style={{ fontSize: 12 }} />
                                </button>
                            </Tooltip>
                        )}

                        {pages.length > 1 && !isEditing && (
                            <Popconfirm
                                title={t('designer.pages.deleteConfirm', { name: page.name, defaultValue: '删除「{{name}}」？' })}
                                open={confirmingPageId === page.id}
                                onOpenChange={open => setConfirmingPageId(open ? page.id : null)}
                                onConfirm={() => {
                                    setConfirmingPageId(null);
                                    onDeletePage(page.id);
                                }}
                                onCancel={() => setConfirmingPageId(null)}
                                okText={t('designer.pages.deleteAction', { defaultValue: '删除' })}
                                cancelText={t('common.cancel', { defaultValue: '取消' })}
                                destroyOnHidden
                            >
                                <button
                                    type="button"
                                    aria-label={t('designer.pages.delete', { name: page.name, defaultValue: '删除页面 {{name}}' })}
                                    className="page-tabs__delete"
                                >
                                    <CloseOutlined aria-hidden style={{ fontSize: 12 }} />
                                </button>
                            </Popconfirm>
                        )}
                    </div>
                );
            })}

            <Tooltip title={t('designer.pages.new', { defaultValue: '新建页面' })}>
                <button
                    type="button"
                    aria-label={t('designer.pages.new', { defaultValue: '新建页面' })}
                    onClick={onAddPage}
                    className="page-tabs__add"
                >
                    <PlusOutlined aria-hidden style={{ fontSize: 14 }} />
                </button>
            </Tooltip>
        </div>
    );
});
