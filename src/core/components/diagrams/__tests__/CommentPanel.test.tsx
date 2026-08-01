// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = vi.hoisted(() => ({
    comments: [] as Array<{
        id: string;
        content: string;
        authorName: string;
        authorColor: string;
        createdAt: number;
        isResolved: boolean;
        replies: unknown[];
        x: number;
        y: number;
    }>,
    removeComment: vi.fn(),
    updateComment: vi.fn(),
    setActiveCommentId: vi.fn(),
    isCommentMode: false,
    setIsCommentMode: vi.fn(),
}));

vi.mock('../../../store/useDiagramStore', () => ({
    useDiagramStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({ setCenter: vi.fn() }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

import { CommentPanel } from '../CommentPanel';

describe('CommentPanel', () => {
    beforeEach(() => {
        storeState.comments = [];
        storeState.removeComment.mockReset();
        storeState.updateComment.mockReset();
        storeState.setActiveCommentId.mockReset();
        storeState.isCommentMode = false;
        storeState.setIsCommentMode.mockReset();
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: false,
                media: '',
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
    });

    it('exposes touch-sized filters with their selected state', () => {
        render(<CommentPanel />);

        const unresolved = screen.getByRole('button', { name: 'comment.filterUnresolved' });
        const resolved = screen.getByRole('button', { name: 'comment.filterResolved' });
        expect(unresolved.getAttribute('aria-pressed')).toBe('true');
        expect(unresolved.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
        expect(resolved.getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(resolved);
        expect(resolved.getAttribute('aria-pressed')).toBe('true');
        expect(unresolved.getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByRole('textbox', { name: 'comment.searchPlaceholder' })).toBeTruthy();
    });

    it('offers a direct path to create the first comment', () => {
        render(<CommentPanel />);

        const addFirst = screen.getByRole('button', { name: 'comment.addFirst' });
        expect(addFirst.getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(addFirst);
        expect(storeState.setIsCommentMode).toHaveBeenCalledWith(true);
    });

    it('lets users recover from filters that have no results', () => {
        storeState.comments = [{
            id: 'comment-1',
            content: '已解决反馈',
            authorName: '测试用户',
            authorColor: '#3b82f6',
            createdAt: Date.now(),
            isResolved: true,
            replies: [],
            x: 10,
            y: 20,
        }];
        render(<CommentPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'comment.clearFilters' }));
        expect(screen.getByText('已解决反馈')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'comment.filterAll' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('requires confirmation before deleting a comment', async () => {
        storeState.comments = [{
            id: 'comment-1',
            content: '需要确认删除',
            authorName: '测试用户',
            authorColor: '#3b82f6',
            createdAt: Date.now(),
            isResolved: false,
            replies: [],
            x: 10,
            y: 20,
        }];
        render(<CommentPanel />);

        fireEvent.click(screen.getByRole('button', { name: 'comment.delete' }));
        expect(storeState.removeComment).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: /删\s*除/ }));
        expect(storeState.removeComment).toHaveBeenCalledWith('comment-1');
    });
});
