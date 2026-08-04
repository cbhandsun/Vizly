import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Node, Edge, Connection, reconnectEdge, SelectionMode, MarkerType, type EdgeChange, type NodeChange, type OnConnect, type ReactFlowInstance } from '@xyflow/react';
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
import type { DiagramTypePlugin, PluginContext } from '../../../types/plugin';
import type { FlowStylePreset } from '../../shared/DiagramStyleManager';
import type { LayerConfig } from './useLayerManagement';
import type { CommentThread } from '../../../store/useDiagramStore';
import type { HistorySnapshotOptions } from '../../../hooks/useDiagramHistory';

export interface UseDesignerInteractionsProps {
    nodes: Node[];
    edges: Edge[];
    nodesRef: React.MutableRefObject<Node[]>;
    edgesRef: React.MutableRefObject<Edge[]>;
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodes: Node[];
    setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot: (
        nodes: Node[],
        edges: Edge[],
        label?: string,
        options?: HistorySnapshotOptions,
    ) => void;
    notifyHistoryChanged: () => void;
    reactFlowInstance: ReactFlowInstance | null;
    isDragging: boolean;
    setIsDragging: (val: boolean) => void;
    activePlugin?: DiagramTypePlugin;
    pluginCtx: PluginContext | null;
    onNodesChange: (changes: NodeChange<Node>[]) => void;
    onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
    virtualizedNodes: Node[];
    edgesWithCollapseState: Edge[];
    onConnect: OnConnect;
    preset: FlowStylePreset;
    showOnlyMainFlow: boolean;
    highlightMainFlow: boolean;
    
    // Lifted Layer Management Props
    layers: LayerConfig[];
    activeLayerId: string | null;
    setActiveLayerId: (layerId: string) => void;
    createLayer: (name: string) => void;
    deleteLayer: (layerId: string) => void;
    toggleVisibility: (layerId: string) => void;
    toggleLock: (layerId: string) => void;
    renameLayer: (layerId: string, name: string) => void;
    reorderLayers: (fromIndex: number, toIndex: number) => void;
    getLayer: (layerId: string) => LayerConfig | undefined;
    setLayerColor: (layerId: string, color: string | undefined) => void;
}

const ANNOTATION_COLORS = ['#facc15', '#f87171', '#60a5fa', '#34d399', '#c084fc', '#fb923c'];

export function useDesignerInteractions({
    nodes, edges, nodesRef, edgesRef, setNodes, setEdges,
    selectedNodes, setSelectedNodes,
    takeSnapshot, notifyHistoryChanged, reactFlowInstance,
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

    const normalizedActiveLayerId = activeLayerId ?? undefined;


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
        nodes, edges, nodesRef, edgesRef, setNodes, setEdges, selectedNodes, setSelectedNodes, takeSnapshot,
        defaultGroupLabel: '组件', defaultGroupDescription: '组件'
    });

    const [selectionMode] = useState<SelectionMode>(SelectionMode.Partial);
    const [isMarqueeActive, setIsMarqueeActive] = useState<boolean>(false);
    const { guides, onSmartNodeDrag, clearGuides, snapDeltaRef } = useSmartGuides();

    const { handleAlign, handleDistribute, canAlign, canDistribute } = useAlignment({
        selectedNodes,
        onUpdateNodes: (updates) => {
            takeSnapshot(nodes, edges);
            setNodes((nds) => {
                return nds.map((n) => {
                    const update = updates.find((candidate) => candidate.id === n.id);
                    return update ? { ...n, position: update.position } : n;
                });
            });
        }
    });

    const { hasCopiedStyle, copyStyle, pasteStyle } = useStylePainter(setNodes);

    const { templates, groupedTemplates, saveAsTemplate, saveGroupAsTemplate, createFromTemplate, deleteTemplate, renameTemplate } = useNodeTemplates(normalizedActiveLayerId);
    
    // ⭐ [GAP-02] 使用统一协作 Store 替代本地 Annotations
    const comments = useDiagramStore(state => state.comments);
    const annotationMode = useDiagramStore(state => state.isCommentMode);
    const addComment = useDiagramStore(state => state.addComment);
    const updateComment = useDiagramStore(state => state.updateComment);
    const removeComment = useDiagramStore(state => state.removeComment);
    const _setIsCommentMode = useDiagramStore(state => state.setIsCommentMode);
    
    const getEdgeDefaults = useCallback(() => {
        const edgeToken = preset.edges.main;
        return {
            style: { stroke: edgeToken.color, strokeWidth: edgeToken.width, strokeDasharray: edgeToken.dash },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeToken.color, width: edgeToken.arrow.width, height: edgeToken.arrow.height }
        };
    }, [preset]);

    const { quickAddMenu, onConnectEnd: quickAddOnConnectEnd, handleAddNode, closeMenu, openQuickAddMenu, getFlowPosition } = useQuickAdd(
        setNodes, setEdges, takeSnapshot, reactFlowInstance, getEdgeDefaults, nodes, edges, normalizedActiveLayerId
    );

    const { setQuickConnectPreview, nodesWithGhost, edgesWithGhost } = useDesignerGhostNodes({
        layerSyncedNodes, enhancedEdges, quickAddMenu, getFlowPosition
    });

    const isMainEdge = useCallback((e: Edge) => {
        const k1 = String(e.data?.edgeType ?? '').toLowerCase();
        const k2 = String(e.data?.kind ?? '').toLowerCase();
        return k1 === 'main' || k1.includes('main') || k1 === 'core' || k1.includes('core') ||
               k2 === 'main' || k2.includes('main') || k2.includes('core') || k2.includes('core');
    }, []);

    const finalEdgesWithGhost = useMemo(() => {
        if (!showOnlyMainFlow && !highlightMainFlow) return edgesWithGhost;
        const base = showOnlyMainFlow ? edgesWithGhost.filter(isMainEdge) : edgesWithGhost;
        return base.map((e) => {
            if (highlightMainFlow && isMainEdge(e)) return { ...e, animated: true };
            return e;
        });
    }, [edgesWithGhost, showOnlyMainFlow, highlightMainFlow, isMainEdge]);

    const { isConnecting, connectPreview, onConnectStart, enhancedOnConnect, enhancedOnConnectEnd } = useConnectionMicrointeractions({
        nodes, setEdges, onConnect, onConnectEnd: quickAddOnConnectEnd, reactFlowInstance
    });

    const { isValidConnection } = useConnectionValidation(
        nodes,
        edges,
        pluginCtx ?? undefined,
        activePlugin,
        {},
    );

    const reconnectNodesRef = useRef(nodes);
    const reconnectEdgesRef = useRef(edges);
    useEffect(() => {
        reconnectNodesRef.current = nodes;
        reconnectEdgesRef.current = edges;
    }, [nodes, edges]);

    const handleReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
        takeSnapshot(reconnectNodesRef.current, reconnectEdgesRef.current);
        setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    }, [setEdges, takeSnapshot]);

    const handleReconnectStart = useCallback((_event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, _edge: Edge, _handleType: 'source' | 'target') => {}, []);
    const handleReconnectEnd = useCallback((_event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, _edge: Edge) => {}, []);

    const { onDragOver, onDrop, onNodeDragStart, onNodeDrag, onNodeDragStop: originalOnNodeDragStop } = useDiagramDragDrop({
        nodes, edges, setNodes, setEdges, takeSnapshot, notifyHistoryChanged, reactFlowInstance, setIsDragging, snapDeltaRef, clearGuides,
        enableAltDuplicate: false, isConnecting, activeLayerId: normalizedActiveLayerId
    });

    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const nodeAnimationTimerRef = useRef<NodeJS.Timeout | null>(null);

    const wrappedOnNodeDragStart = useCallback((event: MouseEvent | TouchEvent, node: Node) => {
        setIsDraggingNode(true);
        onNodeDragStart(event, node);
    }, [onNodeDragStart]);

    const onNodeDragStop = useCallback((event: MouseEvent | TouchEvent, node: Node, matchedNodes: Node[]) => {
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
    }, [originalOnNodeDragStop]);

    const addAnnotation = useCallback((x: number, y: number, text: string) => {
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
    }, [addComment]);

    const updateAnnotation = useCallback((id: string, updates: Partial<CommentThread>) => updateComment(id, updates), [updateComment]);
    const deleteAnnotation = useCallback((id: string) => removeComment(id), [removeComment]);
    const toggleResolved = useCallback((id: string) => {
        // 通过 getState() 避免将 comments 加入 deps，防止每条评论变化时重建回调
        const c = useDiagramStore.getState().comments.find((comment) => comment.id === id);
        if (c) updateComment(id, { isResolved: !c.isResolved });
    }, [updateComment]);

    return {
        layers, activeLayerId, setActiveLayerId, createLayer, deleteLayer, toggleVisibility, toggleLock, renameLayer, reorderLayers, getLayer, setLayerColor,
        layerSyncedNodes, visibleEdges, onNodesChangeWithLock, onEdgesChangeWithLock,
        handleLabelOffsetChange, handleLabelStyleChange, handleWaypointsChange, handleEdgeLabelChange,
        handleGroup, handleUngroup,
        selectionMode, isMarqueeActive, setIsMarqueeActive,
        guides, clearGuides, onSmartNodeDrag,
        handleAlign, handleDistribute, canAlign, canDistribute,
        hasCopiedStyle, copyStyle, pasteStyle,
        templates, groupedTemplates, saveAsTemplate, saveGroupAsTemplate, createFromTemplate, deleteTemplate, renameTemplate,
        annotations: comments,
        annotationMode,
        addAnnotation,
        updateAnnotation,
        deleteAnnotation,
        toggleResolved,
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
