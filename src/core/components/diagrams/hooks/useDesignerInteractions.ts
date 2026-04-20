import { useCallback, useRef, useState, useMemo } from 'react';
import { Node, Edge, Connection, reconnectEdge, SelectionMode, MarkerType } from '@xyflow/react';
import { useLayerManagement } from './useLayerManagement';
import { useLayeredVirtualization } from './useLayeredVirtualization';
import { useDesignerEdgeCallbacks } from './useDesignerEdgeCallbacks';
import { useDiagramDragDrop } from './useDiagramDragDrop';
import { useGrouping } from './useGrouping';
import { useSmartGuides } from '../../../hooks/useSmartGuides';
import { useAlignment } from './useAlignment';
import { useStylePainter } from './useStylePainter';
import { useNodeTemplates } from './useNodeTemplates';
import { useDiagramStore } from '../../../store/useDiagramStore';
import { useQuickAdd } from './useQuickAdd';
import { useDesignerGhostNodes } from './useDesignerGhostNodes';
import { useConnectionMicrointeractions } from './useConnectionMicrointeractions';
import { useConnectionValidation } from './useConnectionValidation';

export interface UseDesignerInteractionsProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: any;
    setEdges: any;
    selectedNodes: Node[];
    setSelectedNodes: any;
    takeSnapshot: any;
    reactFlowInstance: any;
    isDragging: boolean;
    setIsDragging: (val: boolean) => void;
    activePlugin: any;
    pluginCtx: any;
    onNodesChange: any;
    onEdgesChange: any;
    virtualizedNodes: any;
    edgesWithCollapseState: any;
    onConnect: any;
    preset: any;
    showOnlyMainFlow: boolean;
    highlightMainFlow: boolean;
    
    // Lifted Layer Management Props
    layers: any[];
    activeLayerId: string | null;
    setActiveLayerId: any;
    createLayer: any;
    deleteLayer: any;
    toggleVisibility: any;
    toggleLock: any;
    renameLayer: any;
    reorderLayers: any;
    getLayer: any;
    setLayerColor: any;
}

export function useDesignerInteractions({
    nodes, edges, setNodes, setEdges,
    selectedNodes, setSelectedNodes,
    takeSnapshot, reactFlowInstance,
    isDragging, setIsDragging,
    activePlugin, pluginCtx,
    onNodesChange, onEdgesChange,
    virtualizedNodes, edgesWithCollapseState,
    onConnect, preset,
    showOnlyMainFlow, highlightMainFlow,
    
    // Destructured Lifted Props
    layers, activeLayerId, setActiveLayerId, createLayer, deleteLayer,
    toggleVisibility, toggleLock, renameLayer, reorderLayers, getLayer, setLayerColor
}: UseDesignerInteractionsProps) {


    const {
        layerSyncedNodes,
        visibleEdges,
        onNodesChangeWithLock,
        onEdgesChangeWithLock
    } = useLayeredVirtualization({
        nodes, edges, virtualizedNodes,
        edgesWithCollapseState, layers, getLayer,
        isDragging, onNodesChange, onEdgesChange
    });

    const { handleLabelOffsetChange, handleLabelStyleChange, handleWaypointsChange, handleEdgeLabelChange } = useDesignerEdgeCallbacks(setEdges);
    const enhancedEdges = visibleEdges;

    const { handleGroup, handleUngroup } = useGrouping({
        nodes, edges, setNodes, selectedNodes, setSelectedNodes, takeSnapshot,
        defaultGroupLabel: '组件', defaultGroupDescription: '组件'
    });

    const [selectionMode] = useState<SelectionMode>(SelectionMode.Partial);
    const [isMarqueeActive, setIsMarqueeActive] = useState<boolean>(false);
    const { guides, onSmartNodeDrag, clearGuides } = useSmartGuides();

    const { handleAlign, handleDistribute, canAlign, canDistribute } = useAlignment({
        selectedNodes,
        onUpdateNodes: (updates: any) => {
            takeSnapshot(nodes, edges);
            setNodes((nds: any) => {
                return nds.map((n: any) => {
                    const update = updates.find((u: any) => u.id === n.id);
                    return update ? { ...n, position: update.position } : n;
                });
            });
        }
    });

    const { hasCopiedStyle, copyStyle, pasteStyle } = useStylePainter(setNodes);

    const { templates, groupedTemplates, saveAsTemplate, saveGroupAsTemplate, createFromTemplate, deleteTemplate, renameTemplate } = useNodeTemplates(activeLayerId);
    
    // ⭐ [GAP-02] 使用统一协作 Store 替代本地 Annotations
    const comments = useDiagramStore(state => state.comments);
    const annotationMode = useDiagramStore(state => state.isCommentMode);
    const addComment = useDiagramStore(state => state.addComment);
    const updateComment = useDiagramStore(state => state.updateComment);
    const removeComment = useDiagramStore(state => state.removeComment);
    const setIsCommentMode = useDiagramStore(state => state.setIsCommentMode);
    
    const ANNOTATION_COLORS = ['#facc15', '#f87171', '#60a5fa', '#34d399', '#c084fc', '#fb923c'];

    const getEdgeDefaults = useCallback(() => {
        const edgeToken = preset.edges.main;
        return {
            style: { stroke: edgeToken.color, strokeWidth: edgeToken.width, strokeDasharray: edgeToken.dash },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeToken.color, width: edgeToken.arrow.width, height: edgeToken.arrow.height }
        };
    }, [preset]);

    const { quickAddMenu, onConnectEnd: quickAddOnConnectEnd, handleAddNode, closeMenu, openQuickAddMenu, getFlowPosition } = useQuickAdd(
        setNodes, setEdges, takeSnapshot, reactFlowInstance, getEdgeDefaults, nodes, edges, activeLayerId
    );

    const { setQuickConnectPreview, nodesWithGhost, edgesWithGhost } = useDesignerGhostNodes({
        layerSyncedNodes, enhancedEdges, quickAddMenu, getFlowPosition
    });

    const isMainEdge = useCallback((e: Edge) => {
        const data = e.data as any;
        const k1 = String(data?.edgeType ?? '').toLowerCase();
        const k2 = String(data?.kind ?? '').toLowerCase();
        return k1 === 'main' || k1.includes('main') || k1 === 'core' || k1.includes('core') ||
               k2 === 'main' || k2.includes('main') || k2.includes('core') || k2.includes('core');
    }, []);

    const finalEdgesWithGhost = useMemo(() => {
        if (!showOnlyMainFlow && !highlightMainFlow) return edgesWithGhost;
        const base = showOnlyMainFlow ? edgesWithGhost.filter(isMainEdge) : edgesWithGhost;
        return base.map((e: any) => {
            if (highlightMainFlow && isMainEdge(e)) return { ...e, animated: true };
            return e;
        });
    }, [edgesWithGhost, showOnlyMainFlow, highlightMainFlow, isMainEdge]);

    const { isConnecting, connectPreview, onConnectStart, enhancedOnConnect, enhancedOnConnectEnd } = useConnectionMicrointeractions({
        nodes, setEdges, onConnect, onConnectEnd: quickAddOnConnectEnd, reactFlowInstance
    });

    const { isValidConnection } = useConnectionValidation(nodes, edges, pluginCtx, activePlugin, {});

    const handleReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
        takeSnapshot(nodes, edges);
        setEdges((eds: any) => reconnectEdge(oldEdge, newConnection, eds));
    }, [setEdges, takeSnapshot, nodes, edges]);

    const handleReconnectStart = useCallback((_event: any, edge: Edge, handleType: 'source' | 'target') => {}, []);
    const handleReconnectEnd = useCallback((_event: any, edge: Edge) => {}, []);

    const { onDragOver, onDrop, onNodeDragStart, onNodeDrag, onNodeDragStop: originalOnNodeDragStop } = useDiagramDragDrop({
        nodes, edges, setNodes, setEdges, takeSnapshot, reactFlowInstance, setIsDragging, onSmartNodeDrag, clearGuides,
        enableAltDuplicate: false, isConnecting, activeLayerId
    });

    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const nodeAnimationTimerRef = useRef<NodeJS.Timeout | null>(null);

    const wrappedOnNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
        setIsDraggingNode(true);
        if (typeof document !== 'undefined') {
            document.body.classList.add('performance-mode');
        }
        onNodeDragStart(event, node);
    }, [onNodeDragStart]);

    const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node, matchedNodes: Node[]) => {
        originalOnNodeDragStop(event, node, matchedNodes);
        if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);

        const droppedEl = document.querySelector(`[data-id="${node.id}"]`);
        droppedEl?.classList.add('just-dropped');

        nodeAnimationTimerRef.current = setTimeout(() => {
            const el = document.querySelector(`[data-id="${node.id}"]`);
            if (el) el.classList.remove('just-dropped');
            nodeAnimationTimerRef.current = null;
        }, 300);

        setIsDraggingNode(false);
        if (typeof document !== 'undefined') {
            document.body.classList.remove('performance-mode');
        }
    }, [originalOnNodeDragStop]);

    return {
        layers, activeLayerId, setActiveLayerId, createLayer, deleteLayer, toggleVisibility, toggleLock, renameLayer, reorderLayers, getLayer, setLayerColor,
        layerSyncedNodes, visibleEdges, onNodesChangeWithLock, onEdgesChangeWithLock,
        handleLabelOffsetChange, handleLabelStyleChange, handleWaypointsChange, handleEdgeLabelChange,
        handleGroup, handleUngroup,
        selectionMode, isMarqueeActive, setIsMarqueeActive,
        guides, clearGuides,
        handleAlign, handleDistribute, canAlign, canDistribute,
        hasCopiedStyle, copyStyle, pasteStyle,
        templates, groupedTemplates, saveAsTemplate, saveGroupAsTemplate, createFromTemplate, deleteTemplate, renameTemplate,
        annotations: comments, // 映射到旧名称以减少 FlowchartDesigner 的改动
        annotationMode, 
        addAnnotation: (x: number, y: number, text: string) => {
            const user = useDiagramStore.getState().user;
            addComment({
                id: `comment-${Date.now()}`,
                x, y,
                authorId: user.id,
                authorName: user.name,
                authorColor: user.color,
                content: text,
                createdAt: Date.now(),
                isResolved: false,
                color: ANNOTATION_COLORS[0],
                replies: []
            });
        },
        updateAnnotation: (id: string, updates: any) => updateComment(id, updates),
        deleteAnnotation: (id: string) => removeComment(id),
        toggleResolved: (id: string) => {
            const c = comments.find(x => x.id === id);
            if (c) updateComment(id, { isResolved: !c.isResolved });
        },
        ANNOTATION_COLORS,
        quickAddMenu, handleAddNode, closeMenu, openQuickAddMenu, getFlowPosition,
        setQuickConnectPreview, nodesWithGhost, finalEdgesWithGhost,
        isConnecting, connectPreview, onConnectStart, enhancedOnConnect, enhancedOnConnectEnd,
        isValidConnection,
        handleReconnect, handleReconnectStart, handleReconnectEnd,
        onDragOver, onDrop, wrappedOnNodeDragStart, onNodeDrag, onNodeDragStop,
        isDraggingNode
    };
}
