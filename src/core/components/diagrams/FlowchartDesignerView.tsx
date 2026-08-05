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
import { DiagramEditingProvider } from './DiagramEditingContext';
import { DesignerHeaderLayer } from './ui/DesignerHeaderLayer';
import { FlowchartCanvasShell } from './FlowchartCanvasShell';
import { FlowchartEmptyState } from './FlowchartEmptyState';
import { FlowchartOnboardingHint } from './FlowchartOnboardingHint';
import { shouldShowFlowchartOnboarding } from './flowchartResponsiveChrome';
import { resolveFlowchartLeftClearance } from './flowchartChromeLayout';
import { FreehandDrawingLayer } from './FreehandDrawingLayer';
import { RemoteCursors } from './ui/RemoteCursors';
import { UnifiedDesignerShell } from './UnifiedDesignerShell';
import { persistFlowchartOnboardingDismissed } from './flowchartOnboardingStorage';
import { shouldOpenDesignerAiSidebar } from './designerRightSidebarState';
import {
    CONTAINER_COLLAPSE_REQUEST_EVENT,
    readContainerCollapseRequest,
} from './containerCollapseRequest';
import {
    resolveFlowchartPluginContribution,
    type FlowchartDesignerViewModel,
} from './flowchartDesignerViewModel';
import {
    FlowchartDesignerLeftSidebar,
    FlowchartDesignerOverlaysRegion,
    FlowchartDesignerRightSidebarRegion,
} from './FlowchartDesignerShellRegions';
import { filterCommentsForPage } from './commentPageScope';

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
        canvasSearchReplaceVisible,
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
        isMobile,
        isReadonly,
        isSidebarHidden,
        isSpacePressed,
        isValidConnection,
        isYjsSynced,
        collaborationStatus,
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
        reactFlowWrapper,
        toggleGroupCollapse,
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

    React.useEffect(() => {
        const handleCollapseRequest = (event: Event) => {
            const nodeId = readContainerCollapseRequest(event);
            if (nodeId) toggleGroupCollapse(nodeId);
        };
        window.addEventListener(CONTAINER_COLLAPSE_REQUEST_EVENT, handleCollapseRequest);
        return () => window.removeEventListener(CONTAINER_COLLAPSE_REQUEST_EVENT, handleCollapseRequest);
    }, [toggleGroupCollapse]);

    const actualLeftOffset = resolveFlowchartLeftClearance({
        isSidebarHidden,
        leftDrawerOpen,
        leftDrawerWidth,
    });
    const editingEnabled = !isReadonly && !presentationActive;
    const showEditingChrome = !presentationActive;

    return (
        <UnifiedDesignerShell
            id={id || diagramIdForExport}
            isDragging={isDragging}
            onDragOver={onDragOver}
            onDrop={onDrop}
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
                            isInitialDiagramLoading,
                            onboardingDismissed,
                            leftDrawerOpen,
                            nodeCount: nodes.length,
                            edgeCount: edges.length,
                            jsonEditorVisible,
                            selectedNodeCount: selectedNodes.length,
                            selectedEdgeCount: selectedEdges.length,
                        })}
                        mod={/Mac/i.test(navigator.platform) ? 'âŒ˜' : 'Ctrl'}
                        onOpenCommandPalette={() => setCommandPaletteVisible(true)}
                        onDismiss={() => {
                            setOnboardingDismissed(true);
                            persistFlowchartOnboardingDismissed();
                        }}
                    />}
                    {editingEnabled && <FlowchartEmptyState
                        visible={pluginId !== 'mindmap' && !isInitialDiagramLoading && nodes.length === 0 && !jsonEditorVisible && !isDragging && !isConnecting && !quickAddMenu?.visible}
                        onOpenShapePicker={() => setMobileRequestedPanel('shapes')}
                    />}
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
                            {t('common.loadingDiagram', 'åŠ è½½å›¾è¡¨...')}
                        </div>
                    )}
                    <div ref={reactFlowWrapper} style={{ position: 'relative', height: '100%' }}>
                        {editingEnabled && <ContextMenuLayer onAction={handleContextMenuAction} activePlugin={activePlugin} pluginCtx={pluginCtx ?? undefined} />}

                        {showEditingChrome && <DesignerHeaderLayer
                            diagramId={diagramIdForExport}
                            diagramTitle={model.title}
                            topActions={{
                                onEditJson: handleOpenJsonEditor,
                                onStartPresentation: async () => {
                                    const currentNodes = nodesRef.current;
                                    if (currentNodes.length === 0) {
                                        appMessage.info(t(
                                            'designer.toolbar.presentationEmpty',
                                            'è¯·å…ˆæ·»åŠ è‡³å°‘ä¸€ä¸ªèŠ‚ç‚¹å†å¼€å§‹æ¼”ç¤º',
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
                                            'æ¼”ç¤ºæ¨¡å¼åŠ è½½å¤±è´¥ï¼Œè¯·é‡è¯•',
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
                                isDirectSaveDisabled,
                                onShare: onOpenShareDialog,
                                rightOffset: rightSidebarWidth,
                                extraExportItems,
                    ×nö¶‰žËkºwµç@€€€€€€€€€€€€€€€€€€€€¥˜€¡Í•±•Ñ•‘9½‘•Ì¹±•¹Ñ €ø€ÀñðÍ•±•Ñ•‘‘•Ì¹±•¹Ñ €ø€À¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•ÑÑ¥Ù•I¥¡ÑQ…ˆ ÁÉ½Á•ÉÑäœ¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ô°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…¥¡…ÑÑ¥Ù”è…¥¡…ÑY¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¹½‘•½Õ¹Ðè¹½‘•Ì¹±•¹Ñ °(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€•‘•½Õ¹Ðè•‘•Ì¹±•¹Ñ °(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•±•Ñ•‘9½‘•Í½Õ¹ÐèÍ•±•Ñ•‘9½‘•Ì¹±•¹Ñ °(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•±•Ñ•‘‘•Í½Õ¹ÐèÍ•±•Ñ•‘‘•Ì¹±•¹Ñ °(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€é½½µA•É•¹Ðè5…Ñ ¹É½Õ¹¡Ù¥•ÝÁ½ÉÐ¹é½½´€¨€ÄÀÀ¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í¹…ÁQ½É¥èÍ¹…Á¹…‰±•°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Q½±•M¹…Àè€ ¤€ôøÍ•ÑM¹…Á¹…‰±• ¡•¹…‰±•è‰½½±•…¸¤€ôø€…•¹…‰±•¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥‘•i½½µ½¹ÑÉ½±Ìè…Ñ¥Ù•A±Õ¥¸ü¹¡¥‘•i½½µ½¹ÑÉ½±Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥‘•1…å½ÕÑ½¹ÑÉ½±Ìè…Ñ¥Ù•A±Õ¥¸ü¹¡¥‘•1…å½ÕÑ½¹ÑÉ½±Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥‘•É¥‘½¹ÑÉ½±Ìè…Ñ¥Ù•A±Õ¥¸ü¹¡¥‘•É¥‘½¹ÑÉ½±Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥‘•±½Ý½ÕÍ½¹ÑÉ½±Ìè…Ñ¥Ù•A±Õ¥¸ü¹¡¥‘•±½Ý½ÕÍ½¹ÑÉ½±Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥‘•U¹‘½I•‘½½¹ÑÉ½±Ìè…Ñ¥Ù•A±Õ¥¸ü¹¡¥‘•U¹‘½I•‘½½¹ÑÉ½±Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ÍÉ…Ý¥¹5½‘”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥Í5…ÉÅÕ••Ñ¥Ù”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ñ½±•M•±•Ñ¥½¹5½‘”èÑ½±•5…ÉÅÕ••5½‘”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Q½±•É…Ý¥¹5½‘”èÑ½±•É…Ý¥¹5½‘”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Ñ¥Ù…Ñ•A½¥¹Ñ•Èè…Ñ¥Ù…Ñ•A½¥¹Ñ•È°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘‘MÑ¥­å9½Ñ”è¡…¹‘±•‘‘MÑ¥­å9½Ñ”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘‘5¥¹‘5…Àè¡…¹‘±•‘‘5¥¹‘5…À°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹áÁ½ÉÐè€ ¤€ôøÍ•ÑáÁ½ÉÑ5½‘…±Y¥Í¥‰±”¡ÑÉÕ”¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹%µÁ½ÉÑ±¥¬è•‘¥Ñ¥¹¹…‰±•€ü¡…¹‘±•I•ÅÕ•ÍÑ%µÁ½ÉÐ€èÕ¹‘•™¥¹•°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É•¹‘•ÉQ¡•µ•M•±•Ñ½È°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥ÍÑ½Éå½Õ¹ÐèÁ…ÍÑ¹ÑÉ¥•Ìü¹±•¹Ñ €üü€À°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹±¥¸è¡…¹‘±•±¥¸°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹¥ÍÑÉ¥‰ÕÑ”è¡…¹‘±•¥ÍÑÉ¥‰ÕÑ”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€¼ùô((€€€€€€€€€€€€€€€€€€€€€€€í¥ÍI•…‘½¹±ä€˜˜€…ÁÉ•Í•¹Ñ…Ñ¥½¹Ñ¥Ù”€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É½±”ô‰ÍÑ…ÑÕÌˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á½Í¥Ñ¥½¸è€…‰Í½±ÕÑ”œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ñ½Àè€ÜÈ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€±•™Ðè€œÔÀ”œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÑÉ…¹Í™½É´è€ÑÉ…¹Í±…Ñ•` ´ÔÀ”¤œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€é%¹‘•àè€ÄÈÀ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…‘‘¥¹œè€œáÁà€ÄÑÁàœ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰½É‘•ÉI…‘¥ÕÌè€äää°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰…­É½Õ¹è€É‰„ ÄÔ°€ÈÌ°€ÐÈ°€À¸ä¤œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½±½Èè€œ™™˜œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€™½¹ÑM¥é”è€ÄÌ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€™½¹Ñ]•¥¡Ðè€ØÀÀ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á½¥¹Ñ•ÉÙ•¹ÑÌè€¹½¹”œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€íÐ ‘•Í¥¹•È¹Ñ½½±‰…È¹É•…‘½¹±åMÑ…ÑÕÌœ°€ŸžRï–â–ÞË¦R–ºhƒ
Üƒ’î–>¿š~—žr,œ¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€¥ô((€€€€€€€€€€€€€€€€€€€€€€€€ñ¥…É…µ‘¥Ñ¥¹AÉ½Ù¥‘•ÈÙ…±Õ”õí•‘¥Ñ¥¹¹…‰±•‘ôø(€€€€€€€€€€€€€€€€€€€€€€€€ñ1…å½ÕÑMÑ…‰¥±¥Ñå½¹Ñ•áÐ¹AÉ½Ù¥‘•ÈÙ…±Õ”õí¥Í1…å½ÕÑMÑ…‰±•ôø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰…¹Ù…ÌµÑ½Õ µÝÉ…ÁÁ•Èˆ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÍÑå±”õíìÝ¥‘Ñ è€œÄÀÀ”œ°¡•¥¡Ðè€œÄÀÀ”œ°Á½Í¥Ñ¥½¸è€É•±…Ñ¥Ù”œõô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Q½Õ¡MÑ…ÉÐõí¡…¹‘±•Q½Õ¡MÑ…ÉÑô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Q½Õ¡¹õí¡…¹‘±•Q½Õ¡¹‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ•ÍÑÕÉ•=Ù•É±…äé½½´õíÕÉÉ•¹Ñi½½µôÙ¥Í¥‰±”õíÍ¡½Ý=Ù•É±…åô€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ±½Ý¡…ÉÑ…¹Ù…ÍM¡•±°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¹½‘•Ìõí¥Í%¹¥Ñ¥…±¥…É…µ1½…‘¥¹œ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ümt(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€èÁ•É™½Éµ…¹•5½‘”(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ü¹½‘•Ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€è±…å•ÉMå¹•‘9½‘•Íô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‘¥ÍÁ±…å‘•Ìõí¥Í%¹¥Ñ¥…±¥…É…µ1½…‘¥¹œ€ümt€èÙ¥Í¥‰±•‘•Íô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¹½‘•QåÁ•Ìõí‘å¹…µ¥9½‘•QåÁ•Íô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€•‘•QåÁ•Ìõí‘å¹…µ¥‘•QåÁ•Íô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹%¹¥Ðõí¡…¹‘±•I•…Ñ±½Ý%¹¥Ñô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹9½‘•Í¡…¹”õí½¹9½‘•Í¡…¹•]¥Ñ¡1½­ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘•Í¡…¹”õí½¹‘•Í¡…¹•]¥Ñ¡1½­ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹½¹¹•Ðõí•¹¡…¹•‘=¹½¹¹•Ñô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹½¹¹•ÑMÑ…ÉÐõí½¹½¹¹•ÑMÑ…ÉÑô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹½¹¹•Ñ¹õí•¹¡…¹•‘=¹½¹¹•Ñ¹‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹M•±•Ñ¥½¹¡…¹”õí½¹M•±•Ñ¥½¹¡…¹•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹A…¹•±¥¬õí¡…¹‘±•A…¹•±¥­ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹A…¹•5½ÕÍ•5½Ù”õí½¹A…¹•5½ÕÍ•5½Ù•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹A…¹•5½ÕÍ•1•…Ù”õí½¹A…¹•5½ÕÍ•1•…Ù•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹A…¹•½Õ‰±•±¥¬õí½¹A…¹•½Õ‰±•±¥­ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹9½‘•½¹Ñ•áÑ5•¹Ôõí½¹9½‘•½¹Ñ•áÑ5•¹Õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘•½¹Ñ•áÑ5•¹Ôõí½¹‘•½¹Ñ•áÑ5•¹Õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘•½Õ‰±•±¥¬õí¡…¹‘±•‘•½Õ‰±•±¥­ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹A…¹•½¹Ñ•áÑ5•¹Ôõí½¹A…¹•½¹Ñ•áÑ5•¹Õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹9½‘•É…MÑ…ÉÐõíÝÉ…ÁÁ•‘=¹9½‘•É…MÑ…ÉÑô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹9½‘•É…œõí½¹9½‘•É…ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Mµ…ÉÑ9½‘•É…œõí½¹Mµ…ÉÑ9½‘•É…ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹9½‘•É…MÑ½Àõí½¹9½‘•É…MÑ½Áô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•½¹¹•Ðõí¡…¹‘±•I•½¹¹•Ñô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•½¹¹•ÑMÑ…ÉÐõí¡…¹‘±•I•½¹¹•ÑMÑ…ÉÑô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•½¹¹•Ñ¹õí¡…¹‘±•I•½¹¹•Ñ¹‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…ÕÑ½I½ÕÑ¥¹¹…‰±•õí…ÕÑ½I½ÕÑ¥¹¹…‰±•‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€•¹…‰±•Mµ…ÉÑ‘•ÌõíÑÉÕ•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í¡½Ý5¥¹¥µ…ÀõíÍ¡½Ý‘¥Ñ¥¹¡É½µ”€˜˜Í¡½Ý5¥¹¥µ…Áô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í¡½ÝÉ¥õíÍ¡½ÝÉ¥‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É¥‘Y…É¥…¹ÐõíÉ¥‘Y…É¥…¹Ñô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‰…­É½Õ¹‘É¥‘½±½ÈõíÉ¥‘½±½Éô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ÍMÁ…•AÉ•ÍÍ•õí¥ÍMÁ…•AÉ•ÍÍ•‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥Í½¹¹•Ñ¥¹œõí¥Í½¹¹•Ñ¥¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹¹•ÑAÉ•Ù¥•Üõí½¹¹•ÑAÉ•Ù¥•Ýô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹¹•Ñ¥½¹5½‘”õí½¹¹•Ñ¥½¹5½‘”¹1½½Í•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•±•Ñ¥½¹5½‘”õíM•±•Ñ¥½¹5½‘”¹A…ÉÑ¥…±ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ÍY…±¥‘½¹¹•Ñ¥½¸õí¥ÍY…±¥‘½¹¹•Ñ¥½¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í¹…Á¹…‰±•õíÍ¹…Á¹…‰±•‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ÍÉ…¥¹œõí¥ÍÉ…¥¹ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€•‘¥Ñ¥¹¹…‰±•õí•‘¥Ñ¥¹¹…‰±•‘ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñI•µ½Ñ•ÕÉÍ½ÉÌ€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€í•‘¥Ñ¥¹¹…‰±•€˜˜€ñ•Í¥¹•É…¹Ù…Í•…ÑÕÉ•Í1…å•È(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÅÕ¥­½¹¹•Ðõíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù¥Í¥‰±”è€„…ÅÕ¥­‘‘5•¹Ôü¹Ù¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€àèÅÕ¥­‘‘5•¹Ôü¹±¥•¹Ñ`ñð€À°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€äèÅÕ¥­‘‘5•¹Ôü¹±¥•¹Ñdñð€À°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í½ÕÉ•9½‘•%èÅÕ¥­‘‘5•¹Ôü¹Í½ÕÉ•9½‘•%°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹M•±•Ðè¡…¹‘±•‘‘9½‘”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹±½Í”è±½Í•5•¹Ô°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹AÉ•Ù¥•ÜèÍ•ÑEÕ¥­½¹¹•ÑAÉ•Ù¥•Ü°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡½Ù•ÉQ½½±‰…Èõíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•±•Ñ•‘9½‘•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•±•Ñ•‘‘•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¹½‘•QåÁ•Ìè‘å¹…µ¥9½‘•QåÁ•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á±Õ¥¹ÑàèÁ±Õ¥¹Ñà€üüÕ¹‘•™¥¹•°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…Ñ¥Ù•A±Õ¥¸°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÅÕ¥­‘‘5•¹ÕY¥Í¥‰±”è€„…ÅÕ¥­‘‘5•¹Ôü¹Ù¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥Í½¹Ñ•áÑQ½½±‰…É!¥‘‘•¸è¥Í½¹Ñ•áÑQ½½±‰…É!¥‘‘•¸ñð	½½±•…¸¡±•™ÑÉ…Ý•É=Á•¸¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ÍÉ…¥¹œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥Í½¹¹•Ñ¥¹œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÕÁ‘…Ñ•9½‘•Í	…Ñ °(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÕÁ‘…Ñ•‘•Í	…Ñ °(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹UÁ‘…Ñ•9½‘•Ìè€¡ÕÁ‘…Ñ•Ìè9½‘•A½Í¥Ñ¥½¹UÁ‘…Ñ•mt¤€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ñ…­•M¹…ÁÍ¡½Ð¡¹½‘•ÍI•˜¹ÕÉÉ•¹Ð°•‘•ÍI•˜¹ÕÉÉ•¹Ð¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍÐÕÁ‘…Ñ•Í5…À€ô¹•Ü5…À¡ÕÁ‘…Ñ•Ì¹µ…À¡ÕÁ‘…Ñ”€ôømÕÁ‘…Ñ”¹¥°ÕÁ‘…Ñ•t¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ9½‘•Ì ¡ÕÉÉ•¹Ñ9½‘•Ìè9½‘•mt¤€ôøÕÉÉ•¹Ñ9½‘•Ì¹µ…À ¡¹½‘”¤€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹ÍÐÕÁ‘…Ñ”€ôÕÁ‘…Ñ•Í5…À¹•Ð¡¹½‘”¹¥¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É•ÑÕÉ¸€¡ÕÁ‘…Ñ”€˜˜ÕÁ‘…Ñ”¹Á½Í¥Ñ¥½¸¤€üì€¸¸¹¹½‘”°Á½Í¥Ñ¥½¸èÕÁ‘…Ñ”¹Á½Í¥Ñ¥½¸ô€è¹½‘”ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ô¤¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ô°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±••±•Ñ•]¥Ñ¡Q½…ÍÐ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•ÕÁ±¥…Ñ•]¥Ñ¡Q½…ÍÐ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•É½ÕÁ]¥Ñ¡Q½…ÍÐ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•U¹É½ÕÁ]¥Ñ¡Q½…ÍÐ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•1½¬°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•=Á…¥Ñä°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•	É¥¹Q½É½¹Ð°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…¹‘±•M•¹‘Q½	…¬°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½ÁåMÑå±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…ÍÑ•MÑå±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡…Í½Á¥•‘MÑå±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Íµ…ÉÑÕ¥‘•ÌõíìÕ¥‘•Ìõô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…¹¹½Ñ…Ñ¥½¹Ìõíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥Ñ•µÌè™¥±Ñ•É½µµ•¹ÑÍ½ÉA…”¡…¹¹½Ñ…Ñ¥½¹Ì°µÕ±Ñ¥A…”¹…Ñ¥Ù•A…•%¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€µ½‘”è…¹¹½Ñ…Ñ¥½¹5½‘”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘è€¡à°ä°Ñ•áÐ¤€ôø…‘‘¹¹½Ñ…Ñ¥½¸¡à°ä°Ñ•áÐ°µÕ±Ñ¥A…”¹…Ñ¥Ù•A…•%¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹UÁ‘…Ñ”èÕÁ‘…Ñ•¹¹½Ñ…Ñ¥½¸°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹•±•Ñ”è‘•±•Ñ•¹¹½Ñ…Ñ¥½¸°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹Q½±•I•Í½±Ù•èÑ½±•I•Í½±Ù•°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…Ñ¥Ù•A…•%èµÕ±Ñ¥A…”¹…Ñ¥Ù•A…•%°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½±½ÉÌè99=QQ%=9}=1=IL°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…•Ìõíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥Ñ•µÌèµÕ±Ñ¥A…”¹Á…•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…Ñ¥Ù•A…•%èµÕ±Ñ¥A…”¹…Ñ¥Ù•A…•%°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹MÝ¥Ñ¡A…”èµÕ±Ñ¥A…”¹ÍÝ¥Ñ¡A…”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹‘‘A…”èµÕ±Ñ¥A…”¹…‘‘A…”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹•±•Ñ•A…”èµÕ±Ñ¥A…”¹‘•±•Ñ•A…”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•¹…µ•A…”èµÕ±Ñ¥A…”¹É•¹…µ•A…”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€‘¥Í…‰±•è¥Í%¹¥Ñ¥…±¥…É…µ1½…‘¥¹œ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¡¥ÍÑ½Éäõíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù¥Í¥‰±”è¡¥ÍÑ½ÉåA…¹•±Y¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹±½Í”è€ ¤€ôøÍ•Ñ!¥ÍÑ½ÉåA…¹•±Y¥Í¥‰±”¡™…±Í”¤°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…ÍÑ¹ÑÉ¥•ÌèÁ…ÍÑ¹ÑÉ¥•Ìñðmt°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…¹U¹‘¼°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…¹I•‘¼°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹U¹‘¼èÕ¹‘¼°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•‘¼èÉ•‘¼°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹)ÕµÁQ¼è©ÕµÁQ¼°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•…É õíì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Ù¥Í¥‰±”è…¹Ù…ÍM•…É¡Y¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹±½Í”è€ ¤€ôøì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ…¹Ù…ÍM•…É¡Y¥Í¥‰±”¡™…±Í”¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Í•Ñ…¹Ù…ÍM•…É¡I•Á±…•Y¥Í¥‰±”¡™…±Í”¤ì(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ô°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¹½‘•Ì°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹!¥¡±¥¡Ñ9½‘”èÍ•Ñ!¥¡±¥¡Ñ•‘9½‘•%°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•Á±…•9½‘”è¡…¹‘±•M•…É¡I•Á±…•9½‘”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•Á±…•±°è¡…¹‘±•M•…É¡I•Á±…•±°°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€É•Á±…•Y¥Í¥‰±”è…¹Ù…ÍM•…É¡I•Á±…•Y¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹I•Á±…•Y¥Í¥‰±•¡…¹”èÍ•Ñ…¹Ù…ÍM•…É¡I•Á±…•Y¥Í¥‰±”°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¼ùô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€í•‘¥Ñ¥¹¹…‰±•€˜˜€ñÉ••¡…¹‘É…Ý¥¹1…å•È(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€­•äõí€‘íµÕ±Ñ¥A…”¹…Ñ¥Ù•A…•%‘ô´‘í¥ÍÉ…Ý¥¹5½‘”€ü€…Ñ¥Ù”œ€è€¥¹…Ñ¥Ù”õô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ÍÉ…Ý¥¹5½‘”õí¥ÍÉ…Ý¥¹5½‘•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€é½½´õíÙ¥•ÝÁ½ÉÐ¹é½½µô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á…¸õíìàèÙ¥•ÝÁ½ÉÐ¹à°äèÙ¥•ÝÁ½ÉÐ¹äõô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ÕÉÉ•¹Ñ½±½ÈõíÁÉ•Í•Ð¹¹…µ”€ôôô€Í­•Ñ œ€ü€œŒÔÔÔÔÔÔœ€è€œŒÀÀÀÀÀÀô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€½¹É…Ý¹õí¡…¹‘±•‘‘É••¡…¹‘MÑÉ½­•ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¼ùô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€í•‘¥Ñ¥¹¹…‰±•€˜˜É•Í½±Ù•±½Ý¡…ÉÑA±Õ¥¹½¹ÑÉ¥‰ÕÑ¥½¸ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€…¹Ù…Ìœ°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€Á±Õ¥¹Ñà€˜˜…Ñ¥Ù•A±Õ¥¸ü¹½¹ÑÉ¥‰ÕÑ•…¹Ù…Í½µÁ½¹•¹ÑÌ(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ü€ ¤€ôø…Ñ¥Ù•A±Õ¥¸¹½¹ÑÉ¥‰ÕÑ•…¹Ù…Í½µÁ½¹•¹ÑÌü¸¡Á±Õ¥¹Ñà¤(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€è¹Õ±°°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¹Õ±°°(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€í…Ñ¥Ù•UÍ•ÉÌ¹±•¹Ñ €ø€À€˜˜åÝ…É•¹•ÍÌ€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñ1¥Ù•ÕÉÍ½ÉÌ…Ñ¥Ù•UÍ•ÉÌõí…Ñ¥Ù•UÍ•ÉÍôåÝ…É•¹•ÍÌõíåÝ…É•¹•ÍÍô€¼ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½±½Ý¡…ÉÑ…¹Ù…ÍM¡•±°ø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ð½1…å½ÕÑMÑ…‰¥±¥Ñå½¹Ñ•áÐ¹AÉ½Ù¥‘•Èø(€€€€€€€€€€€€€€€€€€€€€€€€ð½¥…É…µ‘¥Ñ¥¹AÉ½Ù¥‘•Èø(€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€ð¼ø(€€€€€€€€€€€ô(€€€€€€€€€€€É¥¡ÑM¥‘•‰…Èõí•‘¥Ñ¥¹¹…‰±•€ü€ñ±½Ý¡…ÉÑ•Í¥¹•ÉI¥¡ÑM¥‘•‰…ÉI•¥½¸µ½‘•°õíµ½‘•±ô€¼ø€è¹Õ±±ô(€€€€€€€€€€€½Ù•É±…åÌõìñ±½Ý¡…ÉÑ•Í¥¹•É=Ù•É±…åÍI•¥½¸µ½‘•°õíµ½‘•±ô€¼ùô(€€€€€€€€¼ø(€€€€¤ì)ô(