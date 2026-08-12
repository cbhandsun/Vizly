import { useCallback } from 'react';
import type { TFunction } from 'i18next';

import type { DiagramPage } from './hooks/useMultiPage';
import { MAX_DIAGRAM_PAGES } from './multiPagePersistence';
import { getPageTabsMutationFailure } from './pageTabsMutationFeedback';

interface UsePageTabsMutationsOptions {
    addedPageFocusTargetRef: { current: string | null };
    focusPageTab: (pageId: string) => void;
    onAddPage: () => string | null;
    onDiscardPage: (id: string) => boolean;
    onDuplicatePage?: (id: string, preferredName: string) => string | null;
    onMovePage?: (id: string, direction: 'left' | 'right') => boolean;
    pages: DiagramPage[];
    scrollPageItemIntoView: (pageId: string) => void;
    setStatusMessage: (message: string) => void;
    setUndoableStatus: (message: string, undo: () => boolean) => void;
    t: TFunction;
}

export const usePageTabsMutations = ({
    addedPageFocusTargetRef,
    focusPageTab,
    onAddPage,
    onDiscardPage,
    onDuplicatePage,
    onMovePage,
    pages,
    scrollPageItemIntoView,
    setStatusMessage,
    setUndoableStatus,
    t,
}: UsePageTabsMutationsOptions) => {
    const handleAddPage = useCallback(() => {
        const newPageId = onAddPage();
        if (!newPageId) {
            const failure = getPageTabsMutationFailure('create');
            setStatusMessage(t(failure.key, { defaultValue: failure.defaultValue }));
            return;
        }
        addedPageFocusTargetRef.current = newPageId;
        setUndoableStatus(
            t('designer.pages.createSuccess', { defaultValue: '已新建页面' }),
            () => onDiscardPage(newPageId),
        );
    }, [addedPageFocusTargetRef, onAddPage, onDiscardPage, setStatusMessage, setUndoableStatus, t]);

    const announcePageLimit = useCallback(() => {
        setStatusMessage(t('designer.pages.limitReached', {
            count: MAX_DIAGRAM_PAGES,
            defaultValue: '最多可创建 {{count}} 个页面',
        }));
    }, [setStatusMessage, t]);

    const handleDuplicatePage = useCallback((page: DiagramPage) => {
        if (!onDuplicatePage) return;
        const preferredName = t('designer.pages.copyName', { name: page.name, defaultValue: '{{name}} 副本' });
        const newPageId = onDuplicatePage(page.id, preferredName);
        if (!newPageId) {
            const failure = getPageTabsMutationFailure('duplicate');
            setStatusMessage(t(failure.key, { name: page.name, defaultValue: failure.defaultValue }));
            return;
        }
        addedPageFocusTargetRef.current = newPageId;
        setUndoableStatus(
            t('designer.pages.duplicateSuccess', {
                name: page.name,
                defaultValue: '已复制页面“{{name}}”',
            }),
            () => onDiscardPage(newPageId),
        );
    }, [addedPageFocusTargetRef, onDiscardPage, onDuplicatePage, setStatusMessage, setUndoableStatus, t]);

    const handleMovePage = useCallback((page: DiagramPage, direction: 'left' | 'right') => {
        const currentIndex = pages.findIndex((candidate) => candidate.id === page.id);
        if (currentIndex < 0) return;
        const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
        if (!onMovePage?.(page.id, direction)) {
            const failure = getPageTabsMutationFailure('move');
            setStatusMessage(t(failure.key, { name: page.name, defaultValue: failure.defaultValue }));
            return;
        }
        setUndoableStatus(
            t(direction === 'left' ? 'designer.pages.moveLeftSuccess' : 'designer.pages.moveRightSuccess', {
                name: page.name,
                defaultValue: direction === 'left'
                    ? '已将页面“{{name}}”向左移动'
                    : '已将页面“{{name}}”向右移动',
            }),
            () => onMovePage?.(page.id, direction === 'left' ? 'right' : 'left') ?? false,
        );
        const reachesBoundary = targetIndex === 0 || targetIndex === pages.length - 1;
        requestAnimationFrame(() => {
            if (reachesBoundary) focusPageTab(page.id);
            else scrollPageItemIntoView(page.id);
        });
    }, [focusPageTab, onMovePage, pages, scrollPageItemIntoView, setStatusMessage, setUndoableStatus, t]);

    return { announcePageLimit, handleAddPage, handleDuplicatePage, handleMovePage };
};
