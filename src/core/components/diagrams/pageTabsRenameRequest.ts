export interface PendingPageRename {
    sourcePageId: string;
    targetPageId: string;
}

export type PendingPageRenameResolution = 'wait' | 'open' | 'cancel';

export const resolvePendingPageRename = (
    request: PendingPageRename,
    activePageId: string,
): PendingPageRenameResolution => {
    if (activePageId === request.sourcePageId) return 'wait';
    return activePageId === request.targetPageId ? 'open' : 'cancel';
};
