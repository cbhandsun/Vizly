// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? ({
            'designer.toolbar.documentActions': '文档操作',
            'designer.toolbar.presentationMode': '演示模式',
            'designer.toolbar.pluginManager': '插件管理',
            'designer.toolbar.commentMode': '评论模式',
            'designer.toolbar.operationHistory': '操作历史',
            'designer.toolbar.versionHistory': '版本快照',
        }[key] ?? key),
    }),
}));

vi.mock('../ui/CollaborationAvatars', () => ({
    CollaborationAvatars: () => null,
}));

import { TopActionButtons } from '../TopActionButtons';

describe('TopActionButtons document menu', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockImplementation(() => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    it('opens with ArrowDown, focuses the first item, and closes with Escape', async () => {
        render(
            <TopActionButtons
                disablePortal
                onStartPresentation={vi.fn()}
            />,
        );

        const trigger = screen.getByRole('button', { name: '文档操作' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        const firstItem = await screen.findByRole('menuitem', { name: /演示模式/ });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('separates operation history from version snapshots and invokes the snapshot entry', async () => {
        const onOpenVersionHistory = vi.fn();
        render(
            <TopActionButtons
                disablePortal
                onShowHistory={vi.fn()}
                onOpenVersionHistory={onOpenVersionHistory}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '文档操作' }));
        expect(await screen.findByRole('menuitem', { name: /操作历史/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: /版本快照/ }));
        expect(onOpenVersionHistory).toHaveBeenCalledTimes(1);
    });
});
