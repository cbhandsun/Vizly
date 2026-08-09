import { useCallback, useRef } from 'react';

import { useDiagramStore, type CommentThread } from '../../../store/useDiagramStore';
import { removeCommentsForPage } from '../commentPageScope';

export const useCommentAwarePageDeletion = (
    deletePage: (pageId: string) => boolean,
    restoreDeletedPage: () => string | null,
) => {
    const setComments = useDiagramStore(state => state.setComments);
    const setActiveCommentId = useDiagramStore(state => state.setActiveCommentId);
    const deletedCommentsRef = useRef<CommentThread[]>([]);

    const deletePageWithComments = useCallback((pageId: string) => {
        if (!deletePage(pageId)) return false;

        const state = useDiagramStore.getState();
        deletedCommentsRef.current = state.comments.filter(comment => comment.pageId === pageId);
        const nextComments = removeCommentsForPage(state.comments, pageId);
        if (state.activeCommentId && !nextComments.some(comment => comment.id === state.activeCommentId)) {
            setActiveCommentId(null);
        }
        setComments(nextComments);
        return true;
    }, [deletePage, setActiveCommentId, setComments]);

    const restoreDeletedPageWithComments = useCallback(() => {
        const restoredPageId = restoreDeletedPage();
        if (!restoredPageId) return null;

        const deletedComments = deletedCommentsRef.current.filter(
            comment => comment.pageId === restoredPageId,
        );
        if (deletedComments.length > 0) {
            const state = useDiagramStore.getState();
            const existingIds = new Set(state.comments.map(comment => comment.id));
            setComments([
                ...state.comments,
                ...deletedComments.filter(comment => !existingIds.has(comment.id)),
            ]);
        }
        deletedCommentsRef.current = [];
        return restoredPageId;
    }, [restoreDeletedPage, setComments]);

    return {
        deletePage: deletePageWithComments,
        restoreDeletedPage: restoreDeletedPageWithComments,
    };
};
