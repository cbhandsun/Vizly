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
        pageId?: string;
    }>,
    removeComment: vi.fn(),
    updateComment: vi.fn(),
    setActiveCommentId: vi.fn(),
    isCommentMode: false,
    setIsCommentMode: vi.fn(),
}));
const reactFlowMocks = vi.hoisted(() => ({ setCenter: vi.fn() }));

vi.mock('../../../store/useDiagramStore', () => ({
    useDiagramStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));
vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({ setCenter: reactFlowMocks.setCenter }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: string | { name?: string }) => {
            if (key === 'comment.pageScope' && typeof options === 'object') {
                return `当前页面：${options.name ?? ''}`;
            }
            return typeof options === 'string' ? options : key;
        },
    }),
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
        reactFlowMocks.setCenter.mockReset();
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
        const onStartCommentMode = vi.fn();
        render(<CommentPanel onStartCommentMode={onStartCommentMode} />);

        const addFirst = screen.getByRole('button', { name: 'comment.addFirst' });
        expect(addFirst.getAttribute('aria-pressed')).toBe('false');
        expect(addFirst.style.minHeight).toBe('var(--commercial-touch-target, 44px)');

        fireEvent.click(addFirst);
        expect(storeState.setIsCommentMode).toHaveBeenCalledWith(true);
        expect(onStartCommentMode).toHaveBeenCalledTimes(1);
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

    it('does not refocus the canvas when a keyboard user activates a comment action', () => {
        storeState.comments = [{
            id: 'comment-1',
            content: '键盘操作评论',
            authorName: '测试用户',
            authorColor: '#3b82f6',
            createdAt: Date.now(),
            isResolved: false,
            replies: [],
            x: 10,
            y: 20,
        }];
        render(<CommentPanel />);

        const resolveButton = screen.getByRole('button', { name: 'comment.markResolved' });
        fireEvent.keyDown(resolveButton, { key: 'Enter' });

        expect(reactFlowMocks.setCenter).not.toHaveBeenCalled();
        expect(storeState.setActiveCommentId).not.toHaveBeenCalled();

        const row = screen.getByLabelText('comment.focus: 键盘操作评论');
        fireEvent.keyDown(row, { key: 'Enter' });

        expect(reactFlowMocks.setCenter).toHaveBeenCalledWith(26, 36, {
            zoom: 1.5,
            duration: 800,
        });
        expect(storeState.setActiveCommentId).toHaveBeenCalledWith('comment-1');
    });

    it('shows only comments that belong to the active page and names the scope', () => {
        storeState.comments = [{
            id: 'legacy-page-1',
            content: '页面 1 历史评论',
            authorName: '测试用户',
            authorColor: '#3b82f6',
            createdAt: 1,
            isResolved: false,
            replies: [],
            x: 10,
            y: 20,
        }, {
            id: 'page-2-comment',
            content: '页面 2 专属评论',
            authorName: '测试用户',
            authorColor: '#3b82f6',
            createdAt: 2,
            isResolved: false,
            replies: [],
            x: 30,
            y: 40,
            pageId: 'page-2',
        }];

        render(<CommentPanel activePageId="page-2" activePageName="页面 2" />);

        expect(screen.getByText('当前页面：页面 2')).toBeTruthy();
        expect(screen.getByText('页面 2 专属评论')).toBeTruthy();
        expect(screen.queryByText('页面 1 历史评论')).toBeNull();
    });
});
