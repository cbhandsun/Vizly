import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    CloseOutlined,
    CopyOutlined,
    EditOutlined,
    PlusOutlined,
} from '@ant-design/icons';
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
    onAddPage: () => string | null;
    onDeletePage: (id: string) => boolean;
    onRenamePage: (id: string, name: string) => boolean;
    onDuplicatePage?: (id: string, preferredName: string) => string | null;
    onMovePage?: (id: string, direction: 'left' | 'right') => boolean;
    disabled?: boolean;
}

/** 底部页面 Tab 栏 — 类似 Excel 的 sheet tabs。 */
export const PageTabs: React.FC<PageTabsProps> = React.memo(({
    pages,
    activePageId,
    onSwitchPage,
    onAddPage,
    onDeletePage,
    onRenamePage,
    onDuplicatePage,
    onMovePage,
    disabled = false,
}) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);
    const [confirmingPageId, setConfirmingPageId] = useState<string | null>(null);
    const inputRef = useRef<InputRef>(null);
    const renameErrorId = React.useId();
    const tabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const deleteButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const restoreFocusAfterDeleteRef = useRef(false);
    const addedPageFocusTargetRef = useRef<string | null>(null);
    const pageLimitReached = pages.length >= MAX_DIAGRAM_PAGES;

    const scrollPageItemIntoView = useCallback((pageId: string) => {
        const tab = tabButtonRefs.current.get(pageId);
        if (!tab) return;
        tab.parentElement?.scrollIntoView?.({
            block: 'nearest',
            inline: 'nearest',
        });
    }, []);

    const focusPageTab = useCallback(
        (pageId: string) => {
            const tab = tabButtonRefs.current.get(pageId);
            if (!tab) return;
            tab.focus({ preventScroll: true });
            scrollPageItemIntoView(pageId);
        },
        [scrollPageItemIntoView],
    );

    useEffect(() => {
        const frame = requestAnimationFrame(() => scrollPageItemIntoView(activePageId));
        return () => cancelAnimationFrame(frame);
    }, [activePageId, pages.length, scrollPageItemIntoView]);

    const focusDeleteButton = useCallback((pageId: string) => {
        deleteButtonRefs.current.get(pageId)?.focus({ preventScroll: true });
    }, []);

    const focusDeleteCancelButton = useCallback(() => {
        setTimeout(() => {
            getViewportOverlayContainer().querySelector<HTMLButtonElement>('[data-page-tabs-delete-cancel="true"]')?.focus({ preventScroll: true });
        }, 0);
    }, []);

    useEffect(() => {
        if (!restoreFocusAfterDeleteRef.current) return;
        restoreFocusAfterDeleteRef.current = false;
        requestAnimationFrame(() => focusPageTab(activePageId));
    }, [activePageId, focusPageTab, pages]);

    useEffect(() => {
        const targetPageId = addedPageFocusTargetRef.current;
        if (!targetPageId || activePageId !== targetPageId) return;
        if (!pages.some((page) => page.id === targetPageId)) return;
        addedPageFocusTargetRef.current = null;
        requestAnimationFrame(() => focusPageTab(targetPageId));
    }, [activePageId, focusPageTab, pages]);

    useEffect(() => {
        const editingAnotherPage = Boolean(editingId && editingId !== activePageId);
        const confirmingAnotherPage = Boolean(confirmingPageId && confirmingPageId !== activePageId);
        if (!editingAnotherPage && !confirmingAnotherPage) return;

        setEditingId(null);
        setEditName('');
        setRenameError(null);
        setConfirmingPageId(null);
    }, [activePageId, confirmingPageId, editingId]);

    const handleStartRename = useCallback((page: DiagramPage) => {
        if (page.id !== activePageId) onSwitchPage(page.id);
        setConfirmingPageId(null);
        setEditingId(page.id);
        setEditName(page.name);
        setRenameError(null);
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 50);
    }, [activePageId, onSwitchPage]);

    const handleFinishRename = useCallback(() => {
        if (!editingId) return;
        const normalizedName = normalizePageName(editName);
        if (!normalizedName) {
            setRenameError(
                t('designer.pages.nameRequired', {
                    defaultValue: '页面名称不能为空',
                }),
            );
            return;
        }
        if (!isPageNameAvailable(pages, normalizedName, editingId)) {
            setRenameError(
                t('designer.pages.duplicateName', {
                    defaultValue: '页面名称不能重复',
                }),
            );
            return;
        }
        if (!onRenamePage(editingId, normalizedName)) {
            setRenameError(
                t('designer.pages.renameFailed', {
                    defaultValue: '页面重命名失败，请重试',
                }),
            );
            return;
        }
        const renamedPageId = editingId;
        setRenameError(null);
        setEditingId(null);
        requestAnimationFrame(() => focusPageTab(renamedPageId));
    }, [editingId, editName, focusPageTab, onRenamePage, pages, t]);

    const handleRenameKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Escape' || !editingId) return;
            event.preventDefault();
            const cancelledPageId = editingId;
            setEditingId(null);
            setEditName('');
            setRenameError(null);
            requestAnimationFrame(() => focusPageTab(cancelledPageId));
        },
        [editingId, focusPageTab],
    );

    const handleAddPage = useCallback(() => {
        const newPageId = onAddPage();
        if (newPageId) addedPageFocusTargetRef.current = newPageId;
    }, [onAddPage]);

    const handleDuplicatePage = useCallback((page: DiagramPage) => {
        if (!onDuplicatePage) return;
        const preferredName = t('designer.pages.copyName', {
            name: page.name,
            defaultValue: '{{name}} 副本',
        });
        const newPageId = onDuplicatePage(page.id, preferredName);
        if (newPageId) addedPageFocusTargetRef.current = newPageId;
    }, [onDuplicatePage, t]);

    const handleTabKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLButtonElement>, pageId: string) => {
            if (disabled) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSwitchPage(pageId);
                return;
            }

            const currentIndex = pages.findIndex((page) => page.id === pageId);
            const targetIndex = resolvePageTabTargetIndex(event.key, currentIndex, pages.length);
            if (targetIndex === null) return;

            event.preventDefault();
            const targetPage = pages[targetIndex];
            if (!targetPage) return;
            onSwitchPage(targetPage.id);
            focusPageTab(targetPage.id);
        },
        [disabled, focusPageTab, onSwitchPage, pages],
    );

    const activePage = pages.find((page) => page.id === activePageId) ?? null;
    const activePageIndex = activePage ? pages.findIndex(page => page.id === activePage.id) : -1;
    const isRenamingActivePage = editingId === activePage?.id;

    return (
        <div
            role="group"
            aria-label={t('designer.pages.management', { defaultValue: '页面管理' })}
            className="page-tabs"
            style={
                {
                    borderColor: token.colorBorderSecondary,
                    '--page-tab-active-color': token.colorPrimary,
                    '--page-tab-text-color': token.colorTextSecondary,
                    '--page-tab-muted-color': token.colorTextQuaternary,
                    '--page-tab-error-color': token.colorError,
                    '--page-tab-active-bg': `${token.colorPrimary}12`,
                    '--page-tab-hover-bg': `${token.colorPrimary}08`,
                } as React.CSSProperties
            }
        >
            <div
                aria-label={t('designer.pages.tabList', { defaultValue: '页面' })}
                aria-orientation="horizontal"
                className="page-tabs__scroller"
                role="tablist"
            >
                {pages.map((page) => {
                    const isActive = page.id === activePageId;

                    return (
                        <div key={page.id} className="page-tabs__item" role="presentation">
                            <button
                                ref={(element) => {
                                    if (element) tabButtonRefs.current.set(page.id, element);
                                    else tabButtonRefs.current.delete(page.id);
                                }}
                                type="button"
                                role="tab"
                                tabIndex={isActive ? 0 : -1}
                                aria-selected={isActive}
                                aria-label={page.name}
                                title={page.name}
                                className={`page-tabs__tab${isActive ? ' page-tabs__tab--active' : ''}`}
                                disabled={disabled}
                                onClick={() => onSwitchPage(page.id)}
                                onDoubleClick={() => handleStartRename(page)}
                                onKeyDown={(event) => handleTabKeyDown(event, page.id)}
                            >
                                {page.name}
                            </button>
                        </div>
                    );
                })}
            </div>

            {activePage && (
                <div
                    aria-label={t('designer.pages.actions', {
                        name: activePage.name,
                        defaultValue: '{{name}} 页面操作',
                    })}
                    className="page-tabs__actions"
                    role="group"
                >
                    {isRenamingActivePage ? (
                        <span className="page-tabs__rename-anchor">
                            <Input
                                ref={inputRef}
                                aria-label={t('designer.pages.rename', {
                                    name: activePage.name,
                                    defaultValue: '重命名页面 {{name}}',
                                })}
                                aria-invalid={Boolean(renameError)}
                                aria-describedby={renameError ? renameErrorId : undefined}
                                size="small"
                                value={editName}
                                maxLength={MAX_DIAGRAM_PAGE_NAME_LENGTH}
                                status={renameError ? 'error' : undefined}
                                onChange={(event) => {
                                    setEditName(event.target.value);
                                    setRenameError(null);
                                }}
                                onBlur={handleFinishRename}
                                onPressEnter={handleFinishRename}
                                onKeyDown={handleRenameKeyDown}
                                className="page-tabs__rename"
                            />
                        </span>
                    ) : (
                        <>
                            {onMovePage && (
                                <>
                                    <Tooltip title={t('designer.pages.moveLeft', { defaultValue: '向左移动页面' })}>
                                        <button
                                            type="button"
                                            aria-label={t('designer.pages.moveLeftNamed', {
                                                name: activePage.name,
                                                defaultValue: '向左移动页面 {{name}}',
                                            })}
                                            className="page-tabs__move"
                                            disabled={disabled || activePageIndex <= 0}
                                            onClick={() => onMovePage(activePage.id, 'left')}
                                        >
                                            <ArrowLeftOutlined aria-hidden style={{ fontSize: 12 }} />
                                        </button>
                                    </Tooltip>
                                    <Tooltip title={t('designer.pages.moveRight', { defaultValue: '向右移动页面' })}>
                                        <button
                                            type="button"
                                            aria-label={t('designer.pages.moveRightNamed', {
                                                name: activePage.name,
                                                defaultValue: '向右移动页面 {{name}}',
                                            })}
                                            className="page-tabs__move"
                                            disabled={disabled || activePageIndex >= pages.length - 1}
                                            onClick={() => onMovePage(activePage.id, 'right')}
                                        >
                                            <ArrowRightOutlined aria-hidden style={{ fontSize: 12 }} />
                                        </button>
                                    </Tooltip>
                                </>
                            )}

                            {onDuplicatePage && (
                                <Tooltip
                                    title={pageLimitReached
                                        ? t('designer.pages.limitReached', {
                                              count: MAX_DIAGRAM_PAGES,
                                              defaultValue: '最多可创建 {{count}} 个页面',
                                          })
                                        : t('designer.pages.duplicateAction', {
                                              name: activePage.name,
                                              defaultValue: '复制页面 {{name}}',
                                          })}
                                >
                                    <button
                                        type="button"
                                        aria-label={t('designer.pages.duplicateAction', {
                                            name: activePage.name,
                                            defaultValue: '复制页面 {{name}}',
                                        })}
                                        className="page-tabs__duplicate"
                                        disabled={disabled || pageLimitReached}
                                        onClick={() => handleDuplicatePage(activePage)}
                                    >
                                        <CopyOutlined aria-hidden style={{ fontSize: 12 }} />
                                    </button>
                                </Tooltip>
                            )}

                            <Tooltip
                                title={t('designer.pages.renameAction', {
                                    name: activePage.name,
                                    defaultValue: '重命名页面 {{name}}',
                                })}
                            >
                                <button
                                    type="button"
                                    aria-label={t('designer.pages.renameAction', {
                                        name: activePage.name,
                                        defaultValue: '重命名页面 {{name}}',
                                    })}
                                    className="page-tabs__rename-action"
                                    disabled={disabled}
                                    onClick={() => handleStartRename(activePage)}
                                >
                                    <EditOutlined aria-hidden style={{ fontSize: 12 }} />
                                </button>
                            </Tooltip>

                            {pages.length > 1 && (
                                <Popconfirm
                                    title={t('designer.pages.deleteConfirm', {
                                        name: activePage.name,
                                        defaultValue: '删除「{{name}}」？',
                                    })}
                                    description={t('designer.pages.deleteDescription', {
                                        nodeCount: activePage.nodes.length,
                                        edgeCount: activePage.edges.length,
                                        defaultValue: '将永久删除此页面中的 {{nodeCount}} 个节点和 {{edgeCount}} 条连线，且无法撤销。',
                                    })}
                                    getPopupContainer={getViewportOverlayContainer}
                                    placement="top"
                                    autoAdjustOverflow
                                    styles={{ root: { maxWidth: 'calc(100vw - 16px)' } }}
                                    open={confirmingPageId === activePage.id}
                                    onOpenChange={(open) => {
                                        setConfirmingPageId(open ? activePage.id : null);
                                        if (open) focusDeleteCancelButton();
                                        else requestAnimationFrame(() => focusDeleteButton(activePage.id));
                                    }}
                                    onConfirm={() => {
                                        const deleted = onDeletePage(activePage.id);
                                        restoreFocusAfterDeleteRef.current = deleted;
                                        setConfirmingPageId(null);
                                    }}
                                    onCancel={() => {
                                        setConfirmingPageId(null);
                                        requestAnimationFrame(() => focusDeleteButton(activePage.id));
                                    }}
                                    okText={t('designer.pages.deleteAction', {
                                        defaultValue: '删除',
                                    })}
                                    cancelText={t('common.cancel', { defaultValue: '取消' })}
                                    cancelButtonProps={{
                                        'data-page-tabs-delete-cancel': 'true',
                                    }}
                                    okButtonProps={{ danger: true }}
                                    destroyOnHidden
                                >
                                    <button
                                        ref={(element) => {
                                            if (element) deleteButtonRefs.current.set(activePage.id, element);
                                            else deleteButtonRefs.current.delete(activePage.id);
                                        }}
                                        type="button"
                                        aria-label={t('designer.pages.delete', {
                                            name: activePage.name,
                                            defaultValue: '删除页面 {{name}}',
                                        })}
                                        className="page-tabs__delete"
                                        disabled={disabled}
                                    >
                                        <CloseOutlined aria-hidden style={{ fontSize: 12 }} />
                                    </button>
                                </Popconfirm>
                            )}
                        </>
                    )}
                </div>
            )}

            {renameError && (
                <span id={renameErrorId} role="alert" className="page-tabs__rename-error">
                    {renameError}
                </span>
            )}

            <Tooltip
                title={
                    pageLimitReached
                        ? t('designer.pages.limitReached', {
                              count: MAX_DIAGRAM_PAGES,
                              defaultValue: '最多可创建 {{count}} 个页面',
                          })
                        : t('designer.pages.new', { defaultValue: '新建页面' })
                }
            >
                <button type="button" aria-label={t('designer.pages.new', { defaultValue: '新建页面' })} onClick={handleAddPage} className="page-tabs__add" disabled={disabled || pageLimitReached}>
                    <PlusOutlined aria-hidden style={{ fontSize: 14 }} />
                </button>
            </Tooltip>
        </div>
    );
});
