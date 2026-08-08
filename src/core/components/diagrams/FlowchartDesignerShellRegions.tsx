import type { Node } from '@xyflow/react';

import type { DiagramTypePlugin } from '../../types/plugin';
import { MobileBottomDock } from '../layout/MobileBottomDock';
import { DesignerOverlaysLayer } from './ui/DesignerOverlaysLayer';
import { DesignerRightSidebar } from './DesignerRightSidebar';
import { IconRailSidebar } from './IconRailSidebar';
import { LaserPointer } from './LaserPointer';
import {
    resolveFlowchartPluginContribution,
    type FlowchartDesignerViewModel,
} from './flowchartDesignerViewModel';

export type FlowchartDesignerLeftSidebarModel = Omit<Pick<FlowchartDesignerViewModel,
    | 'activeLayerId'
    | 'activePlugin'
    | 'createLayer'
    | 'deleteLayer'
    | 'deleteTemplate'
    | 'groupedTemplates'
    | 'handleFocusNode'
    | 'handleUseTemplate'
    | 'isMobile'
    | 'isInitialDiagramLoading'
    | 'isSidebarHidden'
    | 'layers'
    | 'mobileRequestedPanel'
    | 'multiPage'
    | 'nodes'
    | 'pluginCtx'
    | 'presentationActive'
    | 'renameLayer'
    | 'renameTemplate'
    | 'reorderLayers'
    | 'setActiveLayerId'
    | 'setLayerColor'
    | 'setLeftDrawerOpen'
    | 'setLeftDrawerWidth'
    | 'setMobileRequestedPanel'
    | 'templates'
    | 'toggleLock'
    | 'toggleVisibility'
>, 'activePlugin'> & {
    activePlugin?: Pick<DiagramTypePlugin, 'hideDefaultSidebar' | 'contributeSidebarPanels'>;
};

export type FlowchartDesignerRightSidebarModel = Pick<FlowchartDesignerViewModel,
    | 'activePlugin'
    | 'activeRightTab'
    | 'aiChatVisible'
    | 'handleBeforeUpdate'
    | 'id'
    | 'isDraggingNode'
    | 'isMobile'
    | 'leftDrawerOpen'
    | 'mobilePropertyDrawerVisible'
    | 'onAiTabIntercept'
    | 'pluginCtx'
    | 'presentationActive'
    | 'renderAIChatPanel'
    | 'selectedEdges'
    | 'selectedNodes'
    | 'setActiveRightTab'
    | 'setAiChatVisible'
    | 'setMobilePropertyDrawerVisible'
    | 'setRightSidebarWidth'
    | 'showAiCrown'
    | 'updateEdgesBatch'
    | 'updateNodesBatch'
>;

export type FlowchartDesignerOverlaysModel = Pick<FlowchartDesignerViewModel,
    | 'activeRightTab'
    | 'canRedo'
    | 'canUndo'
    | 'commandPaletteItems'
    | 'commandPaletteVisible'
    | 'diagramIdForExport'
    | 'diffResult'
    | 'edges'
    | 'handleOpenSettings'
    | 'handleBeforeUpdate'
    | 'handlePresentationFocus'
    | 'id'
    | 'isMobile'
    | 'isReadonly'
    | 'isVersionHistoryOpen'
    | 'jsonEditorInitialContent'
    | 'jsonEditorVisible'
    | 'laserEnabled'
    | 'mobilePropertyDrawerVisible'
    | 'nodes'
    | 'onOpenSettings'
    | 'onVersionHistoryClose'
    | 'presentationActive'
    | 'presentationSlides'
    | 'reactFlowInstance'
    | 'redo'
    | 'renderAIConfigModal'
    | 'renderShareDialog'
    | 'renderVersionHistoryPanel'
    | 'saveState'
    | 'saveTarget'
    | 'selectedEdges'
    | 'selectedNodes'
    | 'setActiveRightTab'
    | 'setAiChatVisible'
    | 'setCommandPaletteVisible'
    | 'setDiffResult'
    | 'setEdges'
    | 'setJsonEditorVisible'
    | 'setMobileRequestedPanel'
    | 'setMobilePropertyDrawerVisible'
    | 'setNodes'
    | 'setPresentationActive'
    | 'setShortcutHelpVisible'
    | 'setShowShortcutsModal'
    | 'shortcutHelpVisible'
    | 'showPerformanceDashboard'
    | 'showShortcuts'
    | 'undo'
>;

export function FlowchartDesignerLeftSidebar({ model }: { model: FlowchartDesignerLeftSidebarModel }) {
    const {
        activeLayerId,
        activePlugin,
        createLayer,
        deleteLayer,
        deleteTemplate,
        groupedTemplates,
        handleFocusNode,
        handleUseTemplate,
        isInitialDiagramLoading,
        isMobile,
        isSidebarHidden,
        layers,
        mobileRequestedPanel,
        multiPage,
        nodes,
        pluginCtx,
        presentationActive,
        renameLayer,
        renameTemplate,
        reorderLayers,
        setActiveLayerId,
        setLayerColor,
        setLeftDrawerOpen,
        setLeftDrawerWidth,
        setMobileRequestedPanel,
        templates,
        toggleLock,
        toggleVisibility,
    } = model;

    if (presentationActive || isSidebarHidden || activePlugin?.hideDefaultSidebar) return null;
    const contributeSidebarPanels = activePlugin?.contributeSidebarPanels;
    const rawPluginPanels = resolveFlowchartPluginContribution(
        'sidebar',
        contributeSidebarPanels && pluginCtx
            ? () => contributeSidebarPanels(pluginCtx)
            : null,
        [],
    );
    const pluginPanels = Array.isArray(rawPluginPanels) ? rawPluginPanels.slice(0, 50) : [];

    return (
        <IconRailSidebar
            activePageId={multiPage.activePageId}
            activePageName={multiPage.pages.find(page => page.id === multiPage.activePageId)?.name ?? multiPage.activePageId}
            nodes={nodes}
            onFocusNode={(node: Node) => handleFocusNode(node.id)}
            layers={layers}
            activeLayerId={activeLayerId}
            onSetActiveLayer={setActiveLayerId}
            onToggleLayerVisibility={toggleVisibility}
            onToggleLayerLock={toggleLock}
            onRenameLayer={renameLayer}
            onCreateLayer={createLayer}
            onDeleteLayer={deleteLayer}
            onReorderLayers={reorderLayers}
            onSetLayerColor={setLayerColor}
            templates={templates}
            groupedTemplates={groupedTemplates}
            onUseTemplate={handleUseTemplate}
            onDeleteTemplate={deleteTemplate}
            onRenameTemplate={renameTemplate}
            onDrawerVisibleChange={setLeftDrawerOpen}
            onDrawerWidthChange={setLeftDrawerWidth}
            pluginPanels={pluginPanels}
            isMobile={isMobile}
            autoOpenShapes={!isInitialDiagramLoading && nodes.length === 0}
            requestedPanel={mobileRequestedPanel}
            onRequestedPanelHandled={() => setMobileRequestedPanel(null)}
        />
    );
}

export function FlowchartDesignerRightSidebarRegion({ model }: { model: FlowchartDesignerRightSidebarModel }) {
    const {
        activePlugin,
        activeRightTab,
        aiChatVisible,
        id,
        handleBeforeUpdate,
        isDraggingNode,
        isMobile,
        mobilePropertyDrawerVisible,
        onAiTabIntercept,
        pluginCtx,
        presentationActive,
        leftDrawerOpen,
        renderAIChatPanel,
        selectedEdges,
        selectedNodes,
        setActiveRightTab,
        setAiChatVisible,
        setMobilePropertyDrawerVisible,
        setRightSidebarWidth,
        showAiCrown,
        updateEdgesBatch,
        updateNodesBatch,
    } = model;

    if (presentationActive) return null;

    return (
        <DesignerRightSidebar
            activeTab={activeRightTab}
            diagramId={id}
            onTabChange={setActiveRightTab}
            aiChatVisible={aiChatVisible}
            setAiChatVisible={setAiChatVisible}
            selectedNodes={selectedNodes}
            selectedEdges={selectedEdges}
            updateNodesBatch={updateNodesBatch}
            updateEdgesBatch={updateEdgesBatch}
            onBeforeUpdate={handleBeforeUpdate}
            isDraggingNode={isDraggingNode}
            renderAIChatPanel={renderAIChatPanel}
            onWidthChange={setRightSidebarWidth}
            showAiCrown={showAiCrown}
            onAiTabIntercept={onAiTabIntercept}
            activePlugin={activePlugin}
            pluginCtx={pluginCtx ?? undefined}
            isMobile={isMobile}
            collapseForLeftDrawer={leftDrawerOpen}
            mobileOpen={isMobile ? mobilePropertyDrawerVisible : undefined}
            onMobileOpenChange={isMobile ? setMobilePropertyDrawerVisible : undefined}
        />
    );
}

export function FlowchartDesignerOverlaysRegion({ model }: { model: FlowchartDesignerOverlaysModel }) {
    const {
        activeRightTab,
        canRedo,
        canUndo,
        commandPaletteItems,
        commandPaletteVisible,
        diagramIdForExport,
        diffResult,
        edges,
        id,
        isMobile,
        isReadonly,
        isVersionHistoryOpen,
        jsonEditorInitialContent,
        jsonEditorVisible,
        laserEnabled,
        mobilePropertyDrawerVisible,
        nodes,
        onOpenSettings,
        onVersionHistoryClose,
        presentationActive,
        presentationSlides,
        reactFlowInstance,
        redo,
        renderAIConfigModal,
        renderShareDialog,
        renderVersionHistoryPanel,
        saveState,
        saveTarget,
        selectedEdges,
        selectedNodes,
        setActiveRightTab,
        setAiChatVisible,
        setCommandPaletteVisible,
        setDiffResult,
        setEdges,
        setJsonEditorVisible,
        setMobileRequestedPanel,
        setMobilePropertyDrawerVisible,
        setNodes,
        setPresentationActive,
        setShortcutHelpVisible,
        setShowShortcutsModal,
        shortcutHelpVisible,
        showPerformanceDashboard,
        showShortcuts,
        undo,
        handleOpenSettings,
        handleBeforeUpdate,
        handlePresentationFocus,
    } = model;

    return (
        <>
            <DesignerOverlaysLayer
                diagramId={diagramIdForExport}
                jsonEditor={{
                    visible: jsonEditorVisible,
                    setVisible: setJsonEditorVisible,
                    nodes,
                    edges,
                    setNodes,
                    setEdges,
                    reactFlowInstance,
                    initialContent: jsonEditorInitialContent,
                    onBeforeCanvasReplace: handleBeforeUpdate,
                }}
                commandPalette={{
                    visible: commandPaletteVisible,
                    setVisible: setCommandPaletteVisible,
                    items: commandPaletteItems,
                }}
                shortcuts={{
                    panelVisible: shortcutHelpVisible,
                    setPanelVisible: setShortcutHelpVisible,
                    modalVisible: showShortcuts,
                    setModalVisible: setShowShortcutsModal,
                }}
                status={{
                    saveState,
                    saveTarget,
                    showPerformanceDashboard: !!showPerformanceDashboard,
                    nodeCount: nodes.length,
                    edgeCount: edges.length,
                }}
                presentation={{
                    active: presentationActive,
                    setActive: setPresentationActive,
                    slides: presentationSlides,
                    onFocusNodes: handlePresentationFocus,
                }}
                diff={{ result: diffResult, setResult: setDiffResult }}
                renderAIConfigModal={renderAIConfigModal}
                renderShareDialog={renderShareDialog}
            />
            {isVersionHistoryOpen && renderVersionHistoryPanel?.({
                diagramId: id || 'default-diagram',
                isOpen: true,
                onClose: () => onVersionHistoryClose?.(),
            })}
            <LaserPointer active={presentationActive && laserEnabled} />
            {isMobile && !presentationActive && (
                <MobileBottomDock
                    activeTab={mobilePropertyDrawerVisible ? activeRightTab : null}
                    selectedCount={isReadonly ? 0 : selectedNodes.length + selectedEdges.length}
                    selectedNodesCount={isReadonly ? 0 : selectedNodes.length}
                    selectedEdgesCount={isReadonly ? 0 : selectedEdges.length}
                    editingDisabled={isReadonly}
                    onAddClick={() => {
                        setAiChatVisible(false);
                        setMobilePropertyDrawerVisible(false);
                        setMobileRequestedPanel('shapes');
                    }}
                    onPropertyClick={() => {
                        const shouldClose = mobilePropertyDrawerVisible && activeRightTab === 'property';
                        if (shouldClose) {
                            setMobilePropertyDrawerVisible(false);
                            return;
                        }
                        setMobileRequestedPanel('close');
                        setAiChatVisible(false);
                        setActiveRightTab('property');
                        setMobilePropertyDrawerVisible(true);
                    }}
                    onLayerClick={() => {
                        setAiChatVisible(false);
                        setMobilePropertyDrawerVisible(false);
                        setMobileRequestedPanel('layers');
                    }}
                    onAiClick={() => {
                        const shouldClose = mobilePropertyDrawerVisible && activeRightTab === 'ai';
                        if (shouldClose) {
                            setAiChatVisible(false);
                            setMobilePropertyDrawerVisible(false);
                            return;
                        }
                        setMobileRequestedPanel('close');
                        setActiveRightTab('ai');
                        setAiChatVisible(true);
                        setMobilePropertyDrawerVisible(true);
                    }}
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onSettingsClick={onOpenSettings ? handleOpenSettings : undefined}
                />
            )}
        </>
    );
}
