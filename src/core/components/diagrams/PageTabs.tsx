import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Input, Popconfirm, theme, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { useTranslation } from 'react-i18next';

import type { DiagramPage } from './hooks/useMultiPage';
import { MAX_DIAGRAM_PAGE_NAME_LENGTH, MAX_DIAGRAM_PAGES } from './multiPagePersistence';
import { isPageNameAvailable, normalizePageName } from './multiPageNaming';
import { resolvePageTabTargetIndex } from './pageTabKeyboard';
import { getViewportOverlayContainer } from '../ui/viewportOverlayPortal';
import './PageTabs.css';

interface PageTabsProps {
    pages: DiagramPage[];
    activePageId: string;
    onSwitchPage: (id: string) => void;
    onAddPage: () => void;
    onDeletePage: (id: string) => boolean;
    onRenamePage: (id: string, name: string) => boolean;
    disabled?: boolean;
}

/** 底部页面 Tab 栏 — 类似 Excel 的 sheet tabs。 */
export const PageTabs: React.FC<PageTabsProps> = React.memo(({
    pages, activePageId, onSwitchPage, onAddPage, onDeletePage, onRenamePage, disabled = false,
}) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);
    const [confirmingPageId, setConfirmingPageId] = useState<string | null>(null);
    const inputRef = useRef<InputRef>(null);
    const tabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const restoreFocusAfterDeleteRef = useRef(false);
    const pageLimitReached = pages.length >= MAX_DIAGRAM_PAGES;

    useEffect(() => {
        if (!restoreFocusAfterDeleteRef.current) return;
        restoreFocusAfterDeleteRef.current = false;
        requestAnimationFrame(() => tabButtonRefs.current.get(activePageId)?.focus());
    }, [activePageId, pages]);

    const handleStartRename = useCallback((page: DiagramPage) => {
        setConfirmingPageId(null);
        setEditingId(page.id);
        setEditName(page.name);
        setRenameError(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    const handleFinishRename = useCallback(() => {
        if (!editingId) return;
        const normalizedName = normalizePageName(editName);
        if (!normalizedName) {
            setRenameError(t('designer.pages.nameRequired', { defaultValue: '页面名称不能为空' }));
            return;
        }
        if (!isPageNameAvailable(pages, normalizedName, editingId)) {
            setRenameError(t('designer.pages.duplicateName', { defaultValue: '页面名称不能重复' }));
            return;
        }
        if (!onRenamePage(editingId, normalizedName)) {
            setRenameError(t('designer.pages.renameFailed', { defaultValue: '页面重命名失败，请重试' }));
            return;
        }
        setRenameError(null);
        setEditingId(null);
    }, [editingId, editName, onRenamePage, pages, t]);

    const handleRenameKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Escape' || !editingId) return;
        event.preventDefault();
        const cancelledPageId = editingId;
        setEditingId(null);
        setEditName('');
        setRenameError(null);
        requestAnimationFrame(() => tabButtonRefs.current.get(cancelledPageId)?.focus());
    }, [editingId]);

    const handleTabKeyDown = useCallback((
        event: React.KeyboardEvent<HTMLButtonElement>,
        pageId: string,
    ) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSwitchPage(pageId);
            return;
        }

        const currentIndex = pages.findIndex(page => page.id === pageId);
        const targetIndex = resolvePageTabTargetIndex(event.key, currentIndex, pages.length);
        if (targetIndex === null) return;

        event.preventDefault();
        const targetPage = pages[targetIndex];
        if (!targetPage) return;
        onSwitchPage(targetPage.id);
        tabButtonRefs.current.get(targetPage.id)?.focus();
    }, [disabled, onSwitchPage, pages]);

    return (
        <div
            role="tablist"
            aria-orientation="horizontal"
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
                            <Tooltip
                                open={Boolean(renameError)}
                                title={renameError}
                                placement="top"
                            >
                                <Input
                                    ref={inputRef}
                                    aria-label={t('designer.pages.rename', { name: page.name, defaultValue: '重命名页面 {{name}}' })}
                                    aria-invalid={Boolean(renameError)}
                                    size="small"
                                    value={editName}
                                    maxLength={MAX_DIAGRAM_PAGE_NAME_LENGTH}
                                    status={renameError ? 'error' : undefined}
                                    onChange={event => {
                                        setEditName(event.target.value);
                                        setRenameError(null);
                                    }}
                                    onBlur={handleFinishRename}
                                    onPressEnter={handleFinishRename}
                                    onKeyDown={handleRenameKeyDown}
                                    className="page-tabs__rename"
                                />
                            </Tooltip>
                        ) : (
                            <button
                                ref={element => {
                                    if (element) tabButtonRefs.current.set(page.id, element);
                                    else tabButtonRefs.current.delete(page.id);
                                }}
                                type="button"
                                role="tab"
                                tabIndex={isActive ? 0 : -1}
                                aria-selected={isActive}
                                aria-label={page.name}
                                className={`page-tabs__tab${isActive ? ' page-tabs__tab--active' : ''}`}
                                disabled={disabled}
                                onClick={() => onSwitchPage(page.id)}
                                onDoubleClick={() => handleStartRename(page)}
                                onKeyDown={event => handleTabKeyDown(event, page.id)}
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
                                    disabled={disabled}
                                    onClick={() => handleStartRename(page)}
                                >
                                    <EditOutlined aria-hidden style={{ fontSize: 12 }} />
                                </button>
                            </Tooltip>
                        )}

                        {pages.length > 1 && !isEditing && (
                            <Popconfirm
                                title={t('designer.pages.deleteConfirm', { name: page.name, defaultValue: '删除「{{name}}」？' })}
                                description={t('designer.pages.deleteDescription', { defaultValue: '此页面及其全部内容将永久删除，且无法撤销。' })}
                                getPopupContainer={getViewportOverlayContainer}
                                placement="top"
                                autoAdjustOverflow={false}
                                open={confirmingPageId === page.id}
                                onOpenChange={open => setConfirmingPageId(open ? page.id : null)}
                                onConfirm={() => {
                                    const deleted = onDeletePage(page.id);
                                    restoreFocusAfterDeleteRef.current = deleted;
                                    setConfirmingPageId(null);
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
                                    disabled={disabled}
                                >
                                    <CloseOutlined aria-hidden style={{ fontSize: 12 }} />
                                </button>
                            </Popconfirm>
                        )}
                    </div>
                );
            })}

            <Tooltip title={pageLimitReached
                ? t('designer.pages.limitReached', { count: MAX_DIAGRAM_PAGES, defaultValue: '最多可创建 {{count}} 个页面' })
                : t('designer.pages.new', { defaultValue: '新建页面' })}
            >
                <button
                    type="button"
                    aria-label={t('designer.pages.new', { defaultValue: '新建页面' })}
                    onClick={onAddPage}
                    className="page-tabs__add"
                    disabled={disabled || pageLimitReached}
                >
                    <PlusOutlined aria-hidden style={{ fontSize: 14 }} />
                </button>
            </Tooltip>
        </div>
    );
});
