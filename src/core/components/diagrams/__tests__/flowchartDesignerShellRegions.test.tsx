// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    FlowchartDesignerLeftSidebar,
    FlowchartDesignerOverlaysRegion,
    FlowchartDesignerRightSidebarRegion,
    type FlowchartDesignerLeftSidebarModel,
    type FlowchartDesignerOverlaysModel,
    type FlowchartDesignerRightSidebarModel,
} from '../FlowchartDesignerShellRegions';
import { setDesignerCommandPaletteVisibility } from '../commandPaletteOwnership';
import {
    shouldShowFlowchartMinimapByDefault,
    shouldShowFlowchartOnboarding,
} from '../flowchartResponsiveChrome';
import type { PluginContext } from '../../../types/plugin';

vi.mock('../IconRailSidebar', () => ({
    IconRailSidebar: (props: { pluginPanels: unknown[]; requestedPanel?: string | null }) => (
        <div data-testid="left-sidebar" data-requested-panel={props.requestedPanel ?? ''}>
            {props.pluginPanels.length}
        </div>
    ),
}));

vi.mock('../DesignerRightSidebar', () => ({
    DesignerRightSidebar: (props: {
        aiChatVisible: boolean;
        mobileOpen?: boolean;
        onMobileOpenChange?: (open: boolean) => void;
    }) => (
        <button
            data-testid="right-sidebar"
            data-ai-visible={String(props.aiChatVisible)}
            data-mobile-open={String(props.mobileOpen)}
            onClick={() => props.onMobileOpenChange?.(false)}
        />
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
    MobileBottomDock: (props: {
        activeTab: 'property' | 'ai' | null;
        onAddClick: () => void;
        onLayerClick: () => void;
        onPropertyClick: () => void;
        onAiClick: () => void;
    }) => (
        <>
            <output data-testid="mobile-active-tab">{props.activeTab ?? ''}</output>
            <button data-testid="mobile-add" onClick={props.onAddClick}>Add</button>
            <button data-testid="mobile-layers" onClick={props.onLayerClick}>Layers</button>
            <button data-testid="mobile-property" onClick={props.onPropertyClick}>Property</button>
            <button data-testid="mobile-ai" onClick={props.onAiClick}>AI</button>
        </>
    ),
}));

vi.mock('../LaserPointer', () => ({
    LaserPointer: (props: { active: boolean }) => (
        <div data-testid="laser" data-active={String(props.active)} />
    ),
}));

const createPluginContext = (): PluginContext => ({
    getNodes: () => [],
    getEdges: () => [],
    updateNodesBatch: () => undefined,
    updateEdgesBatch: () => undefined,
    takeSnapshot: () => undefined,
    nodes: [],
    edges: [],
    setNodes: () => undefined,
    setEdges: () => undefined,
    addNode: () => 'node-1',
});

const createLeftModel = (
    overrides: Partial<FlowchartDesignerLeftSidebarModel> = {},
): FlowchartDesignerLeftSidebarModel => ({
    activeLayerId: 'default',
    activePlugin: undefined,
    createLayer: () => undefined,
    deleteLayer: () => undefined,
    deleteTemplate: () => undefined,
    groupedTemplates: {},
    handleFocusNode: () => undefined,
    handleUseTemplate: () => undefined,
    isInitialDiagramLoading: false,
    isMobile: false,
    isSidebarHidden: false,
    layers: [],
    mobileRequestedPanel: null,
    nodes: [],
    pluginCtx: null,
    presentationActive: false,
    renameLayer: () => undefined,
    renameTemplate: () => undefined,
    reorderLayers: () => undefined,
    selectedNodes: [],
    setActiveLayerId: () => undefined,
    setLayerColor: () => undefined,
    setLeftDrawerOpen: () => undefined,
    setLeftDrawerWidth: () => undefined,
    setMobileRequestedPanel: () => undefined,
    templates: [],
    toggleLock: () => undefined,
    toggleVisibility: () => undefined,
    ...overrides,
});

const createRightModel = (
    overrides: Partial<FlowchartDesignerRightSidebarModel> = {},
): FlowchartDesignerRightSidebarModel => ({
    activePlugin: undefined,
    activeRightTab: 'property',
    aiChatVisible: false,
    handleBeforeUpdate: () => undefined,
    id: 'diagram-1',
    isDraggingNode: false,
    isMobile: false,
    leftDrawerOpen: false,
    mobilePropertyDrawerVisible: false,
    onAiTabIntercept: undefined,
    pluginCtx: null,
    presentationActive: false,
    renderAIChatPanel: undefined,
    selectedEdges: [],
    selectedNodes: [],
    setActiveRightTab: () => undefined,
    setAiChatVisible: () => undefined,
    setMobilePropertyDrawerVisible: () => undefined,
    setRightSidebarWidth: () => undefined,
    showAiCrown: false,
    updateEdgesBatch: () => undefined,
    updateNodesBatch: () => undefined,
    ...overrides,
});

const createOverlaysModel = (
    overrides: Partial<FlowchartDesignerOverlaysModel> = {},
): FlowchartDesignerOverlaysModel => ({
    activeRightTab: 'property',
    canRedo: false,
    canUndo: false,
    commandPaletteItems: [],
    commandPaletteVisible: false,
    diagramIdForExport: 'diagram-1',
    diffResult: null,
    edges: [],
    handleOpenSettings: () => undefined,
    handlePresentationFocus: () => undefined,
    id: 'diagram-1',
    isMobile: false,
    isVersionHistoryOpen: false,
    jsonEditorInitialContent: undefined,
    jsonEditorVisible: false,
    laserEnabled: false,
    mobilePropertyDrawerVisible: false,
    nodes: [],
    onOpenSettings: undefined,
    onVersionHistoryClose: undefined,
    presentationActive: false,
    presentationSlides: [],
    reactFlowInstance: null,
    redo: () => undefined,
    renderAIConfigModal: undefined,
    renderShareDialog: undefined,
    renderVersionHistoryPanel: undefined,
    saveState: { saving: false, lastSaved: null, error: null },
    saveTarget: 'local',
    selectedEdges: [],
    selectedNodes: [],
    setActiveRightTab: () => undefined,
    setAiChatVisible: () => undefined,
    setCommandPaletteVisible: () => undefined,
    setDiffResult: () => undefined,
    setEdges: () => undefined,
    setJsonEditorVisible: () => undefined,
    setMobileRequestedPanel: () => undefined,
    setMobilePropertyDrawerVisible: () => undefined,
    setNodes: () => undefined,
    setPresentationActive: () => undefined,
    setShortcutHelpVisible: () => undefined,
    setShowShortcutsModal: () => undefined,
    shortcutHelpVisible: false,
    showPerformanceDashboard: false,
    showShortcuts: false,
    undo: () => undefined,
    ...overrides,
});

describe('FlowchartDesigner shell regions', () => {
    it('delegates command palette ownership to the host without opening a duplicate internal panel', () => {
        const openHostCommandPalette = vi.fn();
        const setInternalVisibility = vi.fn();

        setDesignerCommandPaletteVisibility({
            visible: true,
            openHostCommandPalette,
            setInternalVisibility,
        });

        expect(openHostCommandPalette).toHaveBeenCalledTimes(1);
        expect(setInternalVisibility).not.toHaveBeenCalled();

        setDesignerCommandPaletteVisibility({
            visible: false,
            openHostCommandPalette,
            setInternalVisibility,
        });

        expect(setInternalVisibility).toHaveBeenCalledWith(false);
    });

    it('keeps first-run guidance and the minimap from crowding the mobile canvas', () => {
        expect(shouldShowFlowchartMinimapByDefault(true)).toBe(false);
        expect(shouldShowFlowchartMinimapByDefault(false)).toBe(true);

        const onboardingState = {
            pluginId: 'flowchart',
            isInitialDiagramLoading: false,
            onboardingDismissed: false,
            leftDrawerOpen: false,
            nodeCount: 0,
            edgeCount: 0,
            jsonEditorVisible: false,
            selectedNodeCount: 0,
            selectedEdgeCount: 0,
        };

        expect(shouldShowFlowchartOnboarding({
            ...onboardingState,
            isMobile: true,
        })).toBe(false);
        expect(shouldShowFlowchartOnboarding({
            ...onboardingState,
            isMobile: false,
        })).toBe(true);
        expect(shouldShowFlowchartOnboarding({
            ...onboardingState,
            isMobile: false,
            leftDrawerOpen: true,
        })).toBe(false);
    });

    it('isolates plugin sidebar panels and honors sidebar visibility', () => {
        const model = createLeftModel({
            activePlugin: {
                contributeSidebarPanels: vi.fn(() => [{
                    id: 'plugin-panel',
                    title: 'Plugin',
                    icon: null,
                    content: null,
                }]),
            },
            pluginCtx: createPluginContext(),
        });
        const { rerender } = render(<FlowchartDesignerLeftSidebar model={model} />);

        expect(screen.getByTestId('left-sidebar').textContent).toBe('1');
        rerender(<FlowchartDesignerLeftSidebar model={{ ...model, isSidebarHidden: true }} />);
        expect(screen.queryByTestId('left-sidebar')).toBeNull();
    });

    it('forwards AI visibility and controlled mobile visibility to the right sidebar adapter', () => {
        const setMobilePropertyDrawerVisible = vi.fn();
        render(<FlowchartDesignerRightSidebarRegion model={createRightModel({
            activeRightTab: 'ai',
            aiChatVisible: true,
            isMobile: true,
            mobilePropertyDrawerVisible: true,
            pluginCtx: createPluginContext(),
            setMobilePropertyDrawerVisible,
        })} />);

        expect(screen.getByTestId('right-sidebar').getAttribute('data-ai-visible')).toBe('true');
        expect(screen.getByTestId('right-sidebar').getAttribute('data-mobile-open')).toBe('true');
        fireEvent.click(screen.getByTestId('right-sidebar'));
        expect(setMobilePropertyDrawerVisible).toHaveBeenCalledWith(false);
    });

    it('renders overlay status and closes an already open mobile AI drawer', () => {
        const setAiChatVisible = vi.fn();
        const setMobilePropertyDrawerVisible = vi.fn();
        render(<FlowchartDesignerOverlaysRegion model={createOverlaysModel({
            activeRightTab: 'ai',
            edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
            isMobile: true,
            laserEnabled: true,
            mobilePropertyDrawerVisible: true,
            nodes: [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }],
            setAiChatVisible,
            setMobilePropertyDrawerVisible,
        })} />);

        expect(screen.getByTestId('designer-overlays').textContent).toBe('1:1');
        expect(screen.getByTestId('laser').getAttribute('data-active')).toBe('false');
        expect(screen.getByTestId('mobile-active-tab').textContent).toBe('ai');
        fireEvent.click(screen.getByTestId('mobile-ai'));
        expect(setAiChatVisible).toHaveBeenCalledWith(false);
        expect(setMobilePropertyDrawerVisible).toHaveBeenCalledWith(false);
    });

    it('opens the requested mobile property and AI drawers with a single source of truth', () => {
        const setActiveRightTab = vi.fn();
        const setAiChatVisible = vi.fn();
        const setMobilePropertyDrawerVisible = vi.fn();
        render(<FlowchartDesignerOverlaysRegion model={createOverlaysModel({
            isMobile: true,
            setActiveRightTab,
            setAiChatVisible,
            setMobilePropertyDrawerVisible,
        })} />);

        fireEvent.click(screen.getByTestId('mobile-property'));
        expect(setAiChatVisible).toHaveBeenCalledWith(false);
        expect(setActiveRightTab).toHaveBeenCalledWith('property');
        expect(setMobilePropertyDrawerVisible).toHaveBeenCalledWith(true);

        fireEvent.click(screen.getByTestId('mobile-ai'));
        expect(setActiveRightTab).toHaveBeenCalledWith('ai');
        expect(setAiChatVisible).toHaveBeenCalledWith(true);
        expect(setMobilePropertyDrawerVisible).toHaveBeenLastCalledWith(true);
    });

    it('routes the mobile add and layers actions to the matching sidebar panel', () => {
        const setMobileRequestedPanel = vi.fn();
        render(<FlowchartDesignerOverlaysRegion model={createOverlaysModel({
            isMobile: true,
            setMobileRequestedPanel,
        })} />);

        fireEvent.click(screen.getByTestId('mobile-add'));
        fireEvent.click(screen.getByTestId('mobile-layers'));

        expect(setMobileRequestedPanel).toHaveBeenNthCalledWith(1, 'shapes');
        expect(setMobileRequestedPanel).toHaveBeenNthCalledWith(2, 'layers');
    });

    it('hides editing sidebars and the mobile dock during presentation', () => {
        const leftModel = createLeftModel({ isMobile: true, presentationActive: true });
        const rightModel = createRightModel({ isMobile: true, presentationActive: true });
        const overlaysModel = createOverlaysModel({
            isMobile: true,
            laserEnabled: true,
            presentationActive: true,
        });

        const { container } = render(
            <>
                <FlowchartDesignerLeftSidebar model={leftModel} />
                <FlowchartDesignerRightSidebarRegion model={rightModel} />
                <FlowchartDesignerOverlaysRegion model={overlaysModel} />
            </>,
        );

        expect(screen.queryByTestId('left-sidebar')).toBeNull();
        expect(screen.queryByTestId('right-sidebar')).toBeNull();
        expect(screen.queryByTestId('mobile-ai')).toBeNull();
        expect(screen.getByTestId('laser').getAttribute('data-active')).toBe('true');
        expect(container).toBeTruthy();
    });
});
