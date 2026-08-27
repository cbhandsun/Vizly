import React from 'react';
import { ConnectionMode } from '@xyflow/react';

import { LiveCursors } from './collaboration/LiveCursors';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { LayoutStabilityContext } from '../../context/LayoutStabilityContext';
import { diffDiagrams } from '../../utils/diagramDiff';
import { GestureOverlay } from '../shared/GestureOverlay';
import { CanvasRuler, RulerCorner } from './CanvasRuler';
import { ContextMenuLayer } from './ContextMenuLayer';
import { DesignerCanvasFeaturesLayer } from './ui/DesignerCanvasFeaturesLayer';
import { DiagramEditingProvider } from './DiagramEditingContext';
import { DesignerHeaderLayer } from './ui/DesignerHeaderLayer';
import { FlowchartCanvasShell } from './FlowchartCanvasShell';
import { runAndPersistViewportAction } from './flowchartViewportActions';
import { FlowchartEmptyState } from './FlowchartEmptyState';
import { FlowchartFileDropOverlay } from './FlowchartFileDropOverlay';
import { FlowchartOnboardingHint } from './FlowchartOnboardingHint';
import { PageScopedPluginCanvas } from './PageScopedPluginCanvas';
import { shouldShowFlowchartOnboarding } from './flowchartResponsiveChrome';
import { FreehandDrawingLayer } from './FreehandDrawingLayer';
import { RemoteCursors } from './ui/RemoteCursors';
import { UnifiedDesignerShell } from './UnifiedDesignerShell';
import { shouldOpenDesignerAiSidebar } from './designerRightSidebarState';
import {
    resolveFlowchartPluginContribution,
    type FlowchartDesignerViewProps,
} from './flowchartDesignerViewModel';
import {
    FlowchartDesignerLeftSidebar,
    FlowchartDesignerOverlaysRegion,
    FlowchartDesignerRightSidebarRegion,
} from './FlowchartDesignerShellRegions';
import { filterCommentsForPage } from './commentPageScope';
import { useFlowchartDesignerViewSetup } from './useFlowchartDesignerViewSetup';
import { resolveDesignerDragRenderPolicy } from './designerDragRenderPolicy';
import { FlowchartLoadingOverlay } from './FlowchartLoadingOverlay';
import { FlowchartReadonlyStatus } from './FlowchartReadonlyStatus';

export type { FlowchartDesignerViewModel } from './flowchartDesignerViewModel';

import {
    applyFlowchartNodePositionUpdates,
    dismissFlowchartOnboarding,
    type NodePositionUpdate,
} from './flowchartDesignerViewHelpers';

/**
 * Presentation-only half of FlowchartDesigner. State ownership and event wiring
 * remain in the controller component so this extraction cannot alter layout.
 */
export function FlowchartDesignerView({ model }: FlowchartDesignerViewProps) {
    const {
        ANNOTATION_COLORS,
        activePlugin,
        activeRightTab,
        activeUsers,
        addAnnotation,
        aiChatVisible,
        annotationMode,
        annotations,
        autoRoutingEnabled,
        canRedo,
        canUndo,
        canvasBg,
        canvasSearchReplaceVisible,
        canvasSearchVisible,
        closeMenu,
        connectPreview,
        copyStyle,
        currentZoom,
        deleteAnnotation,
        diagramIdForExport,
        viewportPersistenceKey,
        dynamicEdgeTypes,
        dynamicNodeTypes,
        edges,
        edgesRef,
        enhancedOnConnect,
        enhancedOnConnectEnd,
        exportModalVisible,
        extraExportItems,
        fileInputRef,
        getPreviousState,
        getReactFlowSnapshot,
        gridColor,
        gridVariant,
        guides,
        handleAddFreehandStroke,
        handleAddMindMap,
        handleAddNode,
        handleAddStickyNote,
        handleAlign,
        handleBringToFront,
        handleContextMenuAction,
        handleDeleteWithToast,
        handleDistribute,
        handleDuplicateWithToast,
        handleGroupWithToast,
        handleUngroupWithToast,
        handleEdgeClick,
        handleEdgeDoubleClick,
        handleFitView,
        handleGridRotate,
        handleImport,
        handleRequestImport,
        handleLock,
        handleOpacity,
        handleOpenJsonEditor,
        handleOpenSettings,
        handlePaneClick,
        handleReactFlowInit,
        handleReadonlyChange,
        handleReconnect,
        handleReconnectEnd,
        handleReconnectStart,
        handleSearchReplaceAll,
        handleSearchReplaceMatch,
        handleSendToBack,
        handleSmartOptimize,
        handleSmartLayout,
        handleStrategyLayout,
        handleToggleHighlightMainFlow,
        handleToggleShowOnlyMainFlow,
        handleTouchEnd,
        handleTouchStart,
        handleWrappedCloudSave,
        handleWrappedDirectSave,
        hasCopiedStyle,
        highlightMainFlow,
        historyPanelVisible,
        id,
        isCommentMode,
        isConnecting,
        isContextToolbarHidden,
        isDirectSaveDisabled,
        isDragging,
        isDraggingNode,
        isDrawingMode,
        isInitialDiagramLoading,
        isLayoutBusy,
        isLayoutStable,
        isMarqueeActive,
        isMobile,
        isReadonly,
        isSpacePressed,
        isValidConnection,
        isYjsSynced,
        collaborationStatus,
        customDomainLayoutAvailable,
        jsonEditorVisible,
        jumpTo,
        lastDomainDirection,
        lastDomainStrategy,
        lastNodeLayout,
        layerSyncedNodes,
        leftDrawerOpen,
        messageContextHolder,
        multiPage,
        nodes,
        nodesRef,
        notificationContextHolder,
        onAiTabIntercept,
        onCloudSave,
        onConnectStart,
        onDirectSave,
        onDisplayRoutingFinalApplied,
        onSaveAs,
        onEdgeContextMenu,
        onEdgesChangeWithLock,
        onNodeContextMenu,
        onNodeDrag,
        onNodeDragStop,
        onNodesChangeWithLock,
        onSmartNodeDrag,
        onOpenSettings,
        onExportPermissionCheck,
        onOpenCollaboration,
        onOpenShareDialog,
        onOpenVersionHistory,
        onPaneContextMenu,
        onPaneDoubleClick,
        onPaneMouseLeave,
        onPaneMouseMove,
        onSelectionChange,
        onboardingDismissed,
        pastEntries,
        pasteStyle,
        performanceMode,
        pluginCtx,
        pluginId,
        pluginManagerVisible,
        presentationActive,
        preset,
        quickAddMenu,
        reactFlowInstance,
        routingSessionRuntime,
        reactFlowWrapper,
        redo,
        renderThemeSelector,
        rightSidebarWidth,
        selectedEdges,
        selectedNodes,
        setActiveRightTab,
        setAiChatVisible,
        setAutoRoutingEnabled,
        setCanvasSearchReplaceVisible,
        setCanvasSearchVisible,
        setCommandPaletteVisible,
        setDiffResult,
        setExportModalVisible,
        setHighlightedNodeId,
        setHistoryPanelVisible,
        setIsCommentMode,
        setMobileRequestedPanel,
        setNodes,
        setOnboardingDismissed,
        setPluginManagerVisible,
        setPresentationActive,
        setPresentationSlides,
        setQuickConnectPreview,
        setShowMinimap,
        setShowRuler,
        setShowShortcuts,
        setSnapEnabled,
        showAiCrown,
        showGrid,
        showMinimap,
        showOnlyMainFlow,
        showOverlay,
        showRuler,
        snapEnabled,
        t,
        takeSnapshot,
        theme,
        activatePointer,
        toggleDrawingMode,
        toggleMarqueeMode,
        toggleResolved,
        topActionArea,
        undo,
        updateAnnotation,
        updateEdgesBatch,
        updateNodesBatch,
        viewport,
        visibleEdges,
        wrappedOnNodeDragStart,
        yAwareness,
    } = model;

    const {
        actualLeftOffset,
        editingEnabled,
        fileDrop,
        marqueeCanvasInteraction,
        reactFlowMinimapSupported,
        showEditingChrome,
    } = useFlowchartDesignerViewSetup(model);
    const dragRenderPolicy = resolveDesignerDragRenderPolicy({
        isDragging,
        isDraggingNode,
        performanceMode,
    });

    return (
        <UnifiedDesignerShell
            id={id || diagramIdForExport}
            isDragging={isDragging}
            onDragEnter={fileDrop.handleDragEnter}
            onDragOver={fileDrop.handleDragOver}
            onDragLeave={fileDrop.handleDragLeave}
            onDrop={fileDrop.handleDrop}
            messageContextHolder={messageContextHolder}
            notificationContextHolder={notificationContextHolder}
            canvasBg={canvasBg}
            themeMode={theme?.mode || 'light'}
            diagramIdForExport={diagramIdForExport}
            style={{ '--designer-left-clearance': `${actualLeftOffset}px` } as React.CSSProperties}
            hiddenInputs={
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".json,.mmd,.mermaid,.txt"
                    onChange={handleImport}
                    disabled={!editingEnabled}
                    aria-label={t('designer.toolbar.import')}
                    title={t('designer.toolbar.import')}
                />
            }
            leftSidebar={editingEnabled ? <FlowchartDesignerLeftSidebar model={model} /> : null}
            canvasArea={
                <>
                    {showEditingChrome && showRuler && (
                        <>
                            <CanvasRuler orientation="horizontal" isDarkMode={theme?.mode === 'dark'} />
                            <CanvasRuler orientation="vertical" isDarkMode={theme?.mode === 'dark'} />
                            <RulerCorner isDarkMode={theme?.mode === 'dark'} />
                        </>
                    )}

                    {editingEnabled && <FlowchartOnboardingHint
                        visible={shouldShowFlowchartOnboarding({
                            isMobile,
                            pluginId,
                            pluginReplacesDefaultCanvas: activePlugin?.replacesDefaultCanvas === true,
                            isInitialDiagramLoading,
                            onboardingDismissed,
                            leftDrawerOpen,
                            nodeCount: nodes.length,
                            edgeCount: edges.length,
                            jsonEditorVisible,
                            selectedNodeCount: selectedNodes.length,
                            selectedEdgeCount: selectedEdges.length,
                        })}
                        mod={/Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'}
                        onOpenCommandPalette={() => setCommandPaletteVisible(true)}
                        onDismiss={() => dismissFlowchartOnboarding(setOnboardingDismissed)}
                    />}
                    {editingEnabled && <FlowchartEmptyState
                        visible={pluginId !== 'mindmap' && activePlugin?.replacesDefaultCanvas !== true && !isInitialDiagramLoading && nodes.length === 0 && !jsonEditorVisible && !isDragging && !isConnecting && !quickAddMenu?.visible}
                        pluginId={pluginId}
                        onOpenShapePicker={() => setMobileRequestedPanel('shapes-search')}
                    />}
                    {isInitialDiagramLoading && <FlowchartLoadingOverlay
                        label={t('common.loadingDiagram', '加载图表...')}
                    />}
                    <div ref={reactFlowWrapper} style={{ position: 'relative', height: '100%' }}>
                        {editingEnabled && <ContextMenuLayer
                            onAction={handleContextMenuAction}
                            activePlugin={activePlugin}
                            pluginCtx={pluginCtx ?? undefined}
                            canUndo={canUndo}
                            canRedo={canRedo}
                        />}

                        <div hidden={!showEditingChrome}>
                            <DesignerHeaderLayer
                            diagramId={diagramIdForExport}
                            diagramTitle={model.title}
                            topActions={{
                                onEditJson: handleOpenJsonEditor,
                                onStartPresentation: async () => {
                                    const currentNodes = nodesRef.current;
                                    if (currentNodes.length === 0) {
                                        appMessage.info(t(
                                            'designer.toolbar.presentationEmpty',
                                            '请先添加至少一个节点再开始演示',
                                        ));
                                        return;
                                    }
                                    try {
                                        const { generateSlides } = await import('../../hooks/usePresentationSlides');
                                        setPresentationSlides(generateSlides(currentNodes, 'vertical'));
                                        setPresentationActive(true);
                                    } catch {
                                        appMessage.error(t(
                                            'designer.toolbar.presentationLoadFailed',
                                            '演示模式加载失败，请重试',
                                        ));
                                    }
                                },
                                onShowDiff: () => {
                                    const prevState = getPreviousState();
                                    if (prevState && pastEntries && pastEntries.length > 0) {
                                        const result = diffDiagrams(
                                            { nodes: prevState.nodes || [], edges: prevState.edges || [] },
                                            { nodes, edges },
                                        );
                                        setDiffResult(result);
                                    } else {
                                        appMessage.info(t('designer.flowchart.noHistory'));
                                    }
                                },
                                onShowHistory: () => setHistoryPanelVisible((prev: boolean) => !prev),
                                onOpenVersionHistory,
                                onSaveToCloud: onCloudSave ? handleWrappedCloudSave : undefined,
                                onDirectSave: onDirectSave ? handleWrappedDirectSave : undefined,
                                onSaveAs,
                                isDirectSaveDisabled,
                                onShare: onOpenShareDialog,
                                rightOffset: rightSidebarWidth,
                                extraExportItems,
                                isYjsSynced,
                                collaborationStatus,
                                onOpenCollaboration,
                                isReadonly,
                                onReadonlyChange: handleReadonlyChange,
                                onOpenSettings: onOpenSettings ? handleOpenSettings : undefined,
                                onSmartOptimize: handleSmartOptimize,
                                activeUsers,
                                highlightMainFlow,
                                handleToggleHighlightMainFlow,
                                showOnlyMainFlow,
                                handleToggleShowOnlyMainFlow,
                                topActionArea,
                                exportModalVisible,
                                setExportModalVisible,
                                getReactFlowSnapshot,
                                onExportPermissionCheck,
                                pluginManagerVisible,
                                setPluginManagerVisible,
                                isCommentMode,
                                setIsCommentMode,
                                pluginToolbar: resolveFlowchartPluginContribution(
                                    'toolbar',
                                    pluginCtx && activePlugin?.contributeToolbar
                                        ? () => activePlugin.contributeToolbar?.(pluginCtx)
                                        : null,
                                    null,
                                ),
                            }}
                            toolbar={{
                                canUndo,
                                canRedo,
                                onUndo: undo,
                                onRedo: redo,
                                onZoomIn: () => reactFlowInstance?.zoomIn(),
                                onZoomOut: () => reactFlowInstance?.zoomOut(),
                                onResetZoom: () => runAndPersistViewportAction({ action: () => reactFlowInstance?.zoomTo(1, { duration: 220 }), getViewport: () => reactFlowInstance?.getViewport(), persistenceKey: viewportPersistenceKey }),
                                onFitView: handleFitView,
                                autoRouting: autoRoutingEnabled,
                                toggleAutoRouting: () => setAutoRoutingEnabled(!autoRoutingEnabled),
                                showGrid,
                                gridVariant,
                                toggleGrid: handleGridRotate,
                                onShowShortcuts: () => setShowShortcuts(),
                                onShowCanvasSearch: () => {
                                    setCanvasSearchReplaceVisible(false);
                                    setCanvasSearchVisible(true);
                                },
                                onStrategyLayout: handleStrategyLayout,
                                onSmartLayout: handleSmartLayout,
                                customDomainLayoutAvailable,
                                lastDomainStrategy,
                                lastDomainDirection,
                                lastNodeLayout,
                                layoutBusy: isLayoutBusy,
                                showRuler,
                                toggleRuler: () => setShowRuler((previous: boolean) => !previous),
                                showMinimap: reactFlowMinimapSupported ? showMinimap : undefined,
                                toggleMinimap: reactFlowMinimapSupported
                                    ? () => setShowMinimap((previous: boolean) => !previous)
                                    : undefined,
                                showAiCrown,
                                onToggleAI: () => {
                                    if (onAiTabIntercept && !onAiTabIntercept()) return;
                                    if (shouldOpenDesignerAiSidebar(activeRightTab, aiChatVisible)) {
                                        setActiveRightTab('ai');
                                        setAiChatVisible(true);
                                    } else {
                                        setAiChatVisible(false);
                                        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                                            setActiveRightTab('property');
                                        }
                                    }
                                },
                                aiChatActive: aiChatVisible,
                                nodeCount: nodes.length,
                                edgeCount: edges.length,
                                selectedNodesCount: selectedNodes.length,
                                selectedEdgesCount: selectedEdges.length,
                                zoomPercent: Math.round(viewport.zoom * 100),
                                snapToGrid: snapEnabled,
                                onToggleSnap: () => setSnapEnabled((enabled: boolean) => !enabled),
                                hideZoomControls: activePlugin?.hideZoomControls,
                                hideLayoutControls: activePlugin?.hideLayoutControls,
                                hideGridControls: activePlugin?.hideGridControls,
                                hideFlowFocusControls: activePlugin?.hideFlowFocusControls,
                                hideUndoRedoControls: activePlugin?.hideUndoRedoControls,
                                isDrawingMode,
                                isMarqueeActive,
                                toggleSelectionMode: toggleMarqueeMode,
                                onToggleDrawingMode: toggleDrawingMode,
                                onActivatePointer: activatePointer,
                                onAddStickyNote: handleAddStickyNote,
                                onAddMindMap: handleAddMindMap,
                                onExport: () => setExportModalVisible(true),
                                onImportClick: editingEnabled ? handleRequestImport : undefined,
                                renderThemeSelector,
                                historyCount: pastEntries?.length ?? 0,
                                onAlign: handleAlign,
                                onDistribute: handleDistribute,
                            }}
                            />
                        </div>

                        {isReadonly && !presentationActive && (
                            <FlowchartReadonlyStatus
                                text={t('designer.toolbar.readonlyStatus', '画布已锁定 · 仅可查看')}
                            />
                        )}

                        <DiagramEditingProvider value={editingEnabled}>
                        <LayoutStabilityContext.Provider value={isLayoutStable}>
                            <div
                                className="canvas-touch-wrapper"
                                style={{ width: '100%', height: '100%', position: 'relative' }}
                                onTouchStart={handleTouchStart}
                                onTouchEnd={handleTouchEnd}
                            >
                                <GestureOverlay zoom={currentZoom} visible={showOverlay} />
                                <FlowchartCanvasShell
                                    viewportPersistenceKey={viewportPersistenceKey}
                                    nodes={isInitialDiagramLoading
                                        ? []
                                        : dragRenderPolicy.usePerformanceNodes
                                            ? nodes
                                            : layerSyncedNodes}
                                    displayEdges={isInitialDiagramLoading ? [] : visibleEdges}
                                    nodeTypes={dynamicNodeTypes}
                                    edgeTypes={dynamicEdgeTypes}
                                    onInit={handleReactFlowInit}
                                    onNodesChange={onNodesChangeWithLock}
                                    onEdgesChange={onEdgesChangeWithLock}
                                    onConnect={enhancedOnConnect}
                                    onConnectStart={onConnectStart}
                                    onConnectEnd={enhancedOnConnectEnd}
                                    onSelectionChange={onSelectionChange}
                                    onPaneClick={handlePaneClick}
                                    onPaneMouseMove={onPaneMouseMove}
                                    onPaneMouseLeave={onPaneMouseLeave}
                                    onPaneDoubleClick={onPaneDoubleClick}
                                    onNodeContextMenu={onNodeContextMenu}
                                    onEdgeContextMenu={onEdgeContextMenu}
                                    onEdgeClick={handleEdgeClick}
                                    onEdgeDoubleClick={handleEdgeDoubleClick}
                                    onPaneContextMenu={onPaneContextMenu}
                                    onNodeDragStart={wrappedOnNodeDragStart}
                                    onNodeDrag={onNodeDrag}
                                    onSmartNodeDrag={onSmartNodeDrag}
                                    onNodeDragStop={onNodeDragStop}
                                    onReconnect={handleReconnect}
                                    onReconnectStart={handleReconnectStart}
                                    onReconnectEnd={handleReconnectEnd}
                                    onDisplayRoutingFinalApplied={onDisplayRoutingFinalApplied}
                                    routingSessionRuntime={routingSessionRuntime}
                                    autoRoutingEnabled={autoRoutingEnabled}
                                    enableSmartEdges={true}
                                    showMinimap={showEditingChrome && showMinimap && reactFlowMinimapSupported}
                                    showGrid={showGrid}
                                    gridVariant={gridVariant}
                                    backgroundGridColor={gridColor}
                                    isSpacePressed={isSpacePressed}
                                    isConnecting={isConnecting}
                                    connectPreview={connectPreview}
                                    connectionMode={ConnectionMode.Loose}
                                    selectionMode={marqueeCanvasInteraction.selectionMode}
                                    selectionOnDrag={marqueeCanvasInteraction.selectionOnDrag}
                                    panOnDrag={marqueeCanvasInteraction.panOnDrag}
                                    isValidConnection={isValidConnection}
                                    snapEnabled={snapEnabled}
                                    isDragging={dragRenderPolicy.canvasDragActive}
                                    editingEnabled={editingEnabled}
                                    defaultCanvasHiddenFromAssistiveTech={activePlugin?.replacesDefaultCanvas === true}
                                >
                                    <RemoteCursors />
                                    {editingEnabled && <DesignerCanvasFeaturesLayer
                                        quickConnect={{
                                            visible: !!quickAddMenu?.visible,
                                            x: quickAddMenu?.clientX || 0,
                                            y: quickAddMenu?.clientY || 0,
                                            sourceNodeId: quickAddMenu?.sourceNodeId,
                                            onSelect: handleAddNode,
                                            onClose: closeMenu,
                                            onPreview: setQuickConnectPreview,
                                        }}
                                        hoverToolbar={{
                                            selectedNodes,
                                            selectedEdges,
                                            nodeTypes: dynamicNodeTypes,
                                            pluginCtx: pluginCtx ?? undefined,
                                            activePlugin,
                                            quickAddMenuVisible: !!quickAddMenu?.visible,
                                            isContextToolbarHidden: isContextToolbarHidden || Boolean(leftDrawerOpen),
                                            isDragging,
                                            isConnecting,
                                            updateNodesBatch,
                                            updateEdgesBatch,
                                            onUpdateNodes: (updates: NodePositionUpdate[]) => {
                                                takeSnapshot(nodesRef.current, edgesRef.current);
                                                setNodes(currentNodes => applyFlowchartNodePositionUpdates(currentNodes, updates));
                                            },
                                            handleDeleteWithToast,
                                            handleDuplicateWithToast,
                                            handleGroupWithToast,
                                            handleUngroupWithToast,
                                            handleLock,
                                            handleOpacity,
                                            handleBringToFront,
                                            handleSendToBack,
                                            copyStyle,
                                            pasteStyle,
                                            hasCopiedStyle,
                                        }}
                                        smartGuides={{ guides }}
                                        annotations={{
                                            items: filterCommentsForPage(annotations, multiPage.activePageId),
                                            mode: annotationMode,
                                            onAdd: (x, y, text) => addAnnotation(x, y, text, multiPage.activePageId),
                                            onUpdate: updateAnnotation,
                                            onDelete: deleteAnnotation,
                                            onToggleResolved: toggleResolved,
                                            activePageId: multiPage.activePageId,
                                            colors: ANNOTATION_COLORS,
                                        }}
                                        pages={{
                                            items: multiPage.pages,
                                            activePageId: multiPage.activePageId,
                                            onSwitchPage: multiPage.switchPage,
                                            onAddPage: multiPage.addPage,
                                            onDiscardPage: multiPage.discardPage,
                                            onDeletePage: multiPage.deletePage,
                                            onRestoreDeletedPage: multiPage.restoreDeletedPage,
                                            onRenamePage: multiPage.renamePage,
                                            onDuplicatePage: multiPage.duplicatePage,
                                            onMovePage: multiPage.movePage,
                                            canRestoreDeletedPage: multiPage.canRestoreDeletedPage,
                                            restorableDeletedPageName: multiPage.restorableDeletedPageName,
                                            activePageNodeCount: nodes.length,
                                            activePageEdgeCount: edges.length,
                                            disabled: isInitialDiagramLoading,
                                        }}
                                        history={{
                                            visible: historyPanelVisible,
                                            onClose: () => setHistoryPanelVisible(false),
                                            pastEntries: pastEntries || [],
                                            canUndo,
                                            canRedo,
                                            onUndo: undo,
                                            onRedo: redo,
                                            onJumpTo: jumpTo,
                                        }}
                                        search={{
                                            visible: canvasSearchVisible,
                                            onClose: () => {
                                                setCanvasSearchVisible(false);
                                                setCanvasSearchReplaceVisible(false);
                                            },
                                            nodes,
                                            edges,
                                            onHighlightNode: setHighlightedNodeId,
                                            onReplaceMatch: handleSearchReplaceMatch,
                                            onReplaceAll: handleSearchReplaceAll,
                                            replaceVisible: canvasSearchReplaceVisible,
                                            onReplaceVisibleChange: setCanvasSearchReplaceVisible,
                                        }}
                                    />}
                                    {editingEnabled && <FreehandDrawingLayer
                                        key={`${multiPage.activePageId}-${isDrawingMode ? 'active' : 'inactive'}`}
                                        isDrawingMode={isDrawingMode}
                                        zoom={viewport.zoom}
                                        pan={{ x: viewport.x, y: viewport.y }}
                                        currentColor={preset.name === 'sketch' ? '#555555' : '#000000'}
                                        onDrawEnd={handleAddFreehandStroke}
                                    />}
                                    {editingEnabled && pluginCtx && activePlugin?.contributeCanvasComponents && (
                                        <PageScopedPluginCanvas
                                            pageScope={multiPage.getPageOperationScope()}
                                            ready={!isInitialDiagramLoading}
                                            context={pluginCtx}
                                            nodes={nodes}
                                            edges={edges}
                                            renderCanvas={(pageContext) => resolveFlowchartPluginContribution(
                                                'canvas',
                                                () => activePlugin.contributeCanvasComponents?.(pageContext),
                                                null,
                                            )}
                                        />
                                    )}
                                    {activeUsers.length > 0 && yAwareness && (
                                        <LiveCursors activeUsers={activeUsers} yAwareness={yAwareness} />
                                    )}
                                </FlowchartCanvasShell>
                            </div>
                        </LayoutStabilityContext.Provider>
                        </DiagramEditingProvider>
                    </div>
                </>
            }
            rightSidebar={editingEnabled ? <FlowchartDesignerRightSidebarRegion model={model} /> : null}
            overlays={<>{fileDrop.isFileDragActive ? <FlowchartFileDropOverlay t={t} /> : null}<FlowchartDesignerOverlaysRegion model={model} /></>}
        />
    );
}
