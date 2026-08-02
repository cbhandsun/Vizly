import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { message, notification } from 'antd';
import { ReactFlowInstance, addEdge, type Connection, type Edge } from '@xyflow/react';

import { useDesignerCanvasState } from './hooks/useDesignerCanvasState';
import { useDesignerInteractions } from './hooks/useDesignerInteractions';
import { useDesignerEventHandlers } from './hooks/useDesignerEventHandlers';
import { useDesignerSystemSync } from './hooks/useDesignerSystemSync';
import { useDiagramScopedSelection } from './hooks/useDiagramScopedSelection';
import { useCanonicalSelectionChange } from './hooks/useCanonicalSelectionChange';
import { computeFlowchartCollapsedStateHash } from './flowchartCollapsedState';
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
import { useContainerAutoLayout } from './hooks/useContainerAutoLayout';
// useAnnotations removed (GAP-02 Unified)
import { useMultiPage } from './hooks/useMultiPage';
import { dispatchDiagramControl } from '../shared/diagramControl';
import { useDesignerBatchUpdates } from './hooks/useDesignerBatchUpdates';
import { useAutoRouting } from './hooks/useAutoRouting';
import { useFlowchartExportControls } from './hooks/useFlowchartExportControls';
import { useDesignerCommands } from './hooks/useDesignerCommands';
// useLayerManagement already imported above
import {
    focusFlowchartNode,
} from './flowchartFocusEntity';
import {
    addFlowchartMindMapNode,
    addFlowchartStickyNote,
} from './flowchartDesignerCanvasActions';
import { createFlowchartImportHandler, type FlowchartImportEvent } from './flowchartImportHandler';
import { scheduleFlowchartInitialFit } from './flowchartInitialFit';
import { registerImportedFlowchartDiagram } from './flowchartImportRegistration';
import { useFlowchartPluginRuntime } from './hooks/useFlowchartPluginRuntime';
import { useFlowchartExternalEvents } from './hooks/useFlowchartExternalEvents';
import { useFlowchartShellState } from './hooks/useFlowchartShellState';
import { useFlowchartCanvasCommands } from './hooks/useFlowchartCanvasCommands';
import { useTrackedFlowchartSaves } from './hooks/useTrackedFlowchartSaves';
import { coerceCollaborationPresenceUsers } from './collaborationPresence';
import { shouldShowFlowchartMinimapByDefault } from './flowchartResponsiveChrome';
import { useFlowchartChromeCoordination } from './hooks/useFlowchartChromeCoordination';
import { useFlowchartHostActions } from './hooks/useFlowchartHostActions';
import { useMobileFlowchartViewportGuard, useScheduledFlowchartFit } from './hooks/useMobileFlowchartViewportGuard';
import { useFlowchartSearchReplaceActions } from './hooks/useFlowchartSearchReplaceActions';

export const useFlowchartDesignerController = ({
    id,
    title,
    businessData,
    extraExportItems,
    onExportPermissionCheck,
    isYjsSynced,
    activeUsers: rawActiveUsers = [],
    yAwareness,
    onCloudSave,
    onDirectSave,
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
        takeSnapshot, notifyHistoryChanged, undo, redo, canUndo, canRedo,
        pastEntries, getPreviousState, jumpTo, switchScope: switchHistoryScope,
        removeScope: removeHistoryScope,
    } = diagramHistory;
    const {
        selectedNodes,
        selectedEdges,
        setSelectedNodes,
        setSelectedEdges,
    } = useDiagramScopedSelection(id, nodes, edges);
    const [isContextToolbarHidden] = useState(false);
    const handleBeforeUpdate = useCallback(() => {
        takeSnapshot(nodesRef.current, edgesRef.current);
    }, [edgesRef, nodesRef, takeSnapshot]);
    const handleFocusNode = useCallback((nodeId: string) => {
        focusFlowchartNode({
            reactFlowInstance,
            nodes: nodesRef.current,
            nodeId,
            setSelectedNodes,
            duration: 800,
            zoom: 1.2,
        });
    }, [nodesRef, reactFlowInstance, setSelectedNodes]);

    const handlePresentationFocus = useCallback((ids: string[]) => {
        if (ids && ids.length > 0) handleFocusNode(ids[0]);
    }, [handleFocusNode]);

    const {
        layers, activeLayerId, setActiveLayerId, createLayer, deleteLayer, toggleVisibility, toggleLock, renameLayer, reorderLayers, getLayer, setLayerColor
    } = useLayerManagement();

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
        presentationActive, setPresentationActive, laserEnabled, diffResult, setDiffResult, canvasSearchVisible, setCanvasSearchVisible,
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

    const [messageApi, messageContextHolder] = message.useMessage();
    const [notificationApi, notificationContextHolder] = notification.useNotification();
    const getCurrentNodes = useCallback(() => nodesRef.current, [nodesRef]);
    const getCurrentEdges = useCallback(() => edgesRef.current, [edgesRef]);
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
    const { nodesWithCollapseState, edgesWithCollapseState, toggleGroupCollapse } = useCollapsibleGroups({ nodes, edges, setNodes, takeSnapshot });

    // 2. Interactions Domain Controller
    const interactionsParams = useDesignerInteractions({
        nodes, edges, setNodes, setEdges,
        selectedNodes, setSelectedNodes,
        takeSnapshot, notifyHistoryChanged, reactFlowInstance,
        isDragging, setIsDragging,
        activePlugin, pluginCtx,
        onNodesChange, onEdgesChange,
        virtualizedNodes: nodesWithCollapseState, edgesWithCollapseState: edgesWithCollapseState,
         onConnect: (params: Connection) => {
             takeSnapshot(nodesRef.current, edgesRef.current);
             
             const isRelationship = (params.sourceHandle?.includes('relationship') || params.targetHandle?.includes('relationship'));
             
             if (isRelationship) {
                 const id = `rel-${Date.now()}`;
                  const newEdge: Edge = {
                     ...params,
                     id,
                     type: 'relationshipEdge',
                     data: { label: t('designer.flowchart.relationshipEdgeLabel') },
                     animated: true
                 };
                 setEdges(eds => addEdge(newEdge, eds));
                 return;
             }
             
             setEdges(eds => addEdge(params, eds));
         },
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
        isDraggingNode
    } = interactionsParams;
    
    // 2.5 Linter Layer (Phase 8 integration)
    useTopologyLinter(nodesWithGhost, finalEdgesWithGhost, { enabled: !isReadonly });
    






    // 协作层 diagramId：优先使用 id prop，回退到导出 ID，避免多画布协作时 ID 冲突
    const diagramId = id || diagramIdForExport || 'default';
    const { updateLocalCursor } = useDiagramCollaboration(diagramId, !isReadonly);
    const isCommentMode = useDiagramStore(state => state.isCommentMode);
    const setIsCommentMode = useDiagramStore(state => state.setIsCommentMode);
    const _addComment = useDiagramStore(state => state.addComment);

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
        nodes, edges, setNodes, setEdges,
        selectedNodes, selectedEdges,
        takeSnapshot, undo, redo,
        reactFlowInstance, reactFlowWrapper,
        isDragging, editingEnabled: !isReadonly && !presentationActive, pluginCtx, activePlugin,
        messageApi, notificationApi,
        layers, setActiveLayerId, toggleVisibility,
        canAlign, canDistribute, handleAlign, handleDistribute,
        handleGroup, handleUngroup,
        nodesRef, edgesRef,
        setCommandPaletteVisible: handleCommandPaletteVisibility, setShortcutHelpVisible, setCanvasSearchVisible,
        copyStyle, pasteStyle, hasCopiedStyle, saveAsTemplate,
        toggleGroupCollapse
    });
    const handlePaneClick = useCallback((_event?: React.MouseEvent) => {
        // 先关闭可能存在的 Context Menu
        contextMenuPaneClick();

        if (isCommentMode) {
            // [GAP-02] 由 AnnotationLayer 的 handleCanvasClick 负责展示编辑器并添加评论
            // 这里不再直接 addComment，以避免创建空评论。
            return;
        }
    }, [isCommentMode, contextMenuPaneClick]);

    useContainerAutoLayout();

    // Features
    const multiPage = useMultiPage(
        () => nodesRef.current,
        () => edgesRef.current,
        setNodes,
        setEdges,
        {
            switchScope: switchHistoryScope,
            removeScope: removeHistoryScope,
        },
    );

    const { autoRoutingEnabled, setAutoRoutingEnabled, isLayoutStable, handleStrategyLayout, lastDomainStrategy, lastDomainDirection, lastNodeLayout } = useAutoRouting({
        setNodes,
        setEdges,
        nodesRef,
        edgesRef,
        takeSnapshot,
        reactFlowInstance,
        diagramId: diagramIdForExport,
        loadLayoutPresetMap,
    });
    
    // 监听折叠状态变化，自动触发排版微调，让周围节点紧凑排列
    const collapsedHash = useMemo(() => {
        return computeFlowchartCollapsedStateHash(nodes);
    }, [nodes]);

    const initialCollapsedRef = useRef(collapsedHash);
    const hasObservedInitialCollapseStateRef = useRef(false);

    useEffect(() => {
        if (!hasObservedInitialCollapseStateRef.current) {
            initialCollapsedRef.current = collapsedHash;
            if (nodes.length > 0) {
                hasObservedInitialCollapseStateRef.current = true;
            }
            return;
        }

        if (initialCollapsedRef.current !== collapsedHash) {
            initialCollapsedRef.current = collapsedHash;
            // 触发自动布局
            handleStrategyLayout(lastDomainStrategy, lastNodeLayout, lastDomainDirection);
        }
    }, [collapsedHash, nodes.length, handleStrategyLayout, lastDomainStrategy, lastNodeLayout, lastDomainDirection]);
    
    // Auto-Routing: Sync internal `autoRoutingEnabled` with the exposed edgeMode from config/topbar
    useEffect(() => {
        if (internalEdgeMode === 'native') {
            setAutoRoutingEnabled(false);
        } else {
            setAutoRoutingEnabled(true);
        }
    }, [internalEdgeMode, setAutoRoutingEnabled]);

    const {
        handleSmartLayout, handleSmartOptimize, handleEdgeDoubleClick, handleGridRotate,
        handleClearCanvasCommand, handleExportMermaid, handleCopyAsMermaid,
        handleUseTemplate, handleOpacity,
    } = useFlowchartCanvasCommands({
        t, getNodes: getCurrentNodes, getEdges: getCurrentEdges, setNodes, setEdges, takeSnapshot,
        handleStrategyLayout, isReadonly, showGrid, gridVariant, setGridVariant, setShowGrid,
        reactFlowInstance, viewport, createFromTemplate, templates, selectedNodes, updateNodesBatch,
    });

    const notifyReverseImportSuccess = useCallback((filename: string) => {
        messageApi.success(t('designer.flowchart.import.reverseSuccess', { filename }));
    }, [messageApi, t]);
    const scheduleReverseImportFit = useScheduledFlowchartFit(handleFitView, 300);
    const selectExternalRightTab = useCallback((tab: string) => {
        setActiveRightTab(tab === 'ai' ? 'ai' : 'property');
    }, [setActiveRightTab]);

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

    const handleImport = useCallback((event: FlowchartImportEvent) => createFlowchartImportHandler({
        t,
        messageApi,
        activePlugin,
        businessDataId: businessData?.id,
        diagramId: id,
        setNodes,
        setEdges,
        onBeforeCanvasReplace: handleBeforeUpdate,
        fitView: handleFitView,
        registerStandardReload: registerImportedFlowchartDiagram,
    })(event), [t, messageApi, activePlugin, businessData?.id, id, setNodes, setEdges, handleBeforeUpdate, handleFitView]);

    const onSelectionChange = useCanonicalSelectionChange({
        nodesRef,
        edgesRef,
        setSelectedNodes,
        setSelectedEdges,
    });

    const onPaneDoubleClick = useCallback((event: React.MouseEvent | MouseEvent) => {
        if (!reactFlowInstance) return;
        const flowPos = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        openQuickAddMenu(flowPos.x, flowPos.y);
    }, [openQuickAddMenu, reactFlowInstance]);

    const handleOpenJsonEditor = useCallback(() => setJsonEditorVisible(true), [setJsonEditorVisible]);
    const setShowShortcuts = useCallback(() => setShortcutHelpVisible(true), [setShortcutHelpVisible]);

    // ─── Modular migration stubs removed ───



    // 4. System Sync Domain Controller
    const { performanceMode, isInitialDiagramLoading, saveState } = useDesignerSystemSync({
        id, diagramIdForExport, nodes, edges, setNodes, setEdges, reactFlowInstance, isDragging, pluginId, messageApi,
        getAutoSaveMetadata: multiPage.getPersistedMetadata,
        restoreAutoSaveMetadata: multiPage.restorePersistedMetadata,
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
        fileInputRef, 
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
        handleSearchReplaceNode,
        handleSearchReplaceAll,
        handleBeforeReplace,
    } = useFlowchartSearchReplaceActions({
        setNodes,
        getNodes: getCurrentNodes,
        getEdges: getCurrentEdges,
        takeSnapshot,
    });

    // 🚀 P2 性能优化：稳定的 onInit 回调，避?CanvasShell memo 失效
    const handleReactFlowInit = useCallback((instance: ReactFlowInstance) => {
        setReactFlowInstance(instance);
        scheduleFlowchartInitialFit({
            reactFlowInstance: instance,
            dispatchFit: () => dispatchDiagramControl('fit', id),
        });
    }, [id, setReactFlowInstance]);

    const handleAddStickyNote = useCallback(() => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        addFlowchartStickyNote({
            layer: activeLayerId,
            setNodes,
        });
    }, [activeLayerId, edgesRef, nodesRef, reactFlowInstance, setNodes, takeSnapshot]);

    const handleAddMindMap = useCallback(() => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        addFlowchartMindMapNode({
            layer: activeLayerId,
            label: t('designer.flowchart.mindMapCenter'),
            setNodes,
        });
    }, [activeLayerId, edgesRef, nodesRef, reactFlowInstance, setNodes, t, takeSnapshot]);

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
        canRedo, canUndo, canvasBg, canvasSearchVisible, closeMenu, commandPaletteItems, commandPaletteVisible, connectPreview, copyStyle, createLayer,
        currentZoom, deleteAnnotation, deleteLayer, deleteTemplate, diagramIdForExport, diffResult, dynamicEdgeTypes, dynamicNodeTypes, edges,
        edgesRef, enhancedOnConnect, enhancedOnConnectEnd, exportModalVisible, extraExportItems, fileInputRef,
        getPreviousState, getReactFlowSnapshot, gridColor, gridVariant, groupedTemplates, guides, handleAddMindMap, handleAddNode, handleAddStickyNote, handleAlign,
        handleBeforeReplace, handleBeforeUpdate, handleBringToFront, handleContextMenuAction, handleDeleteWithToast, handleDistribute, handleDuplicateWithToast,
        handleEdgeDoubleClick, handleFitView, handleFocusNode, handleGridRotate, handleImport, handleLock, handleOpacity,
        handleOpenJsonEditor, handleOpenSettings, handlePaneClick, handlePresentationFocus, handleReactFlowInit, handleReadonlyChange, handleReconnect,
        handleReconnectEnd, handleReconnectStart, handleSearchReplaceAll, handleSearchReplaceNode, handleSendToBack, handleSmartOptimize, handleStrategyLayout,
        handleToggleHighlightMainFlow, handleToggleShowOnlyMainFlow, handleTouchEnd, handleTouchStart, handleUseTemplate, handleWrappedCloudSave,
        handleWrappedDirectSave, hasCopiedStyle, highlightMainFlow, historyPanelVisible, id, isCommentMode, isConnecting, isContextToolbarHidden,
        isDirectSaveDisabled, isDragging, isDraggingNode, isDrawingMode, isInitialDiagramLoading, isLayoutStable, isMarqueeActive, isMobile, isReadonly,
        isSidebarHidden, isSpacePressed, isValidConnection, isVersionHistoryOpen, isYjsSynced, jsonEditorInitialContent, jsonEditorVisible, jumpTo, laserEnabled,
        lastDomainDirection, lastDomainStrategy, lastNodeLayout, layerSyncedNodes, layers, leftDrawerOpen, leftDrawerWidth, messageContextHolder,
        mobilePropertyDrawerVisible, multiPage, nodes, nodesRef, notificationContextHolder, onAiTabIntercept, onCloudSave, onConnectStart, onDirectSave,
        onDragOver, onDrop, onEdgeContextMenu, onEdgesChangeWithLock, onNodeContextMenu, onNodeDrag, onNodeDragStop, onNodesChangeWithLock, onSmartNodeDrag,
        onExportPermissionCheck, onOpenSettings, onOpenShareDialog, onOpenVersionHistory, onPaneContextMenu, onPaneDoubleClick, onPaneMouseLeave, onPaneMouseMove,
        onSelectionChange, onVersionHistoryClose, onboardingDismissed, pastEntries, pasteStyle, performanceMode, pluginCtx, pluginId, pluginManagerVisible,
        presentationActive, presentationSlides, preset, quickAddMenu, reactFlowInstance, reactFlowWrapper, redo, renameLayer, renameTemplate, renderAIChatPanel,
        renderAIConfigModal, renderShareDialog, renderThemeSelector, renderVersionHistoryPanel, reorderLayers, rightSidebarWidth, saveState: displayedSaveState, saveTarget: displayedSaveTarget, selectedEdges, selectedNodes, setActiveLayerId,
        setActiveRightTab, setAiChatVisible, setAutoRoutingEnabled, setCanvasSearchVisible, setCommandPaletteVisible: handleCommandPaletteVisibility, setDiffResult, setEdges,
        setExportModalVisible, setHighlightedNodeId, setHistoryPanelVisible, setIsCommentMode, setIsDrawingMode, setIsMarqueeActive, setJsonEditorVisible,
        setLayerColor, setLeftDrawerOpen, setLeftDrawerWidth, mobileRequestedPanel, setMobileRequestedPanel, setMobilePropertyDrawerVisible, setNodes, setOnboardingDismissed,
        setPluginManagerVisible, setPresentationActive, setPresentationSlides, setQuickConnectPreview, setRightSidebarWidth, setShortcutHelpVisible,
        setShowMinimap, setShowRuler, setShowShortcuts, setShowShortcutsModal, setSnapEnabled, shortcutHelpVisible, showAiCrown, showGrid, showMinimap,
        showOnlyMainFlow, showOverlay, showPerformanceDashboard, showRuler, showShortcuts, snapEnabled, t, takeSnapshot, templates, theme, toggleLock,
        title, toggleResolved, toggleVisibility, topActionArea, undo, updateAnnotation, updateEdgesBatch, updateNodesBatch, viewport, visibleEdges,
        wrappedOnNodeDragStart, yAwareness,
    };

    return {
        businessData,
        edgeCallbacks,
        updateNodesBatch,
        viewModel,
    };
};
