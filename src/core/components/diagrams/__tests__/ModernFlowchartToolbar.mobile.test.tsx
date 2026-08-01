// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
    });

    it('exposes selection and creation tools through the mobile more menu', async () => {
        const onActivatePointer = vi.fn();
        const toggleSelectionMode = vi.fn();
        const onToggleDrawingMode = vi.fn();
        const onAddStickyNote = vi.fn();

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
                onActivatePointer={onActivatePointer}
                toggleSelectionMode={toggleSelectionMode}
                onToggleDrawingMode={onToggleDrawingMode}
                onAddStickyNote={onAddStickyNote}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));

        expect(await screen.findByRole('menuitem', { name: /普通选择器/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('menuitem', { name: /框选模式/ }));
        expect(toggleSelectionMode).toHaveBeenCalledTimes(1);

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));
        expect(await screen.findByRole('menuitem', { name: /自由画笔/ })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: /便签/ })).toBeTruthy();
        expect(onActivatePointer).not.toHaveBeenCalled();
        expect(onToggleDrawingMode).not.toHaveBeenCalled();
        expect(onAddStickyNote).not.toHaveBeenCalled();
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

        fireEvent.click(await screen.findByRole('button', { name: /更多操作|moreActions/i }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /搜索画布节点/ }));

        expect(onShowCanvasSearch).toHaveBeenCalledTimes(1);
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
        fireEvent.click(await screen.findByRole('menuitem', { name: /树形.*上→下/ }));
        expect(onStrategyLayout).toHaveBeenCalledWith('tree', undefined, 'TB');
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

    it('names multi-selection actions and preserves a physical mobile touch target', async () => {
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

        const actionNames = ['左对齐', '水平居中', '右对齐', '顶对齐', '垂直居中', '底对齐', '水平均分', '垂直均分'];
        const buttons = await Promise.all(actionNames.map(name => screen.findByRole('button', { name })));

        for (const button of buttons) {
            expect(button.style.minWidth).toBe('var(--commercial-touch-target, 44px)');
            expect(button.style.width).toBe(button.style.minWidth);
            expect(button.style.height).toBe(button.style.minWidth);
        }

        fireEvent.click(screen.getByRole('button', { name: '左对齐' }));
        fireEvent.click(screen.getByRole('button', { name: '水平均分' }));
        expect(onAlign).toHaveBeenCalledWith('left');
        expect(onDistribute).toHaveBeenCalledWith('horizontal');
    });
});
