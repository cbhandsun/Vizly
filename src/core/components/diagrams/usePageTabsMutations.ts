import { useCallback } from 'react';
import type { TFunction } from 'i18next';

import type { DiagramPage } from './hooks/useMultiPage';
import { MAX_DIAGRAM_PAGES } from './multiPagePersistence';
import { getPageTabsMutationFailure } from './pageTabsMutationFeedback';

interface UsePageTabsMutationsOptions {
    addedPageFocusTargetRef: { current: string | null };
    focusPageTab: (pageId: string) => void;
    onAddPage: () => string | null;
    onDuplicatePage?: (id: string, preferredName: string) => string | null;
    onMovePage?: (id: string, direction: 'left' | 'right') => boolean;
    pages: DiagramPage[];
    scrollPageItemIntoView: (pageId: string) => void;
    setStatusMessage: (message: string) => void;
    t: TFunction;
}

export const usePageTabsMutations = ({
    addedPageFocusTargetRef,
    focusPageTab,
    onAddPage,
    onDuplicatePage,
    onMovePage,
    pages,
    scrollPageItemIntoView,
    setStatusMessage,
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
        setStatusMessage(t('designer.pages.createSuccess', { defaultValue: '已新建页面' }));
    }, [addedPageFocusTargetRef, onAddPage, setStatusMessage, t]);

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
        setStatusMessage(t('designer.pages.duplicateSuccess', {
            name: page.name,
            defaultValue: '已复制页面“{{name}}”',
        }));
    }, [addedPageFocusTargetRef, onDuplicatePage, setStatusMessage, t]);

    const handleMovePage = useCallback((page: DiagramPage, direction: 'left' | 'right') => {
        const currentIndex = pages.findIndex((candidate) => candidate.id === page.id);
        if (currentIndex < 0) return;
        const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
        if (!onMovePage?.(page.id, direction)) {
            const failure = getPageTabsMutationFailure('move');
            setStatusMessage(t(failure.key, { name: page.name, defaultValue: failure.defaultValue }));
            return;
        }
        setStatusMessage(t(
            direction === 'left' ? 'designer.pages.moveLeftSuccess' : 'designer.pages.moveRightSuccess',
            {
                name: page.name,
                defaultValue: direction === 'left'
                    ? '已将页面“{{name}}”向左移动'
                    : '已将页面“{{name}}”向右移动',
            },
        ));
        const reachesBoundary = targetIndex === 0 || targetIndex === pages.length - 1;
        requestAnimationFrame(() => {
            if (reachesBoundary) focusPageTab(page.id);
            else scrollPageItemIntoView(page.id);
        });
    }, [focusPageTab, onMovePage, pages, scrollPageItemIntoView, setStatusMessage, t]);

    return { announcePageLimit, handleAddPage, handleDuplicatePage, handleMovePage };
};
