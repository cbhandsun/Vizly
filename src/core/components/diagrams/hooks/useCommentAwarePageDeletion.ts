import { useCallback } from 'react';

import { useDiagramStore } from '../../../store/useDiagramStore';
import { removeCommentsForPage } from '../commentPageScope';

export const useCommentAwarePageDeletion = (
    deletePage: (pageId: string) => boolean,
) => {
    const setComments = useDiagramStore(state => state.setComments);
    const setActiveCommentId = useDiagramStore(state => state.setActiveCommentId);

    return useCallback((pageId: string) => {
        if (!deletePage(pageId)) return false;

        const state = useDiagramStore.getState();
        const nextComments = removeCommentsForPage(state.comments, pageId);
        if (state.activeCommentId && !nextComments.some(comment => comment.id === state.activeCommentId)) {
            setActiveCommentId(null);
        }
        setComments(nextComments);
        return true;
    }, [deletePage, setActiveCommentId, setComments]);
};
