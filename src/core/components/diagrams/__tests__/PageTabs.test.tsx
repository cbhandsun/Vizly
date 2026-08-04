// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageTabs } from '../PageTabs';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                'designer.pages.tabList': '页面',
                'designer.pages.new': '新建页面',
                'designer.pages.limitReached': '最多可创建 {{count}} 个页面',
                'designer.pages.rename': '重命名页面 {{name}}',
                'designer.pages.renameAction': '重命名页面 {{name}}',
                'designer.pages.nameRequired': '页面名称不能为空',
                'designer.pages.duplicateName': '页面名称不能重复',
                'designer.pages.renameFailed': '页面重命名失败，请重试',
                'designer.pages.delete': '删除页面 {{name}}',
                'designer.pages.deleteConfirm': '删除「{{name}}」？',
                'designer.pages.deleteDescription': '此页面及其全部内容将永久删除，且无法撤销。',
                'designer.pages.deleteAction': '删除',
                'common.cancel': '取消',
            };
            const template = translations[key] ?? key;
            return template
                .replace('{{name}}', String(options?.name ?? ''))
                .replace('{{count}}', String(options?.count ?? ''));
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

    it('keeps duplicate page names in edit mode and exposes a visible error', async () => {
        const onRenamePage = vi.fn(() => true);
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-2"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRenamePage={onRenamePage}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '重命名页面 页面 2' }));
        const input = screen.getByRole('textbox', { name: '重命名页面 页面 2' });
        fireEvent.change(input, { target: { value: ' 页面 1 ' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(await screen.findByText('页面名称不能重复')).toBeTruthy();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('maxlength')).toBe('80');
        expect(onRenamePage).not.toHaveBeenCalled();
    });

    it('cancels inline rename with Escape and restores tab focus', async () => {
        const onRenamePage = vi.fn();
        render(
            <PageTabs
                pages={[{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRenamePage={onRenamePage}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '重命名页面 页面 1' }));
        const input = screen.getByRole('textbox', { name: '重命名页面 页面 1' });
        fireEvent.change(input, { target: { value: '不会保存' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        const tab = screen.getByRole('tab', { name: '页面 1' });
        await waitFor(() => expect(document.activeElement).toBe(tab));
        expect(onRenamePage).not.toHaveBeenCalled();
    });

    it('disables page creation at the 50-page limit', () => {
        const onAddPage = vi.fn();
        const pages = Array.from({ length: 50 }, (_, index) => ({
            id: `page-${index + 1}`,
            name: `页面 ${index + 1}`,
            nodes: [],
            edges: [],
        }));
        render(
            <PageTabs
                pages={pages}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={onAddPage}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
            />,
        );

        const add = screen.getByRole('button', { name: '新建页面' });
        expect(add.hasAttribute('disabled')).toBe(true);
        fireEvent.click(add);
        expect(onAddPage).not.toHaveBeenCalled();
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
        expect(screen.getByText('此页面及其全部内容将永久删除，且无法撤销。')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));

        await waitFor(() => expect(deleteButton.getAttribute('aria-describedby')).toBeNull());
        expect(onSwitchPage).not.toHaveBeenCalled();
        expect(onDeletePage).not.toHaveBeenCalled();
    });

    it('renders the destructive confirmation outside the clipped page-tab item', async () => {
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-2"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '删除页面 页面 2' }));
        const title = await screen.findByText('删除「页面 2」？');
        const popover = title.closest('.ant-popover');

        expect(popover).toBeTruthy();
        expect(popover?.parentElement).toBe(document.body);
    });

    it('restores keyboard focus to the adjacent active page after deletion', async () => {
        const PageTabsHarness = () => {
            const [pages, setPages] = useState([
                { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                { id: 'page-3', name: '页面 3', nodes: [], edges: [] },
            ]);
            const [activePageId, setActivePageId] = useState('page-3');
            return (
                <PageTabs
                    pages={pages}
                    activePageId={activePageId}
                    onSwitchPage={setActivePageId}
                    onAddPage={vi.fn()}
                    onDeletePage={pageId => {
                        const deletedIndex = pages.findIndex(page => page.id === pageId);
                        if (deletedIndex < 0) return false;
                        const adjacentPage = pages[deletedIndex + 1] ?? pages[deletedIndex - 1];
                        setPages(current => current.filter(page => page.id !== pageId));
                        if (pageId === activePageId && adjacentPage) setActivePageId(adjacentPage.id);
                        return true;
                    }}
                    onRenamePage={vi.fn(() => true)}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.click(screen.getByRole('button', { name: '删除页面 页面 3' }));
        fireEvent.click(screen.getByRole('button', { name: /^删\s*除$/ }));

        const adjacentTab = await screen.findByRole('tab', { name: '页面 2' });
        await waitFor(() => expect(document.activeElement).toBe(adjacentTab));
        expect(adjacentTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.queryByRole('tab', { name: '页面 3' })).toBeNull();
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
