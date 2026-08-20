import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    CloseOutlined,
    CopyOutlined,
    EditOutlined,
} from '@ant-design/icons';
import { Input, Popconfirm, theme, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { useTranslation } from 'react-i18next';

import { MAX_DIAGRAM_PAGE_NAME_LENGTH, MAX_DIAGRAM_PAGES } from './multiPagePersistence';
import { isPageNameAvailable, normalizePageName } from './multiPageNaming';
import { resolvePageContentMetrics } from './pageCanvasMetadata';
import { resolvePageTabTargetIndex } from './pageTabKeyboard';
import { schedulePageTabsDeleteFocus } from './pageTabsDeleteFocus';
import { runPageTabsCapacityAction } from './pageTabsLimitFeedback';
import { PageTabsCapacityControls } from './PageTabsCapacityControls';
import { PageTabsStatus } from './PageTabsStatus';
import { getPageTabsMutationFailure } from './pageTabsMutationFeedback';
import { usePageTabsPendingRename } from './usePageTabsPendingRename';
import { usePageTabsMutations } from './usePageTabsMutations';
import { useTransientStatusMessage } from './useTransientStatusMessage';
import { getViewportOverlayContainer } from '../ui/viewportOverlayPortal';
import type { DiagramPage, PageTabsProps } from './pageTabsTypes';
import './PageTabs.css';

/** 底部页面 Tab 栏 — 类似 Excel 的 sheet tabs。 */
export const PageTabs: React.FC<PageTabsProps> = React.memo(({
    pages,
    activePageId,
    onSwitchPage,
    onAddPage,
    onDiscardPage,
    onDeletePage,
    onRestoreDeletedPage,
    onRenamePage,
    onDuplicatePage,
    onMovePage,
    canRestoreDeletedPage = false,
    restorableDeletedPageName = null,
    activePageNodeCount,
    activePageEdgeCount,
    disabled = false,
}) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);
    const [confirmingPageId, setConfirmingPageId] = useState<string | null>(null);
    const {
        pauseStatusDismissal,
        resumeStatusDismissal,
        statusAction,
        statusMessage,
        statusMessageVersion,
        setStatusMessage,
    } = useTransientStatusMessage();
    const inputRef = useRef<InputRef>(null);
    const restoreButtonRef = useRef<HTMLButtonElement>(null);
    const renameErrorId = React.useId();
    const deleteDialogId = React.useId();
    const deleteDialogTitleId = React.useId();
    const deleteDialogDescriptionId = React.useId();
    const tabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const deleteButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const deleteCancelFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deleteFocusReturnPageIdRef = useRef<string | null>(null);
    const deleteFocusRequestRef = useRef<{ cancel: () => void } | null>(null);
    const renameBlurCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const restoreFocusAfterDeleteRef = useRef(false);
    const addedPageFocusTargetRef = useRef<string | null>(null);
    const pageLimitReached = pages.length >= MAX_DIAGRAM_PAGES;

    const cancelRenameBlurCommit = useCallback(() => {
        if (renameBlurCommitTimerRef.current === null) return;
        clearTimeout(renameBlurCommitTimerRef.current);
        renameBlurCommitTimerRef.current = null;
    }, []);

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

    const setUndoableStatus = useCallback((message: string, undo: () => boolean) => {
        setStatusMessage(message, {
            label: t('designer.pages.undoAction', { defaultValue: '撤销此操作' }),
            onActivate: () => {
                const succeeded = undo();
                setStatusMessage(succeeded
                    ? t('designer.pages.undoSuccess', { defaultValue: '已撤销页面操作' })
                    : t('designer.pages.undoFailed', { defaultValue: '无法撤销页面操作，请重试' }));
                requestAnimationFrame(() => focusPageTab(activePageId));
            },
        });
    }, [activePageId, focusPageTab, setStatusMessage, t]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => scrollPageItemIntoView(activePageId));
        return () => cancelAnimationFrame(frame);
    }, [activePageId, pages.length, scrollPageItemIntoView]);

    const focusDeleteButton = useCallback((pageId: string) => {
        deleteButtonRefs.current.get(pageId)?.focus({ preventScroll: true });
    }, []);

    const scheduleDeleteFocusRecovery = useCallback((pageId: string) => {
        deleteFocusRequestRef.current?.cancel();
        deleteFocusRequestRef.current = schedulePageTabsDeleteFocus({
            dialog: document.getElementById(deleteDialogId),
            observerRoot: getViewportOverlayContainer(),
            resolvePrimaryTarget: () => deleteButtonRefs.current.get(pageId) ?? null,
            resolveFallbackTarget: () => tabButtonRefs.current.get(pageId) ?? null,
        });
    }, [deleteDialogId]);

    const cancelDeleteCancelFocus = useCallback(() => {
        if (deleteCancelFocusTimerRef.current === null) return;
        clearTimeout(deleteCancelFocusTimerRef.current);
        deleteCancelFocusTimerRef.current = null;
    }, []);

    const focusDeleteCancelButton = useCallback(() => {
        cancelDeleteCancelFocus();
        deleteCancelFocusTimerRef.current = setTimeout(() => {
            deleteCancelFocusTimerRef.current = null;
            getViewportOverlayContainer().querySelector<HTMLButtonElement>('[data-page-tabs-delete-cancel="true"]')?.focus({ preventScroll: true });
        }, 0);
    }, [cancelDeleteCancelFocus]);

    const applyDeleteDialogSemantics = useCallback(() => {
        const dialog = document.getElementById(deleteDialogId);
        dialog?.setAttribute('role', 'alertdialog');
        dialog?.setAttribute('aria-labelledby', deleteDialogTitleId);
        dialog?.setAttribute('aria-describedby', deleteDialogDescriptionId);
    }, [deleteDialogDescriptionId, deleteDialogId, deleteDialogTitleId]);

    const handleDeleteDialogAfterOpenChange = useCallback((open: boolean) => {
        if (open) {
            applyDeleteDialogSemantics();
            return;
        }

        const pageId = deleteFocusReturnPageIdRef.current;
        deleteFocusReturnPageIdRef.current = null;
        if (pageId) focusDeleteButton(pageId);
    }, [applyDeleteDialogSemantics, focusDeleteButton]);

    const handleDeleteDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Escape' || !confirmingPageId) return;
        event.preventDefault();
        event.stopPropagation();
        cancelDeleteCancelFocus();
        deleteFocusReturnPageIdRef.current = confirmingPageId;
        scheduleDeleteFocusRecovery(confirmingPageId);
        setConfirmingPageId(null);
        requestAnimationFrame(() => focusDeleteButton(confirmingPageId));
    }, [cancelDeleteCancelFocus, confirmingPageId, focusDeleteButton, scheduleDeleteFocusRecovery]);

    useEffect(() => {
        if (!confirmingPageId) return;
        const frame = requestAnimationFrame(applyDeleteDialogSemantics);
        return () => cancelAnimationFrame(frame);
    }, [applyDeleteDialogSemantics, confirmingPageId]);

    useEffect(() => () => {
        cancelRenameBlurCommit();
        cancelDeleteCancelFocus();
        deleteFocusRequestRef.current?.cancel();
        deleteFocusRequestRef.current = null;
    }, [cancelDeleteCancelFocus, cancelRenameBlurCommit]);

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

    const openRename = useCallback((page: DiagramPage) => {
        setConfirmingPageId(null);
        setEditingId(page.id);
        setEditName(page.name);
        setRenameError(null);
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 50);
    }, []);

    const requestRenameAfterSwitch = usePageTabsPendingRename({ activePageId, pages, openRename });

    const handleStartRename = useCallback((page: DiagramPage) => {
        cancelRenameBlurCommit();
        if (page.id !== activePageId) {
            requestRenameAfterSwitch(activePageId, page.id);
            onSwitchPage(page.id);
            return;
        }
        openRename(page);
    }, [activePageId, cancelRenameBlurCommit, onSwitchPage, openRename, requestRenameAfterSwitch]);

    const handleFinishRename = useCallback((restoreTabFocus = true) => {
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
        const previousName = pages.find((page) => page.id === renamedPageId)?.name;
        const successMessage = t('designer.pages.renameSuccess', {
            name: normalizedName,
            defaultValue: '页面已重命名为“{{name}}”',
        });
        if (previousName) setUndoableStatus(successMessage, () => onRenamePage(renamedPageId, previousName));
        else setStatusMessage(successMessage);
        if (restoreTabFocus) {
            requestAnimationFrame(() => focusPageTab(renamedPageId));
        }
    }, [editingId, editName, focusPageTab, onRenamePage, pages, setStatusMessage, setUndoableStatus, t]);

    const handleRenameBlur = useCallback(() => {
        cancelRenameBlurCommit();
        renameBlurCommitTimerRef.current = setTimeout(() => {
            renameBlurCommitTimerRef.current = null;
            handleFinishRename(false);
        }, 0);
    }, [cancelRenameBlurCommit, handleFinishRename]);

    const handleRenameKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Escape' || !editingId) return;
            event.preventDefault();
            cancelRenameBlurCommit();
            const cancelledPageId = editingId;
            setEditingId(null);
            setEditName('');
            setRenameError(null);
            requestAnimationFrame(() => focusPageTab(cancelledPageId));
        },
        [cancelRenameBlurCommit, editingId, focusPageTab],
    );

    const { announcePageLimit, handleAddPage, handleDuplicatePage, handleMovePage } = usePageTabsMutations({
        addedPageFocusTargetRef,
        focusPageTab,
        onAddPage,
        onDiscardPage: onDiscardPage ?? onDeletePage,
        onDuplicatePage,
        onMovePage,
        pages,
        scrollPageItemIntoView,
        setStatusMessage,
        setUndoableStatus,
        t,
    });

    const handleRestoreDeletedPage = useCallback(() => {
        const restoredPageId = onRestoreDeletedPage?.();
        if (!restoredPageId) {
            setStatusMessage(t('designer.pages.restoreFailed', {
                name: restorableDeletedPageName ?? '',
                defaultValue: '无法恢复页面“{{name}}”，请重试',
            }));
            requestAnimationFrame(() => restoreButtonRef.current?.focus());
            return;
        }
        addedPageFocusTargetRef.current = restoredPageId;
        setUndoableStatus(t('designer.pages.restoreSuccess', {
            name: restorableDeletedPageName ?? '',
            defaultValue: '已恢复页面“{{name}}”',
        }), () => onDeletePage(restoredPageId));
    }, [onDeletePage, onRestoreDeletedPage, restorableDeletedPageName, setStatusMessage, setUndoableStatus, t]);

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
    const activePageContentMetrics = activePage
        ? resolvePageContentMetrics(
            activePage.nodes,
            activePage.edges,
            activePageNodeCount,
            activePageEdgeCount,
        )
        : null;
    const pageLimitMessage = t('designer.pages.limitReached', {
        count: MAX_DIAGRAM_PAGES,
        defaultValue: '最多可创建 {{count}} 个页面',
    });
    const restoreActionLabel = restorableDeletedPageName
        ? t('designer.pages.restoreNamedAction', {
            name: restorableDeletedPageName,
            defaultValue: '恢复页面“{{name}}”',
        })
        : t('designer.pages.restoreAction', { defaultValue: '恢复删除的页面' });

    return (
        <div
            role="group"
            aria-label={t('designer.pages.management', { defaultValue: 'Page management' })}
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
                        defaultValue: '{{name}} page actions',
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
                                onBlur={handleRenameBlur}
                                onPressEnter={() => {
                                    cancelRenameBlurCommit();
                                    handleFinishRename();
                                }}
                                onKeyDown={handleRenameKeyDown}
                                className="page-tabs__rename"
                            />
                            {renameError && (
                                <span id={renameErrorId} role="alert" className="page-tabs__rename-error">
                                    {renameError}
                                </span>
                            )}
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
                                            onClick={() => handleMovePage(activePage, 'left')}
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
                                            onClick={() => handleMovePage(activePage, 'right')}
                                        >
                                            <ArrowRightOutlined aria-hidden style={{ fontSize: 12 }} />
                                        </button>
                                    </Tooltip>
                                </>
                            )}

                            {onDuplicatePage && (
                                <Tooltip
                                    title={pageLimitReached
                                        ? pageLimitMessage
                                        : t('designer.pages.duplicateAction', {
                                              name: activePage.name,
                                              defaultValue: '复制页面 {{name}}',
                                          })}
                                >
                                    <button
                                        type="button"
                                        aria-label={pageLimitReached
                                            ? t('designer.pages.duplicateLimitReached', {
                                                name: activePage.name,
                                                count: MAX_DIAGRAM_PAGES,
                                                defaultValue: '无法复制页面 {{name}}：最多可创建 {{count}} 个页面',
                                            })
                                            : t('designer.pages.duplicateAction', {
                                                name: activePage.name,
                                                defaultValue: '复制页面 {{name}}',
                                            })}
                                        className="page-tabs__duplicate"
                                        aria-disabled={pageLimitReached || disabled}
                                        disabled={disabled}
                                        onClick={() => runPageTabsCapacityAction({
                                            pageLimitReached,
                                            disabled,
                                            announceLimit: announcePageLimit,
                                            performAction: () => handleDuplicatePage(activePage),
                                        })}
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
                                    id={deleteDialogId}
                                    title={(
                                        <span id={deleteDialogTitleId}>
                                            {t('designer.pages.deleteConfirm', {
                                                name: activePage.name,
                                                defaultValue: '删除「{{name}}」？',
                                            })}
                                        </span>
                                    )}
                                    description={(
                                        <span id={deleteDialogDescriptionId}>
                                            {t('designer.pages.deleteDescription', {
                                                nodeCount: activePageContentMetrics?.nodeCount ?? activePage.nodes.length,
                                                edgeCount: activePageContentMetrics?.edgeCount ?? activePage.edges.length,
                                                defaultValue: '将删除此页面中的 {{nodeCount}} 个节点和 {{edgeCount}} 条连线。关闭或重新加载图表前，可恢复最近删除的页面。',
                                            })}
                                        </span>
                                    )}
                                    getPopupContainer={getViewportOverlayContainer}
                                    placement="top"
                                    autoAdjustOverflow
                                    styles={{ root: { maxWidth: 'calc(100vw - 16px)' } }}
                                    open={confirmingPageId === activePage.id}
                                    onOpenChange={(open) => {
                                        setConfirmingPageId(open ? activePage.id : null);
                                        if (open) {
                                            deleteFocusRequestRef.current?.cancel();
                                            deleteFocusRequestRef.current = null;
                                            focusDeleteCancelButton();
                                        }
                                        else {
                                            cancelDeleteCancelFocus();
                                            if (!restoreFocusAfterDeleteRef.current) {
                                                deleteFocusReturnPageIdRef.current = activePage.id;
                                                scheduleDeleteFocusRecovery(activePage.id);
                                                requestAnimationFrame(() => focusDeleteButton(activePage.id));
                                            }
                                        }
                                    }}
                                    afterOpenChange={handleDeleteDialogAfterOpenChange}
                                    onConfirm={() => {
                                        cancelDeleteCancelFocus();
                                        const deleted = onDeletePage(activePage.id);
                                        restoreFocusAfterDeleteRef.current = deleted;
                                        if (deleted) {
                                            setStatusMessage(t('designer.pages.deleteSuccess', {
                                                name: activePage.name,
                                                defaultValue: '已删除“{{name}}”，可使用“恢复删除的页面”找回',
                                            }));
                                        }
                                        else {
                                            const failure = getPageTabsMutationFailure('delete');
                                            setStatusMessage(t(failure.key, {
                                                name: activePage.name,
                                                defaultValue: failure.defaultValue,
                                            }));
                                            deleteFocusReturnPageIdRef.current = activePage.id;
                                            scheduleDeleteFocusRecovery(activePage.id);
                                        }
                                        setConfirmingPageId(null);
                                    }}
                                    onCancel={() => {
                                        cancelDeleteCancelFocus();
                                        deleteFocusReturnPageIdRef.current = activePage.id;
                                        scheduleDeleteFocusRecovery(activePage.id);
                                        setConfirmingPageId(null);
                                        requestAnimationFrame(() => focusDeleteButton(activePage.id));
                                    }}
                                    okText={t('designer.pages.deleteAction', {
                                        defaultValue: '删除',
                                    })}
                                    cancelText={t('common.cancel', { defaultValue: '取消' })}
                                    cancelButtonProps={{
                                        'data-page-tabs-delete-cancel': 'true',
                                        onKeyDown: handleDeleteDialogKeyDown,
                                    }}
                                    okButtonProps={{
                                        danger: true,
                                        onKeyDown: handleDeleteDialogKeyDown,
                                    }}
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
                                        aria-controls={confirmingPageId === activePage.id ? deleteDialogId : undefined}
                                        aria-expanded={confirmingPageId === activePage.id}
                                        aria-haspopup="dialog"
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

            <PageTabsStatus
                action={statusAction}
                message={statusMessage}
                onInteractionEnd={resumeStatusDismissal}
                onInteractionStart={pauseStatusDismissal}
                version={statusMessageVersion}
            />

            <PageTabsCapacityControls
                addLabel={pageLimitReached
                    ? t('designer.pages.createLimitReached', {
                        count: MAX_DIAGRAM_PAGES,
                        defaultValue: '无法新建页面：最多可创建 {{count}} 个页面',
                    })
                    : t('designer.pages.new', { defaultValue: '新建页面' })}
                addTooltip={pageLimitReached
                    ? pageLimitMessage
                    : t('designer.pages.new', { defaultValue: '新建页面' })}
                announceLimit={announcePageLimit}
                canRestoreDeletedPage={canRestoreDeletedPage}
                disabled={disabled}
                onAddPage={handleAddPage}
                onRestoreDeletedPage={onRestoreDeletedPage ? handleRestoreDeletedPage : undefined}
                pageLimitReached={pageLimitReached}
                restoreActionLabel={restoreActionLabel}
                restoreButtonRef={restoreButtonRef}
            />
        </div>
    );
});
