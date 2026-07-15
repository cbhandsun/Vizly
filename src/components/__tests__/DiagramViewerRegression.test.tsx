import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const canvasOpsMock = vi.fn(() => ({}));
const importAIDiagramJsonToBridgeMock = vi.fn();
const handleToggleFullscreenMock = vi.fn();
const exportToPNGMock = vi.fn();
const exportToPDFMock = vi.fn();
const exportToSVGMock = vi.fn();
const exportToGIFMock = vi.fn();
const useDiagramControlsMock = vi.fn(() => ({
    handleFitDiagram: vi.fn(),
    handleBackToTop: vi.fn(),
    handleToggleFullscreen: handleToggleFullscreenMock,
    exportToPNG: exportToPNGMock,
    exportToPDF: exportToPDFMock,
    exportToSVG: exportToSVGMock,
    exportToGIF: exportToGIFMock,
}));

vi.mock('../diagramViewerAiBridge', () => ({
    createDiagramViewerCanvasOps: (...args: unknown[]) => canvasOpsMock(...args),
    importAIDiagramJsonToBridge: (...args: unknown[]) => importAIDiagramJsonToBridgeMock(...args),
}));

vi.mock('@/core/hooks/useDiagramControls', () => ({
    useDiagramControls: (...args: unknown[]) => useDiagramControlsMock(...args),
}));

vi.mock('@/core/hooks/useDiagramHostStorage', () => ({
    useDiagramHostStorage: () => ({
        selectedDiagramId: 'test-diagram',
        saveSelectedDiagramId: vi.fn(),
        addRecentDiagram: vi.fn(),
    }),
}));

vi.mock('@/core/hooks/useUIState', () => ({
    useUIState: () => ({
        isFullscreen: false,
        handleToggleFullscreen: vi.fn(),
    }),
}));

vi.mock('@/core/hooks/useConfigIntegration', () => ({
    useConfigIntegration: () => ([{ isReady: false }, { removeConfig: vi.fn(), setConfig: vi.fn() }]),
    useConfigValue: (initialValue: unknown) => [initialValue, vi.fn()],
}));

vi.mock('@/core/hooks/diagramHostStorage', () => ({
    readFavoriteDiagramIds: () => [],
    readRecentDiagramIds: () => [],
    writeFavoriteDiagramIds: vi.fn(),
}));

vi.mock('../context/useSubscription', () => ({
    useSubscription: () => ({
        hasFeature: () => true,
        jwtToken: '',
        showUpgradeModal: vi.fn(),
    }),
}));

vi.mock('../diagrams/collaboration/YjsProviderHooks', () => ({
    useYjsCollaboration: () => ({
        isSynced: false,
        pushLocalChangesToYjs: vi.fn(),
        activeUsers: [],
        provider: undefined,
    }),
}));

vi.mock('../diagrams/hooks/useCloudSave', () => ({
    useCloudSave: () => ({
        saveToCloud: vi.fn(),
        shareDialogOpen: false,
        closeShareDialog: vi.fn(),
        ensureSaved: vi.fn(),
    }),
}));

vi.mock('@/core/components/shared/DiagramControlBridge', () => ({
    default: () => <div data-testid="diagram-control-bridge" />,
}));

vi.mock('../layout/DiagramLayout', () => ({
    DiagramLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../ui/DiagramSettingsPanel', () => ({
    DiagramSettingsPanel: () => <div />,
}));

vi.mock('../ui/EnhancedThemeSelector', () => ({
    EnhancedThemeSelector: () => <div />,
}));

vi.mock('@/core/themes/DiagramThemeProvider', () => ({
    DiagramThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/core/components/ui/CommandPalette', () => ({
    CommandPalette: () => <div />,
}));

vi.mock('@/core/components/ui/commandPaletteStorage', () => ({
    readRecentCommandIds: () => [],
}));

vi.mock('../ui/DraggableSettingsPanel', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../diagrams/ui/TemplateCascaderMenu', () => ({
    default: () => <div />,
}));

vi.mock('../diagramViewerCommandItems', () => ({
    createDiagramViewerCommandItems: vi.fn(() => []),
    getDiagramViewerCommandModifierLabel: () => 'Ctrl',
}));

vi.mock('../diagramViewerNavigation', () => ({
    openDiagramViewerInNewTab: vi.fn(),
    seedAutoSaveAndNavigateDiagram: vi.fn(),
    selectDiagramInViewer: vi.fn(),
}));

vi.mock('../diagramViewerSave', () => ({
    isDiagramViewerBridgeSavable: () => true,
    saveDiagramViewerCloudReplica: vi.fn(),
    saveDiagramViewerDirectCloud: vi.fn(),
}));

vi.mock('../diagramViewerKeyboard', () => ({
    createDiagramViewerGlobalKeydownHandler: vi.fn(() => vi.fn()),
}));

vi.mock('../diagramViewerSwitchGuard', () => ({
    ensureDiagramSwitchConfirmed: vi.fn(),
}));

vi.mock('../diagramViewerSeedNavigation', () => ({
    finalizeDiagramSeedNavigation: vi.fn(),
    normalizeDiagramSeedData: vi.fn(({ convertStandardDataToCanvas }) => convertStandardDataToCanvas({ nodes: [], edges: [] })),
}));

vi.mock('@/core/utils/diagramSnapshot', () => ({
    tryAttachDiagramSnapshot: vi.fn(),
}));

vi.mock('@/core/utils/remoteDiagramPreview', () => ({
    invalidateRemoteDiagramPreview: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        info: vi.fn(),
        error: vi.fn(),
        loading: vi.fn(() => vi.fn()),
    },
    appModal: {
        confirm: vi.fn(),
    },
}));

vi.mock('@/core/plugins/registry', () => ({
    resolvePluginId: () => undefined,
}));

vi.mock('@/core/plugins/builtInPlugins', () => ({
    ensureBuiltInPlugins: vi.fn(),
}));

vi.mock('@/data/standardized/presetMetadata', () => ({
    getStandardPresetDocTypeById: () => undefined,
}));

vi.mock('@/core/utils/diagramTypeStorage', () => ({
    getDiagramDocTypeFromStorage: () => undefined,
}));

vi.mock('@/core/utils/autoSaveStorage', () => ({
    createAutoSavePayload: vi.fn(() => ({})),
}));

vi.mock('@/core/utils/flowDataBridge', () => ({
    getFlowDataBridge: vi.fn(),
    getFlowDataBridgeEdges: vi.fn(() => [
        { id: 'edge-1', source: 'node-1', target: 'node-2' },
    ]),
    getFlowDataBridgeNodes: vi.fn(() => [
        { id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 'node-2', position: { x: 120, y: 0 }, data: { label: 'B' } },
    ]),
    removeFlowDataBridge: vi.fn(),
}));

vi.mock('@/core/utils/customPresetStorage', () => ({
    addCustomPreset: vi.fn(),
    getCustomPreset: vi.fn(),
}));

vi.mock('../diagramViewerLocation', () => ({
    getDiagramViewerRouteParam: () => 'test-diagram',
    setDiagramSearchParam: vi.fn(),
    buildDiagramHashRoute: vi.fn(() => '/diagram'),
}));

vi.mock('../diagramViewerLogging', () => ({
    logDiagramViewerBridgeCleanupFailure: vi.fn(),
    logDiagramViewerCommandPaletteStateFailure: vi.fn(),
    logDiagramViewerDirectSaveFailure: vi.fn(),
    logDiagramViewerDocTypeDetectionFailure: vi.fn(),
    logDiagramViewerEdgeModeInitializationFailure: vi.fn(),
    logDiagramViewerFullscreenExitFailure: vi.fn(),
    logDiagramViewerMermaidImportFailure: vi.fn(),
    logDiagramViewerOpenNewTabFailure: vi.fn(),
    logDiagramViewerRemoteLoadFailure: vi.fn(),
    logDiagramViewerSaveAsFailure: vi.fn(),
    logDiagramViewerStandardDataLayoutFallbackFailure: vi.fn(),
    logDiagramViewerSwitchConfirmationFailure: vi.fn(),
}));

vi.mock('@/data/diagram-definitions', () => ({
    diagramDefinitions: [{
        id: 'test-diagram',
        name: 'test',
        component: () => <div data-testid="diagram" />,
    }],
}));

vi.mock('@/services/remoteDiagramContent', () => ({
    parseRemoteDiagramContent: vi.fn(),
}));

vi.mock('../ui/ErrorBoundary', () => ({
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
    }),
}));

vi.mock('@/core/components/ui/commandPaletteStorage', () => ({
    readRecentCommandIds: vi.fn(() => []),
}));

import DiagramViewer from '../DiagramViewer';

describe('DiagramViewer regression', () => {
    it('passes diagram export callbacks from useDiagramControls into ai canvas ops', () => {
        canvasOpsMock.mockReset();
        useDiagramControlsMock.mockClear();

        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        expect(screen.getByTestId('diagram')).toBeInTheDocument();
        expect(canvasOpsMock).toHaveBeenCalledTimes(1);
        const callArg = canvasOpsMock.mock.calls[0]?.[0] as { onExportPNG?: unknown; onExportPDF?: unknown; onExportSVG?: unknown; onExportGIF?: unknown };
        expect(callArg?.onExportPNG).toBe(exportToPNGMock);
        expect(callArg?.onExportPDF).toBe(exportToPDFMock);
        expect(callArg?.onExportSVG).toBe(exportToSVGMock);
        expect(callArg?.onExportGIF).toBe(exportToGIFMock);
        expect(callArg?.diagramId).toBe('test-diagram');
    });

    it('passes an explicit React Flow snapshot provider into export controls', () => {
        useDiagramControlsMock.mockClear();

        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        expect(useDiagramControlsMock).toHaveBeenCalledWith(
            'test-diagram',
            true,
            expect.objectContaining({
                getReactFlowSnapshot: expect.any(Function),
            }),
        );
        const options = useDiagramControlsMock.mock.calls[0]?.[2] as {
            getReactFlowSnapshot: () => { nodes: unknown[]; edges: unknown[] };
        };
        expect(options.getReactFlowSnapshot()).toEqual({
            nodes: [
                { id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'A' } },
                { id: 'node-2', position: { x: 120, y: 0 }, data: { label: 'B' } },
            ],
            edges: [
                { id: 'edge-1', source: 'node-1', target: 'node-2' },
            ],
        });
    });
});
