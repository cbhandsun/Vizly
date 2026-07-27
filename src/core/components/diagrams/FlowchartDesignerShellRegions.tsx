import type { Node } from '@xyflow/react';

import type { PluginContext } from '../../types/plugin';
import { MobileBottomDock } from '../layout/MobileBottomDock';
import { DesignerOverlaysLayer } from './ui/DesignerOverlaysLayer';
import { DesignerRightSidebar } from './DesignerRightSidebar';
import { IconRailSidebar } from './IconRailSidebar';
import { LaserPointer } from './LaserPointer';
import {
    resolveFlowchartPluginContribution,
    type FlowchartDesignerViewModel,
} from './flowchartDesignerViewModel';

interface FlowchartDesignerRegionProps {
    model: FlowchartDesignerViewModel;
}

export function FlowchartDesignerLeftSidebar({ model }: FlowchartDesignerRegionProps) {
    const {
        activeLayerId,
        activePlugin,
        createLayer,
        deleteLayer,
        deleteTemplate,
        groupedTemplates,
        handleFocusNode,
        handleUseTemplate,
        isMobile,
        isSidebarHidden,
        layers,
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
        templates,
        toggleLock,
        toggleVisibility,
    } = model;

    if (presentationActive || isSidebarHidden || activePlugin?.hideDefaultSidebar) return null;
    const rawPluginPanels = resolveFlowchartPluginContribution(
        'sidebar',
        activePlugin?.contributeSidebarPanels && pluginCtx
            ? () => activePlugin.contributeSidebarPanels(pluginCtx)
            : null,
        [],
    );
    const pluginPanels = Array.isArray(rawPluginPanels) ? rawPluginPanels.slice(0, 50) : [];

    return (
        <IconRailSidebar
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
        />
    );
}

export function FlowchartDesignerRightSidebarRegion({ model }: FlowchartDesignerRegionProps) {
    const {
        activePlugin,
        activeRightTab,
        aiChatVisible,
        id,
        handleBeforeUpdate,
        isDraggingNode,
        isMobile,
        onAiTabIntercept,
        pluginCtx,
        presentationActive,
        renderAIChatPanel,
        selectedEdges,
        selectedNodes,
        setActiveRightTab,
        setAiChatVisible,
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
            pluginCtx={pluginCtx as PluginContext}
            isMobile={isMobile}
        />
    );
}

export function FlowchartDesignerOverlaysRegion({ model }: FlowchartDesignerRegionProps) {
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
        selectedEdges,
        selectedNodes,
        setActiveRightTab,
        setAiChatVisible,
        setCommandPaletteVisible,
        setDiffResult,
        setEdges,
        setJsonEditorVisible,
        setLeftDrawerOpen,
        setMobileAddDrawerVisible,
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
                    activeTab={mobilePropertyDrawerVisible ? 'property' : (activeRightTab === 'ai' ? 'ai' : null)}
                    selectedCount={selectedNodes.length + selectedEdges.length}
                    onAddClick={() => {
                        setLeftDrawerOpen(true);
                        setMobileAddDrawerVisible(true);
                    }}
                    onPropertyClick={() => {
                        setMobilePropertyDrawerVisible(!mobilePropertyDrawerVisible);
                        if (!mobilePropertyDrawerVisible) setActiveRightTab('property');
                    }}
                    onLayerClick={() => setLeftDrawerOpen(true)}
                    onAiClick={() => {
                        if (activeRightTab === 'ai') {
                            setAiChatVisible(false);
                            setActiveRightTab('property');
                        } else {
                            setActiveRightTab('ai');
                            setAiChatVisible(true);
                        }
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
