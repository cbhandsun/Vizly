// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PageTabs } from '../PageTabs';

describe('PageTabs', () => {
    it('exposes keyboard-operable page tabs and named page actions', () => {
        const onSwitchPage = vi.fn();
        const onAddPage = vi.fn();
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-1"
                onSwitchPage={onSwitchPage}
                onAddPage={onAddPage}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
            />,
        );

        expect(screen.getByRole('tablist', { name: '页面' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: '页面 1' }).getAttribute('aria-selected')).toBe('true');
        const secondTab = screen.getByRole('tab', { name: '页面 2' });
        fireEvent.keyDown(secondTab, { key: 'Enter' });
        expect(onSwitchPage).toHaveBeenCalledWith('page-2');

        fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
        expect(onAddPage).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '删除页面 页面 2' })).toBeTruthy();
    });

    it('labels the inline rename input', () => {
        render(
            <PageTabs
                pages={[{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
            />,
        );

        fireEvent.doubleClick(screen.getByRole('tab', { name: '页面 1' }));
        expect(screen.getByRole('textbox', { name: '重命名页面 页面 1' })).toBeTruthy();
    });
});
