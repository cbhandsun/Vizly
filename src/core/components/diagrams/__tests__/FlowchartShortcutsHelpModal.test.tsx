// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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
    'designer.flowchartShortcuts.action.canvasSearch': '搜索画布节点',
    'designer.flowchartShortcuts.action.findReplace': '查找并替换节点文本',
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
        expect(screen.getByText('搜索画布节点')).toBeTruthy();
        expect(screen.getByText('Ctrl+F')).toBeTruthy();

        fireEvent.change(search, { target: { value: '替换' } });

        expect(screen.getByText('查找并替换节点文本')).toBeTruthy();
        expect(screen.queryByText('搜索画布节点')).toBeNull();
        expect(screen.getByRole('button', { name: '清除快捷键搜索' })).toBeTruthy();

        fireEvent.change(search, { target: { value: '不存在的快捷键' } });
        expect(screen.getByText('未找到匹配的快捷键')).toBeTruthy();
    });
});
