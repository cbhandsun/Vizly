import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import Spin from 'antd/es/spin';
import { ConfigProvider } from 'antd';

import { CommandPalette } from '@/core/components/ui/CommandPalette';
import type { CommandItem } from '@/core/types/plugin';
import type {
    DiagramCollaborationStatus,
    DiagramComponentProps,
    DiagramExportFormat,
} from '@/core/types/diagram-components';
import DiagramControlBridge from '@/core/components/shared/DiagramControlBridge';
import { DiagramThemeProvider } from '@/core/themes/DiagramThemeProvider';
import { DiagramLayout } from './layout/DiagramLayout';
import { EnhancedThemeSelector } from './ui/EnhancedThemeSelector';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { subscribeMindMapAIConfigRequest } from '@/core/components/mindmap-v2/mindMapAIConfigEvent';
import { CloudSaveAuthRecovery } from './diagrams/CloudSaveAuthRecovery';
import { loadLayoutPresetMapForDiagram } from '@/data/standardized/layoutPresetMapLoader';

const RoutingDebugPanel = import.meta.env.DEV
    ? lazy(() => import('./debug/RoutingDebugPanel').then(module => ({ default: module.RoutingDebugPanel })))
    : null;
const KeyboardShortcutPanel = lazy(() => import('@/core/components/diagrams/KeyboardShortcutPanel').then(module => ({
    default: module.KeyboardShortcutPanel,
})));
const CollaborationModal = lazy(() => import('./ui/CollaborationModal').then(module => ({ default: module.CollaborationModal })));
const AIConfigModal = lazy(() => import('./ai/AIConfigModal'));
const AIChatView = lazy(() => import('./ai/AIChatPanel').then(module => ({ default: module.AIChatView })));
const ShareDialog = lazy(() => import('@/components/diagrams/ShareDialog'));
const VersionHistoryPanel = lazy(() => import('./diagrams/ui/VersionHistoryPanel').then(module => ({ default: module.VersionHistoryPanel })));
const CloudStorageManagerModal = lazy(() => import('./storage/CloudStorageManagerModal').then(module => ({ default: module.CloudStorageManagerModal })));
const MermaidImportModal = lazy(() => import('./ui/MermaidImportModal').then(module => ({ default: module.MermaidImportModal })));
const DraggableSettingsPanel = lazy(() => import('./ui/DraggableSettingsPanel').then(module => ({ default: module.DraggableSettingsPanel })));
const TemplateCascaderMenu = lazy(() => import('./diagrams/ui/TemplateCascaderMenu').then(module => ({ default: module.TemplateCascaderMenu })));

const renderVersionHistoryPanel = (props: { diagramId: string; isOpen: boolean; onClose: () => void }) => (
    <Suspense fallback={null}>
        <VersionHistoryPanel {...props} />
    </Suspense>
);

type AIChatViewProps = React.ComponentProps<typeof AIChatView>;
type CollaborationModalProps = React.ComponentProps<typeof CollaborationModal>;
type ShareDialogProps = React.ComponentProps<typeof ShareDialog>;
type MermaidImportModalProps = React.ComponentProps<typeof MermaidImportModal>;

interface DiagramViewerViewProps {
    t: TFunction;
    selectedDiagramId: string;
    diagramTitle: string;
    onRenameDiagram?: (title: string) => Promise<void>;
    edgeMode: 'advanced-smart' | 'native';
    setEdgeMode: (mode: 'advanced-smart' | 'native') => void | Promise<void>;
    layoutStrategy: string;
    nodeLayoutStrategy: string;
    elkAlgorithm: string;
    showOnlyMainFlow: boolean;
    setShowOnlyMainFlow: (value: boolean) => void;
    mainFlowAnimationEnabled: boolean;
    setMainFlowAnimationEnabled: (value: boolean) => void;
    isReadonly: boolean;
    onReadonlyChange: (value: boolean) => void;
    isPresentationMode: boolean;
    onExitPresentation: () => void;
    isFullscreen: boolean;
    handleToggleFullscreen: () => void;
    resolvedPluginId?: string;
    handleTemplateChange: (value: string[], leafKey: string, rootGroup: string) => void;
    commandItems: CommandItem[];
    isCommandOpen: boolean;
    setIsCommandOpen: (open: boolean) => void;
    isShortcutsOpen: boolean;
    setIsShortcutsOpen: (open: boolean) => void;
    restoreCommandPaletteFocus: () => void;
    collabModalVisible: boolean;
    setCollabModalVisible: (open: boolean) => void;
    activeUsers: CollaborationModalProps['activeUsers'];
    roomName: string;
    SelectedDiagramComponent: React.ComponentType<DiagramComponentProps> | null;
    refreshNonce: number;
    onExportPermissionCheck: (format: DiagramExportFormat) => boolean;
    isYjsSynced: boolean;
    collaborationStatus: DiagramCollaborationStatus;
    openCollaborationModal: () => void;
    pushLocalChangesToYjs: NonNullable<DiagramComponentProps['onSyncPush']>;
    provider: { awareness?: DiagramComponentProps['yAwareness'] } | null;
    saveToCloud: DiagramComponentProps['onCloudSave'];
    cloudSaveAuthOpen: boolean;
    cloudSaveAuthEnabled: boolean;
    cancelCloudSaveAuthentication: () => void;
    completeCloudSaveAuthentication: () => void;
    restoreCloudSaveFocus: () => void;
    handleDirectSave: () => Promise<void>;
    isSettingsOpen: boolean;
    setIsSettingsOpen: (open: boolean) => void;
    settingsPanel: React.ReactNode;
    aiConfigVisible: boolean;
    setAiConfigVisible: (visible: boolean) => void;
    handlePreviewAIJson: (json: string) => void;
    handleApplyAIJson: (json: string) => void;
    aiNodesRef: AIChatViewProps['diagramNodesRef'];
    aiEdgesRef: AIChatViewProps['diagramEdgesRef'];
    aiCanvasOps: AIChatViewProps['canvasOps'];
    handleAiTabIntercept: () => boolean;
    shareDialogOpen: boolean;
    openShareDialog: NonNullable<DiagramComponentProps['onOpenShareDialog']>;
    closeShareDialog: ShareDialogProps['onClose'];
    ensureSaved: ShareDialogProps['onEnsureSaved'];
    cloudManagerVisible: boolean;
    setCloudManagerVisible: (visible: boolean) => void;
    seedAutoSaveAndNavigate: (data: unknown, id: string) => Promise<void>;
    mermaidModalVisible: boolean;
    setMermaidModalVisible: (visible: boolean) => void;
    handleImportMermaidNodes: MermaidImportModalProps['onImport'];
    showDebugPanel: boolean;
    setShowDebugPanel: (visible: boolean) => void;
}

export const DiagramViewerView: React.FC<DiagramViewerViewProps> = ({
    t,
    selectedDiagramId,
    diagramTitle,
    onRenameDiagram,
    edgeMode,
    setEdgeMode,
    layoutStrategy,
    nodeLayoutStrategy,
    elkAlgorithm,
    showOnlyMainFlow,
    setShowOnlyMainFlow,
    mainFlowAnimationEnabled,
    setMainFlowAnimationEnabled,
    isReadonly,
    onReadonlyChange,
    isPresentationMode,
    onExitPresentation,
    isFullscreen,
    handleToggleFullscreen,
    resolvedPluginId,
    handleTemplateChange,
    commandItems,
    isCommandOpen,
    setIsCommandOpen,
    isShortcutsOpen,
    setIsShortcutsOpen,
    restoreCommandPaletteFocus,
    collabModalVisible,
    setCollabModalVisible,
    activeUsers,
    roomName,
    SelectedDiagramComponent,
    refreshNonce,
    onExportPermissionCheck,
    isYjsSynced,
    collaborationStatus,
    openCollaborationModal,
    pushLocalChangesToYjs,
    provider,
    saveToCloud,
    cloudSaveAuthOpen,
    cloudSaveAuthEnabled,
    cancelCloudSaveAuthentication,
    completeCloudSaveAuthentication,
    restoreCloudSaveFocus,
    handleDirectSave,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsPanel,
    aiConfigVisible,
    setAiConfigVisible,
    handlePreviewAIJson,
    handleApplyAIJson,
    aiNodesRef,
    aiEdgesRef,
    aiCanvasOps,
    handleAiTabIntercept,
    shareDialogOpen,
    openShareDialog,
    closeShareDialog,
    ensureSaved,
    cloudManagerVisible,
    setCloudManagerVisible,
    seedAutoSaveAndNavigate,
    mermaidModalVisible,
    setMermaidModalVisible,
    handleImportMermaidNodes,
    showDebugPanel,
    setShowDebugPanel,
}) => {
    const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
    const [hasMountedAIConfig, setHasMountedAIConfig] = useState(aiConfigVisible);
    const [aiConfigProviderId, setAiConfigProviderId] = useState<string | undefined>();
    const [aiConfigSession, setAiConfigSession] = useState(0);
    const settingsPanelTitle = t('designer.settings.title');
    const loadCurrentLayoutPresetMap = useCallback(
        () => loadLayoutPresetMapForDiagram(selectedDiagramId),
        [selectedDiagramId],
    );

    const openAIConfig = useCallback((providerId?: string) => {
        setAiConfigProviderId(providerId);
        setAiConfigSession(session => session + 1);
        setHasMountedAIConfig(true);
        setAiConfigVisible(true);
    }, [setAiConfigVisible]);

    useEffect(() => subscribeMindMapAIConfigRequest(openAIConfig), [openAIConfig]);

    return (
        <DiagramThemeProvider>
            <DiagramLayout
                isPresentationMode={isPresentationMode}
                toolbarProps={{
                    diagramId: selectedDiagramId,
                    diagramName: diagramTitle,
                    title: diagramTitle,
                    onRenameDiagram,
                    edgeMode: edgeMode || 'advanced-smart',
                    onEdgeModeChange: (mode: 'advanced-smart' | 'native') => setEdgeMode(mode),
                    isFullscreen: isFullscreen,
                    onToggleFullscreen: handleToggleFullscreen,
                    setIsCommandOpen: setIsCommandOpen,
                    showExport: true,
                    showThemeSelector: false,
                    showStyleSwitcher: false,
                    hideCenterIsland: resolvedPluginId === 'mindmap',
                    leftChildren: (switcherOpen) => (
                            <div className="flex items-center max-w-[240px]">
                                <TemplateCascaderMenu
                                    ariaLabel={t('diagramViewer.switcher.open', '打开图表与模板')}
                                    currentDiagramId={selectedDiagramId}
                                    open={switcherOpen}
                                    style={{ width: '100%', minWidth: 160 }}
                                    onChange={handleTemplateChange}
                                />
                            </div>
                    ),
                    centerChildren: null,
                    rightChildren: null
                }}
                showMenu={false}
            >
                {/* Host actions are now unified in the designer's internal toolbar islands */}

                <CommandPalette
                    open={isCommandOpen}
                    onClose={() => setIsCommandOpen(false)}
                    onDismiss={() => {
                        setIsCommandOpen(false);
                        restoreCommandPaletteFocus();
                    }}
                    items={commandItems}
                    getContainer={() => document.getElementById('app-root-layout') || document.body}
                />
                {isShortcutsOpen && (
                    <Suspense fallback={null}>
                        <KeyboardShortcutPanel
                            visible={isShortcutsOpen}
                            onClose={() => {
                                setIsShortcutsOpen(false);
                                restoreCommandPaletteFocus();
                            }}
                            getContainer={() => document.getElementById('app-root-layout') || document.body}
                        />
                    </Suspense>
                )}
                {collabModalVisible && (
                    <Suspense fallback={null}>
                        <CollaborationModal
                            open={collabModalVisible}
                            onClose={() => setCollabModalVisible(false)}
                            activeUsers={activeUsers || []}
                            roomName={roomName}
                            status={collaborationStatus}
                        />
                    </Suspense>
                )}
                <DiagramControlBridge />

                {/* Main Content Area */}
                <div id={`diagram-${selectedDiagramId}`} className={`flex-1 flex flex-col relative bg-surface ${isFullscreen ? 'fixed inset-0 z-[1000]' : ''}`} style={{ height: '100%', width: '100%' }}>
                    <ConfigProvider
                        getPopupContainer={(trigger) => {
                            if (isFullscreen) {
                                return document.getElementById(`diagram-${selectedDiagramId}`) || document.body;
                            }
                            return trigger?.parentElement || document.body;
                        }}
                    >
                        <div className="flex-1 w-full relative min-h-0 overflow-hidden" style={{ height: '100%', width: '100%' }}>
                            <ErrorBoundary
                                title={t('designer.viewer.renderFailed')}
                                subTitle={t('designer.viewer.renderFailedSubtitle')}
                            >
                                <Suspense
                                    fallback={
                                        <div className="flex items-center justify-center h-full text-slate-400">
                                            <Spin size="large" />
                                        </div>
                                    }
                                >
                                    {SelectedDiagramComponent && (
                                            <SelectedDiagramComponent
                                                key={`${selectedDiagramId}-${refreshNonce}`}
                                                id={selectedDiagramId}
                                                title={diagramTitle}
                                                edgeMode={edgeMode}
                                                layoutStrategy={layoutStrategy}
                                                nodeLayoutStrategy={nodeLayoutStrategy}
                                                elkAlgorithm={elkAlgorithm}
                                                showOnlyMainFlow={showOnlyMainFlow}
                                                onShowOnlyMainFlowChange={setShowOnlyMainFlow}
                                                onMainFlowAnimationChange={setMainFlowAnimationEnabled}
                                                highlightMainFlow={mainFlowAnimationEnabled}
                                                isReadonly={isReadonly}
                                                onReadonlyChange={onReadonlyChange}
                                                onExportPermissionCheck={onExportPermissionCheck}
                                                isYjsSynced={isYjsSynced}
                                                collaborationStatus={collaborationStatus}
                                                onOpenCollaboration={openCollaborationModal}
                                                onSyncPush={pushLocalChangesToYjs}
                                                activeUsers={activeUsers || []}
                                                yAwareness={provider?.awareness}
                                                onCloudSave={saveToCloud}
                                                onDirectSave={handleDirectSave}
                                                isDirectSaveDisabled={false}
                                                onOpenShareDialog={openShareDialog}
                                                onOpenSettings={() => setIsSettingsOpen(true)}
                                                onOpenCommandPalette={() => setIsCommandOpen(true)}
                                                isVersionHistoryOpen={isVersionHistoryOpen}
                                                onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
                                                onVersionHistoryClose={() => setIsVersionHistoryOpen(false)}
                                                loadLayoutPresetMap={loadCurrentLayoutPresetMap}
                                                renderVersionHistoryPanel={renderVersionHistoryPanel}
                                                renderAIChatPanel={({ onClose }) => (
                                                    <Suspense fallback={<div className="p-4 text-center text-gray-500">Loading AI...</div>}>
                                                        <AIChatView
                                                            onOpenConfig={openAIConfig}
                                                            pluginId={resolvedPluginId || 'flowchart-diagram'}
                                                            diagramId={selectedDiagramId}
                                                            onPreviewJson={handlePreviewAIJson}
                                                            onApplyJson={handleApplyAIJson}
                                                            diagramNodesRef={aiNodesRef}
                                                            diagramEdgesRef={aiEdgesRef}
                                                            canvasOps={aiCanvasOps}
                                                            onClose={onClose}
                                                        />
                                                    </Suspense>
                                                )}
                                                onAiTabIntercept={handleAiTabIntercept}
                                                renderThemeSelector={
                                                    <EnhancedThemeSelector />
                                                }
                                                renderAIConfigModal={hasMountedAIConfig ? (
                                                    <Suspense fallback={<div />}>
                                                        <AIConfigModal
                                                            key={aiConfigSession}
                                                            open={aiConfigVisible}
                                                            initialProviderId={aiConfigProviderId}
                                                            onCancel={() => setAiConfigVisible(false)}
                                                            onSave={() => setAiConfigVisible(false)}
                                                        />
                                                    </Suspense>
                                                ) : null}
                                                renderShareDialog={shareDialogOpen ? (
                                                    <Suspense fallback={null}>
                                                        <ShareDialog
                                                            open={shareDialogOpen}
                                                            onClose={closeShareDialog}
                                                            diagramId={selectedDiagramId}
                                                            onEnsureSaved={ensureSaved}
                                                        />
                                                    </Suspense>
                                                ) : null}
                                            />
                                    )}
                                </Suspense>

                                {isSettingsOpen && (
                                    <Suspense fallback={null}>
                                        <DraggableSettingsPanel
                                            title={settingsPanelTitle}
                                            closeLabel={t('designer.settings.closePanel', { title: settingsPanelTitle })}
                                            onClose={() => setIsSettingsOpen(false)}
                                        >
                                            {settingsPanel}
                                        </DraggableSettingsPanel>
                                    </Suspense>
                                )}

                                {/* 演示模式退出提示层 */}
                                {isPresentationMode && (
                                    <button
                                        type="button"
                                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] min-h-[44px] px-6 py-2.5 bg-black/70 hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/70 backdrop-blur-md text-white text-xs font-semibold rounded-full cursor-pointer transition-all border border-white/20 shadow-2xl animate-bounce-subtle"
                                        onClick={onExitPresentation}
                                        aria-keyshortcuts="Escape"
                                    >
                                        {t('diagramViewer.presentation.hint')}
                                    </button>
                                )}
                            </ErrorBoundary>

                            {cloudManagerVisible && (
                                <Suspense fallback={null}>
                                    <CloudStorageManagerModal
                                        open={cloudManagerVisible}
                                        onCancel={() => setCloudManagerVisible(false)}
                                        onSelect={(data) => {
                                            seedAutoSaveAndNavigate(data, data.id);
                                        }}
                                    />
                                </Suspense>
                            )}

                            <CloudSaveAuthRecovery
                                enabled={cloudSaveAuthEnabled}
                                open={cloudSaveAuthOpen}
                                onCancel={cancelCloudSaveAuthentication}
                                onAuthenticated={completeCloudSaveAuthentication}
                                onAfterClose={restoreCloudSaveFocus}
                            />

                            {mermaidModalVisible && (
                                <Suspense fallback={null}>
                                    <MermaidImportModal
                                        visible={mermaidModalVisible}
                                        onClose={() => setMermaidModalVisible(false)}
                                        onImport={handleImportMermaidNodes}
                                    />
                                </Suspense>
                            )}
                        </div>
                    </ConfigProvider>
                </div>

                {/* Routing Debug Panel */}
                {import.meta.env.DEV && showDebugPanel && RoutingDebugPanel && (
                    <RoutingDebugPanel onClose={() => setShowDebugPanel(false)} />
                )}
            </DiagramLayout>
        </DiagramThemeProvider>
    );
};
