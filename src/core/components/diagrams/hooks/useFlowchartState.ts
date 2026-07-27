import { useCallback, useEffect, useRef } from 'react';
import {
    Edge,
    NodeChange,
    EdgeChange,
    Connection,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    MarkerType,
} from '@xyflow/react';
import { useDiagramHistory } from '../../../hooks/useDiagramHistory';
import { useDiagramStylePreset_v2 } from '../../../hooks/useDiagramStylePreset_v2';
import { useDiagramStore } from '../../../store/useDiagramStore';

export const useFlowchartState = (edgeMode: 'advanced-smart' | 'native' = 'advanced-smart') => {
    const nodes = useDiagramStore(state => state.nodes);
    const edges = useDiagramStore(state => state.edges);
    const setNodes = useDiagramStore(state => state.setNodes);
    const setEdges = useDiagramStore(state => state.setEdges);

    // Empty state fallback is now exclusively handled by useDesignerSystemSync via PluginRegistry
    // and correctly sequenced AFTER ELK layout resolution to prevent 'Start' node race conditions.

    // 🚀 Ref 模式：避免回调捕获旧值
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);

    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

    // History
    const {
        takeSnapshot,
        notifyHistoryChanged,
        undo,
        redo,
        canUndo,
        canRedo,
        pastEntries,
        jumpTo,
        getPreviousState,
    } = useDiagramHistory(nodes, edges);

    // Presets
    const preset = useDiagramStylePreset_v2();

    // Track resizing state to prevent history flooding
    const isResizingRef = useRef(false);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            let shouldSnapshot = false;

            // Check for deletions
            const deletedNodeIds = changes.flatMap(change => change.type === 'remove' ? [change.id] : []);
            if (deletedNodeIds.length > 0) {
                shouldSnapshot = true;
                
                // Smart Deletion for Mind Maps (Delete & Heal)
                const newEdgesToAdd: Edge[] = [];
                deletedNodeIds.forEach(id => {
                    const node = nodesRef.current.find(n => n.id === id);
                    if (node?.type === 'mindmap' && !node.data.isMindMapRoot) {
                        const parentEdge = edgesRef.current.find(e => e.target === id);
                        if (parentEdge) {
                            const parentId = parentEdge.source;
                            const childEdges = edgesRef.current.filter(e => e.source === id);
                            childEdges.forEach(ce => {
                                if (!deletedNodeIds.includes(ce.target)) {
                                    newEdgesToAdd.push({
                                        id: `edge_${parentId}_${ce.target}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                                        source: parentId,
                                        target: ce.target,
                                        type: ce.type || 'advanced-smart-step',
                                        style: ce.style,
                                        data: ce.data,
                                        markerEnd: ce.markerEnd
                                    });
                                }
                            });
                        }
                    }
                });
                if (newEdgesToAdd.length > 0) {
                    setEdges(eds => [...eds, ...newEdgesToAdd]);
                }
            }

            // Check for dimension changes (resizing)
            const isCurrentlyResizing = changes.some(change => change.type === 'dimensions' && change.resizing);
            
            if (isCurrentlyResizing && !isResizingRef.current) {
                // Just started resizing -> take a snapshot of the BEFORE state
                shouldSnapshot = true;
            }
            
            isResizingRef.current = isCurrentlyResizing;

            if (shouldSnapshot) {
                takeSnapshot(nodesRef.current, edgesRef.current);
            }

            setNodes((nds) => applyNodeChanges(changes, nds));
        },
        [setEdges, setNodes, takeSnapshot],
    );

    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const shouldSnapshot = changes.some(change => change.type === 'remove');
            if (shouldSnapshot) {
                takeSnapshot(nodesRef.current, edgesRef.current);
            }
            setEdges((eds) => applyEdgeChanges(changes, eds));
        },
        [setEdges, takeSnapshot],
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            // Self-loop prevention
            if (connection.source === connection.target) return;

            takeSnapshot(nodesRef.current, edgesRef.current); // 🚀 使用 ref 避免 stale closure

            // Apply global preset styles to the new edge
            const edgeToken = preset.edges.main;

            // Check if this is a relationship edge (from mind map)
            const isRelationship = connection.sourceHandle?.includes('relationship') || connection.targetHandle?.includes('relationship');

            // Default Style
            const defaultStyle = {
                type: isRelationship ? 'relationshipEdge' : (edgeMode === 'native' ? 'smoothstep' : 'advanced-smart-step'),
                style: {
                    stroke: edgeToken.color,
                    strokeWidth: edgeToken.width,
                    strokeDasharray: isRelationship ? '5,5' : edgeToken.dash,
                },
                markerEnd: isRelationship ? undefined : {
                    type: MarkerType.ArrowClosed,
                    color: edgeToken.color,
                    width: edgeToken.arrow.width,
                    height: edgeToken.arrow.height,
                }
            };

            // 🔥 决策节点出边自动标签
            let autoLabel: string | undefined;
            const sourceNode = nodesRef.current.find(n => n.id === connection.source);
            const sourceShape = (sourceNode?.data as Record<string, unknown>)?.shape;
            if (sourceShape === 'diamond') {
                const existingOutEdges = edgesRef.current.filter(e => e.source === connection.source);
                const labels = ['Yes', 'No'];
                const idx = existingOutEdges.length;
                if (idx < labels.length) {
                    autoLabel = labels[idx];
                }
            }

            setEdges((eds) => addEdge({
                ...connection,
                ...defaultStyle,
                ...(autoLabel ? { label: autoLabel } : {}),
                data: {
                    manualHandles: true,
                    auto: []
                },
            }, eds));
        },
        [edgeMode, preset, setEdges, takeSnapshot],
    );

    const handleUndo = useCallback(() => {
        const prevState = undo(nodesRef.current, edgesRef.current); // 🚀 ref
        if (prevState) { setNodes(prevState.nodes); setEdges(prevState.edges); }
    }, [setEdges, setNodes, undo]);

    const handleRedo = useCallback(() => {
        const nextState = redo(nodesRef.current, edgesRef.current); // 🚀 ref
        if (nextState) { setNodes(nextState.nodes); setEdges(nextState.edges); }
    }, [redo, setEdges, setNodes]);

    return {
        nodes,
        setNodes,
        edges,
        setEdges,
        nodesRef,
        edgesRef,
        onNodesChange,
        onEdgesChange,
        onConnect,
        diagramHistory: {
            takeSnapshot,
            notifyHistoryChanged,
            undo: handleUndo,
            redo: handleRedo,
            canUndo,
            canRedo,
            pastEntries,
            jumpTo: (index: number) => {
                const target = jumpTo(index, nodesRef.current, edgesRef.current);
                if (target) { setNodes(target.nodes); setEdges(target.edges); }
            },
            getPreviousState
        }
    };
};
