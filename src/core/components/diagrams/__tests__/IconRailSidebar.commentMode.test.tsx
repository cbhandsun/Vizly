// @vitest-environment jsdom

import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDiagramStore } from '../../../store/useDiagramStore';
import { IconRailSidebar } from '../IconRailSidebar';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string | { name?: string }) => {
            const labels: Record<string, string> = {
                'designer.sidebar.comments': 'Comments and feedback',
                'comment.addFirst': 'Add the first comment',
                'comment.addFirstHint': 'Add feedback directly on the canvas.',
                'comment.emptyAll': 'No comments yet',
                'comment.filterAll': 'All',
                'comment.filterResolved': 'Resolved',
                'comment.filterUnresolved': 'Unresolved',
                'comment.modeActive': 'Comment mode is active',
                'comment.pageScope': 'Current page',
                'comment.searchPlaceholder': 'Search comments or authors...',
            };
            return labels[key] ?? (typeof fallback === 'string' ? fallback : key);
        },
    }),
}));

describe('IconRailSidebar mobile comment entry', () => {
    beforeEach(() => {
        useDiagramStore.setState({ comments: [], isCommentMode: false });
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
    });

    it('closes the mobile drawer when the user starts placing the first comment', async () => {
        render(
            <ReactFlowProvider>
                <IconRailSidebar isMobile autoOpenShapes={false} />
            </ReactFlowProvider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Comments and feedback' }));
        expect(await screen.findByRole('dialog', { name: 'Comments and feedback' })).toBeTruthy();

        fireEvent.click(await screen.findByRole('button', { name: 'Add the first comment' }));

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Comments and feedback' })).toBeNull();
            expect(useDiagramStore.getState().isCommentMode).toBe(true);
        });
    });
});
