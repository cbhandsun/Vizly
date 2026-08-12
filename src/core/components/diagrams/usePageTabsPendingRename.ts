import { useCallback, useEffect, useRef } from 'react';

import type { DiagramPage } from './hooks/useMultiPage';
import { resolvePendingPageRename, type PendingPageRename } from './pageTabsRenameRequest';

interface UsePageTabsPendingRenameOptions {
    activePageId: string;
    pages: DiagramPage[];
    openRename: (page: DiagramPage) => void;
}

export const usePageTabsPendingRename = ({
    activePageId,
    pages,
    openRename,
}: UsePageTabsPendingRenameOptions): ((sourcePageId: string, targetPageId: string) => void) => {
    const pendingRenameRef = useRef<PendingPageRename | null>(null);

    useEffect(() => {
        const pendingRename = pendingRenameRef.current;
        if (!pendingRename) return;
        const resolution = resolvePendingPageRename(pendingRename, activePageId);
        if (resolution === 'wait') return;
        pendingRenameRef.current = null;
        if (resolution === 'cancel') return;
        const pendingPage = pages.find((page) => page.id === pendingRename.targetPageId);
        if (pendingPage) openRename(pendingPage);
    }, [activePageId, openRename, pages]);

    return useCallback((sourcePageId: string, targetPageId: string) => {
        pendingRenameRef.current = { sourcePageId, targetPageId };
    }, []);
};
