// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutPanel } from '../KeyboardShortcutPanel';

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

describe('KeyboardShortcutPanel', () => {
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
});
