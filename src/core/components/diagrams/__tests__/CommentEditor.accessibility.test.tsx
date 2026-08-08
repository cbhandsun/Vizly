// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('../../../store/useDiagramStore', () => ({
    useDiagramStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'comment.markResolved': 'Mark as resolved',
            'comment.markUnresolved': 'Mark as unresolved',
            'comment.delete': 'Delete',
            'comment.replyPlaceholder': 'Reply to this comment...',
            'comment.replyLabel': 'Reply content',
            'comment.sendReply': 'Send',
        }[key] ?? key),
    }),
}));

import { CommentEditor } from '../CommentEditor';

describe('CommentEditor accessibility', () => {
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
        const reply = screen.getByRole('textbox', { name: 'Reply content' });
        expect(reply.getAttribute('placeholder')).toBe('Reply to this comment...');
        fireEvent.change(reply, { target: { value: 'Confirmed' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(storeState.updateComment).toHaveBeenCalledTimes(1);
    });
});
