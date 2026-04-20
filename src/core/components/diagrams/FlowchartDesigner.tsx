import { useDiagramStylePreset_v2 } from "../../hooks/useDiagramStylePreset_v2";
import { diagramStyleManager } from "../shared/DiagramStyleManager";
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { message, notification, Divider, Button, Tooltip, Modal } from 'antd';
import { Node, Edge, MarkerType, BackgroundVariant, ReactFlowInstance, SelectionMode, ConnectionMode, NodeTypes, Connection, reconnectEdge, addEdge } from '@xyflow/react';

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
import { FaProjectDiagram, FaExchangeAlt } from 'react-icons/fa';
import { IconRailSidebar } from './IconRailSidebar';
import { dispatchDiagramControl } from '../../components/shared/diagramControl';
import { PluginRegistry } from '../../services/PluginRegistry';
import { PluginContext } from '../../types/plugin';
import { ModernFlowchartToolbar } from './ModernFlowchartToolbar';
import { TopActionButtons } from './TopActionButtons';
import { EdgeDataUpdate } from '../../types/diagram-updates';
import { ContextMenuLayer } from './ContextMenuLayer';
import { HoverToolbarsOverlay } from './HoverToolbarsOverlay';
import { useLayerKeyboardShortcuts } from '../../hooks/useLayerKeyboardShortcuts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useComponentPerformance, useInteractionPerformance } from '../../hooks/usePerformanceMonitor';
import { useSmartGuides } from '../../hooks/useSmartGuides';
import { LayoutStabilityContext } from '../../context/LayoutStabilityContext';
import { useAutoLayout } from '../../hooks/useAutoLayout';
import { EdgeUpdateProvider } from './EdgeUpdateContext';
import { SmartGuideRenderer } from './SmartGuideRenderer';
import { useDiagramControls } from '../../hooks/useDiagramControls';
import { useResponsive } from '../../../hooks/useResponsive';
import { useDiagramCollaboration } from '../../hooks/useDiagramCollaboration';
import { useTopologyLinter } from '../../hooks/useTopologyLinter';
import { readDomViewport } from '../../utils/domViewport';
import { EdgeRoutingCoordinator } from '../../services/EdgeRoutingCoordinator';
import { DiagramIntelligenceService } from '../../services/DiagramIntelligenceService';
import { LayoutOptimizer } from '../layout/LayoutOptimizer';
import { useDiagramStore, useDiagramStore as useDiagramStoreStatic } from '../../store/useDiagramStore';
import './FlowchartDesigner.css';
import './ModernControls.css';

import { useDiagramActions } from './hooks/useDiagramActions';
import { useVirtualization } from '../../hooks/useVirtualization';
import { useMobileInteractions } from '../../hooks/useMobileInteractions';
import { GestureOverlay } from '../shared/GestureOverlay';
import { useGrouping } from './hooks/useGrouping';
import { useCollapsibleGroups } from './hooks/useCollapsibleGroups';
import { useDiagramDragDrop } from './hooks/useDiagramDragDrop';
import { useFlowchartState } from './hooks/useFlowchartState';
import { useAutoSave } from './hooks/useAutoSave';
import { useLayerManagement } from './hooks/useLayerManagement';
import { useQuickAdd } from './hooks/useQuickAdd';
import { useClipboard } from './hooks/useClipboard';
import { useToastActions } from './hooks/useToastActions';
import { useSpacePan } from './hooks/useSpacePan';
import { useAlignment } from './hooks/useAlignment';
import { useConnectionMicrointeractions } from './hooks/useConnectionMicrointeractions';
import { useContainerAutoLayout } from './hooks/useContainerAutoLayout';
import { useConnectionValidation } from './hooks/useConnectionValidation';
import { useStylePainter } from './hooks/useStylePainter';
import { useNodeTemplates } from './hooks/useNodeTemplates';
// useAnnotations removed (GAP-02 Unified)
import { AnnotationLayer } from './AnnotationLayer';
import { FreehandDrawingLayer } from './FreehandDrawingLayer';
import { useMultiPage } from './hooks/useMultiPage';
import { PageTabs } from './PageTabs';
import { QuickConnectMenu } from './QuickConnectMenu';
import { FloatingContextToolbar } from './FloatingContextToolbar';
import { ContextualEdgeToolbar } from './ContextualEdgeToolbar';
import { HistoryPanel } from './HistoryPanel';
import { CanvasSearchBar } from './CanvasSearchBar';
import { useTheme } from '../../themes/useCoreTheme';
import PresentationMode from '../presentation/PresentationMode';
import { generateSlides } from '../../hooks/usePresentationSlides';
import DiffOverlay from './DiffOverlay';
import { diffDiagrams, DiffResult } from '../../utils/diagramDiff';
import { KeyboardShortcutPanel } from './KeyboardShortcutPanel';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { CanvasRuler, RulerCorner } from './CanvasRuler';
import { toMermaid, fromMermaid } from '../../utils/mermaidConverter';
import { recommendLayout } from '../../utils/layoutRecommender';
import { CommandPalette as UiCommandPalette } from '../ui/CommandPalette';
import { UnifiedDesignerShell } from './UnifiedDesignerShell';
import { FlowchartShortcutsHelpModal } from './FlowchartShortcutsHelpModal';
import { FlowchartOnboardingHint } from './FlowchartOnboardingHint';
import { FlowchartEmptyState } from './FlowchartEmptyState';
import { PerformanceDashboard } from './PerformanceDashboard';
import { NodeUpdateProvider } from './NodeUpdateContext';
import { FlowchartCanvasShell } from './FlowchartCanvasShell';
import { RemoteCursors } from './ui/RemoteCursors';
import { useDesignerEdgeCallbacks } from './hooks/useDesignerEdgeCallbacks';
import { useDesignerBatchUpdates } from './hooks/useDesignerBatchUpdates';
import { JsonEditorModal } from './JsonEditorModal';
import { useDesignerContextMenu } from './hooks/useDesignerContextMenu';
import { useAutoRouting } from './hooks/useAutoRouting';
import { DesignerRightSidebar } from './DesignerRightSidebar';
import { useDesignerCommands } from './hooks/useDesignerCommands';
import { useLayeredVirtualization } from './hooks/useLayeredVirtualization';
import { useDesignerGhostNodes } from './hooks/useDesignerGhostNodes';
import { DesignerHeaderLayer } from './ui/DesignerHeaderLayer';
import { DesignerOverlaysLayer } from './ui/DesignerOverlaysLayer';
import { DesignerCanvasFeaturesLayer } from './ui/DesignerCanvasFeaturesLayer';
import { LaserPointer } from './LaserPointer';
import ArrowTimelineNode from './nodes/ArrowTimelineNode';
import { LiveCursors } from '../../../components/diagrams/collaboration/LiveCursors';
import ERDatabaseNode from '../custom-nodes/ERDatabaseNode';
import { VersionHistoryPanel } from '../../../components/diagrams/ui/VersionHistoryPanel';
// useLayerManagement already imported above
import { MobileBottomDock } from '../layout/MobileBottomDock';
// useMindMapOrchestrator decoupled

const FallbackNode = ({ type, data }: any) => (
    <div style={{ padding: 8, background: '#fff1f0', border: '1px dashed #ffa39e', borderRadius: 4, fontSize: 12, color: '#cf1322', textAlign: 'center', opacity: 0.8 }}>
        ⚠️ 插件缺失 [{type}]
    </div>
);

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
};

// [NEW] Declare static edge types to inject specialized rendering
const DEFAULT_EDGE_TYPES = {
    mindmapEdge: MindMapEdge,
    relationshipEdge: RelationshipEdge
};

const FlowchartDesigner: React.FC<DiagramComponentProps> = ({
    id,
    businessData,
    extraExportItems,
    isYjsSynced,
    onSyncPush,
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
    const screenToFlowPosition = reactFlowInstance?.screenToFlowPosition;

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
    const edgeMode = internalEdgeMode;

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
            message.info('当前独立设计器模式未挂载高级首选项面板，请在主视图中或按快捷键 Ctrl+Shift+, 打开');
        }
    }, [onOpenSettings]);

    // ?图片导出支持 (PNG/SVG/PDF/GIF)
    const diagramIdForExport = id || 'flowchart-designer';
    const { exportToPNG, exportToSVG, exportToPDF, exportToGIF } = useDiagramControls(diagramIdForExport, false);

    // ?统一主题控制：响?ConfigIntegration 的全局主题切换
    const [theme, setTheme] = useTheme({ autoInitialize: true });

    // ?监听跨包架构的全局主题变更事件 (由于主工程和核心包存?ThemeManager 隔离情况)
    useEffect(() => {
        const handleGlobalThemeChanged = (e: any) => {
            const newThemeId = e.detail;
            if (newThemeId && newThemeId !== theme?.id) {
                setTheme(newThemeId).catch(console.warn);
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
    const setViewport = useCallback((vp: any) => {}, []); // viewport is read-only from the hook
    const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
    const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);
    const [isContextToolbarHidden, setIsContextToolbarHidden] = useState(false);
    const handleBeforeUpdate = useCallback(() => {}, []);
    const handleFocusNode = useCallback((nodeId: string) => {
        if (!reactFlowInstance) return;
        const node = nodesRef.current.find(n => n.id === nodeId);
        if (node) {
            reactFlowInstance.setCenter(node.position.x + (node.measured?.width || 100) / 2, node.position.y + (node.measured?.height || 50) / 2, { duration: 800, zoom: 1.2 });
            setSelectedNodes(nodesRef.current.filter(n => n.id === nodeId));
        }
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
    const [isSidebarHidden, setIsSidebarHidden] = useState(false);
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
    const [leftDrawerWidth, setLeftDrawerWidth] = useState(300);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(300);

    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
    const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
    const [presentationActive, setPresentationActive] = useState(false);
    const [laserEnabled, setLaserEnabled] = useState(false);
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
    const [diagramMetadata, setDiagramMetadata] = useState<any>(null);
    const [canvasSearchVisible, setCanvasSearchVisible] = useState(false);
    
    // ?GAP-11: Mobile Response Logic
    const { isMobile, isTouchDevice } = useResponsive();
    const [mobileAddDrawerVisible, setMobileAddDrawerVisible] = useState(false);
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
    const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

    const {
        isGesturing,
        currentZoom,
        showOverlay,
        handleTouchStart,
        handleTouchEnd
    } = useMobileInteractions();

    const [onboardingDismissed, setOnboardingDismissed] = useState(true);
    useEffect(() => {
        try { if (!localStorage.getItem('designer.flowchart.onboarding.dismissed')) setOnboardingDismissed(false); } catch { void 0; }
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
                addNode: (type, data = {}, position) => {
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
                            label: '新节点',
                            ...data,
                            layer: activeLayerId 
                        }
                    };
                    
                    setNodes(nds => [...nds, newNode]);
                    message.success(`已添加 ${type}`);
                    
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
                setPluginState: (patch) => {
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
    }, [pluginId, id, setNodes, setEdges, reactFlowInstance, updateNodesBatch, updateEdgesBatch, takeSnapshot]);

    const dynamicNodeTypes = useMemo(() => {
        if (activePlugin?.getNodeTypes) {
            return { ...DEFAULT_NODE_TYPES, ...activePlugin.getNodeTypes() };
        }
        return DEFAULT_NODE_TYPES;
    }, [activePlugin]);

    const dynamicEdgeTypes = useMemo(() => {
        if (activePlugin?.getEdgeTypes) {
            return { ...DEFAULT_EDGE_TYPES, ...activePlugin.getEdgeTypes() };
        }
        return DEFAULT_EDGE_TYPES;
    }, [activePlugin]);

    // 2. Interactions Domain Controller
    const interactionsParams = useDesignerInteractions({
        nodes, edges, setNodes, setEdges,
        selectedNodes, setSelectedNodes,
        takeSnapshot, reactFlowInstance,
        isDragging, setIsDragging,
        activePlugin, pluginCtx,
        onNodesChange, onEdgesChange,
        virtualizedNodes: nodes, edgesWithCollapseState: edges,
        onConnect: (params) => {
             takeSnapshot(nodesRef.current, edgesRef.current);
             
             const isRelationship = (params.sourceHandle?.includes('relationship') || params.targetHandle?.includes('relationship'));
             
             if (isRelationship) {
                 const id = `rel-${Date.now()}`;
                 const newEdge = {
                     ...params,
                     id,
                     type: 'relationshipEdge',
                     data: { label: '相关说明' },
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
        selectionMode, isMarqueeActive, setIsMarqueeActive,
        guides, clearGuides,
        handleAlign, handleDistribute, canAlign, canDistribute,
        hasCopiedStyle, copyStyle, pasteStyle,
        templates, groupedTemplates, saveAsTemplate, saveGroupAsTemplate, createFromTemplate, deleteTemplate, renameTemplate,
        annotations, annotationMode, addAnnotation, updateAnnotation, deleteAnnotation, toggleResolved, ANNOTATION_COLORS,
        quickAddMenu, handleAddNode, closeMenu, openQuickAddMenu, getFlowPosition,
        setQuickConnectPreview, nodesWithGhost, finalEdgesWithGhost,
        isConnecting, connectPreview, onConnectStart, enhancedOnConnect, enhancedOnConnectEnd,
        isValidConnection,
        handleReconnect, handleReconnectStart, handleReconnectEnd,
        onDragOver, onDrop, wrappedOnNodeDragStart, onNodeDrag, onNodeDragStop,
        isDraggingNode
    } = interactionsParams;
    
    // 2.5 Linter Layer (Phase 8 integration)
    const { lintedNodes, lintedEdges } = useTopologyLinter(nodesWithGhost, finalEdgesWithGhost, { enabled: !isReadonly });

    // 2.6 节点折叠层 — toggleGroupCollapse 供命令面板和右键菜单使用
    const { toggleGroupCollapse } = useCollapsibleGroups({ nodes, edges, setNodes, takeSnapshot });

    // 协作层 diagramId：优先使用 id prop，回退到导出 ID，避免多画布协作时 ID 冲突
    const diagramId = id || diagramIdForExport || 'default';
    const { updateLocalCursor } = useDiagramCollaboration(diagramId, !isReadonly);
    const isCommentMode = useDiagramStore(state => state.isCommentMode);
    const setIsCommentMode = useDiagramStore(state => state.setIsCommentMode);
    const addComment = useDiagramStore(state => state.addComment);

    // 3. Event Handlers Domain Controller
    // commandPaletteVisible and shortcutHelpVisible already declared in Component root state section


    const {
        onNodeContextMenu,
        onEdgeContextMenu,
        onPaneContextMenu,
        onPaneClick: contextMenuPaneClick,
        onPaneClick,
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
        onContextMenuActionWithToast,
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
        const handleSnap = () => takeSnapshot(nodesRef.current, edgesRef.current);
        window.addEventListener('diagram:save-snapshot', handleSnap);
        
        const handleImportSuccess = (e: any) => {
            const { filename } = e.detail;
            if (messageApi) messageApi.success(`成功?[${filename}] 恢复画布内容`);
            // 自动居中显示恢复的内?
            if (handleFitView) setTimeout(() => handleFitView(), 300);
        };
        window.addEventListener('vizly:reverse-import-success', handleImportSuccess);

        return () => {
            window.removeEventListener('diagram:save-snapshot', handleSnap);
            window.removeEventListener('vizly:reverse-import-success', handleImportSuccess);
        };
    }, [takeSnapshot, handleFitView, messageApi]);

    const handlePaneClick = useCallback((_event: React.MouseEvent) => {
        // 先关闭可能存在的 Context Menu
        contextMenuPaneClick();

        if (isCommentMode) {
            // [GAP-02] 由 AnnotationLayer 的 handleCanvasClick 负责展示编辑器并添加评论
            // 这里不再直接 addComment，以避免创建空评论。
            return;
        }
    }, [isCommentMode, contextMenuPaneClick]);

    const { layoutContainer } = useContainerAutoLayout();

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

    const { autoRoutingEnabled, setAutoRoutingEnabled, isLayoutStable, handleStrategyLayout, lastDomainStrategy, lastDomainDirection, lastNodeLayout } = useAutoRouting({ setNodes, setEdges, nodesRef, edgesRef, takeSnapshot, reactFlowInstance });
    
    // Auto-Routing: Sync internal `autoRoutingEnabled` with the exposed edgeMode from config/topbar
    useEffect(() => {
        if (internalEdgeMode === 'native') {
            setAutoRoutingEnabled(false);
        } else {
            setAutoRoutingEnabled(true);
        }
    }, [internalEdgeMode, setAutoRoutingEnabled]);

    const handleSmartLayout = useCallback(() => {
        const rec = recommendLayout(nodesRef.current, edgesRef.current);
        message.info(`推荐布局?{rec.reason}（置信度 ${Math.round(rec.confidence * 100)}%）`);
        handleStrategyLayout(rec.domainStrategy, rec.nodeLayout, rec.direction);
    }, [handleStrategyLayout]);

    const handleSmartOptimize = useCallback(async () => {
        const intelligence = DiagramIntelligenceService.getInstance();
        takeSnapshot(nodesRef.current, edgesRef.current);
        const result = await intelligence.optimize(nodesRef.current, edgesRef.current);
        
        setNodes(result.nodes);
        setEdges(result.edges);
        
        message.success(`优化完成：解决了 ${result.stats.rectifiedOverlaps} 处重叠，对齐?${result.stats.alignedNodes} 个节点。`);
    }, [setNodes, setEdges, takeSnapshot]);


    const handleGridRotate = () => {
         const variants = [BackgroundVariant.Lines, BackgroundVariant.Dots, BackgroundVariant.Cross];
         const currentIndex = variants.indexOf(gridVariant);
         const nextVariant = variants[(currentIndex + 1) % variants.length];
         setGridVariant(nextVariant);
         setShowGrid(true);
    };

    // handleFocusNode moved to line 278 to avoid TDZ error in handlePresentationFocus

    useEffect(() => {
        const handleFocusEntity = (e: CustomEvent) => {
            if (!reactFlowInstance) return;
            const { edgeId, nodeId } = e.detail;
            if (nodeId) {
                const node = nodesRef.current.find((n: Node) => n.id === nodeId);
                if (node) {
                    reactFlowInstance.setCenter(node.position.x + (node.measured?.width || 100) / 2, node.position.y + (node.measured?.height || 50) / 2, { duration: 800, zoom: 1.2 });
                    setSelectedNodes(nodesRef.current.filter(n => n.id === nodeId));
                    setSelectedEdges([]);
                }
            } else if (edgeId) {
                const edge = edgesRef.current.find((e: Edge) => e.id === edgeId);
                if (edge) {
                    const sourceNode = nodesRef.current.find((n: Node) => n.id === edge.source);
                    const targetNode = nodesRef.current.find((n: Node) => n.id === edge.target);
                    if (sourceNode && targetNode) {
                        const midX = (sourceNode.position.x + targetNode.position.x) / 2;
                        const midY = (sourceNode.position.y + targetNode.position.y) / 2;
                        reactFlowInstance.setCenter(midX, midY, { duration: 800, zoom: 1.2 });
                        setSelectedEdges(edgesRef.current.filter(e => e.id === edgeId));
                        setSelectedNodes([]);
                    }
                }
            }
        };
        window.addEventListener('editor:focus-entity', handleFocusEntity as EventListener);
        return () => window.removeEventListener('editor:focus-entity', handleFocusEntity as EventListener);
    }, [reactFlowInstance, setSelectedNodes, setSelectedEdges]);

    const handleExport = useCallback(() => setJsonEditorVisible(true), []);

    useEffect(() => {
        const handleCommand = (e: CustomEvent) => {
            const { action } = e.detail;
            if (action === 'smart-layout') {
                handleSmartLayout();
            } else if (action === 'export-png') {
                const downloadBtn = document.querySelector('[data-id="toolbar-export-btn"]') as HTMLButtonElement;
                if(downloadBtn) downloadBtn.click();
                else handleExport();
            } else if (action === 'toggle-ai-chat') {
                setAiChatVisible(true);
                setActiveRightTab('ai');
            } else if (action === 'add-node') {
                // Determine center of current viewport to place the node
                if (!reactFlowInstance) return;
                const { x, y, zoom } = reactFlowInstance.getViewport();
                // We fake a generic position if possible, or use standard top-left
                const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
                const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
                const rx = (windowWidth / 2 - x) / zoom;
                const ry = (windowHeight / 2 - y) / zoom;
                
                // Let's use the first available node type in the active plugin, or fallback to 'custom'
                const nodeType = activePlugin?.getNodeTypes ? Object.keys(activePlugin.getNodeTypes())[0] : 'custom';
                
                const newId = `node_${Date.now()}`;
                setNodes(nds => [...nds, {
                    id: newId,
                    type: nodeType || 'custom',
                    position: { x: rx, y: ry },
                    data: { label: 'New Node' },
                    selected: true
                } as Node]);
            } else if (action === 'clear-canvas') {
                Modal.confirm({
                    title: '清空画布 (Clear Canvas)',
                    content: '确定要清空画布吗？此操作不可撤销?Are you sure you want to clear the canvas?)',
                    okText: '确定 (OK)',
                    cancelText: '取消 (Cancel)',
                    onOk: () => {
                        setNodes([]);
                        setEdges([]);
                        takeSnapshot([], []);
                    }
                });
            }
        };
        window.addEventListener('editor:command', handleCommand as EventListener);
        return () => window.removeEventListener('editor:command', handleCommand as EventListener);
    }, [handleSmartLayout, handleExport, setNodes, setEdges, takeSnapshot, reactFlowInstance, activePlugin]);

    const handleAddSummary = useCallback((e: CustomEvent) => {
        const { sourceIds } = e.detail;
        if (!sourceIds || sourceIds.length === 0) return;
        
        takeSnapshot(nodesRef.current, edgesRef.current);

        // Compute center of selected nodes
        let totalX = 0;
        let totalY = 0;
        let count = 0;
        sourceIds.forEach((id: string) => {
            const n = nodesRef.current.find(node => node.id === id);
            if (n) {
                totalX += n.position.x;
                totalY += n.position.y;
                count++;
            }
        });
        const avgX = count > 0 ? totalX / count : 0;
        const avgY = count > 0 ? totalY / count : 0;
        
        const newId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const summaryNode: Node = {
            id: newId,
            type: 'mindmap',
            position: { x: avgX + 300, y: avgY }, // Initially place it to the right, orchestrator will sync it
            data: {
                label: '总结 (Summary)',
                isSummary: true,
                summaryTargets: sourceIds,
                direction: 'L'
            }
        };
        setNodes(nds => [...nds, summaryNode]);

        // Auto-select the newly added summary node
        setTimeout(() => {
            setNodes(nds => nds.map(n => ({...n, selected: n.id === newId})));
        }, 50);
    }, [setNodes, takeSnapshot]);

    useEffect(() => {
        window.addEventListener('editor:add-summary-node', handleAddSummary as EventListener);
        return () => window.removeEventListener('editor:add-summary-node', handleAddSummary as EventListener);
    }, [handleAddSummary]);

    const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target?.result as string;
            if (file.name.endsWith('.json')) {
                try {
                    const data = JSON.parse(content);
                    // ?检测是否为 StandardDiagramData 格式（和示例文件/云端文件一致的结构?
                    // 特征：顶层有 type/layout/version 等字段，nodes 内含 description/domain 而非 position
                    const isStandardData = data.nodes && data.edges &&
                        (data.type || data.layout || data.version) &&
                        Array.isArray(data.nodes) &&
                        data.nodes.length > 0 &&
                        (data.nodes[0].description !== undefined || data.nodes[0].domain !== undefined);

                    if (isStandardData || (activePlugin && activePlugin.parseData)) {
                        // 【标准化适配】优先交由活跃插件解析数?
                        const parsed = activePlugin ? activePlugin.parseData(data) : null;
                        
                        if (parsed && parsed.nodes && parsed.nodes.length > 0) {
                            setNodes(parsed.nodes);
                            setEdges(parsed.edges || []);
                            messageApi.success(`成功导入标准化配置（${parsed.nodes.length} 节点）`);
                            setTimeout(() => handleFitView(), 500);
                            return;
                        }

                        // 如果插件解析失败，回退到全局重载模式
                        const { dataRegistry } = await import('@/data/DataRegistry');
                        const localSvc = dataRegistry.getDataService();
                        const currentId = businessData?.id || id || `imported_${Date.now()}`;
                        const normalized = {
                            ...data,
                            id: currentId,
                            metadata: {
                                ...(data.metadata || {}),
                                openedAt: new Date().toISOString()
                            }
                        };
                        localSvc.registerDiagram(normalized);
                        messageApi.success(`正在重载视图主题与布局配置...`);
                        setTimeout(() => {
                            window.location.href = `/?diagram=${currentId}`;
                        }, 500);
                    } else if (data.nodes && data.edges) {
                        // 原始 React Flow 画布数据：兜底确保每个节点都?position ?data
                        const safeNodes = data.nodes.map((n: any, i: number) => ({
                            ...n,
                            position: n.position || { x: 100 + (i % 5) * 200, y: 100 + Math.floor(i / 5) * 150 },
                            data: n.data || { label: n.id || `Node ${i}` },
                        }));
                        setNodes(safeNodes);
                        setEdges(data.edges);
                        messageApi.info(`成功导入 ${safeNodes.length} 个节点和 ${data.edges.length} 条边`);
                        setTimeout(() => handleFitView(), 500);
                    } else { throw new Error('无效的数据格式'); }
                } catch (err: any) { messageApi.error('JSON导入失败: ' + err.message); }
            } else if (file.name.endsWith('.txt') || file.name.endsWith('.mmd') || file.name.endsWith('.mermaid')) {
                try {
                     const { nodes: newNodes, edges: newEdges } = await fromMermaid(content);
                     setNodes(newNodes); setEdges(newEdges);
                     messageApi.info('成功导入 Mermaid 文本');
                     setTimeout(() => {
                         messageApi.info('建议点击"智能布局"整理节点');
                     }, 500);
                } catch(e:any) { messageApi.error('Mermaid解析失败'); }
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, [setNodes, setEdges, handleFitView, pluginId, reactFlowInstance, messageApi, activePlugin]);

    const handleExportMermaid = useCallback(async () => {
        try {
            const m = await toMermaid(nodesRef.current, edgesRef.current);
            const blob = new Blob([m], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flowchart-${Date.now()}.mmd`;
            a.click();
            URL.revokeObjectURL(url);
        } catch(e:any) { message.error(e.message); }
    }, []);

    const handleCopyAsMermaid = useCallback(async () => {
         try {
             const m = await toMermaid(nodesRef.current, edgesRef.current);
             if (navigator.clipboard) {
                 await navigator.clipboard.writeText(m);
                 message.success('已复制 Mermaid 代码到剪贴板');
             }
         } catch(e:any) { message.error(e.message); }
    }, []);

    const handleUseTemplate = useCallback((tpl: any) => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        const { nodes: newN, edges: newE } = createFromTemplate(tpl, viewport.x, viewport.y, viewport.zoom);
        setNodes(nds => [...nds, ...newN]);
        setEdges(eds => [...eds, ...newE]);
        message.success('已应用模板');
    }, [reactFlowInstance, takeSnapshot, createFromTemplate, viewport, setNodes, setEdges]);
    
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
    const { performanceMode } = useDesignerSystemSync({
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
        pluginCtx, 
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
        setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            return { ...n, data: { ...n.data, label: newLabel } };
        }));
    }, [setNodes]);

    const handleSearchReplaceAll = useCallback((matchIds: string[], newLabel: string) => {
        const idSet = new Set(matchIds);
        setNodes(nds => nds.map(n => {
            if (!idSet.has(n.id)) return n;
            return { ...n, data: { ...n.data, label: newLabel } };
        }));
    }, [setNodes]);

    const handleBeforeReplace = useCallback(() => {
        takeSnapshot(nodesRef.current, edgesRef.current);
    }, [takeSnapshot, nodesRef, edgesRef]);

    // 🚀 P2 性能优化：稳定的 onInit 回调，避?CanvasShell memo 失效
    const handleReactFlowInit = useCallback((instance: ReactFlowInstance<any, any>) => {
        setReactFlowInstance(instance as unknown as ReactFlowInstance);
        // 初始化后延迟 dispatch 'fit'，执行工业标准真理居中，等待节点测量完成
        setTimeout(() => {
            const currentNodes = instance.getNodes();
            if (currentNodes.length > 0) {
                dispatchDiagramControl('fit', id);
            }
        }, 250);
    }, [id]);

    const handleAddStickyNote = useCallback(() => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        const vp = readDomViewport();
        const container = document.querySelector('.react-flow') as HTMLElement | null;
        const cw = container ? container.getBoundingClientRect().width : window.innerWidth;
        const ch = container ? container.getBoundingClientRect().height : window.innerHeight;
        
        // Random slight offset for consecutive additions
        const offset = Math.floor(Math.random() * 40) - 20;

        const centerX = (cw / 2 - vp.x) / vp.zoom + offset;
        const centerY = (ch / 2 - vp.y) / vp.zoom + offset;
        
        const newNode: Node = {
            id: `sticky-${Date.now()}`,
            type: 'sticky-note',
            position: { x: centerX - 100, y: centerY - 100 },
            data: { label: '', noteColor: 'yellow', layer: activeLayerId, isEditing: true },
            style: { width: 200, height: 200 },
            zIndex: 1000, // Post-its should always float above normal diagrams
        };
        
        setNodes((nds) => [...nds, newNode]);
    }, [reactFlowInstance, setNodes, takeSnapshot, activeLayerId]);

    const handleAddMindMap = useCallback(() => {
        if (!reactFlowInstance) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        const vp = readDomViewport();
        const container = document.querySelector('.react-flow') as HTMLElement | null;
        const cw = container ? container.getBoundingClientRect().width : window.innerWidth;
        const ch = container ? container.getBoundingClientRect().height : window.innerHeight;
        
        const centerX = (cw / 2 - vp.x) / vp.zoom;
        const centerY = (ch / 2 - vp.y) / vp.zoom;
        
        const newNode: Node = {
            id: `mindmap-${Date.now()}`,
            type: 'mindmap',
            position: { x: centerX - 60, y: centerY - 20 },
            data: { label: '中心主题', layer: activeLayerId, isEditing: true },
            style: { width: 120, height: 40 },
        };
        
        setNodes((nds) => [...nds, newNode]);
    }, [reactFlowInstance, setNodes, takeSnapshot, activeLayerId]);

    // 3.5 Collaboration Events (Phase 9)
    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        if (!reactFlowInstance) return;
        const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        if (updateLocalCursor) updateLocalCursor(position);
    }, [reactFlowInstance, updateLocalCursor]);

    const onPaneMouseLeave = useCallback(() => {
        if (updateLocalCursor) updateLocalCursor(null);
    }, [updateLocalCursor]);

    // 🚀 P3 性能优化：稳定的边回调对象，通过 Context 传?
    const edgeCallbacks = useMemo(() => ({
        onLabelOffsetChange: handleLabelOffsetChange,
        onLabelStyleChange: handleLabelStyleChange,
        onWaypointsChange: handleWaypointsChange,
        onLabelChange: handleEdgeLabelChange,
    }), [handleLabelOffsetChange, handleLabelStyleChange, handleWaypointsChange, handleEdgeLabelChange]);

    const handleWrappedCloudSave = useCallback(async () => {
        if (activePlugin?.onDataSync) {
            activePlugin.onDataSync(nodesRef.current, edgesRef.current, false, pluginCtx);
        }
        if (onCloudSave) {
            await onCloudSave();
        }
    }, [activePlugin, pluginCtx, onCloudSave]);

    const handleWrappedDirectSave = useCallback(async () => {
        if (activePlugin?.onDataSync) {
            activePlugin.onDataSync(nodesRef.current, edgesRef.current, false, pluginCtx);
        }
        if (onDirectSave) {
            await onDirectSave();
        }
    }, [activePlugin, pluginCtx, onDirectSave]);

    return (
        <EdgeUpdateProvider callbacks={edgeCallbacks}>
            <NodeUpdateProvider updateNodesBatch={updateNodesBatch} businessData={businessData}>
                {(() => {
                    const actualLeftOffset = isSidebarHidden ? 0 : (leftDrawerOpen ? 64 + leftDrawerWidth : 64);
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
                            accept=".json,.mmd,.mermaid"
                            onChange={handleImport}
                            aria-label={t('designer.toolbar.import')}
                            title={t('designer.toolbar.import')}
                        />
                    }
                    leftSidebar={
                        (() => {
                            const pluginPanels = (activePlugin?.contributeSidebarPanels && pluginCtx) ? activePlugin.contributeSidebarPanels(pluginCtx) : [];
                            if (isSidebarHidden) return null;
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
                        })()
                    }

                    canvasArea={
                        <>
                        {/* Canvas Rulers */}
                        {showRuler && (
                            <>
                                <CanvasRuler orientation="horizontal" isDarkMode={theme?.mode === 'dark'} />
                                <CanvasRuler orientation="vertical" isDarkMode={theme?.mode === 'dark'} />
                                <RulerCorner isDarkMode={theme?.mode === 'dark'} />
                            </>
                        )}

                        <FlowchartOnboardingHint
                            visible={!onboardingDismissed && nodes.length <= 1 && edges.length === 0 && !jsonEditorVisible && selectedNodes.length === 0 && selectedEdges.length === 0}
                            mod={/Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'}
                            onOpenCommandPalette={() => setCommandPaletteVisible(true)}
                            onDismiss={() => {
                                setOnboardingDismissed(true);
                                try { localStorage.setItem('designer.flowchart.onboarding.dismissed', '1'); } catch { void 0; }
                            }}
                        />
                        <FlowchartEmptyState 
                            visible={nodes.length === 0 && !jsonEditorVisible && !isDragging && !isConnecting && !quickAddMenu?.visible}
                        />
                        <div ref={reactFlowWrapper} style={{ position: 'relative', height: '100%' }}>
                            <ContextMenuLayer onAction={handleContextMenuAction} activePlugin={activePlugin} pluginCtx={pluginCtx} />
                            
                            <DesignerHeaderLayer
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
                                                { nodes, edges }
                                            );
                                            setDiffResult(result);
                                        } else {
                                            message.info('没有历史记录可以对比');
                                        }
                                    },
                                    onShowHistory: () => setHistoryPanelVisible(prev => !prev),
                                    onSaveToCloud: onCloudSave ? handleWrappedCloudSave : undefined,
                                    onDirectSave: onDirectSave ? handleWrappedDirectSave : undefined,
                                    isDirectSaveDisabled: isDirectSaveDisabled,
                                    onShare: onOpenShareDialog,
                                    rightOffset: rightSidebarWidth,
                                    extraExportItems: extraExportItems,
                                    isYjsSynced: isYjsSynced,
                                    isReadonly: isReadonly,
                                    onReadonlyChange: handleReadonlyChange,
                                    onOpenSettings: handleOpenSettings,
                                    onSmartOptimize: handleSmartOptimize,
                                    activeUsers: activeUsers, // ⭐ GAP-02
                                    highlightMainFlow: highlightMainFlow,
                                    handleToggleHighlightMainFlow: handleToggleHighlightMainFlow,
                                    showOnlyMainFlow: showOnlyMainFlow,
                                    handleToggleShowOnlyMainFlow: handleToggleShowOnlyMainFlow,
                                    topActionArea,
                                    // ?Phase 10
                                    exportModalVisible: exportModalVisible,
                                    setExportModalVisible: setExportModalVisible,
                                    pluginManagerVisible: pluginManagerVisible,
                                    setPluginManagerVisible: setPluginManagerVisible,
                                    isCommentMode: isCommentMode,
                                    setIsCommentMode: setIsCommentMode,
                                    pluginToolbar: (() => {
                                        if (!pluginCtx || !activePlugin) return null; // Guard: ctx/plugin not ready on first render
                                        return activePlugin?.contributeToolbar ? activePlugin.contributeToolbar(pluginCtx) : null;
                                    })()
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
                                    toggleRuler: () => setShowRuler(prev => !prev),
                                    showMinimap,
                                    toggleMinimap: () => setShowMinimap(prev => !prev),
                                    showAiCrown,
                                    onToggleAI: () => {
                                        if (onAiTabIntercept && !onAiTabIntercept()) {
                                            return;
                                        }
                                        if (activeRightTab !== 'ai') {
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
                                    onToggleSnap: () => setSnapEnabled(s => !s),
                                    hideZoomControls: activePlugin?.hideZoomControls,
                                    hideLayoutControls: activePlugin?.hideLayoutControls,
                                    hideGridControls: activePlugin?.hideGridControls,
                                    hideFlowFocusControls: activePlugin?.hideFlowFocusControls,
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
                                }}
                            />

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
                                        onPaneClick={() => handlePaneClick({ clientX: 0, clientY: 0 } as any)}
                                        onPaneDoubleClick={onPaneDoubleClick}
                                        onNodeContextMenu={onNodeContextMenu}
                                        onEdgeContextMenu={onEdgeContextMenu}
                                        onPaneContextMenu={onPaneContextMenu}
                                        onNodeDragStart={wrappedOnNodeDragStart}
                                        onNodeDrag={onNodeDrag}
                                        onNodeDragStop={onNodeDragStop}
                                        onReconnect={handleReconnect}
                                        onReconnectStart={handleReconnectStart}
                                        onReconnectEnd={handleReconnectEnd}
                                        autoRoutingEnabled={autoRoutingEnabled}
                                        enableSmartEdges={true}
                                        showMinimap={showMinimap}
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
                                        <DesignerCanvasFeaturesLayer
                                            quickConnect={{
                                                visible: !!quickAddMenu?.visible,
                                                x: quickAddMenu?.clientX || 0,
                                                y: quickAddMenu?.clientY || 0,
                                                sourceNodeId: quickAddMenu?.sourceNodeId,
                                                onSelect: handleAddNode,
                                                onClose: closeMenu,
                                                onPreview: setQuickConnectPreview
                                            }}
                                            hoverToolbar={{
                                                nodeTypes: dynamicNodeTypes,
                                                pluginCtx,
                                                activePlugin,
                                                quickAddMenuVisible: !!quickAddMenu?.visible,
                                                isContextToolbarHidden,
                                                isConnecting,
                                                updateNodesBatch,
                                                updateEdgesBatch,
                                                onUpdateNodes: (updates) => {
                                                    takeSnapshot(nodesRef.current, edgesRef.current);
                                                    setNodes(nds => nds.map(n => {
                                                        const u = updates.find(update => update.id === n.id);
                                                        return (u && u.position) ? { ...n, position: u.position } : n;
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
                                                hasCopiedStyle
                                            }}
                                            smartGuides={{ guides }}
                                            annotations={{
                                                items: annotations,
                                                mode: annotationMode,
                                                onAdd: (ann: any) => addAnnotation(ann.x, ann.y, ann.label || ann.text),
                                                onUpdate: updateAnnotation,
                                                onDelete: deleteAnnotation,
                                                onToggleResolved: toggleResolved,
                                                activePageId: multiPage.activePageId,
                                                colors: ANNOTATION_COLORS
                                            }}
                                            pages={{
                                                items: multiPage.pages,
                                                activePageId: multiPage.activePageId,
                                                onSwitchPage: multiPage.switchPage,
                                                onAddPage: multiPage.addPage,
                                                onDeletePage: multiPage.deletePage,
                                                onRenamePage: multiPage.renamePage
                                            }}
                                            history={{
                                                visible: historyPanelVisible,
                                                onClose: () => setHistoryPanelVisible(false),
                                                pastEntries: pastEntries || [],
                                                canUndo,
                                                canRedo,
                                                onUndo: undo,
                                                onRedo: redo,
                                                onJumpTo: jumpTo
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
                                        />
                                        <FreehandDrawingLayer 
                                            isDrawingMode={isDrawingMode} 
                                            zoom={viewport.zoom} 
                                            pan={{ x: viewport.x, y: viewport.y }} 
                                            currentColor={preset.name === 'sketch' ? '#555555' : '#000000'}
                                        />
                                        {(() => {
                                            if (!pluginCtx || !activePlugin) return null;
                                            return activePlugin?.contributeCanvasComponents ? activePlugin.contributeCanvasComponents(pluginCtx) : null;
                                        })()}
                                        {activeUsers.length > 0 && yAwareness && (
                                            <LiveCursors activeUsers={activeUsers} yAwareness={yAwareness} />
                                        )}
                                    </FlowchartCanvasShell>
                                </div>
                            </LayoutStabilityContext.Provider>
                        </div>
                        </>
                    }
                    rightSidebar={
                        (() => {
                            const ctx: PluginContext = pluginCtx;
                            return (
                                <DesignerRightSidebar
                                    activeTab={activeRightTab}
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
                                    pluginCtx={ctx}
                                    isMobile={isMobile}
                                />
                            );
                        })()
                    }
                    overlays={
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
                                initialContent: jsonEditorInitialContent
                            }}
                            commandPalette={{
                                visible: commandPaletteVisible,
                                setVisible: setCommandPaletteVisible,
                                items: commandPaletteItems
                            }}
                            shortcuts={{
                                panelVisible: shortcutHelpVisible,
                                setPanelVisible: setShortcutHelpVisible,
                                modalVisible: showShortcuts,
                                setModalVisible: setShowShortcutsModal
                            }}
                            status={{
                                saveState,
                                showPerformanceDashboard: !!showPerformanceDashboard,
                                nodeCount: nodes.length,
                                edgeCount: edges.length
                            }}
                            presentation={{
                                active: presentationActive,
                                setActive: setPresentationActive,
                                slides: presentationSlides,
                                onFocusNodes: handlePresentationFocus
                            }}
                            diff={{
                                result: diffResult,
                                setResult: setDiffResult
                            }}
                            renderAIConfigModal={renderAIConfigModal}
                            renderShareDialog={renderShareDialog}
                        />
                        {/* GAP-05: Version History Panel Wrapper */}
                        <VersionHistoryPanel
                            diagramId={id || 'default-diagram'}
                            isOpen={isVersionHistoryOpen}
                            onClose={() => {
                                if (onVersionHistoryClose) onVersionHistoryClose();
                            }}
                        />

                        {/* 激光笔 — 演示模式下 L 键切换 */}
                        <LaserPointer active={presentationActive && laserEnabled} />

                        {/* GAP-11 Phase 2: Mobile Interaction Excellence Layer */}
                        {isMobile && (
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
                                onLayerClick={() => {
                                    setLeftDrawerOpen(true);
                                    // Optionally jump to layer tab in rail
                                }}
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
                                onSettingsClick={handleOpenSettings}
                            />
                        )}
                        </>
                    }
                />
                    );
                })()}
            </NodeUpdateProvider>
        </EdgeUpdateProvider>
    );
};

export default FlowchartDesigner;
