// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => typeof fallback === 'string' ? fallback : key,
    }),
}));

class MockResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { void callback; }
    observe(target: Element, options?: ResizeObserverOptions): void { void target; void options; }
    unobserve(target: Element): void { void target; }
    disconnect(): void { return; }
}

import { ModernFlowchartToolbar } from '../ModernFlowchartToolbar';
import { buildToolModeMenuItems } from '../flowchartToolbarToolModeMenu';

describe('ModernFlowchartToolbar mobile file actions', () => {
    beforeEach(() => {
        globalThis.ResizeObserver = MockResizeObserver;
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
        document.body.innerHTML = `
            <div id="vizly-plugin-center-island-portal"></div>
            <div id="vizly-plugin-context-toolbar-portal"></div>
            <div id="vizly-plugin-bottom-island-portal"></div>
        `;
    });

    it('normalizes conflicting tool flags to a single checked menu item', () => {
        const items = buildToolModeMenuItems({
            isDrawingMode: true,
            isMarqueeActive: true,
            labels: {
                drawing: 'drawing',
                marquee: 'marquee',
                mindMap: 'mind-map',
                pointer: 'pointer',
                stickyNote: 'sticky-note',
            },
            onActivatePointer: vi.fn(),
            onToggleDrawingMode: vi.fn(),
            toggleSelectionMode: vi.fn(),
        });

        const checkedItems = items.filter((item) => (
            typeof item === 'object'
            && item !== null
            && 'aria-checked' in item
            && item['aria-checked'] === true
        ));

        expect(checkedItems).toHaveLength(1);
        expect(checkedItems[0]).toMatchObject({ key: 'marquee' });
    });

    it('keeps the file-actions trigger available when the desktop breakpoint is absent', async () => {
        const onImportClick = vi.fn();

        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onImportClick={onImportClick}
            />,
        );

        const moreButton = await screen.findByRole('button', { name: /更多操作|moreActions/i });
        expect(moreButton.hasAttribute('disabled')).toBe(false);
        expect(moreButton.getAttribute('data-flowchart-import-focus-return')).toBe('true');
    });

    it('exposes the active selection tool as a selected radio item in the mobile more menu', async () => {
        const onActivatePointer = vi.fn();
        const toggleSelectionMode = vi.fn();
        const onToggleDrawingMode = vi.fn();
        const onAddStickyNote = vi.fn();
        const onAddMindMap = vi.fn();

        const { rerender } = render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onActivatePointer={onActivatePointer}
                toggleSelectionMode={toggleSelectionMode}
                onToggleDrawingMode={onToggleDrawingMode}
                onAddStickyNote={onAddStickyNote}
                onAddMindMap={onAddMindMap}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));

        const pointerItem = await screen.findByRole('menuitemradio', { name: /普通选择器/ });
        expect(pointerItem.getAttribute('aria-checked')).toBe('true');
        expect(pointerItem.className).toContain('ant-dropdown-menu-item-selected');

        const marqueeItem = screen.getByRole('menuitemradio', { name: /框选模式/ });
        expect(marqueeItem.getAttribute('aria-checked')).toBe('false');
        fireEvent.click(marqueeItem);
        expect(toggleSelectionMode).toHaveBeenCalledTimes(1);

        rerender(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onActivatePointer={onActivatePointer}
                isMarqueeActive
                toggleSelectionMode={toggleSelectionMode}
                onToggleDrawingMode={onToggleDrawingMode}
                onAddStickyNote={onAddStickyNote}
                onAddMindMap={onAddMindMap}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));
        const activeMarqueeItem = await screen.findByRole('menuitemradio', { name: /退出框选/ });
        expect(activeMarqueeItem.getAttribute('aria-checked')).toBe('true');
        expect(activeMarqueeItem.className).toContain('ant-dropdown-menu-item-selected');
        const drawingItem = screen.getByRole('menuitemradio', { name: /自由画笔/ });
        expect(drawingItem.getAttribute('aria-checked')).toBe('false');
        expect(screen.getByRole('menuitem', { name: /便签/ })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: /思维导图 \(Shift\+M\)/ })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: /思维导图 \(M\)/ })).toBeNull();

        fireEvent.click(drawingItem);
        rerender(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onActivatePointer={onActivatePointer}
                isDrawingMode
                toggleSelectionMode={toggleSelectionMode}
                onToggleDrawingMode={onToggleDrawingMode}
                onAddStickyNote={onAddStickyNote}
                onAddMindMap={onAddMindMap}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));
        const activeDrawingItem = await screen.findByRole('menuitemradio', { name: /退出自由画笔/ });
        expect(activeDrawingItem.getAttribute('aria-checked')).toBe('true');
        expect(activeDrawingItem.className).toContain('ant-dropdown-menu-item-selected');
        expect(screen.getByRole('menuitemradio', { name: /普通选择器/ }).getAttribute('aria-checked')).toBe('false');
        expect(onActivatePointer).not.toHaveBeenCalled();
        expect(onToggleDrawingMode).toHaveBeenCalledTimes(1);
        expect(onAddStickyNote).not.toHaveBeenCalled();
        expect(onAddMindMap).not.toHaveBeenCalled();
    });

    it('exposes canvas search through the mobile more menu', async () => {
        const onShowCanvasSearch = vi.fn();

        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                onShowCanvasSearch={onShowCanvasSearch}
                showRuler={false}
                toggleRuler={vi.fn()}
            />,
        );

        const moreButton = await screen.findByRole('button', { name: /更多操作|moreActions/i });
        expect(moreButton.getAttribute('data-flowchart-search-focus-return')).toBe('true');
        fireEvent.click(moreButton);
        fireEvent.click(await screen.findByRole('menuitem', { name: /搜索画布内容/ }));

        expect(onShowCanvasSearch).toHaveBeenCalledTimes(1);
    });

    it('keeps the mobile menu below its trigger and exposes snap-to-grid', async () => {
        const onToggleSnap = vi.fn();

        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                snapToGrid
                onToggleSnap={onToggleSnap}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));

        const popup = (await screen.findByRole('menu')).closest('.ant-dropdown');
        expect(popup?.className).toContain('ant-dropdown-placement-bottomRight');
        fireEvent.click(await screen.findByRole('menuitem', { name: /网格吸附：开启|snapOn/i }));
        expect(onToggleSnap).toHaveBeenCalledTimes(1);
    });

    it('opens the mobile more menu from the keyboard and restores focus on Escape', async () => {
        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onImportClick={vi.fn()}
            />,
        );

        const trigger = await screen.findByRole('button', { name: /更多操作|moreActions/i });
        fireEvent.keyDown(trigger, { key: 'Enter' });

        const firstItem = await screen.findByRole('menuitem', { name: /打开本地 JSON|import/i });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => {
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('opens the automatic-layout menu by click and runs the selected strategy', async () => {
        const onStrategyLayout = vi.fn();

        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onStrategyLayout={onStrategyLayout}
            />,
        );

        const layoutButton = await screen.findByRole('button', { name: /layout\.tooltip|自动布局/i });
        expect(layoutButton.getAttribute('aria-haspopup')).toBe('menu');
        expect(layoutButton.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(layoutButton);

        expect(layoutButton.getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(await screen.findByRole('menuitemradio', { name: /树形.*上→下/ }));
        expect(onStrategyLayout).toHaveBeenCalledWith('tree', undefined, 'TB');
    });

    it('announces the current compound layout and exposes both checked radio states', async () => {
        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onStrategyLayout={vi.fn()}
                lastDomainStrategy="domain-dagre"
                lastDomainDirection="TB"
                lastNodeLayout="dagre"
            />,
        );

        const trigger = await screen.findByRole('button', {
            name: /自动布局：DomainDagre.*Dagre分层/,
        });
        fireEvent.click(trigger);

        const domainLayout = await screen.findByRole('menuitemradio', {
            name: /DomainDagre.*上→下/,
        });
        const nodeLayout = screen.getByRole('menuitemradio', {
            name: /Dagre分层/,
        });
        const inactiveLayout = screen.getByRole('menuitemradio', {
            name: /树形.*上→下/,
        });

        expect(domainLayout.getAttribute('aria-checked')).toBe('true');
        expect(nodeLayout.getAttribute('aria-checked')).toBe('true');
        expect(inactiveLayout.getAttribute('aria-checked')).toBe('false');
        expect(domainLayout.className).toContain('ant-dropdown-menu-item-selected');
        expect(nodeLayout.className).toContain('ant-dropdown-menu-item-selected');
    });

    it('opens the automatic-layout menu with ArrowDown and focuses its first action', async () => {
        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                onStrategyLayout={vi.fn()}
            />,
        );

        const trigger = await screen.findByRole('button', { name: /layout\.tooltip|自动布局/i });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        const firstItem = await screen.findByRole('menuitemradio', { name: /树形.*上→下/ });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('provides commercial touch targets and a programmatic routing state', async () => {
        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
            />,
        );

        const touchTargetNames = [
            /zoomIn|放大/i,
            /zoomOut|缩小/i,
            /fitView|适应/i,
            /layout\.tooltip|自动布局/i,
            /autoRouting.*(?:common\.on|开启)/i,
            /moreActions|更多操作/i,
        ];
        const buttons = await Promise.all(touchTargetNames.map(name => screen.findByRole('button', { name })));

        for (const button of buttons) {
            expect(button.style.minWidth).toBe('var(--commercial-touch-target, 44px)');
            expect(button.style.width).toBe(button.style.minWidth);
            expect(button.style.height).toBe(button.style.minWidth);
        }

        expect(buttons[4].getAttribute('aria-pressed')).toBe('true');
    });

    it('does not duplicate multi-selection actions in the mobile top toolbar', async () => {
        const onAlign = vi.fn();
        const onDistribute = vi.fn();

        render(
            <ModernFlowchartToolbar
                canUndo={false}
                canRedo={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                onZoomIn={vi.fn()}
                onZoomOut={vi.fn()}
                onFitView={vi.fn()}
                autoRouting={false}
                toggleAutoRouting={vi.fn()}
                showGrid
                toggleGrid={vi.fn()}
                onShowShortcuts={vi.fn()}
                showRuler={false}
                toggleRuler={vi.fn()}
                selectedNodesCount={3}
                onAlign={onAlign}
                onDistribute={onDistribute}
            />,
        );

        expect(screen.queryByRole('toolbar', { name: '多选对齐与分布' })).toBeNull();
        expect(screen.queryByRole('button', { name: '左对齐' })).toBeNull();
        expect(onAlign).not.toHaveBeenCalled();
        expect(onDistribute).not.toHaveBeenCalled();
    });
});
