// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    FlowchartDesignerLeftSidebar,
    FlowchartDesignerOverlaysRegion,
    FlowchartDesignerRightSidebarRegion,
} from '../FlowchartDesignerShellRegions';

vi.mock('../IconRailSidebar', () => ({
    IconRailSidebar: (props: { pluginPanels: unknown[] }) => (
        <div data-testid="left-sidebar">{props.pluginPanels.length}</div>
    ),
}));

vi.mock('../DesignerRightSidebar', () => ({
    DesignerRightSidebar: (props: { aiChatVisible: boolean }) => (
        <div data-testid="right-sidebar" data-ai-visible={String(props.aiChatVisible)} />
    ),
}));

vi.mock('../ui/DesignerOverlaysLayer', () => ({
    DesignerOverlaysLayer: (props: { status: { nodeCount: number; edgeCount: number } }) => (
        <div data-testid="designer-overlays">
            {props.status.nodeCount}:{props.status.edgeCount}
        </div>
    ),
}));

vi.mock('../../layout/MobileBottomDock', () => ({
    MobileBottomDock: (props: { onAiClick: () => void }) => (
        <button data-testid="mobile-ai" onClick={props.onAiClick}>AI</button>
    ),
}));

vi.mock('../LaserPointer', () => ({
    LaserPointer: (props: { active: boolean }) => (
        <div data-testid="laser" data-active={String(props.active)} />
    ),
}));

describe('FlowchartDesigner shell regions', () => {
    it('isolates plugin sidebar panels and honors sidebar visibility', () => {
        const model = {
            activePlugin: { contributeSidebarPanels: vi.fn(() => [{ id: 'plugin-panel' }]) },
            pluginCtx: {},
            isSidebarHidden: false,
            nodes: [],
            layers: [],
            templates: [],
            groupedTemplates: [],
        };
        const { rerender } = render(<FlowchartDesignerLeftSidebar model={model} />);

        expect(screen.getByTestId('left-sidebar').textContent).toBe('1');
        rerender(<FlowchartDesignerLeftSidebar model={{ ...model, isSidebarHidden: true }} />);
        expect(screen.queryByTestId('left-sidebar')).toBeNull();
    });

    it('forwards AI visibility to the right sidebar adapter', () => {
        render(<FlowchartDesignerRightSidebarRegion model={{
            activeRightTab: 'ai',
            aiChatVisible: true,
            selectedNodes: [],
            selectedEdges: [],
            pluginCtx: {},
        }} />);

        expect(screen.getByTestId('right-sidebar').getAttribute('data-ai-visible')).toBe('true');
    });

    it('renders overlay status and keeps mobile AI toggling inside the overlay region', () => {
        const setAiChatVisible = vi.fn();
        const setActiveRightTab = vi.fn();
        render(<FlowchartDesignerOverlaysRegion model={{
            activeRightTab: 'ai',
            canRedo: false,
            canUndo: false,
            commandPaletteItems: [],
            commandPaletteVisible: false,
            diagramIdForExport: 'diagram-1',
            edges: [{ id: 'edge-1' }],
            isMobile: true,
            isVersionHistoryOpen: false,
            jsonEditorVisible: false,
            laserEnabled: true,
            mobilePropertyDrawerVisible: false,
            nodes: [{ id: 'node-1' }],
            presentationActive: false,
            presentationSlides: [],
            saveState: 'idle',
            selectedEdges: [],
            selectedNodes: [],
            setActiveRightTab,
            setAiChatVisible,
            shortcutHelpVisible: false,
            showShortcuts: false,
        }} />);

        expect(screen.getByTestId('designer-overlays').textContent).toBe('1:1');
        expect(screen.getByTestId('laser').getAttribute('data-active')).toBe('false');
        fireEvent.click(screen.getByTestId('mobile-ai'));
        expect(setAiChatVisible).toHaveBeenCalledWith(false);
        expect(setActiveRightTab).toHaveBeenCalledWith('property');
    });

    it('hides editing sidebars and the mobile dock during presentation', () => {
        const model = {
            activePlugin: {},
            activeRightTab: 'property',
            aiChatVisible: false,
            isMobile: true,
            isSidebarHidden: false,
            layers: [],
            nodes: [],
            pluginCtx: {},
            presentationActive: true,
            selectedEdges: [],
            selectedNodes: [],
            templates: [],
            groupedTemplates: [],
        };

        const { container } = render(
            <>
                <FlowchartDesignerLeftSidebar model={model} />
                <FlowchartDesignerRightSidebarRegion model={model} />
                <FlowchartDesignerOverlaysRegion model={{
                    ...model,
                    canRedo: false,
                    canUndo: false,
                    commandPaletteItems: [],
                    commandPaletteVisible: false,
                    diagramIdForExport: 'diagram-1',
                    edges: [],
                    isVersionHistoryOpen: false,
                    jsonEditorVisible: false,
                    laserEnabled: true,
                    mobilePropertyDrawerVisible: false,
                    presentationSlides: [],
                    saveState: 'idle',
                    shortcutHelpVisible: false,
                    showShortcuts: false,
                }} />
            </>,
        );

        expect(screen.queryByTestId('left-sidebar')).toBeNull();
        expect(screen.queryByTestId('right-sidebar')).toBeNull();
        expect(screen.queryByTestId('mobile-ai')).toBeNull();
        expect(screen.getByTestId('laser').getAttribute('data-active')).toBe('true');
        expect(container).toBeTruthy();
    });
});
