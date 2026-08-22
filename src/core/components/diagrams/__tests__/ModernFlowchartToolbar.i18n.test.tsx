// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    confirm: vi.fn(),
}));

const translations: Record<string, string> = {
    'common.cancel': 'Cancel',
    'common.off': 'Off',
    'common.on': 'On',
    'designer.toolbar.clearCache': 'Reset Local Editor State',
    'designer.toolbar.clearCacheConfirm': 'Reset and Reload',
    'designer.toolbar.clearCacheContent': 'Reset content',
    'designer.toolbar.clearCacheTitle': 'Reset local editor state?',
    'designer.toolbar.creationTools': 'Creation Tools',
    'designer.toolbar.drawingMode': 'Freehand Draw (P)',
    'designer.toolbar.drawingModeExit': 'Exit Freehand Draw (Esc)',
    'designer.toolbar.fileGroup': 'File Operations',
    'designer.toolbar.gridLines': 'Grid: Lines',
    'designer.toolbar.marqueeEnter': 'Marquee Select (M)',
    'designer.toolbar.marqueeExit': 'Exit Marquee (Esc)',
    'designer.toolbar.mindMap': 'Mind Map (Shift+M)',
    'designer.toolbar.moreActions': 'More Actions',
    'designer.toolbar.pointer': 'Select (V)',
    'designer.toolbar.searchCanvas': 'Search canvas content (Ctrl+F)',
    'designer.toolbar.shortcuts': 'Keyboard Shortcuts',
    'designer.toolbar.showRuler': 'Show Ruler',
    'designer.toolbar.stickyNote': 'Sticky Note (S)',
    'designer.toolbar.viewGroup': 'View Controls',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => translations[key] ?? fallback ?? key,
    }),
}));

vi.mock('../../../utils/antdStaticBridge', () => ({
    appModal: { confirm: mocks.confirm },
}));

class MockResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { void callback; }
    observe(target: Element, options?: ResizeObserverOptions): void { void target; void options; }
    unobserve(target: Element): void { void target; }
    disconnect(): void { return; }
}

import { ModernFlowchartToolbar } from '../ModernFlowchartToolbar';

const renderToolbar = () => render(
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
        onShowCanvasSearch={vi.fn()}
        showRuler={false}
        toggleRuler={vi.fn()}
        onActivatePointer={vi.fn()}
        toggleSelectionMode={vi.fn()}
        onToggleDrawingMode={vi.fn()}
        onAddStickyNote={vi.fn()}
        onAddMindMap={vi.fn()}
    />,
);

describe('ModernFlowchartToolbar localized workflows', () => {
    beforeEach(() => {
        mocks.confirm.mockReset();
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

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the complete creation-tools menu in English', async () => {
        renderToolbar();

        fireEvent.click(await screen.findByRole('button', { name: 'More Actions' }));

        expect(await screen.findByText('Creation Tools')).toBeTruthy();
        expect(screen.getByRole('menuitemradio', { name: 'Select (V)' })).toBeTruthy();
        expect(screen.getByRole('menuitemradio', { name: 'Marquee Select (M)' })).toBeTruthy();
        expect(screen.getByRole('menuitemradio', { name: 'Freehand Draw (P)' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Sticky Note (S)' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Mind Map (Shift+M)' })).toBeTruthy();
        expect(screen.queryByText('操作工具')).toBeNull();
        expect(screen.queryByText('便签 (S)')).toBeNull();
    });

    it('defaults destructive reset to cancel and restores focus to More Actions after close', async () => {
        renderToolbar();

        const trigger = await screen.findByRole('button', { name: 'More Actions' });
        fireEvent.click(trigger);
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset Local Editor State' }));

        expect(mocks.confirm).toHaveBeenCalledTimes(1);
        const options = mocks.confirm.mock.calls[0]?.[0] as {
            afterClose?: () => void;
            autoFocusButton?: 'ok' | 'cancel' | null;
            getContainer?: () => HTMLElement;
            rootClassName?: string;
            zIndex?: number;
        };
        expect(options.autoFocusButton).toBe('cancel');
        expect(options.getContainer?.()).toBe(document.body);
        expect(options.rootClassName).toContain('commercial-viewport-modal');
        expect(options.rootClassName).toContain('local-editor-reset-confirm');
        expect(options.zIndex).toBe(2200);
        expect(options.afterClose).toBeTypeOf('function');

        vi.useFakeTimers();
        document.body.tabIndex = -1;
        document.body.focus();
        expect(document.activeElement).toBe(document.body);
        options.afterClose?.();
        vi.runAllTimers();

        expect(document.activeElement).toBe(trigger);
    });

    it('keeps the mobile More Actions menu above and clear of the bottom dock', () => {
        const css = readFileSync('src/core/components/diagrams/ModernFlowchartToolbar.css', 'utf8');

        expect(css).toMatch(
            /body \.flowchart-mobile-more-menu\s*\{[\s\S]*?--flowchart-mobile-dock-clearance:\s*calc\(88px \+ env\(safe-area-inset-bottom, 0px\)\);/,
        );
        expect(css).toMatch(
            /body \.flowchart-mobile-more-menu\s*\{[\s\S]*?inset:\s*var\(--flowchart-mobile-menu-top-clearance\) auto var\(--flowchart-mobile-dock-clearance\) 8px !important;/,
        );
        expect(css).toMatch(
            /body \.flowchart-mobile-more-menu\s*\{[\s\S]*?z-index:\s*1200 !important;/,
        );
        expect(css).toMatch(
            /body \.flowchart-mobile-more-menu\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;/,
        );
    });
});
