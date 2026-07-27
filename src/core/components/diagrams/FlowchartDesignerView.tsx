import React from 'react';
import { ConnectionMode, Node, SelectionMode } from '@xyflow/react';

import { LiveCursors } from './collaboration/LiveCursors';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { LayoutStabilityContext } from '../../context/LayoutStabilityContext';
import { diffDiagrams } from '../../utils/diagramDiff';
import { dispatchDiagramControl } from '../shared/diagramControl';
import { GestureOverlay } from '../shared/GestureOverlay';
import { CanvasRuler, RulerCorner } from './CanvasRuler';
import { ContextMenuLayer } from './ContextMenuLayer';
import { DesignerCanvasFeaturesLayer } from './ui/DesignerCanvasFeaturesLayer';
import { DesignerHeaderLayer } from './ui/DesignerHeaderLayer';
import { FlowchartCanvasShell } from './FlowchartCanvasShell';
import { FlowchartEmptyState } from './FlowchartEmptyState';
import { FlowchartOnboardingHint } from './FlowchartOnboardingHint';
import { FreehandDrawingLayer } from './FreehandDrawingLayer';
import { RemoteCursors } from './ui/RemoteCursors';
import { UnifiedDesignerShell } from './UnifiedDesignerShell';
import { generateSlides } from '../../hooks/usePresentationSlides';
import { persistFlowchartOnboardingDismissed } from './flowchartOnboardingStorage';
import { shouldOpenDesignerAiSidebar } from './designerRightSidebarState';
import {
    resolveFlowchartPluginContribution,
    type FlowchartDesignerViewModel,
} from './flowchartDesignerViewModel';
import {
    FlowchartDesignerLeftSidebar,
    FlowchartDesignerOverlaysRegion,
    FlowchartDesignerRightSidebarRegion,
} from './FlowchartDesignerShellRegions';

export type { FlowchartDesignerViewModel } from './flowchartDesignerViewModel';

interface FlowchartDesignerViewProps {
    model: FlowchartDesignerViewModel;
}

interface NodePositionUpdate {
    id: string;
    position: { x: number; y: number };
}

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
        canvasSearchVisible,
        closeMenu,
        connectPreview,
        copyStyle,
        currentZoom,
        deleteAnnotation,
        diagramIdForExport,
        dynamicEdgeTypes,
        dynamicNodeTypes,
        edges,
        edgesRef,
        enhancedOnConnect,
        enhancedOnConnectEnd,
        exportModalVisible,
        exportToGIF,
        exportToPDF,
        exportToPNG,
        exportToSVG,
        extraExportItems,
        fileInputRef,
        getPreviousState,
        getReactFlowSnapshot,
        gridColor,
        gridVariant,
        guides,
        handleAddMindMap,
        handleAddNode,
        handleAddStickyNote,
        handleAlign,
        handleBeforeReplace,
        handleBringToFront,
        handleContextMenuAction,
        handleDeleteWithToast,
        handleDistribute,
        handleDuplicateWithToast,
        handleEdgeDoubleClick,
        handleExport,
        handleExportMermaid,
        handleFitView,
        handleGridRotate,
        handleImport,
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
        handleSearchReplaceNode,
        handleSendToBack,
        handleSmartOptimize,
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
        isDrawingMode,
        isInitialDiagramLoading,
        isLayoutStable,
        isMarqueeActive,
        isReadonly,
        isSidebarHidden,
        isSpacePressed,
        isValidConnection,
        isYjsSynced,
        jsonEditorVisible,
        jumpTo,
        lastDomainDirection,
        lastDomainStrategy,
        lastNodeLayout,
        layerSyncedNodes,
        leftDrawerOpen,
        leftDrawerWidth,
        messageContextHolder,
        multiPage,
        nodes,
        nodesRef,
        notificationContextHolder,
        onAiTabIntercept,
        onCloudSave,
        onConnectStart,
        onDirectSave,
        onDragOver,
        onDrop,
        onEdgeContextMenu,
        onEdgesChangeWithLock,
        onNodeContextMenu,
        onNodeDrag,
        onNodeDragStop,
        onNodesChangeWithLock,
        onOpenSettings,
        onOpenShareDialog,
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
        reactFlowWrapper,
        redo,
        renderThemeSelector,
        rightSidebarWidth,
        selectedEdges,
        selectedNodes,
        setActiveRightTab,
        setAiChatVisible,
        setAutoRoutingEnabled,
        setCanvasSearchVisible,
        setCommandPaletteVisible,
        setDiffResult,
        setExportModalVisible,
        setHighlightedNodeId,
        setHistoryPanelVisible,
        setIsCommentMode,
        setIsDrawingMode,
        setIsMarqueeActive,
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

    const _actualLeftOffset = isSidebarHidden ? 0 : (leftDrawerOpen ? 64 + leftDrawerWidth : 64);
    const showEditingChrome = !presentationActive;

    return (
        <UnifiedDesignerShell
            id={id}
            isDragging={isDragging}
            onDragOver={onDragOver}
            onDrop={onDrop}
            messageContextHolder={messageContextHolder}
            notificationContextHolder={notificationContextHolder}
            canvasBg={canvasBg}
            themeMode={theme?.mode || 'light'}
            diagramIdForExport={diagramIdForExport}
            hiddenInputs={
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".json,.mmd,.mermaid,.txt"
                    onChange={handleImport}
                    aria-label={t('designer.toolbar.import')}
                    title={t('designer.toolbar.import')}
                />
            }
            leftSidebar={<FlowchartDesignerLeftSidebar model={model} />}
            canvasArea={
                <>
                    {showEditingChrome && showRuler && (
                        <>
                            <CanvasRuler orientation="horizontal" isDarkMode={theme?.mode === 'dark'} />
                            <CanvasRuler orientation="vertical" isDarkMode={theme?.mode === 'dark'} />
                            <RulerCorner isDarkMode={theme?.mode === 'dark'} />
                        </>
                    )}

                    <FlowchartOnboardingHint
                        visible={pluginId !== 'mindmap' && !isInitialDiagramLoading && !onboardingDismissed && nodes.length <= 1 && edges.length === 0 && !jsonEditorVisible && selectedNodes.length === 0 && selectedEdges.length === 0}
                        mod={/Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'}
                        onOpenCommandPalette={() => setCommandPaletteVisible(true)}
                        onDismiss={() => {
                            setOnboardingDismissed(true);
                            persistFlowchartOnboardingDismissed();
                        }}
                    />
                    <FlowchartEmptyState
                        visible={pluginId !== 'mindmap' && !isInitialDiagramLoading && nodes.length === 0 && !jsonEditorVisible && !isDragging && !isConnecting && !quickAddMenu?.visible}
                    />
                    {isInitialDiagramLoading && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-secondary, #64748b)',
                                fontSize: 14,
                                pointerEvents: 'none',
                                zIndex: 5,
                            }}
                        >
                            {t('common.loadingDiagram', '加载图表...')}
                        </div>
                    )}
                    <div ref={reactFlowWrapper} style={{ position: 'relative', height: '100%' }}>
                        <ContextMenuLayer onAction={handleContextMenuAction} activePlugin={activePlugin} pluginCtx={pluginCtx} />

                        {showEditingChrome && <DesignerHeaderLayer
                            diagramId={diagramIdForExport}
                            topActions={{
                                onExportJSON: handleExport,
                                onExportPNG: exportToPNG,
                                onExportSVG: exportToSVG,
                                onExportPDF: exportToPDF,
                                onExportGIF: exportToGIF,
                                onExportMermaid: handleExportMermaid,
                                onImportClick: () => fileInputRef.current?.click(),
                                onEditJson: handleOpenJsonEditor,
                                onStartPresentation: () => {
                                    const slides = generateSlides(nodesRef.current, 'vertical');
                                    setPresentationSlides(slides);
                                    setPresentationActive(true);
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
                                onSaveToCloud: onCloudSave ? handleWrappedCloudSave : undefined,
                                onDirectSave: onDirectSave ? handleWrappedDirectSave : undefined,
                                isDirectSaveDisabled,
                                onShare: onOpenShareDialog,
                                rightOffset: rightSidebarWidth,
                                extraExportItems,
                                isYjsSynced,
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
                                pluginManagerVisible,
                                setPluginManagerVisible,
                                isCommentMode,
                                setIsCommentMode,
                                pluginToolbar: resolveFlowchartPluginContribution(
                                    'toolbar',
                                    pluginCtx && activePlugin?.contributeToolbar
                                        ? () => activePlugin.contributeToolbar(pluginCtx)
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
                                onFitView: handleFitView,
                                onFitWidth: () => dispatchDiagramControl('top', id),
                                autoRouting: autoRoutingEnabled,
                                toggleAutoRouting: () => setAutoRoutingEnabled(!autoRoutingEnabled),
                                showGrid,
                                gridVariant,
                                toggleGrid: handleGridRotate,
                                onShowShortcuts: () => setShowShortcuts(),
                                onStrategyLayout: handleStrategyLayout,
                                lastDomainStrategy,
                                lastDomainDirection,
                                lastNodeLayout,
                                showRuler,
                                toggleRuler: () => setShowRuler((previous: boolean) => !previous),
                                showMinimap,
                                toggleMinimap: () => setShowMinimap((previous: boolean) => !previous),
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
                                toggleSelectionMode: () => {
                                    setIsMarqueeActive(true);
                                    setIsDrawingMode(false);
                                },
                                onToggleDrawingMode: () => {
                                    setIsDrawingMode(true);
                                    setIsMarqueeActive(false);
                                },
                                onActivatePointer: () => {
                                    setIsDrawingMode(false);
                                    setIsMarqueeActive(false);
                                },
                                onAddStickyNote: handleAddStickyNote,
                                onAddMindMap: handleAddMindMap,
                                onExport: handleExport,
                                onImportClick: () => fileInputRef.current?.click(),
                                renderThemeSelector,
                                historyCount: pastEntries?.length ?? 0,
                                onAlign: handleAlign,
                                onDistribute: handleDistribute,
                            }}
                        />}

                        <LayoutStabilityContext.Provider value={isLayoutStable}>
                            <div
                                className="canvas-touch-wrapper"
                                style={{ width: '100%', height: '100%', position: 'relative' }}
                                onTouchStart={handleTouchStart}
                                onTouchEnd={handleTouchEnd}
                            >
                                <GestureOverlay zoom={currentZoom} visible={showOverlay} />
                                <FlowchartCanvasShell
                                    nodes={performanceMode ? nodes : layerSyncedNodes}
                                    displayEdges={visibleEdges}
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
                                    onEdgeDoubleClick={handleEdgeDoubleClick}
                                    onPaneContextMenu={onPaneContextMenu}
                                    onNodeDragStart={wrappedOnNodeDragStart}
                                    onNodeDrag={onNodeDrag}
                                    onNodeDragStop={onNodeDragStop}
                                    onReconnect={handleReconnect}
                                    onReconnectStart={handleReconnectStart}
                                    onReconnectEnd={handleReconnectEnd}
                                    autoRoutingEnabled={autoRoutingEnabled}
                                    enableSmartEdges={true}
                                    showMinimap={showEditingChrome && showMinimap}
                                    showGrid={showGrid}
                                    gridVariant={gridVariant}
                                    backgroundGridColor={gridColor}
                                    isSpacePressed={isSpacePressed}
                                    isConnecting={isConnecting}
                                    connectPreview={connectPreview}
                                    connectionMode={ConnectionMode.Loose}
                                    selectionMode={SelectionMode.Partial}
                                    isValidConnection={isValidConnection}
                                    snapEnabled={snapEnabled}
                                    isDragging={isDragging}
                                >
                                    <RemoteCursors />
                                    {showEditingChrome && <DesignerCanvasFeaturesLayer
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
                                            nodeTypes: dynamicNodeTypes,
                                            pluginCtx,
                                            activePlugin,
                                            quickAddMenuVisible: !!quickAddMenu?.visible,
                                            isContextToolbarHidden,
                                            isDragging,
                                            isConnecting,
                                            updateNodesBatch,
                                            updateEdgesBatch,
                                            onUpdateNodes: (updates: NodePositionUpdate[]) => {
                                                takeSnapshot(nodesRef.current, edgesRef.current);
                                                const updatesMap = new Map(updates.map(update => [update.id, update]));
                                                setNodes((currentNodes: Node[]) => currentNodes.map((node) => {
                                                    const update = updatesMap.get(node.id);
                                                    return (update && update.position) ? { ...node, position: update.position } : node;
                                                }));
                                            },
                                            handleDeleteWithToast,
                                            handleDuplicateWithToast,
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
                                            items: annotations,
                                            mode: annotationMode,
                                            onAdd: addAnnotation,
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
                                            onDeletePage: multiPage.deletePage,
                                            onRenamePage: multiPage.renamePage,
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
                                            onClose: () => setCanvasSearchVisible(false),
                                            nodes,
                                            onHighlightNode: setHighlightedNodeId,
                                            onReplaceNode: handleSearchReplaceNode,
                                            onReplaceAll: handleSearchReplaceAll,
                                            onBeforeReplace: handleBeforeReplace,
                                        }}
                                    />}
                                    {showEditingChrome && <FreehandDrawingLayer
                                        isDrawingMode={isDrawingMode}
                                        zoom={viewport.zoom}
                                        pan={{ x: viewport.x, y: viewport.y }}
                                        currentColor={preset.name === 'sketch' ? '#555555' : '#000000'}
                                    />}
                                    {resolveFlowchartPluginContribution(
                                        'canvas',
                                        pluginCtx && activePlugin?.contributeCanvasComponents
                                            ? () => activePlugin.contributeCanvasComponents(pluginCtx)
                                            : null,
                                        null,
                                    )}
                                    {activeUsers.length > 0 && yAwareness && (
                                        <LiveCursors activeUsers={activeUsers} yAwareness={yAwareness} />
                                    )}
                                </FlowchartCanvasShell>
                            </div>
                        </LayoutStabilityContext.Provider>
                    </div>
                </>
            }
            rightSidebar={<FlowchartDesignerRightSidebarRegion model={model} />}
            overlays={<FlowchartDesignerOverlaysRegion model={model} />}
        />
    );
}
