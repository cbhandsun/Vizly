// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageTabs } from '../PageTabs';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                'designer.pages.tabList': '页面',
                'designer.pages.new': '新建页面',
                'designer.pages.rename': '重命名页面 {{name}}',
                'designer.pages.renameAction': '重命名页面 {{name}}',
                'designer.pages.delete': '删除页面 {{name}}',
                'designer.pages.deleteConfirm': '删除「{{name}}」？',
                'designer.pages.deleteAction': '删除',
                'common.cancel': '取消',
            };
            const template = translations[key] ?? key;
            return template.replace('{{name}}', String(options?.name ?? ''));
        },
    }),
}));

class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());

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

        secondTab.focus();
        fireEvent.keyDown(secondTab, { key: 'ArrowLeft' });
        const firstTab = screen.getByRole('tab', { name: '页面 1' });
        expect(onSwitchPage).toHaveBeenLastCalledWith('page-1');
        expect(document.activeElement).toBe(firstTab);

        fireEvent.keyDown(firstTab, { key: 'End' });
        expect(onSwitchPage).toHaveBeenLastCalledWith('page-2');
        expect(document.activeElement).toBe(secondTab);

        fireEvent.keyDown(secondTab, { key: 'ArrowRight' });
        expect(onSwitchPage).toHaveBeenLastCalledWith('page-1');
        expect(document.activeElement).toBe(firstTab);

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

    it('offers an explicit rename action for the active page', () => {
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

        fireEvent.click(screen.getByRole('button', { name: '重命名页面 页面 1' }));
        expect(screen.getByRole('textbox', { name: '重命名页面 页面 1' })).toBeTruthy();
    });

    it('keeps the inactive page unchanged when deletion is cancelled', async () => {
        const onSwitchPage = vi.fn();
        const onDeletePage = vi.fn();
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-1"
                onSwitchPage={onSwitchPage}
                onAddPage={vi.fn()}
                onDeletePage={onDeletePage}
                onRenamePage={vi.fn()}
            />,
        );

        const deleteButton = screen.getByRole('button', { name: '删除页面 页面 2' });
        expect(deleteButton.classList.contains('page-tabs__delete')).toBe(true);
        fireEvent.click(deleteButton);
        expect(await screen.findByText('删除「页面 2」？')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));

        await waitFor(() => expect(deleteButton.getAttribute('aria-describedby')).toBeNull());
        expect(onSwitchPage).not.toHaveBeenCalled();
        expect(onDeletePage).not.toHaveBeenCalled();
    });

    it('blocks page mutations while the initial diagram is loading', () => {
        const onSwitchPage = vi.fn();
        const onAddPage = vi.fn();
        render(
            <PageTabs
                pages={[{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]}
                activePageId="page-1"
                onSwitchPage={onSwitchPage}
                onAddPage={onAddPage}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
                disabled
            />,
        );

        const tab = screen.getByRole('tab', { name: '页面 1' });
        const add = screen.getByRole('button', { name: '新建页面' });
        expect(tab.hasAttribute('disabled')).toBe(true);
        expect(add.hasAttribute('disabled')).toBe(true);
        fireEvent.click(add);
        fireEvent.keyDown(tab, { key: 'Enter' });
        expect(onAddPage).not.toHaveBeenCalled();
        expect(onSwitchPage).not.toHaveBeenCalled();
    });
});
