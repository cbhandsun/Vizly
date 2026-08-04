import React, { lazy, Suspense, useState } from 'react';
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
import { appMessage } from '@/core/utils/antdStaticBridge';
import { DiagramLayout } from './layout/DiagramLayout';
import { EnhancedThemeSelector } from './ui/EnhancedThemeSelector';
import { ErrorBoundary } from './ui/ErrorBoundary';

const RoutingDebugPanel = lazy(() => import('./debug/RoutingDebugPanel').then(module => ({ default: module.RoutingDebugPanel })));
const ShortcutsHelpModal = lazy(() => import('@/core/components/ui/ShortcutsHelpModal'));
const CollaborationModal = lazy(() => import('./ui/CollaborationModal').then(module => ({ default: module.CollaborationModal })));
const AIConfigModal = lazy(() => import('./ai/AIConfigModal'));
const AIChatView = lazy(() => import('./ai/AIChatPanel').then(module => ({ default: module.AIChatView })));
const ShareDialog = lazy(() => import('@/components/diagrams/ShareDialog'));
const VersionHistoryPanel = lazy(() => import('./diagrams/ui/VersionHistoryPanel').then(module => ({ default: module.VersionHistoryPanel })));
const CloudStorageManagerModal = lazy(() => import('./storage/CloudStorageManagerModal').then(module => ({ default: module.CloudStorageManagerModal })));
const MermaidImportModal = lazy(() => import('./ui/MermaidImportModal').then(module => ({ default: module.MermaidImportModal })));
const DraggableSettingsPanel = lazy(() => import('./ui/DraggableSettingsPanel').then(module => ({ default: module.DraggableSettingsPanel })));
const TemplateCascaderMenu = lazy(() => import('./diagrams/ui/TemplateCascaderMenu').then(module => ({ default: module.TemplateCascaderMenu })));

const loadLayoutPresetMap = () => import('@/data/standardized').then(({ PRESET_MAP }) => PRESET_MAP);
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
    setIsPresentationMode: (value: boolean) => void;
    isFullscreen: boolean;
    handleToggleFullscreen: () => void;
    resolvedPluginId?: string;
    handleTemplateChange: (value: string[], leafKey: string, rootGroup: string) => void;
    commandItems: CommandItem[];
    isCommandOpen: boolean;
    setIsCommandOpen: (open: boolean) => void;
    isShortcutsOpen: boolean;
    setIsShortcutsOpen: (open: boolean) => void;
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
    setIsPresentationMode,
    isFullscreen,
    handleToggleFullscreen,
    resolvedPluginId,
    handleTemplateChange,
    commandItems,
    isCommandOpen,
    setIsCommandOpen,
    isShortcutsOpen,
    setIsShortcutsOpen,
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
                    leftChildren: (
                        <>
                            <div className="flex items-center max-w-[240px]">
                                <TemplateCascaderMenu
                                    style={{ width: '100%', minWidth: 160 }}
                                    onChange={handleTemplateChange}
                                />
                            </div>
                        </>
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
                    items={commandItems}
                    getContainer={() => document.getElementById('app-root-layout') || document.body}
                />
                {isShortcutsOpen && (
                    <Suspense fallback={null}>
                        <ShortcutsHelpModal
                            open={isShortcutsOpen}
                            onClose={() => setIsShortcutsOpen(false)}
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
                                                loadLayoutPresetMap={loadLayoutPresetMap}
                                                renderVersionHistoryPanel={renderVersionHistoryPanel}
                                                renderAIChatPanel={({ onClose }) => (
                                                    <Suspense fallback={<div className="p-4 text-center text-gray-500">Loading AI...</div>}>
                                                        <AIChatView
                                                            onOpenConfig={() => setAiConfigVisible(true)}
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
                                                renderAIConfigModal={aiConfigVisible ? (
                                                    <Suspense fallback={<div />}>
                                                        <AIConfigModal
                                                            open={aiConfigVisible}
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
                                            title={t('designer.commandItems.settings', '配置面板 / Settings')}
                                            onClose={() => setIsSettingsOpen(false)}
                                        >
                                            {settingsPanel}
                                        </DraggableSettingsPanel>
                                    </Suspense>
                                )}

                                {/* 演示模式退出提示层 */}
                                {isPresentationMode && (
                                    <div
                                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] px-6 py-2.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white text-xs font-semibold rounded-full cursor-pointer transition-all border border-white/20 shadow-2xl animate-bounce-subtle"
                                        onClick={() => {
                                            setIsPresentationMode(false);
                                            appMessage.info('演示模式已退出');
                                        }}
                                    >
                                        🎬 点击或按 ESC 退出演示模式
                                    </div>
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
                {showDebugPanel && (
                    <RoutingDebugPanel onClose={() => setShowDebugPanel(false)} />
                )}
            </DiagramLayout>
        </DiagramThemeProvider>
    );
};
