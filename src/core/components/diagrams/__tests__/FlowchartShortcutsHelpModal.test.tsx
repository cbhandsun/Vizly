// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        }),
    });
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
});

const translations: Record<string, string> = {
    'designer.flowchartShortcuts.title': '流程图快捷键',
    'designer.flowchartShortcuts.subtitle': '流程图画布快捷键',
    'designer.flowchartShortcuts.searchPlaceholder': '搜索快捷键或动作...',
    'designer.flowchartShortcuts.clearSearch': '清除快捷键搜索',
    'designer.flowchartShortcuts.noResults': '未找到匹配的快捷键',
    'designer.flowchartShortcuts.table.action': '动作',
    'designer.flowchartShortcuts.table.shortcut': '快捷键',
    'designer.flowchartShortcuts.table.note': '备注',
    'designer.flowchartShortcuts.action.palette': '打开命令面板',
    'designer.flowchartShortcuts.action.canvasSearch': '搜索画布内容',
    'designer.flowchartShortcuts.action.findReplace': '查找并替换画布文本',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] ?? key,
    }),
}));

import { FlowchartShortcutsHelpModal } from '../FlowchartShortcutsHelpModal';

describe('FlowchartShortcutsHelpModal', () => {
    it('makes canvas search discoverable and filters the shortcut list', () => {
        render(<FlowchartShortcutsHelpModal open onClose={vi.fn()} />);

        const search = screen.getByRole('textbox', { name: '搜索快捷键或动作...' });
        expect(screen.getByText('搜索画布内容')).toBeTruthy();
        expect(screen.getByText('Ctrl+F')).toBeTruthy();

        fireEvent.change(search, { target: { value: '替换' } });

        expect(screen.getByText('查找并替换画布文本')).toBeTruthy();
        expect(screen.queryByText('搜索画布内容')).toBeNull();
        expect(screen.getByRole('button', { name: '清除快捷键搜索' })).toBeTruthy();

        fireEvent.change(search, { target: { value: '不存在的快捷键' } });
        expect(screen.getByText('未找到匹配的快捷键')).toBeTruthy();
    });

    it('renders inside the supplied diagram container', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        render(
            <FlowchartShortcutsHelpModal
                open
                onClose={vi.fn()}
                getContainer={() => container}
            />,
        );

        expect(within(container).getByRole('dialog')).toBeTruthy();
    });

    it('returns focus to the command entry when its previous owner was removed', async () => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.dataset.commandPaletteFocusReturn = '';
        trigger.textContent = '打开命令搜索';
        document.body.appendChild(trigger);

        const transientOwner = document.createElement('input');
        document.body.appendChild(transientOwner);
        transientOwner.focus();

        const onClose = vi.fn();
        render(<FlowchartShortcutsHelpModal open onClose={onClose} />);
        transientOwner.remove();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('does not restore focus to a non-interactive modal heading', async () => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.dataset.commandPaletteFocusReturn = '';
        document.body.appendChild(trigger);

        const heading = document.createElement('h1');
        heading.tabIndex = -1;
        document.body.appendChild(heading);
        heading.focus();

        render(<FlowchartShortcutsHelpModal open onClose={vi.fn()} />);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
});
