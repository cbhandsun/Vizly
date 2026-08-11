// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
        matches: false,
        media: '',
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

const storeState = vi.hoisted(() => ({
    updateComment: vi.fn(),
    removeComment: vi.fn(),
    user: { id: 'user-1', name: 'Alex', color: '#3b82f6' },
    comments: [] as Array<{
        id: string;
        content: string;
        x: number;
        y: number;
        color: string;
        authorId: string;
        authorName: string;
        authorColor: string;
        createdAt: number;
        isResolved: boolean;
        replies: unknown[];
    }>,
}));

vi.mock('../../../store/useDiagramStore', () => ({
    useDiagramStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@xyflow/react', () => ({
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: string | { content?: string }) => {
            if (key === 'comment.view' && typeof options === 'object') {
                return `View comment: ${options.content ?? ''}`;
            }
            return ({
            'comment.markResolved': 'Mark as resolved',
            'comment.markUnresolved': 'Mark as unresolved',
            'comment.delete': 'Delete',
            'comment.replyPlaceholder': 'Reply to this comment...',
            'comment.replyLabel': 'Reply content',
            'comment.sendReply': 'Send',
            'comment.editDialog': 'Edit comment',
            'comment.deleteConfirmTitle': 'Delete this comment?',
            'comment.deleteConfirmDescription': 'This action cannot be undone.',
            'comment.validation.required': 'Enter comment content',
            'comment.validation.tooLong': 'Comment content is too long',
            'common.delete': 'Delete',
            'common.cancel': 'Cancel',
            }[key] ?? (typeof options === 'string' ? options : key));
        },
    }),
}));

import { CommentEditor } from '../CommentEditor';
import CommentNode from '../../custom-nodes/CommentNode';

describe('CommentEditor accessibility', () => {
    beforeEach(() => {
        storeState.updateComment.mockReset();
        storeState.removeComment.mockReset();
        storeState.comments = [];
    });

    it('localizes and labels every interactive control', () => {
        render(
            <CommentEditor
                comment={{
                    id: 'comment-1',
                    content: 'Check shipment status',
                    x: 20,
                    y: 30,
                    color: '#facc15',
                    authorId: 'user-2',
                    authorName: 'Sam',
                    authorColor: '#7c3aed',
                    createdAt: Date.now(),
                    isResolved: false,
                    replies: [],
                }}
            />,
        );

        expect(screen.getByRole('button', { name: 'Mark as resolved' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
        expect(screen.getByRole('dialog', { name: 'Edit comment' })).toBeTruthy();
        const reply = screen.getByRole('textbox', { name: 'Reply content' });
        expect(reply.getAttribute('placeholder')).toBe('Reply to this comment...');
        expect(reply.getAttribute('maxlength')).toBe('4000');
        fireEvent.change(reply, { target: { value: '  Confirmed\u200B  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(storeState.updateComment).toHaveBeenCalledTimes(1);
        expect(storeState.updateComment).toHaveBeenCalledWith('comment-1', {
            replies: [expect.objectContaining({ content: 'Confirmed' })],
        });
        expect(screen.getByRole('button', { name: 'Mark as resolved' }).style.minHeight).toBe('44px');
    });

    it('keeps blank replies local and exposes the validation error', () => {
        render(
            <CommentEditor
                comment={{
                    id: 'comment-blank-reply',
                    content: 'Check shipment status',
                    x: 20,
                    y: 30,
                    color: '#facc15',
                    authorId: 'user-2',
                    authorName: 'Sam',
                    authorColor: '#7c3aed',
                    createdAt: Date.now(),
                    isResolved: false,
                    replies: [],
                }}
            />,
        );

        const reply = screen.getByRole('textbox', { name: 'Reply content' });
        fireEvent.change(reply, { target: { value: '   ' } });
        fireEvent.keyDown(reply, { key: 'Enter' });

        expect(storeState.updateComment).not.toHaveBeenCalled();
        expect(reply.getAttribute('aria-invalid')).toBe('true');
        expect(reply.getAttribute('aria-describedby')).toBe('comment-reply-error');
        expect(screen.getByRole('alert').textContent).toBe('Enter comment content');
        expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
    });

    it('requires confirmation before deleting the comment thread', () => {
        const onClose = vi.fn();
        render(
            <CommentEditor
                comment={{
                    id: 'comment-delete',
                    content: 'Delete only after confirmation',
                    x: 20,
                    y: 30,
                    color: '#facc15',
                    authorId: 'user-2',
                    authorName: 'Sam',
                    authorColor: '#7c3aed',
                    createdAt: Date.now(),
                    isResolved: false,
                    replies: [],
                }}
                onClose={onClose}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(storeState.removeComment).not.toHaveBeenCalled();
        const confirmation = screen.getByText('Delete this comment?').closest('.ant-popover');
        expect(confirmation).toBeTruthy();
        fireEvent.click(within(confirmation as HTMLElement).getByRole('button', { name: 'Delete' }));
        expect(storeState.removeComment).toHaveBeenCalledWith('comment-delete');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('makes legacy comment pins keyboard-operable with dialog state', () => {
        storeState.comments = [{
            id: 'comment-node',
            content: 'Keyboard accessible pin',
            x: 20,
            y: 30,
            color: '#facc15',
            authorId: 'user-2',
            authorName: 'Sam',
            authorColor: '#7c3aed',
            createdAt: Date.now(),
            isResolved: false,
            replies: [],
        }];
        render(
            <CommentNode
                id="comment-node"
                data={{}}
                type="vizly:comment"
                dragging={false}
                zIndex={0}
                selectable
                deletable
                selected={false}
                draggable
                isConnectable={false}
                positionAbsoluteX={0}
                positionAbsoluteY={0}
            />,
        );

        const pin = screen.getByRole('button', { name: 'View comment: Keyboard accessible pin' });
        expect(pin.getAttribute('aria-haspopup')).toBe('dialog');
        expect(pin.getAttribute('aria-expanded')).toBe('false');
        expect(pin.style.width).toBe('44px');
        fireEvent.click(pin);
        expect(pin.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('dialog', { name: 'Edit comment' })).toBeTruthy();
    });
});
