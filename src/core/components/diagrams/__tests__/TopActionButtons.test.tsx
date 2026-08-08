// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const breakpointState = vi.hoisted(() => ({ md: true }));

vi.mock('antd', async () => {
    const actual = await vi.importActual<typeof import('antd')>('antd');
    return {
        ...actual,
        Grid: {
            ...actual.Grid,
            useBreakpoint: () => breakpointState,
        },
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : ({
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
            'designer.toolbar.fileGroup': '文件操作',
            'designer.toolbar.viewGroup': '视图控制',
            'common.settings': 'Settings',
        }[key] ?? key)),
    }),
}));

vi.mock('../ui/CollaborationAvatars', () => ({
    CollaborationAvatars: () => null,
}));

vi.mock('../ui/AdvancedExportModal', () => ({
    AdvancedExportModal: ({ onClose }: { onClose: () => void }) => (
        <button type="button" aria-label="关闭高级图表导出" onClick={onClose} />
    ),
}));

import { TopActionButtons } from '../TopActionButtons';

describe('TopActionButtons document menu', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        breakpointState.md = true;
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

    it.each(['ArrowDown', 'Enter', ' '])('opens with %s, focuses the first item, and closes with Escape', async key => {
        render(
            <TopActionButtons
                disablePortal
                onStartPresentation={vi.fn()}
            />,
        );

        const trigger = screen.getByRole('button', { name: '文档操作' });
        fireEvent.keyDown(trigger, { key });

        const firstItem = await screen.findByRole('menuitem', { name: /演示模式/ });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('runs a focused document action with Space and restores trigger focus', async () => {
        const onStartPresentation = vi.fn();
        render(
            <TopActionButtons
                disablePortal
                onStartPresentation={onStartPresentation}
            />,
        );

        const trigger = screen.getByRole('button', { name: '文档操作' });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        const firstItem = await screen.findByRole('menuitem', { name: /演示模式/ });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));

        fireEvent.keyDown(firstItem, { key: ' ' });

        expect(onStartPresentation).toHaveBeenCalledTimes(1);
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

    it('consolidates save into the 44px document menu on mobile', async () => {
        breakpointState.md = false;
        const onSaveToCloud = vi.fn().mockResolvedValue(undefined);
        render(
            <TopActionButtons
                disablePortal
                onSaveToCloud={onSaveToCloud}
                onStartPresentation={vi.fn()}
            />,
        );

        expect(screen.queryByRole('button', { name: '保存选项' })).toBeNull();
        const trigger = screen.getByRole('button', { name: '文档操作' });
        expect(trigger.className).toContain('w-[44px]');
        expect(trigger.className).toContain('min-h-[44px]');
        expect(trigger.style.width).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.minHeight).toBe('var(--commercial-touch-target, 44px)');

        fireEvent.click(trigger);

        const saveItem = await screen.findByRole('menuitem', { name: '保存到云端' });
        expect(saveItem).toBeTruthy();
        expect(await screen.findByRole('menuitem', { name: /演示模式/ })).toBeTruthy();
        expect(screen.getByText('文件操作')).toBeTruthy();
        expect(screen.getByText('视图控制')).toBeTruthy();
    });

    it('names both menus and associates each trigger with its controlled menu', async () => {
        render(
            <TopActionButtons
                disablePortal
                onSaveToCloud={vi.fn().mockResolvedValue(undefined)}
                onStartPresentation={vi.fn()}
            />,
        );

        const saveTrigger = screen.getByRole('button', { name: '保存选项' });
        fireEvent.click(saveTrigger);
        const saveMenu = await screen.findByRole('menu', { name: '保存选项' });
        expect(saveMenu.id).toBeTruthy();
        expect(saveTrigger.getAttribute('aria-controls')).toBe(saveMenu.id);

        fireEvent.keyDown(saveMenu, { key: 'Escape' });
        const documentTrigger = screen.getByRole('button', { name: '文档操作' });
        fireEvent.click(documentTrigger);
        const documentMenu = await screen.findByRole('menu', { name: '文档操作' });
        expect(documentMenu.id).toBeTruthy();
        expect(documentTrigger.getAttribute('aria-controls')).toBe(documentMenu.id);
    });

    it('suppresses the trigger tooltip while the document menu is open', async () => {
        render(
            <TopActionButtons
                disablePortal
                onStartPresentation={vi.fn()}
            />,
        );

        const trigger = screen.getByRole('button', { name: '文档操作' });
        fireEvent.mouseEnter(trigger);
        await waitFor(() => expect(trigger.classList.contains('ant-tooltip-open')).toBe(true));

        fireEvent.click(trigger);
        await screen.findByRole('menu', { name: '文档操作' });
        await waitFor(() => expect(trigger.classList.contains('ant-tooltip-open')).toBe(false));
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
        expect(trigger.hasAttribute('data-history-focus-return')).toBe(true);
        expect(trigger.hasAttribute('data-version-history-focus-return')).toBe(true);
        expect(trigger.hasAttribute('data-json-editor-focus-return')).toBe(true);
        expect(trigger.hasAttribute('data-command-palette-focus-return')).toBe(true);
        expect(trigger.getAttribute('data-settings-focus-return')).toBe('fallback');
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

    it('uses the active locale for the settings menu entry', async () => {
        render(
            <TopActionButtons
                disablePortal
                onOpenSettings={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '文档操作' }));
        expect(await screen.findByRole('menuitem', { name: 'Settings' })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: '设置' })).toBeNull();
    });

    it('keeps comment and read-only modes visible with direct recovery actions', async () => {
        const pendingFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            pendingFrames.push(callback);
            return 1;
        });

        const setIsCommentMode = vi.fn();
        const commentView = render(
            <TopActionButtons
                disablePortal
                isCommentMode
                setIsCommentMode={setIsCommentMode}
            />,
        );

        const commentTrigger = screen.getByRole('button', { name: '文档操作' });
        const commentExit = screen.getByRole('button', { name: '退出评论模式' });
        commentExit.focus();
        fireEvent.click(commentExit);
        expect(setIsCommentMode).toHaveBeenCalledWith(false);
        expect(document.activeElement).not.toBe(commentTrigger);
        pendingFrames.shift()?.(0);
        await waitFor(() => expect(document.activeElement).toBe(commentTrigger));
        commentView.unmount();

        const onReadonlyChange = vi.fn();
        render(
            <TopActionButtons
                disablePortal
                isReadonly
                onReadonlyChange={onReadonlyChange}
            />,
        );

        const readonlyTrigger = screen.getByRole('button', { name: '文档操作' });
        const readonlyExit = screen.getByRole('button', { name: '解锁画布' });
        readonlyExit.focus();
        fireEvent.click(readonlyExit);
        expect(onReadonlyChange).toHaveBeenCalledWith(false);
        expect(document.activeElement).not.toBe(readonlyTrigger);
        pendingFrames.shift()?.(0);
        await waitFor(() => expect(document.activeElement).toBe(readonlyTrigger));
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

    it('returns focus to document actions after closing the plugin manager', async () => {
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });

        const ControlledTopActions = () => {
            const [pluginManagerVisible, setPluginManagerVisible] = React.useState(false);
            return (
                <TopActionButtons
                    disablePortal
                    pluginManagerVisible={pluginManagerVisible}
                    setPluginManagerVisible={setPluginManagerVisible}
                />
            );
        };
        render(<ControlledTopActions />);

        const trigger = screen.getByRole('button', { name: '文档操作' });
        fireEvent.click(trigger);
        fireEvent.click(await screen.findByRole('menuitem', { name: /插件管理/ }));
        const closeButton = await screen.findByRole('button', { name: 'common.close' });
        closeButton.focus();
        expect(document.activeElement).toBe(closeButton);

        fireEvent.click(closeButton);
        expect(document.activeElement).not.toBe(trigger);
        restoreFocus?.(0);

        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('returns focus to the advanced-export launcher after the modal closes', async () => {
        let restoreFocus: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            restoreFocus = callback;
            return 1;
        });

        const ControlledTopActions = () => {
            const [exportModalVisible, setExportModalVisible] = React.useState(true);
            return (
                <TopActionButtons
                    disablePortal
                    exportModalVisible={exportModalVisible}
                    setExportModalVisible={setExportModalVisible}
                />
            );
        };

        render(
            <>
                <button type="button" data-advanced-export-focus-return="true">更多操作</button>
                <ControlledTopActions />
            </>,
        );

        const trigger = screen.getByRole('button', { name: '更多操作' });
        const closeButton = await screen.findByRole('button', { name: '关闭高级图表导出' });
        closeButton.focus();
        fireEvent.click(closeButton);
        expect(document.activeElement).not.toBe(trigger);

        restoreFocus?.(0);
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
});
