import os
import re

file_path = "e:/DEV/WorkSpace/Antigravity-WS/DiagramView/packages/core/src/components/diagrams/FlowchartDesigner.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    original = f.read()

# 1. Update Imports
imports_to_add = """
import { useDesignerCanvasState } from './hooks/useDesignerCanvasState';
import { useDesignerInteractions } from './hooks/useDesignerInteractions';
import { useDesignerEventHandlers } from './hooks/useDesignerEventHandlers';
import { useDesignerSystemSync } from './hooks/useDesignerSystemSync';
"""

# Let's just prepend to the file right after the React imports
original = original.replace("import { DiagramComponentProps }", imports_to_add + "import { DiagramComponentProps }")

# 2. Extract block between useInteractionPerformance and handleReactFlowInit
start_marker = "useInteractionPerformance();"
end_marker = "// 🚀 P2 性能优化：稳定的 onInit 回调"

replacement_block = """
    // 1. State Domain Controller
    const {
        nodes, edges, setNodes, setEdges,
        onNodesChange, onEdgesChange,
        selectedNodes, setSelectedNodes,
        selectedEdges, setSelectedEdges,
        undo, redo, canUndo, canRedo, takeSnapshot,
        viewport, setViewport,
        diagramHistory
    } = useDesignerCanvasState({ edgeMode: internalEdgeMode, preset });

    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

    const { updateNodesBatch } = useDesignerBatchUpdates(setNodes, takeSnapshot);

    const [isSidebarHidden, setIsSidebarHidden] = useState(false);
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
    const [leftDrawerWidth, setLeftDrawerWidth] = useState(240);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(0);

    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [historyPanelVisible, setHistoryPanelVisible] = useState(false);
    const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
    const [presentationActive, setPresentationActive] = useState(false);
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
    const [diagramMetadata, setDiagramMetadata] = useState<any>(null);
    const [canvasSearchVisible, setCanvasSearchVisible] = useState(false);

    const [onboardingDismissed, setOnboardingDismissed] = useState(true);
    useEffect(() => {
        try { if (!localStorage.getItem('designer.flowchart.onboarding.dismissed')) setOnboardingDismissed(false); } catch { void 0; }
    }, []);

    const [showGrid, setShowGrid] = useState(true);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [showRuler, setShowRuler] = useState(false);
    const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Lines);
    useEffect(() => {
        if (theme?.diagram?.canvas?.grid?.style) {
            const style = theme.diagram.canvas.grid.style.toLowerCase();
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
            const ctx: PluginContext = {
                diagramId: id || 'default',
                nodesRef,
                edgesRef,
                setNodes,
                setEdges,
                reactFlowInstance,
                reactFlowWrapper
            };
            setPluginCtx(ctx);
            if (plugin.onInit) {
                plugin.onInit(ctx);
            }
        }
    }, [pluginId, id, setNodes, setEdges, reactFlowInstance]);

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
             setEdges(eds => reconnectEdge(undefined as any, params, eds));
        },
        preset, showOnlyMainFlow, highlightMainFlow
    });

    const {
        layers, activeLayerId, setActiveLayerId, createLayer, deleteLayer, toggleVisibility, toggleLock, renameLayer, reorderLayers, getLayer, setLayerColor,
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
        setQuickConnectPreview, nodesWithGhost, finalEdgesWithGhost: enhancedEdges,
        isConnecting, connectPreview, onConnectStart, enhancedOnConnect, enhancedOnConnectEnd,
        isValidConnection,
        handleReconnect, handleReconnectStart, handleReconnectEnd,
        onDragOver, onDrop, wrappedOnNodeDragStart: onNodeDragStart, onNodeDrag, onNodeDragStop,
        isDraggingNode
    } = interactionsParams;

    // 3. Event Handlers Domain Controller
    const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
    const [shortcutHelpVisible, setShortcutHelpVisible] = useState(false);

    const {
        onNodeContextMenu,
        onEdgeContextMenu,
        onPaneContextMenu,
        onPaneClick,
        handleContextMenuAction,
        handleSelectAll,
        handleFitView,
        handleBringToFront,
        handleSendToBack,
        isSpacePressed
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
        copyStyle, pasteStyle, hasCopiedStyle, saveAsTemplate
    });

    const { layoutContainer } = useContainerAutoLayout();

    // Features
    const { isMultiPageEnabled, activePageId, startMultiPage, switchPage, addNewPage, renamePage, closeMultipage, exportWholeDocument } = useMultiPage();

    const { isEnabled: isAutoRoutingEnabled, toggle: toggleAutoRouting, isLayoutStable, handleStrategyLayout, lastDomainStrategy, lastDomainDirection, lastNodeLayout } = useAutoRouting(setNodes, setEdges, nodesRef, edgesRef, takeSnapshot, reactFlowInstance);
    
    // Auto-Routing: Sync internal `autoRoutingEnabled` with the exposed edgeMode from config/topbar
    const setAutoRoutingEnabled = (val: boolean) => { if (val !== isAutoRoutingEnabled) toggleAutoRouting(); };
    useEffect(() => {
        if (internalEdgeMode === 'native') {
            setAutoRoutingEnabled(false);
        } else {
            setAutoRoutingEnabled(true);
        }
    }, [internalEdgeMode, setAutoRoutingEnabled]);

    const handleSmartLayout = useCallback(() => {
        const rec = recommendLayout(nodesRef.current, edgesRef.current);
        message.info(`推荐布局：${rec.reason}（置信度 ${Math.round(rec.confidence * 100)}%）`);
        handleStrategyLayout(rec.domainStrategy, rec.nodeLayout, rec.direction);
    }, [handleStrategyLayout]);


    const handleGridRotate = () => {
         const variants = [BackgroundVariant.Lines, BackgroundVariant.Dots, BackgroundVariant.Cross];
         const currentIndex = variants.indexOf(gridVariant);
         const nextVariant = variants[(currentIndex + 1) % variants.length];
         setGridVariant(nextVariant);
         setShowGrid(true);
    };

    const handleFocusNode = useCallback((nodeId: string) => {
        if (!reactFlowInstance) return;
        const node = nodesRef.current.find(n => n.id === nodeId);
        if (node) {
            reactFlowInstance.setCenter(node.position.x + (node.measured?.width || 100) / 2, node.position.y + (node.measured?.height || 50) / 2, { duration: 800, zoom: 1.2 });
            setSelectedNodes(nodesRef.current.filter(n => n.id === nodeId));
        }
    }, [reactFlowInstance, setSelectedNodes]);

    const handleExport = useCallback(() => setJsonEditorVisible(true), []);
    const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target?.result as string;
            if (file.name.endsWith('.json')) {
                try {
                    const data = JSON.parse(content);
                    if (data.nodes && data.edges) {
                        setNodes(data.nodes);
                        setEdges(data.edges);
                        message.info(`成功导入 ${data.nodes.length} 个节点和 ${data.edges.length} 条边`);
                        setTimeout(() => handleFitView(), 500);
                    } else { throw new Error('无效的数据格式'); }
                } catch (err: any) { message.error('JSON导入失败: ' + err.message); }
            } else if (file.name.endsWith('.txt') || file.name.endsWith('.mmd') || file.name.endsWith('.mermaid')) {
                try {
                     const { nodes: newNodes, edges: newEdges } = await fromMermaid(content);
                     setNodes(newNodes); setEdges(newEdges);
                     message.info('成功导入 Mermaid 文本');
                     setTimeout(() => {
                         message.info('建议点击"智能布局"整理节点');
                     }, 500);
                } catch(e:any) { message.error('Mermaid解析失败'); }
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, [setNodes, setEdges, handleFitView]);

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
    
    // AIChat visibility handling
    const [aiChatVisible, setAiChatVisible] = useState(false);
    const [activeRightTab, setActiveRightTab] = useState<'property' | 'ai'>('property');
    const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0;
    useEffect(() => {
        if (hasSelection) {
            setActiveRightTab('property');
        }
    }, [selectedNodes.length, selectedEdges.length]);
    useEffect(() => {
        const handleToggleAI = () => {
            setActiveRightTab(currentTab => {
                if (currentTab !== 'ai') {
                    setAiChatVisible(true);
                    return 'ai';
                } else {
                    setAiChatVisible(false);
                    return 'property';
                }
            });
        };
        window.addEventListener('designer:toggle-ai-chat', handleToggleAI);
        return () => window.removeEventListener('designer:toggle-ai-chat', handleToggleAI);
    }, []);

    const handleOpenJsonEditor = useCallback(() => setJsonEditorVisible(true), []);
    const setShowShortcuts = useCallback(() => setShortcutHelpVisible(true), []);


    // 4. System Sync Domain Controller
    const { performanceMode } = useDesignerSystemSync({
        id, diagramIdForExport, nodes, edges, setNodes, setEdges, reactFlowInstance, isDragging, pluginId
    });

    const { commandPaletteItems } = useDesignerCommands({
        reactFlowInstance, handleFitView, handleGridRotate, setAutoRoutingEnabled,
        canUndo, canRedo, undo, redo, handleSelectAll,
        handleExport, handleExportMermaid, handleCopyAsMermaid,
        fileInputRef, handleOpenJsonEditor,
        handleStrategyLayout, handleSmartLayout,
        setShowShortcuts, pluginCtx, activePlugin,
    });
"""

start_pos = original.find(start_marker)
end_pos = original.find(end_marker)

if start_pos != -1 and end_pos != -1:
    new_content = original[:start_pos + len(start_marker)] + "\n\n" + replacement_block + "\n\n    " + original[end_pos:]
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced the core orchestrator block!")
else:
    print("Could not find start or end markers. START:", start_pos, "END:", end_pos)
