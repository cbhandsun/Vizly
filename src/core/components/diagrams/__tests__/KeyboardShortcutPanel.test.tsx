// @vitest-environment jsdom
import React, { useState } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutPanel } from '../KeyboardShortcutPanel';
import en from '../../../../locales/en.json';
import i18n from '../../../../i18n';

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

afterEach(() => {
    document.body.innerHTML = '';
});

beforeEach(async () => {
    await i18n.changeLanguage('zh');
});

describe('KeyboardShortcutPanel', () => {
    it('focuses the shortcut search when the panel opens', async () => {
        render(<KeyboardShortcutPanel visible onClose={vi.fn()} />);

        const search = screen.getByRole('textbox', { name: '搜索快捷键或动作' });
        await waitFor(() => expect(document.activeElement).toBe(search));
    });

    it('makes canvas search shortcuts discoverable through the live menu panel', () => {
        render(<KeyboardShortcutPanel visible onClose={vi.fn()} />);

        const search = screen.getByRole('textbox', { name: '搜索快捷键或动作' });
        expect(screen.getByText('搜索画布内容')).toBeTruthy();
        expect(screen.getByText('查找并替换画布文本')).toBeTruthy();

        fireEvent.change(search, { target: { value: '画布' } });
        expect(screen.getByText('搜索画布内容')).toBeTruthy();
        expect(screen.queryByText('撤销')).toBeNull();

        fireEvent.change(search, { target: { value: '不存在的动作' } });
        expect(screen.getByRole('status').textContent).toContain('未找到匹配的快捷键');
    });

    it('includes the workspace shortcuts formerly exposed by the command entry', () => {
        render(<KeyboardShortcutPanel visible onClose={vi.fn()} />);

        expect(screen.getByText('聚焦左侧菜单搜索')).toBeTruthy();
        expect(screen.getByText('展开/收起左侧菜单')).toBeTruthy();
        expect(screen.getByText('显示/隐藏调试面板')).toBeTruthy();
        expect(screen.getByText('打开更多设置')).toBeTruthy();
        expect(screen.getByText('退出全屏')).toBeTruthy();
    });

    it('localizes titles, groups, actions, filtering, and empty state in English', async () => {
        const englishI18n = createInstance();
        await englishI18n.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { translation: en } },
        });

        render(
            <I18nextProvider i18n={englishI18n}>
                <KeyboardShortcutPanel visible onClose={vi.fn()} />
            </I18nextProvider>,
        );

        expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
        expect(screen.getByText('General')).toBeTruthy();
        expect(screen.getByText('Search canvas content')).toBeTruthy();
        const search = screen.getByRole('textbox', { name: 'Search shortcuts or actions' });

        fireEvent.change(search, { target: { value: 'canvas' } });
        expect(screen.getByText('Search canvas content')).toBeTruthy();
        expect(screen.getByText('Find and replace canvas text')).toBeTruthy();
        expect(screen.queryByText('Undo')).toBeNull();

        fireEvent.change(search, { target: { value: 'missing action' } });
        expect(screen.getByText('No matching shortcuts')).toBeTruthy();
    });

    it('closes when the help shortcut is pressed again inside the open panel', async () => {
        const onClose = vi.fn();
        render(<KeyboardShortcutPanel visible onClose={onClose} />);

        await act(async () => {
            await Promise.resolve();
        });

        const search = screen.getByRole('textbox', { name: '搜索快捷键或动作' });
        search.focus();
        fireEvent.keyDown(search, { key: '?' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('also closes for browsers that report the help chord as Shift+Slash', async () => {
        const onClose = vi.fn();
        render(<KeyboardShortcutPanel visible onClose={onClose} />);

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.keyDown(window, { key: '/', shiftKey: true });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('returns focus to the persistent trigger after Escape closes the panel', async () => {
        const Harness = () => {
            const [visible, setVisible] = useState(false);
            return (
                <>
                    <button type="button" onClick={() => setVisible(true)}>打开快捷键帮助</button>
                    {visible && (
                        <KeyboardShortcutPanel
                            visible
                            onClose={() => setVisible(false)}
                        />
                    )}
                </>
            );
        };

        render(<Harness />);
        const trigger = screen.getByRole('button', { name: '打开快捷键帮助' });
        trigger.focus();
        fireEvent.click(trigger);

        const closeButton = await screen.findByRole('button', { name: 'Close' });
        fireEvent.keyDown(closeButton, { key: 'Escape' });

        await waitFor(() => expect(screen.queryByText('键盘快捷键')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('returns focus to a marked programmatic document heading after the help shortcut closes', async () => {
        const heading = document.createElement('h1');
        heading.tabIndex = -1;
        heading.dataset.shortcutFocusReturn = 'true';
        document.body.appendChild(heading);
        heading.focus();

        const onClose = vi.fn();
        render(<KeyboardShortcutPanel visible onClose={onClose} />);

        await act(async () => {
            await Promise.resolve();
        });
        fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索快捷键或动作' }), { key: '?' });

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(document.activeElement).toBe(heading));

        heading.remove();
    });

    it('falls back to the command entry when the prior modal focus owner is not interactive', async () => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.dataset.commandPaletteFocusReturn = '';
        document.body.appendChild(trigger);

        const modalHeading = document.createElement('h1');
        modalHeading.tabIndex = -1;
        document.body.appendChild(modalHeading);
        modalHeading.focus();

        const onClose = vi.fn();
        render(<KeyboardShortcutPanel visible onClose={onClose} />);

        fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('does not restore focus into the command palette while it is leaving the DOM', async () => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.dataset.commandPaletteFocusReturn = '';
        document.body.appendChild(trigger);

        const priorDialog = document.createElement('div');
        priorDialog.setAttribute('role', 'dialog');
        const priorOption = document.createElement('button');
        priorDialog.appendChild(priorOption);
        document.body.appendChild(priorDialog);
        priorOption.focus();

        render(<KeyboardShortcutPanel visible onClose={vi.fn()} />);
        fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('does not override focus already restored by the parent workflow', async () => {
        const fallback = document.createElement('button');
        fallback.type = 'button';
        fallback.dataset.commandPaletteFocusReturn = '';
        document.body.appendChild(fallback);

        const parentTarget = document.createElement('h1');
        parentTarget.tabIndex = -1;
        document.body.appendChild(parentTarget);

        const priorDialog = document.createElement('div');
        priorDialog.setAttribute('role', 'dialog');
        const priorOption = document.createElement('button');
        priorDialog.appendChild(priorOption);
        document.body.appendChild(priorDialog);
        priorOption.focus();

        render(
            <KeyboardShortcutPanel
                visible
                onClose={() => parentTarget.focus()}
            />,
        );
        fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(parentTarget));

        fallback.remove();
        parentTarget.remove();
        priorDialog.remove();
    });
});
