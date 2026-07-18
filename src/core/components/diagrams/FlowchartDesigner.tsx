import { useDiagramStylePreset_v2 } from "../../hooks/useDiagramStylePreset_v2";
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { message, notification } from 'antd';
import { Node, Edge, BackgroundVariant, ReactFlowInstance, NodeTypes, addEdge, type Connection } from '@xyflow/react';

import { useDesignerCanvasState } from './hooks/useDesignerCanvasState';
import { useDesignerInteractions } from './hooks/useDesignerInteractions';
import { useDesignerEventHandlers } from './hooks/useDesignerEventHandlers';
import { useDesignerSystemSync } from './hooks/useDesignerSystemSync';
import { DiagramComponentProps } from '../../types/diagram-components';
import CustomNode from '../custom-nodes/CustomNode';
import TitleGroupNode from '../custom-nodes/TitleGroupNode';
import SubGroupNode from '../custom-nodes/SubGroupNode';
import FlowchartNode from '../custom-nodes/FlowchartNode';
import IconNode from '../custom-nodes/IconNode';
import SwimLaneNode from '../custom-nodes/SwimLaneNode';
import StickyNoteNode from '../custom-nodes/StickyNoteNode';
import MindMapNode from '../custom-nodes/MindMapNode';
import MindMapBoundaryNode from '../custom-nodes/MindMapBoundaryNode';
import MindMapEdge from '../edges/MindMapEdge';
import CommentNode from '../custom-nodes/CommentNode';
import { RelationshipEdge } from '../custom-edges/RelationshipEdge';
import { useTranslation } from 'react-i18next';
import { PluginRegistry } from '../../services/PluginRegistry';
import { PluginContext } from '../../types/plugin';
import { useComponentPerformance, useInteractionPerformance } from '../../hooks/usePerformanceMonitor';
import { EdgeUpdateProvider } from './EdgeUpdateContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { useDiagramCollaboration } from '../../hooks/useDiagramCollaboration';
import { useTopologyLinter } from '../../hooks/useTopologyLinter';
import { downloadFile } from '../../utils/downloadUtils';
import { DiagramIntelligenceService } from '../../services/DiagramIntelligenceService';
import { useDiagramStore, useDiagramStore as useDiagramStoreStatic } from '../../store/useDiagramStore';
import './FlowchartDesigner.css';
import './ModernControls.css';

import { useMobileInteractions } from '../../hooks/useMobileInteractions';
import { useCollapsibleGroups } from './hooks/useCollapsibleGroups';
import { useLayerManagement } from './hooks/useLayerManagement';
import { useContainerAutoLayout } from './hooks/useContainerAutoLayout';
// useAnnotations removed (GAP-02 Unified)
import { useMultiPage } from './hooks/useMultiPage';
import { useTheme } from '../../themes/useCoreTheme';
import { DiffResult } from '../../utils/diagramDiff';
import { NodeUpdateProvider } from './NodeUpdateContext';
import { dispatchDiagramControl } from '../shared/diagramControl';
import { useDesignerBatchUpdates } from './hooks/useDesignerBatchUpdates';
import { useAutoRouting } from './hooks/useAutoRouting';
import { useFlowchartExportControls } from './hooks/useFlowchartExportControls';
import { useDesignerCommands } from './hooks/useDesignerCommands';
import ArrowTimelineNode from './nodes/ArrowTimelineNode';
import ERDatabaseNode from '../custom-nodes/ERDatabaseNode';
// useLayerManagement already imported above
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { logDiagramGlobalThemeSyncFailure } from './diagramThemeLogging';
import { readFlowchartOnboardingDismissed } from './flowchartOnboardingStorage';
import {
    createFlowchartFocusEntityEventHandler,
    focusFlowchartNode,
} from './flowchartFocusEntity';
import {
    createFlowchartDesignerCommandEventHandler,
    createFlowchartSummaryEventHandler,
} from './flowchartDesignerEventHandlers';
import {
    buildFlowchartClearCanvasConfirm,
    clearFlowchartCanvas,
} from './flowchartClearCanvas';
import {
    createFlowchartReverseImportSuccessHandler,
    createFlowchartSnapshotEventHandler,
} from './flowchartExternalEvents';
import {
    addFlowchartMindMapNode,
    addFlowchartStickyNote,
    applyFlowchartTemplate,
    copyFlowchartAsMermaid,
    exportFlowchartAsMermaid,
} from './flowchartDesignerCanvasActions';
import { createFlowchartImportHandler } from './flowchartImportHandler';
import { buildFlowchartEdgeInsertionPlan } from './flowchartEdgeInsertion';
import { runFlowchartSavePipeline } from './flowchartSavePipeline';
import {
    replaceFlowchartNodeLabel,
    replaceFlowchartNodeLabels,
} from './flowchartSearchReplace';
import { scheduleFlowchartInitialFit } from './flowchartInitialFit';
import { runFlowchartSmartOptimize } from './flowchartSmartOptimize';
import { FlowchartDesignerView } from './FlowchartDesignerView';
import { getApplicationDiagramRuntime } from '../../ports/applicationDiagramRuntime';

// useMindMapOrchestrator decoupled

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FallbackNode = ({ type, data }: any) => {
    const { t } = useTranslation();
    return (
        <div style={{ padding: 8, background: '#fff1f0', border: '1px dashed #ffa39e', borderRadius: 4, fontSize: 12, color: '#cf1322', textAlign: 'center', opacity: 0.8 }}>
            ⚠️ {t('designer.flowchart.pluginMissing', { type })}
        </div>
    );
};

const DEFAULT_NODE_TYPES: NodeTypes = {
    custom: CustomNode,
    titleGroup: TitleGroupNode,
    subGroup: SubGroupNode,
    flowchart: FlowchartNode,
    swimlane: SwimLaneNode,
    mindmap: MindMapNode as any,
    'mindmap-boundary': MindMapBoundaryNode as any,
    'sticky-note': StickyNoteNode,
    arrowTimeline: ArrowTimelineNode as any,
    timelineNode: ArrowTimelineNode as any,  // 兼容旧数据，映射到 ArrowTimelineNode
    iconNode: IconNode as any,
    erNode: ERDatabaseNode as any,
    'vizly:comment': CommentNode as any,
    system: CustomNode as any,
    actor: CustomNode as any,
    process: CustomNode as any,
    notification: CustomNode as any,
};

// [NEW] Declare static edge types to inject specialized rendering
const DEFAULT_EDGE_TYPES = {
    mindmapEdge: MindMapEdge,
    relationshipEdge: RelationshipEdge
};

const pluginNodeTypesCache = new WeakMap<object, NodeTypes>();
const pluginEdgeTypesCache = new WeakMap<object, Record<string, any>>();
const getStablePluginNodeTypes = (plugin: any): NodeTypes => {
    if (!plugin?.getNodeTypes) return DEFAULT_NODE_TYPES;

    const cached = pluginNodeTypesCache.get(plugin);
    if (cached) return cached;

    const nodeTypes = { ...DEFAULT_NODE_TYPES, ...plugin.getNodeTypes() };
    pluginNodeTypesCache.set(plugin, nodeTypes);
    return nodeTypes;
};

const getStablePluginEdgeTypes = (plugin: any): Record<string, any> => {
    if (!plugin?.getEdgeTypes) return DEFAULT_EDGE_TYPES;

    const cached = pluginEdgeTypesCache.get(plugin);
    if (cached) return cached;

    const edgeTypes = { ...DEFAULT_EDGE_TYPES, ...plugin.getEdgeTypes() };
    pluginEdgeTypesCache.set(plugin, edgeTypes);
    return edgeTypes;
};

const FlowchartDesigner: React.FC<DiagramComponentProps> = ({
    id,
    businessData,
    extraExportItems,
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
    const preset = useDiagramStylePreset_v2();
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const _screenToFlowPosition = reactFlowInstance?.screenToFlowPosition;

    // ?Define handleFitView early to avoid TDZ (Temporal Dead Zone) in hooks and effects
    const handleFitView = useCallback(() => {
        if (reactFlowInstance) {
            reactFlowInstance.fitView({ duration: 800 });
        }
    }, [reactFlowInstance]);

    // Feature Parity: Internal state for features to allow standalone designer operation
    const [internalReadonly, setInternalReadonly] = useState(externalReadonly);
    useEffect(() => setInternalReadonly(externalReadonly), [externalReadonly]);
    const isReadonly = internalReadonly;
    const handleReadonlyChange = useCallback((val: boolean) => {
        setInternalReadonly(val);
        if (onReadonlyChange) onReadonlyChange(val);
    }, [onReadonlyChange]);

    const [internalEdgeMode, setInternalEdgeMode] = useState<'advanced-smart' | 'native'>(externalEdgeMode);
    useEffect(() => setInternalEdgeMode(externalEdgeMode), [externalEdgeMode]);
    const _edgeMode = internalEdgeMode;

    const [internalShowOnlyMainFlow, setInternalShowOnlyMainFlow] = useState(externalShowOnlyMainFlow);
    const [internalHighlightMainFlow, setInternalHighlightMainFlow] = useState(externalHighlightMainFlow);
    useEffect(() => setInternalShowOnlyMainFlow(externalShowOnlyMainFlow), [externalShowOnlyMainFlow]);
    useEffect(() => setInternalHighlightMainFlow(externalHighlightMainFlow), [externalHighlightMainFlow]);
    const showOnlyMainFlow = internalShowOnlyMainFlow;
    const highlightMainFlow = internalHighlightMainFlow;

    const handleToggleShowOnlyMainFlow = useCallback(() => {
        const next = !internalShowOnlyMainFlow;
        setInternalShowOnlyMainFlow(next);
        if (onShowOnlyMainFlowChange) onShowOnlyMainFlowChange(next);
    }, [internalShowOnlyMainFlow, onShowOnlyMainFlowChange]);

    const handleToggleHighlightMainFlow = useCallback(() => {
        const next = !internalHighlightMainFlow;
        setInternalHighlightMainFlow(next);
        if (onMainFlowAnimationChange) onMainFlowAnimationChange(next);
    }, [internalHighlightMainFlow, onMainFlowAnimationChange]);

    const handleOpenSettings = useCallback(() => {
        if (onOpenSettings) {
            onOpenSettings();
        } else {
            appMessage.info(t('designer.flowchart.settingsNotAvailable'));
        }
    }, [onOpenSettings, t]);

    // ?图片导出支持 (PNG/SVG/PDF/GIF)
    const diagramIdForExport = id || 'flowchart-designer';
    const { exportToPNG, exportToSVG, exportToPDF, exportToGIF, getReactFlowSnapshot } = useFlowchartExportControls(diagramIdForExport, reactFlowInstance);
    // ?统一主题控制：响?ConfigIntegration 的全局主题切换
    const [theme, setTheme] = useTheme({ autoInitialize: true });

    // ?监听跨包架构的全局主题变更事件 (由于主工程和核心包存?ThemeManager 隔离情况)
    useEffect(() => {
        const handleGlobalThemeChanged = (e: any) => {
            const newThemeId = e.detail;
            if (newThemeId && newThemeId !== theme?.id) {
                setTheme(newThemeId).catch((error) => {
                    logDiagramGlobalThemeSyncFailure('FlowchartDesigner', newThemeId, error);
                });
            }
        };
        window.addEventListener('diagram-global-theme-changed', handleGlobalThemeChanged);
        return () => window.removeEventListener('diagram-global-theme-changed', handleGlobalThemeChanged);
    }, [theme?.id, setTheme]);
    
    // ?画布与网格颜色动态解?(支持深白主题自适应)
    const isDarkBg = theme?.mode === 'dark';
    const canvasBg = theme?.diagram?.canvas?.background || (isDarkBg ? '#1e1e2e' : 'transparent');
    const gridColor = theme?.diagram?.canvas?.grid?.color || (isDarkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)');

    // ?性能监控
    useComponentPerformance('FlowchartDesigner');
    useInteractionPerformance();


    // 1. State Domain Controller
    const {
        nodes, edges, setNodes, setEdges,
        onNodesChange, onEdgesChange,
        viewport,
        diagramHistory
    } = useDesignerCanvasState({ externalEdgeMode: internalEdgeMode });

    const { takeSnapshot, undo, redo, canUndo, canRedo, pastEntries, getPreviousState, jumpTo } = diagramHistory;
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
    }, [reactFlowInstance, setSelectedNodes]);

    const handlePresentationFocus = useCallback((ids: string[]) => {
        if (ids && ids.length > 0) handleFocusNode(ids[0]);
    }, [handleFocusNode]);

    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

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
    const [isSidebarHidden] = useState(false);
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [leftDrawerWidth, setLeftDrawerWidth] = useState(300);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(300);

    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
    const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
    const [presentationActive, setPresentationActive] = useState(false);
    const [laserEnabled, setLaserEnabled] = useState(false);
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
    const [canvasSearchVisible, setCanvasSearchVisible] = useState(false);
    
    // ?GAP-11: Mobile Response Logic
    const { isMobile } = useResponsive();
    const [, setMobileAddDrawerVisible] = useState(false);
    const [mobilePropertyDrawerVisible, setMobilePropertyDrawerVisible] = useState(false);
    
    // Phase 10: 高级组件可见性状态提取
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [pluginManagerVisible, setPluginManagerVisible] = useState(false);

    const [aiChatVisible, setAiChatVisible] = useState(false);
    const [activeRightTab, setActiveRightTab] = useState<'property' | 'ai'>('property');
    // commandPaletteVisible: 单一事实源，必须在 useDesignerCommands 之前声明以避免 TDZ
    const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
    const [shortcutHelpVisible, setShortcutHelpVisible] = useState(false);
    const [showShortcuts, setShowShortcutsModal] = useState(false);
    const [jsonEditorInitialContent] = useState<string | undefined>(undefined);
    const [saveState] = useState<string>('idle');
    const [showPerformanceDashboard] = useState(false);
    const [presentationSlides, setPresentationSlides] = useState<any[]>([]);
    const [, setHighlightedNodeId] = useState<string | null>(null);

    const {
        currentZoom,
        showOverlay,
        handleTouchStart,
        handleTouchEnd
    } = useMobileInteractions();

    const [onboardingDismissed, setOnboardingDismissed] = useState(true);
    useEffect(() => {
        setOnboardingDismissed(readFlowchartOnboardingDismissed());
    }, []);

    const [showGrid, setShowGrid] = useState(true);
    const [showMinimap, setShowMinimap] = useState(true);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [showRuler, setShowRuler] = useState(false);
    const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Lines);
    useEffect(() => {
        const gridControl = (theme?.diagram?.canvas?.grid as any);
        if (gridControl?.style) {
            const style = gridControl.style.toLowerCase();
            if (style === 'dots') setGridVariant(BackgroundVariant.Dots);
            else if (style === 'lines') setGridVariant(BackgroundVariant.Lines);
            else if (style === 'cross') setGridVariant(BackgroundVariant.Cross);
            else if (style === 'none' || style === 'hidden') setShowGrid(false);
        }
    }, [theme]);

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [messageApi, messageContextHolder] = message.useMessage();
    const [notificationApi, notificationContextHolder] = notification.useNotification();
    const [pluginCtx, setPluginCtx] = useState<PluginContext | null>(null);
    const [activePlugin, setActivePlugin] = useState<any>(null);

    useEffect(() => {
        const plugin = PluginRegistry.getInstance().getPlugin(pluginId);
        if (plugin) {
            setActivePlugin(plugin);
            const ctx: any = {
                diagramId: id || 'default',
                getNodes: () => nodesRef.current,
                getEdges: () => edgesRef.current,
                updateNodesBatch: (ids: string[], updates: any) => updateNodesBatch?.(ids, updates, { snapshot: false }),
                updateEdgesBatch: (ids: string[], updates: any) => updateEdgesBatch?.(ids, updates),
                takeSnapshot: () => takeSnapshot(nodesRef.current, edgesRef.current),
                setNodes,
                setEdges,
                reactFlowInstance,
                reactFlowWrapper,
                addNode: (type: string, data: Record<string, unknown> = {}, position?: { x: number; y: number }) => {
                    if (!reactFlowInstance) return;
                    takeSnapshot(nodesRef.current, edgesRef.current);
                    
                    let finalPos = position;
                    if (!finalPos) {
                        // 如果没有指定位置，默认生成在视口中心
                        const vp = reactFlowInstance.getViewport();
                        const container = reactFlowWrapper.current;
                        const cw = container ? container.offsetWidth : window.innerWidth;
                        const ch = container ? container.offsetHeight : window.innerHeight;
                        finalPos = {
                            x: (cw / 2 - vp.x) / vp.zoom - 50,
                            y: (ch / 2 - vp.y) / vp.zoom - 25
                        };
                    }

                    const newNode: Node = {
                        id: `${type}-${Date.now()}`,
                        type: type as any,
                        position: finalPos,
                        data: { 
                            label: t('designer.flowchart.newNode'),
                            ...data,
                            layer: activeLayerId 
                        }
                    };
                    
                    setNodes(nds => [...nds, newNode]);
                    appMessage.success(t('designer.flowchart.nodeAdded', { type }));
                    
                    // 移动端添加后自动关闭抽屉
                    if (isMobile) {
                        setLeftDrawerOpen(false);
                        setMobileAddDrawerVisible(false);
                    }
                    return newNode.id;
                },
                
                // ⭐ [GAP-12] 插件状态沙盒实现
                getPluginState: () => {
                    return useDiagramStore.getState().pluginStates[pluginId];
                },
                setPluginState: (patch: any) => {
                    useDiagramStore.getState().setPluginState(pluginId, patch);
                }
            };
            Object.defineProperty(ctx, 'nodes', { get: () => nodesRef.current });
            Object.defineProperty(ctx, 'edges', { get: () => edgesRef.current });
            setPluginCtx(ctx);
            
            // 生命周期：初始化
            if (plugin.onInit) {
                plugin.onInit(ctx);
            }

            // [NEW] 生命周期：销毁处?
            return () => {
                if (plugin.onDestroy) {
                    plugin.onDestroy(ctx);
                }
            };
        }
    }, [pluginId, id, setNodes, setEdges, reactFlowInstance, updateNodesBatch, updateEdgesBatch, takeSnapshot, activeLayerId, isMobile, t]);

    const dynamicNodeTypes = useMemo(() => getStablePluginNodeTypes(activePlugin), [activePlugin]);
    const dynamicEdgeTypes = useMemo(() => getStablePluginEdgeTypes(activePlugin), [activePlugin]);
    const { nodesWithCollapseState, edgesWithCollapseState, toggleGroupCollapse } = useCollapsibleGroups({ nodes, edges, setNodes, takeSnapshot });

    // 2. Interactions Domain Controller
    const interactionsParams = useDesignerInteractions({
        nodes, edges, setNodes, setEdges,
        selectedNodes, setSelectedNodes,
        takeSnapshot, reactFlowInstance,
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
    // ?Reordered to avoid TDZ (Temporal Dead Zone) for handleFitView and messageApi
    useEffect(() => {
        const handleSnap = createFlowchartSnapshotEventHandler({
            getNodes: () => nodesRef.current,
            getEdges: () => edgesRef.current,
            takeSnapshot,
        });
        window.addEventListener('diagram:save-snapshot', handleSnap);
        
        const handleImportSuccess = createFlowchartReverseImportSuccessHandler({
            notifySuccess: (filename) => {
                if (messageApi) messageApi.success(t('designer.flowchart.import.reverseSuccess', { filename }));
            },
            scheduleFitView: () => {
                if (handleFitView) setTimeout(() => handleFitView(), 300);
            },
        });
        window.addEventListener('vizly:reverse-import-success', handleImportSuccess);

        return () => {
            window.removeEventListener('diagram:save-snapshot', handleSnap);
            window.removeEventListener('vizly:reverse-import-success', handleImportSuccess);
        };
    }, [takeSnapshot, handleFitView, messageApi, t]);

    const handlePaneClick = useCallback((_event: React.MouseEvent) => {
        // 先关闭可能存在的 Context Menu
        contextMenuPaneClick();

        if (isCommentMode) {
            // [GAP-02] 由 AnnotationLayer 的 handleCanvasClick 负责展示编辑器并添加评论
            // 这里不再直接 addComment，以避免创建空评论。
            return;
        }
    }, [isCommentMode, contextMenuPaneClick]);

    useContainerAutoLayout();

    // 演示模式激光笔：L 键切换，退出演示时自动关闭
    useEffect(() => {
        if (!presentationActive) {
            setLaserEnabled(false);
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
            if (e.key.toLowerCase() === 'l') setLaserEnabled(v => !v);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [presentationActive]);

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
        return nodes.map(n => `${n.id}:${n.data?.collapsed ? '1' : '0'}`).join(';');
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

    const handleSmartLayout = useCallback(async () => {
        const { recommendLayout } = await import('../../utils/layoutRecommender');
        const rec = recommendLayout(nodesRef.current, edgesRef.current);
        appMessage.info(t('designer.flowchart.smartLayout', { reason: rec.reason, confidence: Math.round(rec.confidence * 100) }));
        handleStrategyLayout(rec.domainStrategy, rec.nodeLayout, rec.direction);
    }, [handleStrategyLayout, t]);

    const handleSmartOptimize = useCallback(async () => {
        const intelligence = DiagramIntelligenceService.getInstance();
        const result = await runFlowchartSmartOptimize({
            nodes: nodesRef.current,
            edges: edgesRef.current,
            takeSnapshot,
            optimize: intelligence.optimize.bind(intelligence),
        });
        
        setNodes(result.nodes);
        setEdges(result.edges);
        
        appMessage.success(t('designer.flowchart.optimize', { overlaps: result.stats.rectifiedOverlaps, nodes: result.stats.alignedNodes }));
    }, [setNodes, setEdges, takeSnapshot, t]);

    // Gap 6: 双击连线，在中点插入新节点，将边一分为二
    const handleEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        if (isReadonly) return;
        const insertionPlan = buildFlowchartEdgeInsertionPlan({
            edge,
            nodes: nodesRef.current,
            label: t('designer.flowchart.newNode'),
        });
        if (!insertionPlan) return;

        takeSnapshot(nodesRef.current, edgesRef.current);

        setNodes(ns => [...ns, insertionPlan.node]);
        setEdges(es => [...es.filter(e => e.id !== edge.id), ...insertionPlan.replacementEdges]);
        appMessage.success(t('designer.flowchart.edgeNodeInserted'));
    }, [isReadonly, setNodes, setEdges, takeSnapshot, t]);


    const handleGridRotate = () => {
         const variants = [BackgroundVariant.Lines, BackgroundVariant.Dots, BackgroundVariant.Cross];
         const currentIndex = variants.indexOf(gridVariant);
         const nextVariant = variants[(currentIndex + 1) % variants.length];
         setGridVariant(nextVariant);
         setShowGrid(true);
    };

    // handleFocusNode moved to line 278 to avoid TDZ error in handlePresentationFocus

    useEffect(() => {
        const handleFocusEntity = createFlowchartFocusEntityEventHandler({
            reactFlowInstance,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            setSelectedNodes,
            setSelectedEdges,
        });
        window.addEventListener('editor:focus-entity', handleFocusEntity as EventListener);
        return () => window.removeEventListener('editor:focus-entity', handleFocusEntity as EventListener);
    }, [reactFlowInstance, setSelectedNodes, setSelectedEdges]);

    const handleExport = useCallback(() => setJsonEditorVisible(true), []);
    const handleClearCanvasCommand = useCallback(() => {
        appModal.confirm(buildFlowchartClearCanvasConfirm({
            title: t('designer.flowchart.clearCanvas.title'),
            content: t('designer.flowchart.clearCanvas.content'),
            okText: t('designer.flowchart.clearCanvas.ok'),
            cancelText: t('designer.flowchart.clearCanvas.cancel'),
            onConfirm: () => {
                clearFlowchartCanvas({
                    setNodes,
                    setEdges,
                    takeSnapshot,
                });
            },
        }));
    }, [setNodes, setEdges, takeSnapshot, t]);

    useEffect(() => {
        const handleCommand = createFlowchartDesignerCommandEventHandler({
            handleSmartLayout,
            handleStrategyLayout,
            handleExport,
            setAiChatVisible,
            setActiveRightTab: (tab) => setActiveRightTab(tab === 'ai' ? 'ai' : 'property'),
            reactFlowInstance,
            activePlugin,
            setNodes,
            newNodeLabel: t('designer.flowchart.newNode'),
            confirmClearCanvas: handleClearCanvasCommand,
        });
        window.addEventListener('editor:command', handleCommand as EventListener);
        return () => window.removeEventListener('editor:command', handleCommand as EventListener);
    }, [handleSmartLayout, handleStrategyLayout, handleExport, reactFlowInstance, activePlugin, setNodes, setAiChatVisible, setActiveRightTab, t, handleClearCanvasCommand]);

    const handleAddSummary = useMemo(() => createFlowchartSummaryEventHandler({
        nodesRef,
        edgesRef,
        label: t('designer.flowchart.summaryLabel'),
        takeSnapshot,
        setNodes,
    }), [nodesRef, edgesRef, t, takeSnapshot, setNodes]);

    useEffect(() => {
        window.addEventListener('editor:add-summary-node', handleAddSummary as EventListener);
        return () => window.removeEventListener('editor:add-summary-node', handleAddSummary as EventListener);
    }, [handleAddSummary]);

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

    const handleExportMermaid = useCallback(async () => {
        try {
            await exportFlowchartAsMermaid({
                nodes: nodesRef.current,
                edges: edgesRef.current,
                downloadFile,
            });
        } catch(e:any) { appMessage.error(e.message); }
    }, []);

    const handleCopyAsMermaid = useCallback(async () => {
         try {
             if (!navigator.clipboard) return;
             await copyFlowchartAsMermaid({
                 nodes: nodesRef.current,
                 edges: edgesRef.current,
                 writeText: (content) => navigator.clipboard.writeText(content),
             });
             appMessage.success(t('designer.flowchart.mermaidCopied'));
         } catch(e:any) { appMessage.error(e.message); }
    }, [t]);

    const handleUseTemplate = useCallback((tpl: any) => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        applyFlowchartTemplate({
            template: tpl,
            viewport,
            createFromTemplate,
            appendNodes: (nextNodes) => {
                setNodes((nodes) => [...nodes, ...nextNodes]);
            },
            appendEdges: (nextEdges) => {
                setEdges((edges) => [...edges, ...nextEdges]);
            },
        });
        appMessage.success(t('designer.flowchart.templateApplied'));
    }, [reactFlowInstance, takeSnapshot, createFromTemplate, viewport, setNodes, setEdges, t]);
    
    const handleOpacity = useCallback((opacity: number) => {
        updateNodesBatch(selectedNodes.map(n => n.id), { style: { opacity } });
    }, [selectedNodes, updateNodesBatch]);

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

    const handleOpenJsonEditor = useCallback(() => setJsonEditorVisible(true), []);
    const setShowShortcuts = useCallback(() => setShortcutHelpVisible(true), []);

    // ─── Modular migration stubs removed ───



    // 4. System Sync Domain Controller
    const { performanceMode, isInitialDiagramLoading } = useDesignerSystemSync({
        id, diagramIdForExport, nodes, edges, setNodes, setEdges, reactFlowInstance, isDragging, pluginId, messageApi
    });

    const { commandPaletteItems } = useDesignerCommands({
        reactFlowInstance: reactFlowInstance as any, 
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
    const handleReactFlowInit = useCallback((instance: ReactFlowInstance<any, any>) => {
        setReactFlowInstance(instance as unknown as ReactFlowInstance);
        scheduleFlowchartInitialFit({
            reactFlowInstance: instance,
            dispatchFit: () => dispatchDiagramControl('fit', id),
        });
    }, [id]);

    const handleAddStickyNote = useCallback(() => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        addFlowchartStickyNote({
            layer: activeLayerId,
            setNodes,
        });
    }, [reactFlowInstance, setNodes, takeSnapshot, activeLayerId]);

    const handleAddMindMap = useCallback(() => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        addFlowchartMindMapNode({
            layer: activeLayerId,
            label: t('designer.flowchart.mindMapCenter'),
            setNodes,
        });
    }, [reactFlowInstance, setNodes, takeSnapshot, activeLayerId, t]);

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
    }, [activePlugin, pluginCtx, onCloudSave]);

    const handleWrappedDirectSave = useCallback(async () => {
        await runFlowchartSavePipeline({
            activePlugin,
            pluginCtx,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            saveAction: onDirectSave,
        });
    }, [activePlugin, pluginCtx, onDirectSave]);

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
