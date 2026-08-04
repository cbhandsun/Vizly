import { describe, expect, it } from 'vitest';

import type { CommentThread } from '../../../store/useDiagramStore';
import {
    DEFAULT_COMMENT_PAGE_ID,
    MAX_COMMENT_PAGE_ID_LENGTH,
    filterCommentsForPage,
    isCommentOnPage,
    normalizeCommentPageId,
    removeCommentsForPage,
} from '../commentPageScope';

const createComment = (id: string, pageId?: string): CommentThread => ({
    id,
    pageId,
    x: 0,
    y: 0,
    authorId: 'user-1',
    authorName: 'Test User',
    authorColor: '#1677ff',
    content: id,
    createdAt: 1,
    isResolved: false,
    color: '#facc15',
    replies: [],
});

describe('comment page scope', () => {
    it('normalizes external page identifiers and preserves legacy comments on page 1', () => {
        expect(normalizeCommentPageId('  page-2  ')).toBe('page-2');
        expect(normalizeCommentPageId(undefined)).toBe(DEFAULT_COMMENT_PAGE_ID);
        expect(normalizeCommentPageId('')).toBe(DEFAULT_COMMENT_PAGE_ID);
        expect(normalizeCommentPageId('x'.repeat(MAX_COMMENT_PAGE_ID_LENGTH + 1))).toBe(DEFAULT_COMMENT_PAGE_ID);
    });

    it('filters comments to the active page without leaking sibling page feedback', () => {
        const comments = [
            createComment('legacy'),
            createComment('page-2-comment', 'page-2'),
            createComment('page-3-comment', 'page-3'),
        ];

        expect(filterCommentsForPage(comments, 'page-2').map(comment => comment.id)).toEqual(['page-2-comment']);
        expect(filterCommentsForPage(comments, 'page-1').map(comment => comment.id)).toEqual(['legacy']);
        expect(isCommentOnPage(comments[1], ' page-2 ')).toBe(true);
    });

    it('removes only comments owned by a deleted page', () => {
        const comments = [
            createComment('legacy'),
            createComment('page-2-a', 'page-2'),
            createComment('page-2-b', 'page-2'),
            createComment('page-3', 'page-3'),
        ];

        expect(removeCommentsForPage(comments, 'page-2').map(comment => comment.id)).toEqual(['legacy', 'page-3']);
        expect(removeCommentsForPage(comments, 'page-1').map(comment => comment.id)).toEqual(['page-2-a', 'page-2-b', 'page-3']);
    });
});
