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
});
