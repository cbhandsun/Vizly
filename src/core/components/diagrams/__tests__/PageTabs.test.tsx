// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageTabs } from '../PageTabs';

const pageTabsCss = readFileSync(resolve(process.cwd(), 'src/core/components/diagrams/PageTabs.css'), 'utf8');

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            const translations: Record<string, string> = {
                'designer.pages.management': '页面管理',
                'designer.pages.tabList': '页面',
                'designer.pages.actions': '{{name}} 页面操作',
                'designer.pages.new': '新建页面',
                'designer.pages.limitReached': '最多可创建 {{count}} 个页面',
                'designer.pages.rename': '重命名页面 {{name}}',
                'designer.pages.renameAction': '重命名页面 {{name}}',
                'designer.pages.duplicateAction': '复制页面 {{name}}',
                'designer.pages.copyName': '{{name}} 副本',
                'designer.pages.moveLeft': '向左移动页面',
                'designer.pages.moveLeftNamed': '向左移动页面 {{name}}',
                'designer.pages.moveRight': '向右移动页面',
                'designer.pages.moveRightNamed': '向右移动页面 {{name}}',
                'designer.pages.nameRequired': '页面名称不能为空',
                'designer.pages.duplicateName': '页面名称不能重复',
                'designer.pages.renameFailed': '页面重命名失败，请重试',
                'designer.pages.delete': '删除页面 {{name}}',
                'designer.pages.deleteConfirm': '删除「{{name}}」？',
                'designer.pages.deleteDescription': '将删除此页面中的 {{nodeCount}} 个节点和 {{edgeCount}} 条连线。关闭或重新加载图表前，可恢复最近删除的页面。',
                'designer.pages.deleteAction': '删除',
                'designer.pages.deleteSuccess': '已删除“{{name}}”，可使用“恢复删除的页面”找回',
                'designer.pages.restoreAction': '恢复删除的页面',
                'designer.pages.restoreSuccess': '已恢复删除的页面',
                'common.cancel': '取消',
            };
            const template = translations[key] ?? key;
            return template
                .replace('{{name}}', String(options?.name ?? ''))
                .replace('{{count}}', String(options?.count ?? ''))
                .replace('{{nodeCount}}', String(options?.nodeCount ?? ''))
                .replace('{{edgeCount}}', String(options?.edgeCount ?? ''));
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
    it('exposes keyboard-operable page tabs and named page actions', async () => {
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

        const tabList = screen.getByRole('tablist', { name: '页面' });
        expect(tabList.classList.contains('page-tabs__scroller')).toBe(true);
        const firstTab = screen.getByRole('tab', { name: '页面 1' });
        const firstPageItemScroll = vi.fn();
        Object.defineProperty(firstTab.parentElement, 'scrollIntoView', {
            configurable: true,
            value: firstPageItemScroll,
        });
        await waitFor(() => expect(firstPageItemScroll).toHaveBeenCalled());
        expect(firstTab.getAttribute('aria-selected')).toBe('true');
        expect(firstTab.getAttribute('title')).toBe('页面 1');
        const secondTab = screen.getByRole('tab', { name: '页面 2' });
        fireEvent.keyDown(secondTab, { key: 'Enter' });
        expect(onSwitchPage).toHaveBeenCalledWith('page-2');

        secondTab.focus();
        fireEvent.keyDown(secondTab, { key: 'ArrowLeft' });
        expect(onSwitchPage).toHaveBeenLastCalledWith('page-1');
        expect(document.activeElement).toBe(firstTab);
        expect(firstPageItemScroll).toHaveBeenCalledWith({
            block: 'nearest',
            inline: 'nearest',
        });

        fireEvent.keyDown(firstTab, { key: 'End' });
        expect(onSwitchPage).toHaveBeenLastCalledWith('page-2');
        expect(document.activeElement).toBe(secondTab);

        fireEvent.keyDown(secondTab, { key: 'ArrowRight' });
        expect(onSwitchPage).toHaveBeenLastCalledWith('page-1');
        expect(document.activeElement).toBe(firstTab);

        const addPageButton = screen.getByRole('button', { name: '新建页面' });
        expect(tabList.contains(addPageButton)).toBe(false);
        expect(tabList.querySelectorAll('button:not([role="tab"])')).toHaveLength(0);
        expect(screen.getByRole('button', { name: '删除页面 页面 1' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '删除页面 页面 2' })).toBeNull();

        fireEvent.click(addPageButton);
        expect(onAddPage).toHaveBeenCalledTimes(1);
    });

    it('keeps page actions outside the tablist and scopes them to the active page', () => {
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                    { id: 'page-3', name: '页面 3', nodes: [], edges: [] },
                ]}
                activePageId="page-2"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
            />,
        );

        const tabList = screen.getByRole('tablist', { name: '页面' });
        const actions = screen.getByRole('group', { name: '页面 2 页面操作' });

        expect(tabList.querySelectorAll('[role="tab"]')).toHaveLength(3);
        expect(tabList.querySelectorAll('button:not([role="tab"])')).toHaveLength(0);
        expect(actions.contains(screen.getByRole('button', { name: '重命名页面 页面 2' }))).toBe(true);
        expect(actions.contains(screen.getByRole('button', { name: '删除页面 页面 2' }))).toBe(true);
        expect(screen.queryByRole('button', { name: '删除页面 页面 1' })).toBeNull();
        expect(screen.queryByRole('button', { name: '删除页面 页面 3' })).toBeNull();
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

    it('selects the current page name when rename starts', async () => {
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
        const input = screen.getByRole('textbox', {
            name: '重命名页面 页面 1',
        }) as HTMLInputElement;

        await waitFor(() => {
            expect(document.activeElement).toBe(input);
            expect(input.selectionStart).toBe(0);
            expect(input.selectionEnd).toBe(input.value.length);
        });
    });

    it('moves focus to the newly active page after creation', async () => {
        const PageTabsHarness = () => {
            const [pages, setPages] = useState([{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]);
            const [activePageId, setActivePageId] = useState('page-1');
            return (
                <PageTabs
                    pages={pages}
                    activePageId={activePageId}
                    onSwitchPage={setActivePageId}
                    onAddPage={() => {
                        const newPageId = 'page-2';
                        setPages((current) => [...current, { id: newPageId, name: '页面 2', nodes: [], edges: [] }]);
                        setActivePageId(newPageId);
                        return newPageId;
                    }}
                    onDeletePage={vi.fn()}
                    onRenamePage={vi.fn()}
                />
            );
        };

        render(<PageTabsHarness />);
        const addPageButton = screen.getByRole('button', { name: '新建页面' });
        addPageButton.focus();
        fireEvent.click(addPageButton);

        const createdPageTab = await screen.findByRole('tab', { name: '页面 2' });
        await waitFor(() => expect(document.activeElement).toBe(createdPageTab));
        expect(createdPageTab.getAttribute('aria-selected')).toBe('true');
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

        const visibleError = await screen.findByRole('alert');
        expect(visibleError.textContent).toBe('页面名称不能重复');
        expect(visibleError.classList.contains('page-tabs__rename-error')).toBe(true);
        expect(document.querySelector('.page-tabs__scroller')?.contains(visibleError)).toBe(false);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('maxlength')).toBe('80');
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        const announcedError = document.getElementById(describedBy ?? '');
        expect(announcedError).toBe(visibleError);
        expect(announcedError?.textContent).toBe('页面名称不能重复');
        expect(onRenamePage).not.toHaveBeenCalled();
    });

    it('keeps long page names bounded and the add action visible on narrow screens', () => {
        expect(pageTabsCss).toMatch(/\.page-tabs__tab\s*\{[\s\S]*?max-width:\s*180px;[\s\S]*?text-overflow:\s*ellipsis;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__scroller\s*\{[\s\S]*?overflow-x:\s*auto;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__add\s*\{[\s\S]*?flex-shrink:\s*0;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__actions\s*\{[\s\S]*?flex-shrink:\s*0;/);
        expect(pageTabsCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.page-tabs__tab\s*\{[\s\S]*?max-width:\s*120px;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__rename-error\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px\);/);
        expect(pageTabsCss).toMatch(/\.page-tabs\s*\{[\s\S]*?overflow:\s*visible;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__item\s*\{[\s\S]*?overflow:\s*visible;/);
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 480px\)[\s\S]*?\.page-tabs\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/,
        );
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 480px\)[\s\S]*?\.page-tabs__scroller\s*\{[\s\S]*?grid-row:\s*1;[\s\S]*?grid-column:\s*1;[\s\S]*?width:\s*100%;/,
        );
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 480px\)[\s\S]*?\.page-tabs__actions\s*\{[\s\S]*?grid-row:\s*2;[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?border-left:\s*0;/,
        );
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 480px\)[\s\S]*?\.page-tabs__restore\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?\.page-tabs__add\s*\{[\s\S]*?grid-column:\s*3;/,
        );
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

    it('restores tab focus after a successful rename', async () => {
        const PageTabsHarness = () => {
            const [pages, setPages] = useState([{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]);
            return (
                <PageTabs
                    pages={pages}
                    activePageId="page-1"
                    onSwitchPage={vi.fn()}
                    onAddPage={vi.fn()}
                    onDeletePage={vi.fn()}
                    onRenamePage={(pageId, name) => {
                        setPages((current) => current.map((page) => (page.id === pageId ? { ...page, name } : page)));
                        return true;
                    }}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.click(screen.getByRole('button', { name: '重命名页面 页面 1' }));
        const input = screen.getByRole('textbox', { name: '重命名页面 页面 1' });
        fireEvent.change(input, { target: { value: '总览' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        const renamedTab = await screen.findByRole('tab', { name: '总览' });
        await waitFor(() => expect(document.activeElement).toBe(renamedTab));
        expect(renamedTab.getAttribute('aria-selected')).toBe('true');
    });

    it('clears an invalid rename when the user switches to another page', async () => {
        const PageTabsHarness = () => {
            const [activePageId, setActivePageId] = useState('page-1');
            const pages = [
                { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
            ];
            return (
                <PageTabs
                    pages={pages}
                    activePageId={activePageId}
                    onSwitchPage={setActivePageId}
                    onAddPage={vi.fn()}
                    onDeletePage={vi.fn()}
                    onRenamePage={vi.fn(() => false)}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.click(screen.getByRole('button', { name: '重命名页面 页面 1' }));
        const input = screen.getByRole('textbox', { name: '重命名页面 页面 1' });
        fireEvent.change(input, { target: { value: '页面 2' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect((await screen.findByRole('alert')).textContent).toContain('页面名称不能重复');

        fireEvent.click(screen.getByRole('tab', { name: '页面 2' }));
        fireEvent.click(screen.getByRole('tab', { name: '页面 1' }));

        await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('button', { name: '重命名页面 页面 1' })).toBeTruthy();
    });

    it('offers an isolated page copy and bounded page reordering actions', () => {
        const onDuplicatePage = vi.fn(() => 'page-copy');
        const onMovePage = vi.fn(() => true);
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
                onDuplicatePage={onDuplicatePage}
                onMovePage={onMovePage}
            />,
        );

        const moveLeft = screen.getByRole('button', { name: '向左移动页面 页面 1' });
        const moveRight = screen.getByRole('button', { name: '向右移动页面 页面 1' });
        expect(moveLeft.hasAttribute('disabled')).toBe(true);
        expect(moveRight.hasAttribute('disabled')).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: '复制页面 页面 1' }));
        fireEvent.click(moveRight);

        expect(onDuplicatePage).toHaveBeenCalledWith('page-1', '页面 1 副本');
        expect(onMovePage).toHaveBeenCalledWith('page-1', 'right');
    });

    it('disables page creation at the 50-page limit', () => {
        const onAddPage = vi.fn();
        const pages = Array.from({ length: 50 }, (_, index) => ({
            id: `page-${index + 1}`,
            name: `页面 ${index + 1}`,
            nodes: [],
            edges: [],
        }));
        render(<PageTabs pages={pages} activePageId="page-1" onSwitchPage={vi.fn()} onAddPage={onAddPage} onDeletePage={vi.fn()} onRenamePage={vi.fn()} />);

        const add = screen.getByRole('button', { name: '新建页面' });
        expect(add.hasAttribute('disabled')).toBe(true);
        fireEvent.click(add);
        expect(onAddPage).not.toHaveBeenCalled();
    });

    it('keeps the active page unchanged when deletion is cancelled', async () => {
        const onSwitchPage = vi.fn();
        const onDeletePage = vi.fn();
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    {
                        id: 'page-2',
                        name: '页面 2',
                        nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }],
                        edges: [],
                    },
                ]}
                activePageId="page-2"
                onSwitchPage={onSwitchPage}
                onAddPage={vi.fn()}
                onDeletePage={onDeletePage}
                onRenamePage={vi.fn()}
            />,
        );

        const deleteButton = screen.getByRole('button', {
            name: '删除页面 页面 2',
        });
        expect(deleteButton.classList.contains('page-tabs__delete')).toBe(true);
        fireEvent.click(deleteButton);
        expect(await screen.findByText('删除「页面 2」？')).toBeTruthy();
        expect(screen.getByText('将删除此页面中的 1 个节点和 0 条连线。关闭或重新加载图表前，可恢复最近删除的页面。')).toBeTruthy();
        const cancelButton = screen.getByRole('button', { name: /取\s*消/ });
        const confirmButton = screen.getByRole('button', { name: /^删\s*除$/ });
        await waitFor(() => expect(document.activeElement).toBe(cancelButton));
        expect(confirmButton.classList.contains('ant-btn-dangerous')).toBe(true);
        fireEvent.click(cancelButton);

        await waitFor(() => expect(deleteButton.getAttribute('aria-describedby')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(deleteButton));
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
        expect((popover as HTMLElement | null)?.style.maxWidth).toBe('calc(100vw - 16px)');
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
                    onDeletePage={(pageId) => {
                        const deletedIndex = pages.findIndex((page) => page.id === pageId);
                        if (deletedIndex < 0) return false;
                        const adjacentPage = pages[deletedIndex + 1] ?? pages[deletedIndex - 1];
                        setPages((current) => current.filter((page) => page.id !== pageId));
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

    it('uses live canvas counts and restores the latest deleted page with focus', async () => {
        const PageTabsHarness = () => {
            const deletedPage = { id: 'page-2', name: '页面 2', nodes: [], edges: [] };
            const [pages, setPages] = useState([
                { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                deletedPage,
            ]);
            const [activePageId, setActivePageId] = useState('page-2');
            const [canRestore, setCanRestore] = useState(false);
            return (
                <PageTabs
                    pages={pages}
                    activePageId={activePageId}
                    onSwitchPage={setActivePageId}
                    onAddPage={vi.fn()}
                    onDeletePage={() => {
                        setPages((current) => current.filter((page) => page.id !== deletedPage.id));
                        setActivePageId('page-1');
                        setCanRestore(true);
                        return true;
                    }}
                    onRestoreDeletedPage={() => {
                        setPages((current) => [...current, deletedPage]);
                        setActivePageId(deletedPage.id);
                        setCanRestore(false);
                        return deletedPage.id;
                    }}
                    onRenamePage={vi.fn()}
                    canRestoreDeletedPage={canRestore}
                    activePageNodeCount={3}
                    activePageEdgeCount={2}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.click(screen.getByRole('button', { name: '删除页面 页面 2' }));
        expect(await screen.findByText('将删除此页面中的 3 个节点和 2 条连线。关闭或重新加载图表前，可恢复最近删除的页面。')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^删\s*除$/ }));

        const restoreButton = await screen.findByRole('button', { name: '恢复删除的页面' });
        expect(screen.getByRole('status').textContent).toContain('已删除“页面 2”');
        fireEvent.click(restoreButton);

        const restoredTab = await screen.findByRole('tab', { name: '页面 2' });
        await waitFor(() => expect(document.activeElement).toBe(restoredTab));
        expect(restoredTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('status').textContent).toBe('已恢复删除的页面');
        expect(screen.queryByRole('button', { name: '恢复删除的页面' })).toBeNull();
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
