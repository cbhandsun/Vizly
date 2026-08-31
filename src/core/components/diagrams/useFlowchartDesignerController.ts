import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { message, notification } from 'antd';

import { useDesignerCanvasState } from './hooks/useDesignerCanvasState';
import { useDesignerInteractions } from './hooks/useDesignerInteractions';
import { useDesignerEventHandlers } from './hooks/useDesignerEventHandlers';
import { useDesignerSystemSync } from './hooks/useDesignerSystemSync';
import { useLayoutAutoSaveMetadata } from './hooks/usePersistedLayoutSelection';
import { useDiagramScopedSelection } from './hooks/useDiagramScopedSelection';
import { useCanonicalSelectionChange } from './hooks/useCanonicalSelectionChange';
import { DiagramComponentProps } from '../../types/diagram-components';
import { useTranslation } from 'react-i18next';
import { useComponentPerformance, useInteractionPerformance } from '../../hooks/usePerformanceMonitor';
import { useResponsive } from '../../../hooks/useResponsive';
import { useDiagramCollaboration } from '../../hooks/useDiagramCollaboration';
import { useTopologyLinter } from '../../hooks/useTopologyLinter';
import { useDiagramStore } from '../../store/useDiagramStore';

import { useMobileInteractions } from '../../hooks/useMobileInteractions';
import { useCollapsibleGroups } from './hooks/useCollapsibleGroups';
import { useLayerManagement } from './hooks/useLayerManagement';
import { useMultiPage } from './hooks/useMultiPage';
import { useDesignerBatchUpdates } from './hooks/useDesignerBatchUpdates';
import { useAutoRouting } from './hooks/useAutoRouting';
import { useFlowchartExportControls } from './hooks/useFlowchartExportControls';
import { useDesignerCommands } from './hooks/useDesignerCommands';
import { useFlowchartPluginRuntime } from './hooks/useFlowchartPluginRuntime';
import { useFlowchartExternalEvents } from './hooks/useFlowchartExternalEvents';
import { useFlowchartShellState } from './hooks/useFlowchartShellState';
import { useFlowchartCanvasCommands } from './hooks/useFlowchartCanvasCommands';
import { useTrackedFlowchartSaves } from './hooks/useTrackedFlowchartSaves';
import { coerceCollaborationPresenceUsers } from './collaborationPresence';
import { shouldShowFlowchartMinimapByDefault } from './flowchartResponsiveChrome';
import { useFlowchartChromeCoordination } from './hooks/useFlowchartChromeCoordination';
import { useFlowchartHostActions } from './hooks/useFlowchartHostActions';
import { useMobileFlowchartViewportGuard } from './hooks/useMobileFlowchartViewportGuard';
import { useFlowchartSearchReplaceActions } from './hooks/useFlowchartSearchReplaceActions';
import { useFlowchartCreationTools } from './hooks/useFlowchartCreationTools';
import { useFlowchartImportRequest } from './hooks/useFlowchartImportRequest';
import { useCommentAwarePageDeletion } from './hooks/useCommentAwarePageDeletion';
import { useDiagramOperationScope } from './hooks/useDiagramOperationScope';
import { useFlowchartImportNotifications } from './hooks/useFlowchartImportNotifications';
import { useHistoryFeedbackActions } from './historyActionFeedback';
import { useFlowchartNodeFocus } from './hooks/useFlowchartNodeFocus';
import { useFlowchartCanvasExit } from './hooks/useFlowchartCanvasExit';
import { useFlowchartConnectionHandler } from './hooks/useFlowchartConnectionHandler';
import { useFlowchartPaneDoubleClick } from './hooks/useFlowchartPaneDoubleClick';
import { useFlowchartImportHandler } from './hooks/useFlowchartImportHandler';
import { useFlowchartReverseImportFeedback } from './hooks/useFlowchartReverseImportFeedback';
import { useFlowchartReactFlowInit } from './hooks/useFlowchartReactFlowInit';
import { resolveFlowchartCustomDomainLayoutCapability } from './flowchartLayoutCapabilities';

export const useFlowchartDesignerController = ({
    id,
    title,
    businessData,
    extraExportItems,
    onExportPermissionCheck,
    isYjsSynced,
    collaborationStatus = 'inactive',
    onOpenCollaboration,
    activeUsers: rawActiveUsers = [],
    yAwareness,
    onCloudSave,
    onDirectSave,
    onSaveAs,
    isDirectSaveDisabled,
    onOpenShareDialog,
    renderAIChatPanel,
    renderAIConfigModal,
    renderShareDialog,
    renderThemeSelector,
    showAiCrown,
    onAiTabIntercept,
    topActionArea,
    isVersionHistoryOpen = false,
    onOpenVersionHistory,
    onVersionHistoryClose,
    renderVersionHistoryPanel,
    loadLayoutPresetMap,
    showOnlyMainFlow: externalShowOnlyMainFlow = false,
    highlightMainFlow: externalHighlightMainFlow = false,
    onMainFlowAnimationChange,
    onShowOnlyMainFlowChange,
    isReadonly: externalReadonly = false,
    edgeMode: externalEdgeMode = 'advanced-smart',
    onReadonlyChange,
    onOpenSettings,
    onOpenCommandPalette,
    pluginId = 'flowchart',
}: DiagramComponentProps) => {
    const { t } = useTranslation();
    const [messageApi, messageContextHolder] = message.useMessage();
    const activeUsers = useMemo(
        () => coerceCollaborationPresenceUsers(rawActiveUsers),
        [rawActiveUsers],
    );
    const {
        reactFlowInstance,
        setReactFlowInstance,
        viewport,
        isReadonly,
        handleReadonlyChange,
        edgeMode: internalEdgeMode,
        preset,
        showOnlyMainFlow,
        highlightMainFlow,
        handleToggleShowOnlyMainFlow,
        handleToggleHighlightMainFlow,
        theme,
        canvasBg,
        gridColor,
        nodes,
        edges,
        setNodes,
        setEdges,
        onNodesChange,
        onEdgesChange,
        diagramHistory,
        nodesRef,
        edgesRef,
    } = useDesignerCanvasState({
        externalReadonly,
        externalEdgeMode,
        externalShowOnlyMainFlow,
        externalHighlightMainFlow,
        onReadonlyChange,
        onMainFlowAnimationChange,
        onShowOnlyMainFlowChange,
    });

    const { handleFitView, handleOpenSettings, notifyPluginNodeAdded } = useFlowchartHostActions({
        diagramId: id,
        onOpenSettings,
        t,
    });

    // ?图片导出支持 (PNG/SVG/PDF/GIF)
    const diagramIdForExport = id || 'flowchart-designer';
    const { getReactFlowSnapshot } = useFlowchartExportControls(
        diagramIdForExport,
        reactFlowInstance,
        onExportPermissionCheck,
    );

    // ?性能监控
    useComponentPerformance('FlowchartDesigner');
    useInteractionPerformance();

    const {
        takeSnapshot, notifyHistoryChanged, undo: performUndo, redo: performRedo, canUndo, canRedo,
        pastEntries, getPreviousState, jumpTo, switchScope: switchHistoryScope,
        removeScope: removeHistoryScope, removeScopes: removeHistoryScopes,
    } = diagramHistory;
    const {
        selectedNodes,
        selectedEdges,
        setSelectedNodes,
        setSelectedEdges,
        clearSelection,
    } = useDiagramScopedSelection(id, nodes, edges);
    const [isContextToolbarHidden] = useState(false);
    const handleBeforeUpdate = useCallback(() => {
        takeSnapshot(nodesRef.current, edgesRef.current);
    }, [edgesRef, nodesRef, takeSnapshot]);
    const handleFocusNode = useFlowchartNodeFocus({
        reactFlowInstance,
        nodesRef,
        setNodes,
        setEdges,
        setSelectedNodes,
        setSelectedEdges,
    });
    const customDomainLayoutCapability = useMemo(
        () => resolveFlowchartCustomDomainLayoutCapability(nodes, edges),
        [edges, nodes],
    );

    const handlePresentationFocus = useCallback((ids: string[]) => {
        if (ids && ids.length > 0) handleFocusNode(ids[0]);
    }, [handleFocusNode]);

    const {
        layers, activeLayerId, setActiveLayerId, createLayer, deleteLayer, toggleVisibility, toggleLock, renameLayer, reorderLayers, getLayer, setLayerColor
    } = useLayerManagement({ nodesRef, edgesRef, setNodes, setEdges, storageScope: diagramIdForExport, messageApi });

    const { updateNodesBatch, updateEdgesBatch } = useDesignerBatchUpdates({
        nodes,
        edges,
        setNodes,
        setEdges,
        setSelectedNodes,
        setSelectedEdges,
        takeSnapshot,
    });
    const { isMobile } = useResponsive();
    const {
        isSidebarHidden, leftDrawerOpen, setLeftDrawerOpen, leftDrawerWidth, setLeftDrawerWidth, rightSidebarWidth, setRightSidebarWidth,
        isDrawingMode, setIsDrawingMode, historyPanelVisible, setHistoryPanelVisible, jsonEditorVisible, setJsonEditorVisible,
        presentationActive, setPresentationActive, laserEnabled, diffResult, setDiffResult,
        canvasSearchVisible, setCanvasSearchVisible, canvasSearchReplaceVisible, setCanvasSearchReplaceVisible,
        mobileRequestedPanel, setMobileRequestedPanel, mobilePropertyDrawerVisible, setMobilePropertyDrawerVisible,
        exportModalVisible, setExportModalVisible, pluginManagerVisible, setPluginManagerVisible,
        aiChatVisible, setAiChatVisible, activeRightTab, setActiveRightTab, commandPaletteVisible, setCommandPaletteVisible,
        shortcutHelpVisible, setShortcutHelpVisible, showShortcuts, setShowShortcutsModal, jsonEditorInitialContent,
        showPerformanceDashboard, presentationSlides, setPresentationSlides, setHighlightedNodeId,
        onboardingDismissed, setOnboardingDismissed, showGrid, setShowGrid, showMinimap, setShowMinimap,
        snapEnabled, setSnapEnabled, showRuler, setShowRuler, gridVariant, setGridVariant,
    } = useFlowchartShellState(
        theme?.diagram?.canvas?.grid,
        shouldShowFlowchartMinimapByDefault(isMobile),
    );
    const { handleCommandPaletteVisibility, handleMobilePluginNodeAdded } = useFlowchartChromeCoordination({
        isMobile,
        onOpenCommandPalette,
        setCommandPaletteVisible,
        setLeftDrawerOpen,
        setMobileRequestedPanel,
        setShowMinimap,
    });
    const handleOpenExportModal = useCallback(
        () => setExportModalVisible(true),
        [setExportModalVisible],
    );

    const {
        currentZoom,
        showOverlay,
        handleTouchStart,
        handleTouchEnd
    } = useMobileInteractions();

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInFlightRef = useRef(false);

    const [notificationApi, notificationContextHolder] = notification.useNotification();
    const { undo, redo } = useHistoryFeedbackActions(
        performUndo, performRedo, messageApi,
        t('designer.historyPanel.undoStatus'), t('designer.historyPanel.redoStatus'),
    );
    const { handleImportStarted, handleImportFinished } = useFlowchartImportNotifications({
        notificationApi,
        fileInputRef,
        t,
    });
    const getCurrentNodes = useCallback(() => nodesRef.current, [nodesRef]);
    const getCurrentEdges = useCallback(() => edgesRef.current, [edgesRef]);
    const editingEnabled = !isReadonly && !presentationActive;
    const handleRequestImport = useFlowchartImportRequest({
        editingEnabled,
        nodesRef,
        edgesRef,
        fileInputRef,
        importInFlightRef,
        messageApi,
        t,
    });
    useMobileFlowchartViewportGuard({
        isMobile,
        getNodes: getCurrentNodes,
        fitView: handleFitView,
    });
    const {
        activePlugin,
        pluginCtx,
        dynamicNodeTypes,
        dynamicEdgeTypes,
    } = useFlowchartPluginRuntime({
        pluginId,
        diagramId: id || 'default',
        getNodes: getCurrentNodes,
        getEdges: getCurrentEdges,
        setNodes,
        setEdges,
        setSelectedNodes,
        setSelectedEdges,
        updateNodesBatch,
        updateEdgesBatch,
        takeSnapshot,
        reactFlowInstance,
        reactFlowWrapper,
        activeLayerId,
        isMobile,
        t,
        onMobileNodeAdded: handleMobilePluginNodeAdded,
        notifyNodeAdded: notifyPluginNodeAdded,
    });
    const { nodesWithCollapseState, edgesWithCollapseState, toggleGroupCollapse } = useCollapsibleGroups({
        nodes,
        edges,
        nodesRef,
        edgesRef,
        setNodes,
        takeSnapshot,
    });

    // 2. Interactions Domain Controller
    const handleConnect = useFlowchartConnectionHandler({
        edgesRef,
        nodesRef,
        relationshipLabel: t('designer.flowchart.relationshipEdgeLabel'),
        setEdges,
        takeSnapshot,
    });
    const interactionsParams = useDesignerInteractions({
        nodes, edges, nodesRef, edgesRef, setNodes, setEdges,
        selectedNodes, setSelectedNodes,
        takeSnapshot, notifyHistoryChanged, reactFlowInstance,
        isDragging, setIsDragging,
        activePlugin, pluginCtx,
        onNodesChange, onEdgesChange,
        virtualizedNodes: nodesWithCollapseState, edgesWithCollapseState: edgesWithCollapseState,
        onConnect: handleConnect,
        preset, showOnlyMainFlow, highlightMainFlow,
        layers,
        activeLayerId,
        setActiveLayerId,
        createLayer,
        deleteLayer,
        toggleVisibility,
        toggleLock,
        renameLayer,
        reorderLayers,
        getLayer,
        setLayerColor
    });

    const {
        layerSyncedNodes, visibleEdges, onNodesChangeWithLock, onEdgesChangeWithLock,
        handleLabelOffsetChange, handleLabelStyleChange, handleWaypointsChange, handleEdgeLabelChange,
        handleGroup, handleUngroup,
        isMarqueeActive, setIsMarqueeActive,
        guides, onSmartNodeDrag,
        handleAlign, handleDistribute, canAlign, canDistribute,
        hasCopiedStyle, copyStyle, pasteStyle,
        templates, groupedTemplates, saveAsTemplate, createFromTemplate, deleteTemplate, renameTemplate,
        annotations, annotationMode, addAnnotation, updateAnnotation, deleteAnnotation, toggleResolved, ANNOTATION_COLORS,
        quickAddMenu, handleAddNode, closeMenu, openQuickAddMenu,
        setQuickConnectPreview, nodesWithGhost, finalEdgesWithGhost,
        isConnecting, connectPreview, onConnectStart, enhancedOnConnect, enhancedOnConnectEnd,
        isValidConnection,
        handleReconnect, handleReconnectStart, handleReconnectEnd,
        onDragOver, onDrop, wrappedOnNodeDragStart, onNodeDrag, onNodeDragStop,
        isDraggingNode, onDisplayRoutingFinalApplied,
    } = interactionsParams;
    const isCommentMode = annotationMode;
    const setStoredCommentMode = useDiagramStore(state => state.setIsCommentMode);
    const {
        activatePointer, setCommentMode: setIsCommentMode, toggleDrawingMode, toggleMarqueeMode,
        handleAddFreehandStroke, handleAddMindMap, handleAddStickyNote,
    } = useFlowchartCreationTools({
        editingEnabled: !isReadonly && !presentationActive,
        isDrawingMode, isMarqueeActive, isCommentMode,
        setIsDrawingMode, setIsMarqueeActive, setIsCommentMode: setStoredCommentMode,
        activeLayerId, nodesRef, edgesRef, reactFlowInstance, setNodes, takeSnapshot, t,
    });
    const { clearCanvasSelection, exitCanvasInteraction } = useFlowchartCanvasExit({
        setNodes,
        setEdges,
        clearScopedSelection: clearSelection,
        activatePointer,
        closeQuickAdd: closeMenu,
    });
    
    // 2.5 Linter Layer (Phase 8 integration)
    useTopologyLinter(nodesWithGhost, finalEdgesWithGhost, { enabled: !isReadonly });
    






    const { autoRoutingEnabled, setAutoRoutingEnabled, isLayoutStable, isLayoutBusy, layoutPresentationPreview, handleStrategyLayout, lastDomainStrategy, lastDomainDirection, lastNodeLayout, routingSessionRuntime, layoutSelection, restoreLayoutSelection } = useAutoRouting({
        setNodes, setEdges, nodesRef, edgesRef, takeSnapshot, reactFlowInstance,
        diagramId: diagramIdForExport,
        loadLayoutPresetMap,
    });

    // 协作层 diagramId：优先使用 id prop，回退到导出 ID，避免多画布协作时 ID 冲突
    const diagramId = id || diagramIdForExport || 'default';
    const { updateLocalCursor } = useDiagramCollaboration(diagramId, !isReadonly);
    const restorePageLayoutSelection = useCallback((selection: typeof layoutSelection) => {
        restoreLayoutSelection({ layoutSelection: selection });
    }, [restoreLayoutSelection]);
    const captureCurrentPageState = useCallback(() => ({
        ...(activePlugin?.capturePageState && pluginCtx
            ? activePlugin.capturePageState(pluginCtx)
            : { nodes: nodesRef.current, edges: edgesRef.current }),
        layoutSelection,
    }), [activePlugin, edgesRef, layoutSelection, nodesRef, pluginCtx]);
    const setPageNodes = useCallback((nextNodes: typeof nodes) => {
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
    }, [nodesRef, setNodes]);
    const setPageEdges = useCallback((nextEdges: typeof edges) => {
        edgesRef.current = nextEdges;
        setEdges(nextEdges);
    }, [edgesRef, setEdges]);
    const createLocalizedPageName = useCallback((index: number) => t(
        'designer.pages.defaultName',
        {
            index,
            defaultValue: '页面 {{index}}',
        },
    ), [t]);
    const multiPage = useMultiPage(
        () => nodesRef.current,
        () => edgesRef.current,
        setPageNodes,
        setPageEdges,
        {
            switchScope: switchHistoryScope,
            removeScope: removeHistoryScope,
            removeScopes: removeHistoryScopes,
            clearSelection,
            scopeId: diagramId,
            captureCurrentState: captureCurrentPageState,
            restoreLayoutSelection: restorePageLayoutSelection,
        },
        createLocalizedPageName,
    );
    const getOperationScope = useDiagramOperationScope(diagramId, multiPage.getPageOperationScope);
    const viewportPersistenceKey = `${diagramIdForExport}:${multiPage.activePageId}`;
    const commentAwarePageLifecycle = useCommentAwarePageDeletion(
        multiPage.deletePage,
        multiPage.restoreDeletedPage,
    );
    // 3. Event Handlers Domain Controller
    // commandPaletteVisible and shortcutHelpVisible already declared in Component root state section


    const {
        onNodeContextMenu,
        onEdgeContextMenu,
        onPaneContextMenu,
        onPaneClick: contextMenuPaneClick,
        handleContextMenuAction,
        handleSelectAll,
        handleBringToFront,
        handleSendToBack,
        isSpacePressed,
        // Toast actions
        handleCopyWithToast,
        handlePasteWithToast,
        handleCutWithToast,
        handleDeleteWithToast,
        handleDuplicateWithToast,
        handleGroupWithToast,
        handleUngroupWithToast,
        handleLock,
        // 隐藏功能暴露
        handleMatchSize,
        handleReverseEdge,
    } = useDesignerEventHandlers({
        nodes, edges, setNodes, setEdges, setSelectedNodes, setSelectedEdges,
        selectedNodes, selectedEdges,
        takeSnapshot, getOperationScope, undo, redo,
        reactFlowInstance, reactFlowWrapper,
        isDragging, editingEnabled: !isReadonly && !presentationActive, pluginCtx, activePlugin,
        messageApi,
        layers, setActiveLayerId, toggleVisibility,
        canAlign, canDistribute, handleAlign, handleDistribute,
        handleGroup, handleUngroup,
        nodesRef, edgesRef,
        setCommandPaletteVisible: handleCommandPaletteVisibility, setShortcutHelpVisible,
        setCanvasSearchVisible, setCanvasSearchReplaceVisible,
        copyStyle, pasteStyle, hasCopiedStyle, saveAsTemplate,
        toggleGroupCollapse,
        onEscapeEdit: exitCanvasInteraction,
    });
    const handlePaneClick = useCallback((_event?: React.MouseEvent) => {
        // 先关闭可能存在的 Context Menu
        contextMenuPaneClick();
        clearCanvasSelection();

        if (isCommentMode) {
            // [GAP-02] 由 AnnotationLayer 的 handleCanvasClick 负责展示编辑器并添加评论
            // 这里不再直接 addComment，以避免创建空评论。
            return;
        }
    }, [clearCanvasSelection, isCommentMode, contextMenuPaneClick]);

    // Auto-Routing: Sync internal `autoRoutingEnabled` with the exposed edgeMode from config/topbar
    useEffect(() => {
        if (internalEdgeMode === 'native') {
            setAutoRoutingEnabled(false);
        } else {
            setAutoRoutingEnabled(true);
        }
    }, [internalEdgeMode, setAutoRoutingEnabled]);

    const {
        handleSmartLayout, handleSmartOptimize, handleEdgeClick, handleEdgeDoubleClick, handleGridRotate,
        handleClearCanvasCommand, handleExportMermaid, handleCopyAsMermaid,
        handleUseTemplate, handleOpacity,
    } = useFlowchartCanvasCommands({
        t, getNodes: getCurrentNodes, getEdges: getCurrentEdges, setNodes, setEdges, takeSnapshot,
        handleStrategyLayout, isReadonly, showGrid, gridVariant, setGridVariant, setShowGrid,
        reactFlowInstance, viewport, createFromTemplate, templates, selectedNodes, updateNodesBatch,
    });

    const { notifyReverseImportSuccess, scheduleReverseImportFit, selectExternalRightTab } =
        useFlowchartReverseImportFeedback(messageApi, t, handleFitView, setActiveRightTab);

    useFlowchartExternalEvents({
        snapshot: { getNodes: getCurrentNodes, getEdges: getCurrentEdges, takeSnapshot },
        reverseImport: {
            notifySuccess: notifyReverseImportSuccess,
            scheduleFitView: scheduleReverseImportFit,
        },
        focus: {
            reactFlowInstance,
            getNodes: getCurrentNodes,
            getEdges: getCurrentEdges,
            setSelectedNodes,
            setSelectedEdges,
        },
        command: {
            handleSmartLayout,
            handleStrategyLayout,
            handleExport: handleOpenExportModal,
            setAiChatVisible,
            setActiveRightTab: selectExternalRightTab,
            reactFlowInstance,
            activePlugin,
            setNodes,
            newNodeLabel: t('designer.flowchart.newNode'),
            confirmClearCanvas: handleClearCanvasCommand,
        },
        summary: {
            nodesRef,
            edgesRef,
            label: t('designer.flowchart.summaryLabel'),
            takeSnapshot,
            setNodes,
        },
    });

    const handleImport = useFlowchartImportHandler({
        t, messageApi, activePlugin, businessDataId: businessData?.id, diagramId: id,
        setNodes, setEdges, onBeforeCanvasReplace: handleBeforeUpdate, editingEnabled,
        fitView: handleFitView, importInFlightRef, onImportStarted: handleImportStarted,
        onImportFinished: handleImportFinished, getOperationScope,
    });

    const onSelectionChange = useCanonicalSelectionChange({
        nodesRef,
        edgesRef,
        setSelectedNodes,
        setSelectedEdges,
    });

    const onPaneDoubleClick = useFlowchartPaneDoubleClick({ openQuickAddMenu, reactFlowInstance });

    const handleOpenJsonEditor = useCallback(() => setJsonEditorVisible(true), [setJsonEditorVisible]);
    const setShowShortcuts = useCallback(() => setShortcutHelpVisible(true), [setShortcutHelpVisible]);

    // 4. System Sync Domain Controller
    const persistenceMetadata = useLayoutAutoSaveMetadata(multiPage, layoutSelection, restoreLayoutSelection);
    const { performanceMode, isInitialDiagramLoading, saveState } = useDesignerSystemSync({
        id, diagramIdForExport, nodes, edges, setNodes, setEdges, reactFlowInstance, isDragging, pluginId, messageApi,
        ...persistenceMetadata,
        routingSessionRuntime,
    });

    const { commandPaletteItems } = useDesignerCommands({
        reactFlowInstance,
        handleFitView, 
        handleGridRotate, 
        setAutoRoutingEnabled,
        canUndo, canRedo, undo, redo, handleSelectAll,
        handleCopyWithToast,
        handlePasteWithToast,
        handleCutWithToast,
        handleDeleteWithToast,
        handleDuplicateWithToast,
        handleGroupWithToast,
        handleUngroupWithToast,
        handleExport: handleOpenExportModal,
        handleExportMermaid, 
        handleCopyAsMermaid,
        handleImport: handleRequestImport,
        editingEnabled,
        handleOpenJsonEditor,
        handleStrategyLayout, 
        handleSmartLayout,
        setShowShortcuts, 
        pluginCtx: pluginCtx ?? undefined,
        activePlugin,
        onOpenPlugins: () => setPluginManagerVisible(true),
        isCommentMode,
        setIsCommentMode,
        // 隐藏功能暴露到命令面板
        handleMatchSize,
        handleReverseEdge,
        copyStyle,
        pasteStyle,
        hasCopiedStyle,
        saveAsTemplate,
        selectedNodes,
        selectedEdges,
        toggleGroupCollapse,
    });

    // commandPaletteVisible 现在直接使用 hook 内部 state，无需双向同步

    const {
        handleSearchReplaceMatch,
        handleSearchReplaceAll,
    } = useFlowchartSearchReplaceActions({
        setNodes,
        setEdges,
        getNodes: getCurrentNodes,
        getEdges: getCurrentEdges,
        takeSnapshot,
    });

    const handleReactFlowInit = useFlowchartReactFlowInit({ diagramId: id, viewportPersistenceKey, setReactFlowInstance });

    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        if (!reactFlowInstance) return;
        const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        updateLocalCursor(position);
    }, [reactFlowInstance, updateLocalCursor]);

    const onPaneMouseLeave = useCallback(() => {
        updateLocalCursor(null);
    }, [updateLocalCursor]);

    // 🚀 P3 性能优化：稳定的边回调对象，通过 Context 传?
    const edgeCallbacks = useMemo(() => ({
        onLabelOffsetChange: handleLabelOffsetChange,
        onLabelStyleChange: handleLabelStyleChange,
        onWaypointsChange: handleWaypointsChange,
        onLabelChange: handleEdgeLabelChange,
    }), [handleLabelOffsetChange, handleLabelStyleChange, handleWaypointsChange, handleEdgeLabelChange]);

    const {
        displayedSaveState,
        displayedSaveTarget,
        handleCloudSave: handleWrappedCloudSave,
        handleDirectSave: handleWrappedDirectSave,
    } = useTrackedFlowchartSaves({
        activePlugin,
        pluginCtx,
        nodesRef,
        edgesRef,
        localSaveState: saveState,
        onCloudSave,
        onDirectSave,
    });

    const viewModel = {
        ANNOTATION_COLORS, activeLayerId, activePlugin, activeRightTab, activeUsers, addAnnotation, aiChatVisible, annotationMode, annotations, autoRoutingEnabled,
        canRedo, canUndo, canvasBg, canvasSearchVisible, canvasSearchReplaceVisible, closeMenu, commandPaletteItems, commandPaletteVisible, connectPreview, copyStyle, createLayer,
        customDomainLayoutAvailable: customDomainLayoutCapability.available,
        currentZoom, deleteAnnotation, deleteLayer, deleteTemplate, diagramIdForExport, diffResult, dynamicEdgeTypes, dynamicNodeTypes, edges,
        edgesRef, enhancedOnConnect, enhancedOnConnectEnd, exportModalVisible, extraExportItems, fileInputRef,
        getPreviousState, getReactFlowSnapshot, gridColor, gridVariant, groupedTemplates, guides, handleAddFreehandStroke, handleAddMindMap, handleAddNode, handleAddStickyNote, handleAlign,
        handleBeforeUpdate, handleBringToFront, handleContextMenuAction, handleDeleteWithToast, handleDistribute, handleDuplicateWithToast, handleGroupWithToast, handleUngroupWithToast,
        handleEdgeClick, handleEdgeDoubleClick, handleFitView, handleFocusNode, handleGridRotate, handleImport, handleRequestImport, handleLock, handleOpacity,
        handleSmartLayout,
        handleOpenJsonEditor, handleOpenSettings, handlePaneClick, handlePresentationFocus, handleReactFlowInit, handleReadonlyChange, handleReconnect,
        handleReconnectEnd, handleReconnectStart, handleSearchReplaceAll, handleSearchReplaceMatch, handleSendToBack, handleSmartOptimize, handleStrategyLayout,
        handleToggleHighlightMainFlow, handleToggleShowOnlyMainFlow, handleTouchEnd, handleTouchStart, handleUseTemplate, handleWrappedCloudSave,
        handleWrappedDirectSave, hasCopiedStyle, highlightMainFlow, historyPanelVisible, id, isCommentMode, isConnecting, isContextToolbarHidden,
        isDirectSaveDisabled, isDragging, isDraggingNode, isDrawingMode, isInitialDiagramLoading, isLayoutBusy, isLayoutStable, isMarqueeActive, isMobile, isReadonly,
        isSidebarHidden, isSpacePressed, isValidConnection, isVersionHistoryOpen, isYjsSynced, collaborationStatus, jsonEditorInitialContent, jsonEditorVisible, jumpTo, laserEnabled, viewportPersistenceKey,
        lastDomainDirection, lastDomainStrategy, lastNodeLayout, layerSyncedNodes, layoutPresentationPreview, layers, leftDrawerOpen, leftDrawerWidth, messageContextHolder, routingSessionRuntime,
        mobilePropertyDrawerVisible, multiPage: { ...multiPage, ...commentAwarePageLifecycle }, nodes, nodesRef, notificationContextHolder, onAiTabIntercept, onCloudSave, onConnectStart, onDirectSave, onSaveAs,
        onDisplayRoutingFinalApplied, onDragOver, onDrop, onEdgeContextMenu, onEdgesChangeWithLock, onNodeContextMenu, onNodeDrag, onNodeDragStop, onNodesChangeWithLock, onSmartNodeDrag,
        onExportPermissionCheck, onOpenCollaboration, onOpenSettings, onOpenShareDialog, onOpenVersionHistory, onPaneContextMenu, onPaneDoubleClick, onPaneMouseLeave, onPaneMouseMove,
        onSelectionChange, onVersionHistoryClose, onboardingDismissed, pastEntries, pasteStyle, performanceMode, pluginCtx, pluginId, pluginManagerVisible,
        presentationActive, presentationSlides, preset, quickAddMenu, reactFlowInstance, reactFlowWrapper, redo, renameLayer, renameTemplate, renderAIChatPanel,
        renderAIConfigModal, renderShareDialog, renderThemeSelector, renderVersionHistoryPanel, reorderLayers, rightSidebarWidth, saveState: displayedSaveState, saveTarget: displayedSaveTarget, selectedEdges, selectedNodes, setActiveLayerId,
        setActiveRightTab, setAiChatVisible, setAutoRoutingEnabled, setCanvasSearchVisible, setCommandPaletteVisible: handleCommandPaletteVisibility, setDiffResult, setEdges,
        setCanvasSearchReplaceVisible, setExportModalVisible, setHighlightedNodeId, setHistoryPanelVisible, setIsCommentMode, setIsDrawingMode, setIsMarqueeActive, setJsonEditorVisible,
        setLayerColor, setLeftDrawerOpen, setLeftDrawerWidth, mobileRequestedPanel, setMobileRequestedPanel, setMobilePropertyDrawerVisible, setNodes, setOnboardingDismissed,
        setPluginManagerVisible, setPresentationActive, setPresentationSlides, setQuickConnectPreview, setRightSidebarWidth, setShortcutHelpVisible,
        setShowMinimap, setShowRuler, setShowShortcuts, setShowShortcutsModal, setSnapEnabled, shortcutHelpVisible, showAiCrown, showGrid, showMinimap,
        showOnlyMainFlow, showOverlay, showPerformanceDashboard, showRuler, showShortcuts, snapEnabled, t, takeSnapshot, templates, theme, toggleLock,
        activatePointer, toggleDrawingMode, toggleMarqueeMode,
        title, toggleGroupCollapse, toggleResolved, toggleVisibility, topActionArea, undo, updateAnnotation, updateEdgesBatch, updateNodesBatch, viewport, visibleEdges,
        wrappedOnNodeDragStart, yAwareness,
    };

    return {
        businessData,
        edgeCallbacks,
        updateNodesBatch,
        viewModel,
    };
};
