// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback ?? ({
            'designer.toolbar.documentActions': '文档操作',
            'designer.toolbar.saveOptions': '保存选项',
            'designer.toolbar.saveToCloud': '保存到云端',
            'designer.toolbar.presentationMode': '演示模式',
            'designer.toolbar.pluginManager': '插件管理',
            'designer.toolbar.commentMode': '评论模式',
            'designer.toolbar.commentModeExit': '退出评论模式',
            'designer.toolbar.commentModeStatus': '评论模式 · 退出',
            'designer.toolbar.commentModeHint': '点击画布添加批注',
            'designer.toolbar.readonlyStatus': '画布已锁定 · 仅可查看',
            'designer.toolbar.readonlyStatusAction': '已锁定 · 解锁',
            'designer.toolbar.lockCanvas': '锁定画布',
            'designer.toolbar.unlockCanvas': '解锁画布',
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

    it('opens save options from the keyboard and runs the focused item with Space', async () => {
        const onSaveToCloud = vi.fn().mockResolvedValue(undefined);
        render(
            <TopActionButtons
                disablePortal
                onSaveToCloud={onSaveToCloud}
            />,
        );

        const trigger = screen.getByRole('button', { name: '保存选项' });
        fireEvent.keyDown(trigger, { key: 'Enter' });

        const saveItem = await screen.findByRole('menuitem', { name: '保存到云端' });
        await waitFor(() => expect(document.activeElement).toBe(saveItem));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(saveItem, { key: ' ' });

        expect(onSaveToCloud).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('exposes stable focus-return targets for document modes', () => {
        render(
            <TopActionButtons
                disablePortal
                onStartPresentation={vi.fn()}
            />,
        );

        const trigger = screen.getByRole('button', { name: '文档操作' });
        expect(trigger.hasAttribute('data-presentation-focus-return')).toBe(true);
        expect(trigger.hasAttribute('data-diff-focus-return')).toBe(true);
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

    it('keeps comment and read-only modes visible with direct recovery actions', async () => {
        const setIsCommentMode = vi.fn();
        const commentView = render(
            <TopActionButtons
                disablePortal
                isCommentMode
                setIsCommentMode={setIsCommentMode}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '退出评论模式' }));
        expect(setIsCommentMode).toHaveBeenCalledWith(false);
        commentView.unmount();

        const onReadonlyChange = vi.fn();
        render(
            <TopActionButtons
                disablePortal
                isReadonly
                onReadonlyChange={onReadonlyChange}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '解锁画布' }));
        expect(onReadonlyChange).toHaveBeenCalledWith(false);
    });

    it('exits comment mode before locking the canvas', async () => {
        const setIsCommentMode = vi.fn();
        const onReadonlyChange = vi.fn();
        render(
            <TopActionButtons
                disablePortal
                isCommentMode
                setIsCommentMode={setIsCommentMode}
                onReadonlyChange={onReadonlyChange}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '文档操作' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /锁定画布/ }));

        expect(setIsCommentMode).toHaveBeenCalledWith(false);
        expect(onReadonlyChange).toHaveBeenCalledWith(true);
    });
});
