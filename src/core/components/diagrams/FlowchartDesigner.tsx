import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { message, notification } from 'antd';
import { Node, Edge, ReactFlowInstance, addEdge, type Connection } from '@xyflow/react';

import { useDesignerCanvasState } from './hooks/useDesignerCanvasState';
import { useDesignerInteractions } from './hooks/useDesignerInteractions';
import { useDesignerEventHandlers } from './hooks/useDesignerEventHandlers';
import { useDesignerSystemSync } from './hooks/useDesignerSystemSync';
import { computeFlowchartCollapsedStateHash } from './flowchartCollapsedState';
import { DiagramComponentProps } from '../../types/diagram-components';
import { useTranslation } from 'react-i18next';
import { useComponentPerformance, useInteractionPerformance } from '../../hooks/usePerformanceMonitor';
import { EdgeUpdateProvider } from './EdgeUpdateContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { useDiagramCollaboration } from '../../hooks/useDiagramCollaboration';
import { useTopologyLinter } from '../../hooks/useTopologyLinter';
import { useDiagramStore, useDiagramStore as useDiagramStoreStatic } from '../../store/useDiagramStore';
import './FlowchartDesigner.css';
import './ModernControls.css';
import './FlowchartVisualPolish.css';

import { useMobileInteractions } from '../../hooks/useMobileInteractions';
import { useCollapsibleGroups } from './hooks/useCollapsibleGroups';
import { useLayerManagement } from './hooks/useLayerManagement';
import { useContainerAutoLayout } from './hooks/useContainerAutoLayout';
// useAnnotations removed (GAP-02 Unified)
import { useMultiPage } from './hooks/useMultiPage';
import { NodeUpdateProvider } from './NodeUpdateContext';
import { dispatchDiagramControl } from '../shared/diagramControl';
import { useDesignerBatchUpdates } from './hooks/useDesignerBatchUpdates';
import { useAutoRouting } from './hooks/useAutoRouting';
import { useFlowchartExportControls } from './hooks/useFlowchartExportControls';
import { useDesignerCommands } from './hooks/useDesignerCommands';
// useLayerManagement already imported above
import { appMessage } from '@/core/utils/antdStaticBridge';
import {
    focusFlowchartNode,
} from './flowchartFocusEntity';
import {
    addFlowchartMindMapNode,
    addFlowchartStickyNote,
} from './flowchartDesignerCanvasActions';
import { createFlowchartImportHandler } from './flowchartImportHandler';
import { runFlowchartSavePipeline } from './flowchartSavePipeline';
import {
    replaceFlowchartNodeLabel,
    replaceFlowchartNodeLabels,
} from './flowchartSearchReplace';
import { scheduleFlowchartInitialFit } from './flowchartInitialFit';
import { FlowchartDesignerView } from './FlowchartDesignerView';
import { getApplicationDiagramRuntime } from '../../ports/applicationDiagramRuntime';
import { useFlowchartPluginRuntime } from './hooks/useFlowchartPluginRuntime';
import { useFlowchartExternalEvents } from './hooks/useFlowchartExternalEvents';
import { useFlowchartShellState } from './hooks/useFlowchartShellState';
import { useFlowchartCanvasCommands } from './hooks/useFlowchartCanvasCommands';

const FlowchartDesigner: React.FC<DiagramComponentProps> = ({
    id,
    businessData,
    extraExportItems,
    onExportPermissionCheck,
    isYjsSynced,
    activeUsers = [],
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
    pluginId = 'flowchart',
}) => {
    const { t } = useTranslation();
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

    const handleFitView = useCallback(() => {
        if (reactFlowInstance) {
            reactFlowInstance.fitView({ duration: 800 });
        }
    }, [reactFlowInstance]);

    const handleOpenSettings = useCallback(() => {
        if (onOpenSettings) {
            onOpenSettings();
        } else {
            appMessage.info(t('designer.flowchart.settingsNotAvailable'));
        }
    }, [onOpenSettings, t]);

    // ?图片导出支持 (PNG/SVG/PDF/GIF)
    const diagramIdForExport = id || 'flowchart-designer';
    const { exportToPNG, exportToSVG, exportToPDF, exportToGIF, getReactFlowSnapshot } = useFlowchartExportControls(
        diagramIdForExport,
        reactFlowInstance,
        onExportPermissionCheck,
    );

    // ?性能监控
    useComponentPerformance('FlowchartDesigner');
    useInteractionPerformance();

    const {
        takeSnapshot, notifyHistoryChanged, undo, redo, canUndo, canRedo,
        pastEntries, getPreviousState, jumpTo,
    } = diagramHistory;
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
    const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
    const [isContextToolbarHidden] = useState(false);
    const handleBeforeUpdate = useCallback(() => {}, []);
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
        setMobileAddDrawerVisible, mobilePropertyDrawerVisible, setMobilePropertyDrawerVisible,
        exportModalVisible, setExportModalVisible, pluginManagerVisible, setPluginManagerVisible,
        aiChatVisible, setAiChatVisible, activeRightTab, setActiveRightTab, commandPaletteVisible, setCommandPaletteVisible,
        shortcutHelpVisible, setShortcutHelpVisible, showShortcuts, setShowShortcutsModal, jsonEditorInitialContent,
        saveState, showPerformanceDashboard, presentationSlides, setPresentationSlides, setHighlightedNodeId,
        onboardingDismissed, setOnboardingDismissed, showGrid, setShowGrid, showMinimap, setShowMinimap,
        snapEnabled, setSnapEnabled, showRuler, setShowRuler, gridVariant, setGridVariant,
    } = useFlowchartShellState(theme?.diagram?.canvas?.grid);

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
    const handleMobilePluginNodeAdded = useCallback(() => {
        setLeftDrawerOpen(false);
        setMobileAddDrawerVisible(false);
    }, [setLeftDrawerOpen, setMobileAddDrawerVisible]);
    const notifyPluginNodeAdded = useCallback((type: string) => {
        appMessage.success(t('designer.flowchart.nodeAdded', { type }));
    }, [t]);
    const getCurrentNodes = useCallback(() => nodesRef.current, [nodesRef]);
    const getCurrentEdges = useCallback(() => edgesRef.current, [edgesRef]);
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
        guides,
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
        isDragging, pluginCtx, activePlugin,
        messageApi, notificationApi,
        layers, setActiveLayerId, toggleVisibility,
        canAlign, canDistribute, handleAlign, handleDistribute,
        handleGroup, handleUngroup,
        nodesRef, edgesRef,
        setCommandPaletteVisible, setShortcutHelpVisible, setCanvasSearchVisible,
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
        setEdges
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
        handleExport, handleClearCanvasCommand, handleExportMermaid, handleCopyAsMermaid,
        handleUseTemplate, handleOpacity,
    } = useFlowchartCanvasCommands({
        t, getNodes: getCurrentNodes, getEdges: getCurrentEdges, setNodes, setEdges, takeSnapshot,
        handleStrategyLayout, isReadonly, gridVariant, setGridVariant, setShowGrid,
        setJsonEditorVisible, reactFlowInstance, viewport, createFromTemplate, selectedNodes, updateNodesBatch,
    });

    const notifyReverseImportSuccess = useCallback((filename: string) => {
        messageApi.success(t('designer.flowchart.import.reverseSuccess', { filename }));
    }, [messageApi, t]);
    const scheduleReverseImportFit = useCallback(() => {
        window.setTimeout(handleFitView, 300);
    }, [handleFitView]);
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
            handleExport,
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

    const handleImport = useMemo(() => createFlowchartImportHandler({
        t,
        messageApi,
        activePlugin,
        businessDataId: businessData?.id,
        diagramId: id,
        setNodes,
        setEdges,
        fitView: handleFitView,
        registerStandardReload: async ({ normalized, currentId: reloadId, title }) => {
            await getApplicationDiagramRuntime().registerDiagram(normalized, {
                id: reloadId,
                title,
            }, true, {
                id: reloadId,
                metadata: normalized.metadata,
            });
        },
    }), [t, messageApi, activePlugin, businessData?.id, id, setNodes, setEdges, handleFitView]);

    const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
        setSelectedNodes(selNodes);
        setSelectedEdges(selEdges);
        // 同步状态给 zustand store（静态 import，避免异步滞后导致 HoverToolbarsOverlay 读到旧选区）
        useDiagramStoreStatic.getState().setSelectedNodes(selNodes);
        useDiagramStoreStatic.getState().setSelectedEdges(selEdges);
    }, [setSelectedNodes, setSelectedEdges]);

    const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
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
    const { performanceMode, isInitialDiagramLoading } = useDesignerSystemSync({
        id, diagramIdForExport, nodes, edges, setNodes, setEdges, reactFlowInstance, isDragging, pluginId, messageApi
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
        handleExport: () => setExportModalVisible(true),
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

    // Phase 2：查找替换回调 — 通过 ref 读取最新数据，支持撤销
    const handleSearchReplaceNode = useCallback((nodeId: string, newLabel: string) => {
        setNodes((nds) => replaceFlowchartNodeLabel(nds, nodeId, newLabel));
    }, [setNodes]);

    const handleSearchReplaceAll = useCallback((matchIds: string[], newLabel: string) => {
        setNodes((nds) => replaceFlowchartNodeLabels(nds, matchIds, newLabel));
    }, [setNodes]);

    const handleBeforeReplace = useCallback(() => {
        takeSnapshot(nodesRef.current, edgesRef.current);
    }, [takeSnapshot, nodesRef, edgesRef]);

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

    const handleWrappedCloudSave = useCallback(async () => {
        await runFlowchartSavePipeline({
            activePlugin,
            pluginCtx,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            saveAction: onCloudSave,
        });
    }, [activePlugin, edgesRef, nodesRef, onCloudSave, pluginCtx]);

    const handleWrappedDirectSave = useCallback(async () => {
        await runFlowchartSavePipeline({
            activePlugin,
            pluginCtx,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            saveAction: onDirectSave,
        });
    }, [activePlugin, edgesRef, nodesRef, onDirectSave, pluginCtx]);

    const viewModel = {
        ANNOTATION_COLORS, activeLayerId, activePlugin, activeRightTab, activeUsers, addAnnotation, aiChatVisible, annotationMode, annotations, autoRoutingEnabled,
        canRedo, canUndo, canvasBg, canvasSearchVisible, closeMenu, commandPaletteItems, commandPaletteVisible, connectPreview, copyStyle, createLayer,
        currentZoom, deleteAnnotation, deleteLayer, deleteTemplate, diagramIdForExport, diffResult, dynamicEdgeTypes, dynamicNodeTypes, edges,
        edgesRef, enhancedOnConnect, enhancedOnConnectEnd, exportModalVisible, exportToGIF, exportToPDF, exportToPNG, exportToSVG, extraExportItems, fileInputRef,
        getPreviousState, getReactFlowSnapshot, gridColor, gridVariant, groupedTemplates, guides, handleAddMindMap, handleAddNode, handleAddStickyNote, handleAlign,
        handleBeforeReplace, handleBeforeUpdate, handleBringToFront, handleContextMenuAction, handleDeleteWithToast, handleDistribute, handleDuplicateWithToast,
        handleEdgeDoubleClick, handleExport, handleExportMermaid, handleFitView, handleFocusNode, handleGridRotate, handleImport, handleLock, handleOpacity,
        handleOpenJsonEditor, handleOpenSettings, handlePaneClick, handlePresentationFocus, handleReactFlowInit, handleReadonlyChange, handleReconnect,
        handleReconnectEnd, handleReconnectStart, handleSearchReplaceAll, handleSearchReplaceNode, handleSendToBack, handleSmartOptimize, handleStrategyLayout,
        handleToggleHighlightMainFlow, handleToggleShowOnlyMainFlow, handleTouchEnd, handleTouchStart, handleUseTemplate, handleWrappedCloudSave,
        handleWrappedDirectSave, hasCopiedStyle, highlightMainFlow, historyPanelVisible, id, isCommentMode, isConnecting, isContextToolbarHidden,
        isDirectSaveDisabled, isDragging, isDraggingNode, isDrawingMode, isInitialDiagramLoading, isLayoutStable, isMarqueeActive, isMobile, isReadonly,
        isSidebarHidden, isSpacePressed, isValidConnection, isVersionHistoryOpen, isYjsSynced, jsonEditorInitialContent, jsonEditorVisible, jumpTo, laserEnabled,
        lastDomainDirection, lastDomainStrategy, lastNodeLayout, layerSyncedNodes, layers, leftDrawerOpen, leftDrawerWidth, messageContextHolder,
        mobilePropertyDrawerVisible, multiPage, nodes, nodesRef, notificationContextHolder, onAiTabIntercept, onCloudSave, onConnectStart, onDirectSave,
        onDragOver, onDrop, onEdgeContextMenu, onEdgesChangeWithLock, onNodeContextMenu, onNodeDrag, onNodeDragStop, onNodesChangeWithLock,
        onOpenSettings, onOpenShareDialog, onPaneContextMenu, onPaneDoubleClick, onPaneMouseLeave, onPaneMouseMove,
        onSelectionChange, onVersionHistoryClose, onboardingDismissed, pastEntries, pasteStyle, performanceMode, pluginCtx, pluginId, pluginManagerVisible,
        presentationActive, presentationSlides, preset, quickAddMenu, reactFlowInstance, reactFlowWrapper, redo, renameLayer, renameTemplate, renderAIChatPanel,
        renderAIConfigModal, renderShareDialog, renderThemeSelector, renderVersionHistoryPanel, reorderLayers, rightSidebarWidth, saveState, selectedEdges, selectedNodes, setActiveLayerId,
        setActiveRightTab, setAiChatVisible, setAutoRoutingEnabled, setCanvasSearchVisible, setCommandPaletteVisible, setDiffResult, setEdges,
        setExportModalVisible, setHighlightedNodeId, setHistoryPanelVisible, setIsCommentMode, setIsDrawingMode, setIsMarqueeActive, setJsonEditorVisible,
        setLayerColor, setLeftDrawerOpen, setLeftDrawerWidth, setMobileAddDrawerVisible, setMobilePropertyDrawerVisible, setNodes, setOnboardingDismissed,
        setPluginManagerVisible, setPresentationActive, setPresentationSlides, setQuickConnectPreview, setRightSidebarWidth, setShortcutHelpVisible,
        setShowMinimap, setShowRuler, setShowShortcuts, setShowShortcutsModal, setSnapEnabled, shortcutHelpVisible, showAiCrown, showGrid, showMinimap,
        showOnlyMainFlow, showOverlay, showPerformanceDashboard, showRuler, showShortcuts, snapEnabled, t, takeSnapshot, templates, theme, toggleLock,
        toggleResolved, toggleVisibility, topActionArea, undo, updateAnnotation, updateEdgesBatch, updateNodesBatch, viewport, visibleEdges,
        wrappedOnNodeDragStart, yAwareness,
    };

    return (
        <EdgeUpdateProvider callbacks={edgeCallbacks}>
            <NodeUpdateProvider updateNodesBatch={updateNodesBatch} businessData={businessData}>
                <FlowchartDesignerView model={viewModel} />
            </NodeUpdateProvider>
        </EdgeUpdateProvider>
    );
};

export default FlowchartDesigner;
