// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string | { count?: number }) => {
            if (key === 'designer.toolbar.historyWithCount' && typeof fallback === 'object') {
                return `历史记录 (${fallback.count ?? 0})`;
            }
            return typeof fallback === 'string' ? fallback : key;
        },
    }),
}));

class MockResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { void callback; }
    observe(target: Element, options?: ResizeObserverOptions): void { void target; void options; }
    unobserve(target: Element): void { void target; }
    disconnect(): void { return; }
}

const useDesktopBreakpoint = () => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query.includes('min-width: 768px'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
};

import { ModernFlowchartToolbar } from '../ModernFlowchartToolbar';
import { buildToolModeMenuItems } from '../flowchartToolbarToolModeMenu';

describe('ModernFlowchartToolbar mobile file actions', () => {
    it('portals the mobile menu to the viewport and gives it an opaque safe-area surface', () => {
        const toolbarSource = readFileSync(
            resolve(process.cwd(), 'src/core/components/diagrams/ModernFlowchartToolbar.tsx'),
            'utf8',
        );
        const toolbarCss = readFileSync(
            resolve(process.cwd(), 'src/core/components/diagrams/ModernFlowchartToolbar.css'),
            'utf8',
        );

        expect(toolbarSource).toContain(
            'getPopupContainer={(triggerNode) => triggerNode.ownerDocument.body}',
        );
        expect(toolbarCss).toMatch(
            /body \.flowchart-mobile-more-menu\s*\{[\s\S]*?inset: 80px auto auto 8px !important;[\s\S]*?width: min\(304px, calc\(100vw - 16px\)\);[\s\S]*?max-height: calc\(100dvh - 96px\);/,
        );
        expect(toolbarCss).toMatch(
            /body \.flowchart-mobile-more-menu \.ant-dropdown-menu\s*\{[\s\S]*?background-color: rgba\(255, 255, 255, 0\.98\) !important;/,
        );
        expect(toolbarCss).toMatch(
            /html\[data-theme='dark'\] body \.flowchart-mobile-more-menu \.ant-dropdown-menu\s*\{[\s\S]*?background-color: rgba\(28, 28, 41, 0\.98\) !important;/,
        );
    });

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

    it('gives persistent desktop creation actions accessible names', async () => {
        useDesktopBreakpoint();

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
                onActivatePointer={vi.fn()}
                toggleSelectionMode={vi.fn()}
                onToggleDrawingMode={vi.fn()}
                onAddStickyNote={vi.fn()}
                onAddMindMap={vi.fn()}
            />,
        );

        expect(await screen.findByRole('button', { name: /便签 \(S\)/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /思维导图 \(Shift\+M\)/ })).toBeTruthy();
    });

    it('exposes desktop canvas helper states and the settings disclosure state', async () => {
        useDesktopBreakpoint();

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
                onToggleSnap={vi.fn()}
            />,
        );

        const snap = await screen.findByRole('button', { name: /snapOn/i });
        expect(snap.getAttribute('aria-pressed')).toBe('true');

        const settings = screen.getByRole('button', { name: '画布设置' });
        expect(settings.getAttribute('aria-expanded')).toBe('false');
        expect(settings.getAttribute('aria-haspopup')).toBe('dialog');
        fireEvent.click(settings);
        await waitFor(() => expect(settings.getAttribute('aria-expanded')).toBe('true'));
        const settingsDialog = await screen.findByRole('dialog', { name: '画布设置' });
        expect(settings.getAttribute('aria-controls')).toBe(settingsDialog.id);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'designer.toolbar.showRuler' })));
    });

    it('opens canvas settings from the keyboard and restores focus after Escape', async () => {
        useDesktopBreakpoint();

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
                showMinimap={false}
                toggleMinimap={vi.fn()}
            />,
        );

        const settings = await screen.findByRole('button', { name: '画布设置' });
        fireEvent.keyDown(settings, { key: 'Enter' });
        const minimap = await screen.findByRole('button', { name: '显示小地图' });
        await waitFor(() => expect(document.activeElement).toBe(minimap));

        fireEvent.keyDown(minimap, { key: 'Escape' });

        await waitFor(() => expect(settings.getAttribute('aria-expanded')).toBe('false'));
        await waitFor(() => expect(document.activeElement).toBe(settings));
    });

    it('gives the desktop history action a full target and announces its entry count', async () => {
        useDesktopBreakpoint();
        const onShowHistory = vi.fn();

        render(
            <ModernFlowchartToolbar
                canUndo
                canRedo
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
                onShowHistory={onShowHistory}
                historyCount={3}
            />,
        );

        const history = await screen.findByRole('button', { name: '历史记录 (3)' });
        expect(history.className).toContain('w-8');
        expect(history.className).toContain('h-8');
        expect(history.textContent).not.toContain('▾');
        fireEvent.click(history);
        expect(onShowHistory).toHaveBeenCalledTimes(1);
    });

    it.each([
        undefined,
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
    ])('does not announce an invalid history count: %s', async (historyCount) => {
        useDesktopBreakpoint();

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
                onShowHistory={vi.fn()}
                historyCount={historyCount}
            />,
        );

        expect(await screen.findByRole('button', { name: 'designer.toolbar.historyPanel' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /历史记录 \(/ })).toBeNull();
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
                onExport={vi.fn()}
            />,
        );

        const moreButton = await screen.findByRole('button', { name: /更多操作|moreActions/i });
        expect(moreButton.hasAttribute('disabled')).toBe(false);
        expect(moreButton.getAttribute('data-flowchart-import-focus-return')).toBe('true');
        expect(moreButton.getAttribute('data-advanced-export-focus-return')).toBe('true');
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

        const activeMarqueeTrigger = await screen.findByRole('button', {
            name: /(?:更多操作|moreActions).*退出框选/i,
        });
        expect(activeMarqueeTrigger.className).toContain('bg-[#e8f0fe]');
        fireEvent.click(activeMarqueeTrigger);
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

        const activeDrawingTrigger = await screen.findByRole('button', {
            name: /(?:更多操作|moreActions).*退出自由画笔/i,
        });
        expect(activeDrawingTrigger.className).toContain('bg-[#e8f0fe]');
        fireEvent.click(activeDrawingTrigger);
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

    it('keeps the current zoom visible and announces zoom changes on narrow screens', async () => {
        const props = {
            canUndo: false,
            canRedo: false,
            onUndo: vi.fn(),
            onRedo: vi.fn(),
            onZoomIn: vi.fn(),
            onZoomOut: vi.fn(),
            onResetZoom: vi.fn(),
            onFitView: vi.fn(),
            autoRouting: false,
            toggleAutoRouting: vi.fn(),
            showGrid: true,
            toggleGrid: vi.fn(),
            onShowShortcuts: vi.fn(),
            showRuler: false,
            toggleRuler: vi.fn(),
        };
        const { rerender } = render(
            <ModernFlowchartToolbar {...props} zoomPercent={32} />,
        );

        const initialStatus = await screen.findByRole('status', { name: '32%' });
        expect(initialStatus.textContent).toBe('32%');
        expect(await screen.findByRole('button', { name: /zoomIn.*32%/i })).toBeTruthy();
        expect(await screen.findByRole('button', { name: /zoomOut.*32%/i })).toBeTruthy();
        expect(await screen.findByRole('button', { name: /fitView.*32%/i })).toBeTruthy();
        const resetZoom = await screen.findByRole('button', { name: /resetZoom.*32%/i });
        fireEvent.click(resetZoom);
        expect(props.onResetZoom).toHaveBeenCalledTimes(1);
        expect(resetZoom.style.minWidth).toBe('var(--commercial-touch-target, 44px)');

        rerender(<ModernFlowchartToolbar {...props} zoomPercent={38} />);

        const updatedStatus = await screen.findByRole('status', { name: '38%' });
        expect(updatedStatus.textContent).toBe('38%');
        expect(updatedStatus.getAttribute('aria-live')).toBe('polite');
        expect(updatedStatus.getAttribute('aria-atomic')).toBe('true');
        expect(await screen.findByRole('button', { name: /resetZoom.*38%/i })).toBeTruthy();

        rerender(<ModernFlowchartToolbar {...props} zoomPercent={400} />);
        expect((await screen.findByRole('button', { name: /zoomIn.*400%/i }) as HTMLButtonElement).disabled).toBe(true);
        expect((await screen.findByRole('button', { name: /zoomOut.*400%/i }) as HTMLButtonElement).disabled).toBe(false);

        rerender(<ModernFlowchartToolbar {...props} zoomPercent={10} />);
        expect((await screen.findByRole('button', { name: /zoomOut.*10%/i }) as HTMLButtonElement).disabled).toBe(true);
        expect((await screen.findByRole('button', { name: /zoomIn.*10%/i }) as HTMLButtonElement).disabled).toBe(false);

        rerender(<ModernFlowchartToolbar {...props} zoomPercent={100} />);
        expect((await screen.findByRole('button', { name: /resetZoom.*100%/i }) as HTMLButtonElement).disabled).toBe(true);
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

    it('closes canvas settings and focuses its trigger before opening shortcut help', async () => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: true,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        let settingsTrigger: HTMLButtonElement | null = null;
        const onShowShortcuts = vi.fn(() => {
            expect(document.activeElement).toBe(settingsTrigger);
        });
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
                onShowShortcuts={onShowShortcuts}
                showRuler={false}
                toggleRuler={vi.fn()}
            />,
        );

        settingsTrigger = await screen.findByRole('button', { name: '画布设置' }) as HTMLButtonElement;
        fireEvent.click(settingsTrigger);
        const shortcuts = await screen.findByRole('button', { name: '快捷键' });
        fireEvent.click(shortcuts);

        expect(onShowShortcuts).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(document.querySelector('.ant-popover')?.className).toContain('ant-zoom-big-leave'));
        expect(document.activeElement).toBe(settingsTrigger);
    });

    it('closes the mobile more menu and focuses its trigger before opening shortcut help', async () => {
        let moreTrigger: HTMLButtonElement | null = null;
        const onShowShortcuts = vi.fn(() => {
            expect(document.activeElement).toBe(moreTrigger);
        });
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
                onShowShortcuts={onShowShortcuts}
                showRuler={false}
                toggleRuler={vi.fn()}
            />,
        );

        moreTrigger = await screen.findByRole('button', { name: /更多操作|moreActions/i }) as HTMLButtonElement;
        fireEvent.click(moreTrigger);
        const shortcuts = await screen.findByRole('menuitem', { name: /shortcuts|快捷键/i });
        fireEvent.click(shortcuts);

        expect(onShowShortcuts).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(document.querySelector('.flowchart-mobile-more-menu')?.className).toContain('ant-slide-up-leave'));
        expect(document.activeElement).toBe(moreTrigger);
    });
});
