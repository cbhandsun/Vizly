import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

type CanvasOpsOptions = {
    diagramId?: string;
    onExportPNG?: unknown;
    onExportPDF?: unknown;
    onExportSVG?: unknown;
    onExportGIF?: unknown;
    onSetPresentationMode?: (active: boolean) => void;
};
type DiagramControlsOptions = {
    getReactFlowSnapshot: () => { nodes: unknown[]; edges: unknown[] };
};

const canvasOpsMock = vi.fn((_options: CanvasOpsOptions) => ({}));
const importAIDiagramJsonToBridgeMock = vi.fn((..._args: unknown[]) => undefined);
const handleToggleFullscreenMock = vi.fn();
const exportToPNGMock = vi.fn();
const exportToPDFMock = vi.fn();
const exportToSVGMock = vi.fn();
const exportToGIFMock = vi.fn();
const openShareDialogMock = vi.fn();
const configValueSetterMock = vi.fn();
const { appMessageInfoMock } = vi.hoisted(() => ({ appMessageInfoMock: vi.fn() }));
const useDiagramControlsMock = vi.fn((
    _diagramId: string,
    _ready: boolean,
    _options: DiagramControlsOptions,
) => ({
    handleFitDiagram: vi.fn(),
    handleBackToTop: vi.fn(),
    handleToggleFullscreen: handleToggleFullscreenMock,
    exportToPNG: exportToPNGMock,
    exportToPDF: exportToPDFMock,
    exportToSVG: exportToSVGMock,
    exportToGIF: exportToGIFMock,
}));

vi.mock('../diagramViewerAiBridge', () => ({
    createDiagramViewerCanvasOps: (options: CanvasOpsOptions) => canvasOpsMock(options),
    importAIDiagramJsonToBridge: (...args: unknown[]) => importAIDiagramJsonToBridgeMock(...args),
}));

vi.mock('@vizly/core/editor-hooks', () => ({
    useDiagramControls: (
        diagramId: string,
        ready: boolean,
        options: DiagramControlsOptions,
    ) => useDiagramControlsMock(diagramId, ready, options),
    useDiagramHostStorage: () => ({
        selectedDiagramId: 'test-diagram',
        saveSelectedDiagramId: vi.fn(),
        addRecentDiagram: vi.fn(),
    }),
    useUIState: () => ({
        isFullscreen: false,
        handleToggleFullscreen: vi.fn(),
    }),
    useConfigIntegration: () => ([{ isReady: false }, { removeConfig: vi.fn(), setConfig: vi.fn() }]),
    useConfigValue: (initialValue: unknown) => [initialValue, configValueSetterMock],
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
        openShareDialog: openShareDialogMock,
        closeShareDialog: vi.fn(),
        ensureSaved: vi.fn(),
    }),
}));

vi.mock('@vizly/core/editor-ui', () => ({
    DiagramControlBridge: () => <div data-testid="diagram-control-bridge" />,
    CommandPalette: () => <div />,
}));

vi.mock('../layout/DiagramLayout', () => ({
    DiagramLayout: ({ children, toolbarProps }: {
        children: React.ReactNode;
        toolbarProps?: {
            leftChildren?: React.ReactNode | ((switcherOpen: boolean) => React.ReactNode);
        };
    }) => {
        const [switcherOpen, setSwitcherOpen] = React.useState(false);
        const leftChildren = typeof toolbarProps?.leftChildren === 'function'
            ? toolbarProps.leftChildren(switcherOpen)
            : toolbarProps?.leftChildren;
        return (
            <div>
                <button type="button" onClick={() => setSwitcherOpen(open => !open)}>toggle-switcher</button>
                {leftChildren}
                {children}
            </div>
        );
    },
}));

vi.mock('../ui/DiagramSettingsPanel', () => ({
    DiagramSettingsPanel: (props: {
        editingEnabled?: boolean;
        onEdgeModeChange: (value: 'advanced-smart' | 'native') => Promise<void>;
        onLayoutStrategyChange: (value: string) => Promise<void>;
        onNodeLayoutStrategyChange: (value: string) => Promise<void>;
        onElkAlgorithmChange: (value: string) => Promise<void>;
        onRefreshRequest: () => void;
    }) => (
        <div data-testid="settings-panel" data-editing-enabled={String(props.editingEnabled)}>
            <button type="button" onClick={() => void props.onEdgeModeChange('native')}>mutate-edge</button>
            <button type="button" onClick={() => void props.onLayoutStrategyChange('layout')}>mutate-layout</button>
            <button type="button" onClick={() => void props.onNodeLayoutStrategyChange('node-layout')}>mutate-node-layout</button>
            <button type="button" onClick={() => void props.onElkAlgorithmChange('force')}>mutate-elk</button>
            <button type="button" onClick={props.onRefreshRequest}>refresh-settings</button>
        </div>
    ),
}));

vi.mock('../ui/EnhancedThemeSelector', () => ({
    EnhancedThemeSelector: () => <div />,
}));

vi.mock('@vizly/core/theme', () => ({
    DiagramThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ui/DraggableSettingsPanel', () => {
    const MockDraggableSettingsPanel = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
    return {
        default: MockDraggableSettingsPanel,
        DraggableSettingsPanel: MockDraggableSettingsPanel,
    };
});

vi.mock('../diagrams/ui/TemplateCascaderMenu', () => ({
    TemplateCascaderMenu: () => <div data-testid="template-cascader" />,
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

vi.mock('@vizly/core/export', () => ({
    tryAttachDiagramSnapshot: vi.fn(),
}));

vi.mock('@/services/remoteDiagramPreview', () => ({
    invalidateRemoteDiagramPreview: vi.fn(),
}));

vi.mock('@vizly/core/antd', () => ({
    appMessage: {
        info: appMessageInfoMock,
        error: vi.fn(),
        loading: vi.fn(() => vi.fn()),
    },
    appModal: {
        confirm: vi.fn(),
    },
}));

vi.mock('@vizly/core/plugins', () => ({
    resolvePluginId: () => undefined,
    ensureBuiltInPlugins: vi.fn(),
}));

vi.mock('@/data/standardized/presetMetadata', () => ({
    getStandardPresetDocTypeById: () => undefined,
}));

vi.mock('@vizly/core/storage', async (importOriginal) => ({
    ...await importOriginal<typeof import('@vizly/core/storage')>(),
    readRecentCommandIds: vi.fn(() => []),
    getDiagramDocTypeFromStorage: () => undefined,
    createAutoSavePayload: vi.fn(() => ({})),
    addCustomPreset: vi.fn(),
    getCustomPreset: vi.fn(),
}));

vi.mock('@vizly/core/diagram-data', () => ({
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
        component: (props: {
            isReadonly?: boolean;
            onOpenShareDialog?: () => void;
            onOpenSettings?: () => void;
            onReadonlyChange?: (value: boolean) => void;
        }) => (
            <div data-testid="diagram" data-readonly={String(props.isReadonly)}>
                <button type="button" onClick={props.onOpenShareDialog}>share</button>
                <button type="button" onClick={props.onOpenSettings}>open-settings</button>
                <button type="button" onClick={() => props.onReadonlyChange?.(true)}>lock</button>
            </div>
        ),
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

import DiagramViewer from '../DiagramViewer';

describe('DiagramViewer regression', () => {
    it('mounts the template catalog only while the diagram switcher is open', async () => {
        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        expect(screen.queryByTestId('template-cascader')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'toggle-switcher' }));
        expect(await screen.findByTestId('template-cascader')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'toggle-switcher' }));
        expect(screen.queryByTestId('template-cascader')).toBeNull();
    });

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
        const callArg = canvasOpsMock.mock.calls[0]?.[0];
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
        const options = useDiagramControlsMock.mock.calls[0]?.[2];
        expect(options?.getReactFlowSnapshot()).toEqual({
            nodes: [
                { id: 'node-1', position: { x: 0, y: 0 }, data: { label: 'A' } },
                { id: 'node-2', position: { x: 120, y: 0 }, data: { label: 'B' } },
            ],
            edges: [
                { id: 'edge-1', source: 'node-1', target: 'node-2' },
            ],
        });
    });

    it('wires the cloud share action into the selected designer', () => {
        openShareDialogMock.mockClear();

        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'share' }));
        expect(openShareDialogMock).toHaveBeenCalledTimes(1);
    });

    it('synchronizes the selected designer lock state back into the viewer host', () => {
        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        expect(screen.getByTestId('diagram')).toHaveAttribute('data-readonly', 'false');
        fireEvent.click(screen.getByRole('button', { name: 'lock' }));
        expect(screen.getByTestId('diagram')).toHaveAttribute('data-readonly', 'true');
    });

    it('opens the settings shell synchronously instead of suspending its existing content', () => {
        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('button', { name: 'open-settings' }));
        expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
        expect(document.querySelector('[data-settings-panel-phase="loading"]')).toBeNull();
    });

    it('guards settings document mutations after the designer locks the canvas', async () => {
        configValueSetterMock.mockClear();

        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'open-settings' }));
        expect(await screen.findByTestId('settings-panel')).toHaveAttribute('data-editing-enabled', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'lock' }));
        expect(screen.getByTestId('settings-panel')).toHaveAttribute('data-editing-enabled', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'mutate-edge' }));
        fireEvent.click(screen.getByRole('button', { name: 'mutate-layout' }));
        fireEvent.click(screen.getByRole('button', { name: 'mutate-node-layout' }));
        fireEvent.click(screen.getByRole('button', { name: 'mutate-elk' }));
        fireEvent.click(screen.getByRole('button', { name: 'refresh-settings' }));

        expect(configValueSetterMock).not.toHaveBeenCalled();
    });

    it('exposes a localized keyboard-operable presentation exit action', () => {
        canvasOpsMock.mockClear();
        appMessageInfoMock.mockClear();
        render(
            <MemoryRouter initialEntries={['/diagram?diagram=test-diagram']}>
                <DiagramViewer />
            </MemoryRouter>
        );

        const options = canvasOpsMock.mock.calls[0]?.[0];
        act(() => options?.onSetPresentationMode?.(true));

        const exit = screen.getByRole('button', { name: 'diagramViewer.presentation.hint' });
        expect(exit).toHaveAttribute('aria-keyshortcuts', 'Escape');
        expect(exit.className).toContain('min-h-[44px]');
        fireEvent.click(exit);

        expect(screen.queryByRole('button', { name: 'diagramViewer.presentation.hint' })).toBeNull();
        expect(appMessageInfoMock).toHaveBeenCalledWith('diagramViewer.presentation.exit');
    });
});
