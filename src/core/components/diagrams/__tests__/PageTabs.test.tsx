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
                'designer.pages.createSuccess': '已新建页面',
                'designer.pages.createFailed': '无法新建页面，请重试',
                'designer.pages.limitReached': '最多可创建 {{count}} 个页面',
                'designer.pages.createLimitReached': '无法新建页面：最多可创建 {{count}} 个页面',
                'designer.pages.duplicateLimitReached': '无法复制页面 {{name}}：最多可创建 {{count}} 个页面',
                'designer.pages.rename': '重命名页面 {{name}}',
                'designer.pages.renameAction': '重命名页面 {{name}}',
                'designer.pages.duplicateAction': '复制页面 {{name}}',
                'designer.pages.duplicateSuccess': '已复制页面“{{name}}”',
                'designer.pages.duplicateFailed': '无法复制页面“{{name}}”，请重试',
                'designer.pages.copyName': '{{name}} 副本',
                'designer.pages.moveLeft': '向左移动页面',
                'designer.pages.moveLeftNamed': '向左移动页面 {{name}}',
                'designer.pages.moveLeftSuccess': '已将页面“{{name}}”向左移动',
                'designer.pages.moveRight': '向右移动页面',
                'designer.pages.moveRightNamed': '向右移动页面 {{name}}',
                'designer.pages.moveRightSuccess': '已将页面“{{name}}”向右移动',
                'designer.pages.moveFailed': '无法移动页面“{{name}}”，请重试',
                'designer.pages.nameRequired': '页面名称不能为空',
                'designer.pages.duplicateName': '页面名称不能重复',
                'designer.pages.renameFailed': '页面重命名失败，请重试',
                'designer.pages.renameSuccess': '页面已重命名为“{{name}}”',
                'designer.pages.delete': '删除页面 {{name}}',
                'designer.pages.deleteConfirm': '删除「{{name}}」？',
                'designer.pages.deleteNodeCount': '{{count}} 个节点',
                'designer.pages.deleteConnectionCount': '{{count}} 条连线',
                'designer.pages.deleteDescription': '将删除此页面中的 {{nodeCountLabel}}和 {{connectionCountLabel}}。关闭或重新加载图表前，可恢复最近删除的页面。',
                'designer.pages.deleteAction': '删除',
                'designer.pages.deleteSuccess': '已删除“{{name}}”，可使用“恢复删除的页面”找回',
                'designer.pages.deleteFailed': '无法删除页面“{{name}}”，请重试',
                'designer.pages.restoreAction': '恢复删除的页面',
                'designer.pages.restoreNamedAction': '恢复页面“{{name}}”',
                'designer.pages.restoreSuccess': '已恢复页面“{{name}}”',
                'designer.pages.restoreFailed': '无法恢复页面“{{name}}”，请重试',
                'designer.pages.undoAction': '撤销此操作',
                'designer.pages.undoSuccess': '已撤销页面操作',
                'designer.pages.undoFailed': '无法撤销页面操作，请重试',
                'common.cancel': '取消',
            };
            const template = translations[key] ?? key;
            return template
                .replace('{{name}}', String(options?.name ?? ''))
                .replace('{{count}}', String(options?.count ?? ''))
                .replace('{{nodeCount}}', String(options?.nodeCount ?? ''))
                .replace('{{edgeCount}}', String(options?.edgeCount ?? ''))
                .replace('{{nodeCountLabel}}', String(options?.nodeCountLabel ?? ''))
                .replace('{{connectionCountLabel}}', String(options?.connectionCountLabel ?? ''));
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

    it('opens rename after double-clicking a page that first needs activation', async () => {
        const PageTabsHarness = () => {
            const [activePageId, setActivePageId] = useState('page-2');
            return (
                <PageTabs
                    pages={[
                        { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                        { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                    ]}
                    activePageId={activePageId}
                    onSwitchPage={setActivePageId}
                    onAddPage={vi.fn()}
                    onDeletePage={vi.fn()}
                    onRenamePage={vi.fn()}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.doubleClick(screen.getByRole('tab', { name: '页面 1' }));

        const input = await screen.findByRole('textbox', { name: '重命名页面 页面 1' }) as HTMLInputElement;
        await waitFor(() => {
            expect(screen.getByRole('tab', { name: '页面 1' }).getAttribute('aria-selected')).toBe('true');
            expect(document.activeElement).toBe(input);
            expect(input.selectionStart).toBe(0);
            expect(input.selectionEnd).toBe(input.value.length);
        });
    });

    it('moves focus to the newly active page after creation', async () => {
        const PageTabsHarness = () => {
            const [pages, setPages] = useState([{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]);
            const [activePageId, setActivePageId] = useState('page-1');
            const deletePage = (pageId: string) => {
                if (pageId !== 'page-2') return false;
                setPages([{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]);
                setActivePageId('page-1');
                return true;
            };
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
                    onDeletePage={deletePage}
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
        expect(screen.getByRole('status').textContent).toContain('已新建页面');
        fireEvent.click(screen.getByRole('button', { name: '撤销此操作' }));
        expect(screen.queryByRole('tab', { name: '页面 2' })).toBeNull();
        expect(screen.getByRole('status').textContent).toBe('已撤销页面操作');
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: '页面 1' })));
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
        const onRenamePage = vi.fn<(pageId: string, name: string) => boolean>(() => true);
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
        expect(visibleError.parentElement?.classList.contains('page-tabs__rename-anchor')).toBe(true);
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

    it('keeps page tabs readable beside full lifecycle controls on narrow screens', () => {
        expect(pageTabsCss).toMatch(/\.page-tabs__tab\s*\{[\s\S]*?max-width:\s*180px;[\s\S]*?text-overflow:\s*ellipsis;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__scroller\s*\{[\s\S]*?overflow-x:\s*auto;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__add\s*\{[\s\S]*?flex-shrink:\s*0;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__actions\s*\{[\s\S]*?flex-shrink:\s*0;/);
        expect(pageTabsCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.page-tabs__tab\s*\{[\s\S]*?max-width:\s*120px;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__rename-error\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px\);/);
        expect(pageTabsCss).toMatch(/\.page-tabs\s*\{[\s\S]*?overflow:\s*visible;/);
        expect(pageTabsCss).toMatch(/\.page-tabs__item\s*\{[\s\S]*?overflow:\s*visible;/);
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 640px\)[\s\S]*?\.page-tabs\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto auto;/,
        );
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 640px\)[\s\S]*?\.page-tabs__scroller\s*\{[\s\S]*?grid-row:\s*1;[\s\S]*?grid-column:\s*1;[\s\S]*?width:\s*100%;/,
        );
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 640px\)[\s\S]*?\.page-tabs__actions\s*\{[\s\S]*?grid-row:\s*2;[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?border-left:\s*0;/,
        );
        expect(pageTabsCss).toMatch(
            /@media \(max-width: 640px\)[\s\S]*?\.page-tabs__restore\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?\.page-tabs__add\s*\{[\s\S]*?grid-column:\s*3;/,
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
        expect(screen.getByRole('status').textContent).toContain('页面已重命名为“总览”');
        fireEvent.click(screen.getByRole('button', { name: '撤销此操作' }));
        expect(await screen.findByRole('tab', { name: '页面 1' })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe('已撤销页面操作');
    });

    it('preserves the first page action click while committing a rename on blur', async () => {
        const onRenamePage = vi.fn<(pageId: string, name: string) => boolean>(() => true);
        const onAddPage = vi.fn(() => 'page-2');
        const PageTabsHarness = () => {
            const [pages, setPages] = useState([{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]);
            const [activePageId, setActivePageId] = useState('page-1');
            return (
                <PageTabs
                    pages={pages}
                    activePageId={activePageId}
                    onSwitchPage={setActivePageId}
                    onAddPage={() => {
                        const newPageId = onAddPage();
                        setPages((current) => [...current, { id: newPageId, name: '页面 2', nodes: [], edges: [] }]);
                        setActivePageId(newPageId);
                        return newPageId;
                    }}
                    onDeletePage={vi.fn()}
                    onRenamePage={(pageId, name) => {
                        const renamed = onRenamePage(pageId, name);
                        if (renamed) {
                            setPages((current) => current.map((page) => (
                                page.id === pageId ? { ...page, name } : page
                            )));
                        }
                        return renamed;
                    }}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.click(screen.getByRole('button', { name: '重命名页面 页面 1' }));
        const input = screen.getByRole('textbox', { name: '重命名页面 页面 1' });
        fireEvent.change(input, { target: { value: '总览' } });

        fireEvent.blur(input);
        fireEvent.click(screen.getByRole('button', { name: '新建页面' }));

        const createdPageTab = await screen.findByRole('tab', { name: '页面 2' });
        await waitFor(() => {
            expect(onRenamePage).toHaveBeenCalledOnce();
            expect(onAddPage).toHaveBeenCalledOnce();
            expect(screen.getByRole('tab', { name: '总览' })).toBeTruthy();
            expect(document.activeElement).toBe(createdPageTab);
        });
        expect(createdPageTab.getAttribute('aria-selected')).toBe('true');
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
        expect(screen.getByRole('status').textContent).toContain('已复制页面“页面 1”');
        fireEvent.click(moveRight);

        expect(onDuplicatePage).toHaveBeenCalledWith('page-1', '页面 1 副本');
        expect(onMovePage).toHaveBeenCalledWith('page-1', 'right');
        expect(screen.getByRole('status').textContent).toContain('已将页面“页面 1”向右移动');
    });

    it('keeps reorder focus available until the active page reaches a boundary', async () => {
        const PageTabsHarness = () => {
            const [pages, setPages] = useState([
                { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                { id: 'page-3', name: '页面 3', nodes: [], edges: [] },
            ]);
            const movePage = (id: string, direction: 'left' | 'right') => {
                const currentIndex = pages.findIndex((page) => page.id === id);
                const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
                if (currentIndex < 0 || targetIndex < 0 || targetIndex >= pages.length) return false;
                const nextPages = [...pages];
                [nextPages[currentIndex], nextPages[targetIndex]] = [nextPages[targetIndex], nextPages[currentIndex]];
                setPages(nextPages);
                return true;
            };
            return (
                <PageTabs
                    pages={pages}
                    activePageId="page-3"
                    onSwitchPage={vi.fn()}
                    onAddPage={vi.fn()}
                    onDeletePage={vi.fn()}
                    onRenamePage={vi.fn()}
                    onMovePage={movePage}
                />
            );
        };

        render(<PageTabsHarness />);
        const moveLeft = screen.getByRole('button', { name: '向左移动页面 页面 3' });
        const activeTab = screen.getByRole('tab', { name: '页面 3' });
        const activePageItemScroll = vi.fn();
        Object.defineProperty(activeTab.parentElement, 'scrollIntoView', {
            configurable: true,
            value: activePageItemScroll,
        });
        moveLeft.focus();
        fireEvent.click(moveLeft);

        await waitFor(() => expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['页面 1', '页面 3', '页面 2']));
        await waitFor(() => expect(activePageItemScroll).toHaveBeenCalledWith({
            block: 'nearest',
            inline: 'nearest',
        }));
        expect(document.activeElement).toBe(moveLeft);
        expect(moveLeft.hasAttribute('disabled')).toBe(false);

        fireEvent.click(moveLeft);

        await waitFor(() => expect(document.activeElement).toBe(activeTab));
        expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['页面 3', '页面 1', '页面 2']);
        expect(screen.getByRole('button', { name: '向左移动页面 页面 3' }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('status').textContent).toContain('已将页面“页面 3”向左移动');
    });

    it('announces failed page mutations without moving focus away from the retry control', () => {
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn(() => null)}
                onDeletePage={vi.fn()}
                onRenamePage={vi.fn()}
                onDuplicatePage={vi.fn(() => null)}
                onMovePage={vi.fn(() => false)}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '新建页面' }));
        expect(screen.getByRole('status').textContent).toBe('无法新建页面，请重试');
        fireEvent.click(screen.getByRole('button', { name: '复制页面 页面 1' }));
        expect(screen.getByRole('status').textContent).toBe('无法复制页面“页面 1”，请重试');
        const moveRight = screen.getByRole('button', { name: '向右移动页面 页面 1' });
        moveRight.focus();
        fireEvent.click(moveRight);

        expect(screen.getByRole('status').textContent).toBe('无法移动页面“页面 1”，请重试');
        expect(document.activeElement).toBe(moveRight);
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

        const add = screen.getByRole('button', { name: '无法新建页面：最多可创建 50 个页面' });
        expect(add.hasAttribute('disabled')).toBe(false);
        expect(add.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(add);
        expect(onAddPage).not.toHaveBeenCalled();
        expect(screen.getByRole('status').textContent).toBe('最多可创建 50 个页面');
    });

    it('explains duplicate limits and keeps recovery available at the page boundary', () => {
        const pages = Array.from({ length: 50 }, (_, index) => ({
            id: `page-${index + 1}`,
            name: `页面 ${index + 1}`,
            nodes: [],
            edges: [],
        }));
        const onRestoreDeletedPage = vi.fn(() => null);
        render(
            <PageTabs
                pages={pages}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRestoreDeletedPage={onRestoreDeletedPage}
                onRenamePage={vi.fn()}
                onDuplicatePage={vi.fn()}
                canRestoreDeletedPage
                restorableDeletedPageName="已删除页"
            />,
        );

        const duplicateButton = screen.getByRole('button', {
            name: '无法复制页面 页面 1：最多可创建 50 个页面',
        });
        expect(duplicateButton.hasAttribute('disabled')).toBe(false);
        expect(duplicateButton.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(duplicateButton);
        expect(screen.getByRole('status').textContent).toBe('最多可创建 50 个页面');
        const restoreButton = screen.getByRole('button', { name: '恢复页面“已删除页”' });
        expect(restoreButton.hasAttribute('disabled')).toBe(false);
        fireEvent.click(restoreButton);
        expect(onRestoreDeletedPage).toHaveBeenCalledOnce();
        expect(screen.getByRole('status').textContent).toBe('无法恢复页面“已删除页”，请重试');
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
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
        expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
        expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('删除「页面 2」？');
        expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toContain('将删除此页面中的 1 个节点和 0 条连线');
        expect(deleteButton.getAttribute('aria-haspopup')).toBe('dialog');
        expect(deleteButton.getAttribute('aria-expanded')).toBe('true');
        expect(deleteButton.getAttribute('aria-controls')).toBe(dialog.id);
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

    it('closes deletion confirmation with Escape and restores trigger focus after motion', async () => {
        const onDeletePage = vi.fn();
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-2"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={onDeletePage}
                onRenamePage={vi.fn()}
            />,
        );

        const deleteButton = screen.getByRole('button', { name: '删除页面 页面 2' });
        fireEvent.click(deleteButton);
        const cancelButton = screen.getByRole('button', { name: /取\s*消/ });
        await waitFor(() => expect(document.activeElement).toBe(cancelButton));

        fireEvent.keyDown(cancelButton, { key: 'Escape' });

        await waitFor(() => expect(deleteButton.getAttribute('aria-expanded')).toBe('false'));
        await waitFor(() => expect(document.activeElement).toBe(deleteButton));
        expect(deleteButton.getAttribute('aria-controls')).toBeNull();
        expect(onDeletePage).not.toHaveBeenCalled();
    });

    it('announces deletion failure, preserves the page, and restores trigger focus', async () => {
        const onDeletePage = vi.fn(() => false);
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    { id: 'page-2', name: '页面 2', nodes: [], edges: [] },
                ]}
                activePageId="page-2"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={onDeletePage}
                onRenamePage={vi.fn()}
            />,
        );

        const deleteButton = screen.getByRole('button', { name: '删除页面 页面 2' });
        fireEvent.click(deleteButton);
        fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }));

        expect(onDeletePage).toHaveBeenCalledWith('page-2');
        expect(screen.getByRole('status').textContent).toBe('无法删除页面“页面 2”，请重试');
        expect(screen.getByRole('tab', { name: '页面 2' })).toBeTruthy();
        await waitFor(() => expect(document.activeElement).toBe(deleteButton));
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
                    restorableDeletedPageName={canRestore ? deletedPage.name : null}
                    activePageNodeCount={3}
                    activePageEdgeCount={2}
                />
            );
        };

        render(<PageTabsHarness />);
        fireEvent.click(screen.getByRole('button', { name: '删除页面 页面 2' }));
        expect(await screen.findByText('将删除此页面中的 3 个节点和 2 条连线。关闭或重新加载图表前，可恢复最近删除的页面。')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^删\s*除$/ }));

        const restoreButton = await screen.findByRole('button', { name: '恢复页面“页面 2”' });
        const deletedStatus = screen.getByRole('status');
        expect(deletedStatus.textContent).toContain('已删除“页面 2”');
        expect(deletedStatus.classList.contains('page-tabs__status')).toBe(true);
        expect(restoreButton.textContent).toContain('恢复页面“页面 2”');
        fireEvent.click(restoreButton);

        const restoredTab = await screen.findByRole('tab', { name: '页面 2' });
        await waitFor(() => expect(document.activeElement).toBe(restoredTab));
        expect(restoredTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('status').textContent).toContain('已恢复页面“页面 2”');
        expect(screen.queryByRole('button', { name: '恢复页面“页面 2”' })).toBeNull();
    });

    it('uses domain content metrics instead of hidden persistence node counts', async () => {
        render(
            <PageTabs
                pages={[
                    { id: 'page-1', name: '页面 1', nodes: [], edges: [] },
                    {
                        id: 'page-2',
                        name: '页面 2',
                        nodes: [{
                            id: '__mindmap_meta__',
                            position: { x: -9999, y: -9999 },
                            data: {
                                pageContentMetrics: { version: 1, nodeCount: 4, edgeCount: 0 },
                            },
                        }],
                        edges: [],
                    },
                ]}
                activePageId="page-2"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn(() => true)}
                onRenamePage={vi.fn()}
                activePageNodeCount={1}
                activePageEdgeCount={0}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '删除页面 页面 2' }));
        expect(await screen.findByText('将删除此页面中的 4 个节点和 0 条连线。关闭或重新加载图表前，可恢复最近删除的页面。')).toBeTruthy();
    });

    it('keeps a named recovery action visible and focused after a failed restore', async () => {
        render(
            <PageTabs
                pages={[{ id: 'page-1', name: '页面 1', nodes: [], edges: [] }]}
                activePageId="page-1"
                onSwitchPage={vi.fn()}
                onAddPage={vi.fn()}
                onDeletePage={vi.fn()}
                onRestoreDeletedPage={() => null}
                onRenamePage={vi.fn()}
                canRestoreDeletedPage
                restorableDeletedPageName="采购审批"
            />,
        );

        const restoreButton = screen.getByRole('button', { name: '恢复页面“采购审批”' });
        fireEvent.click(restoreButton);

        expect(screen.getByRole('status').textContent).toBe('无法恢复页面“采购审批”，请重试');
        expect(screen.getByRole('button', { name: '恢复页面“采购审批”' })).toBe(restoreButton);
        expect(restoreButton.textContent).toContain('恢复页面“采购审批”');
        await waitFor(() => expect(document.activeElement).toBe(restoreButton));
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
