import type { CommentThread } from '../../store/useDiagramStore';

export const DEFAULT_COMMENT_PAGE_ID = 'page-1';
export const MAX_COMMENT_PAGE_ID_LENGTH = 200;

type CommentPageScopeInput = Pick<CommentThread, 'pageId'> | { pageId?: unknown };

export const normalizeCommentPageId = (value: unknown): string => {
    if (typeof value !== 'string') return DEFAULT_COMMENT_PAGE_ID;
    const normalized = value.trim();
    if (!normalized || normalized.length > MAX_COMMENT_PAGE_ID_LENGTH) {
        return DEFAULT_COMMENT_PAGE_ID;
    }
    return normalized;
};

export const isCommentOnPage = (
    comment: CommentPageScopeInput,
    activePageId: unknown,
): boolean => normalizeCommentPageId(comment.pageId) === normalizeCommentPageId(activePageId);

export const filterCommentsForPage = (
    comments: readonly CommentThread[],
    activePageId: unknown,
): CommentThread[] => comments.filter(comment => isCommentOnPage(comment, activePageId));

export const removeCommentsForPage = (
    comments: readonly CommentThread[],
    pageId: unknown,
): CommentThread[] => comments.filter(comment => !isCommentOnPage(comment, pageId));
