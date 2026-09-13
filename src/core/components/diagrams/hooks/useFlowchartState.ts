import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Edge,
    NodeChange,
    EdgeChange,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';
import { useDiagramHistory } from '../../../hooks/useDiagramHistory';
import { useDiagramStore } from '../../../store/useDiagramStore';
import {
    resolveHistoryNodeFocusAfterChange,
    resolveUndoRestoredNodeFocusId,
    scheduleUndoRestoredNodeFocus,
    shouldFocusEmptyStateAfterRedo,
} from '../flowchartHistoryFocus';
import { scheduleFlowchartEmptyStateFocus } from '../flowchartDeletionFocus';

export const useFlowchartState = () => {
    const { t } = useTranslation();
    const nodes = useDiagramStore(state => state.nodes);
    const edges = useDiagramStore(state => state.edges);
    const setNodes = useDiagramStore(state => state.setNodes);
    const setEdges = useDiagramStore(state => state.setEdges);

    // Empty state fallback is now exclusively handled by useDesignerSystemSync via PluginRegistry
    // and correctly sequenced AFTER ELK layout resolution to prevent 'Start' node race conditions.

    // 🚀 Ref 模式：避免回调捕获旧值
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const historyFocusRequestRef = useRef<{ cancel: () => void } | null>(null);

    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

    useEffect(() => () => {
        historyFocusRequestRef.current?.cancel();
    }, []);

    // History
    const historyLabels = useMemo(() => ({
        getDefaultOperationLabel: (count: number) => t('designer.historyPanel.defaultOperation', { count }),
        historyRestoreLabel: t('designer.historyPanel.historyRestore'),
    }), [t]);
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
        switchScope,
        removeScope,
        removeScopes,
    } = useDiagramHistory(nodes, edges, historyLabels);


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

    const commitHistoryState = useCallback((state: { nodes: typeof nodes; edges: typeof edges }) => {
        nodesRef.current = state.nodes;
        edgesRef.current = state.edges;
        setNodes(state.nodes);
        setEdges(state.edges);
    }, [setEdges, setNodes]);

    const handleUndo = useCallback(() => {
        historyFocusRequestRef.current?.cancel();
        historyFocusRequestRef.current = null;
        const currentNodes = nodesRef.current;
        const prevState = undo(currentNodes, edgesRef.current); // 🚀 ref
        if (!prevState) return false;
        const activeElement = typeof document === 'undefined' ? null : document.activeElement;
        const restoredFocusNodeId = resolveUndoRestoredNodeFocusId(
            currentNodes,
            prevState.nodes,
            activeElement,
        ) ?? resolveHistoryNodeFocusAfterChange(currentNodes, prevState.nodes, activeElement);
        commitHistoryState(prevState);
        if (restoredFocusNodeId) {
            historyFocusRequestRef.current = scheduleUndoRestoredNodeFocus(restoredFocusNodeId);
        }
        return true;
    }, [commitHistoryState, undo]);

    const handleRedo = useCallback(() => {
        historyFocusRequestRef.current?.cancel();
        historyFocusRequestRef.current = null;
        const currentNodes = nodesRef.current;
        const nextState = redo(currentNodes, edgesRef.current); // 🚀 ref
        if (!nextState) return false;
        const activeElement = typeof document === 'undefined' ? null : document.activeElement;
        const replacementFocusNodeId = resolveHistoryNodeFocusAfterChange(
            currentNodes,
            nextState.nodes,
            activeElement,
        );
        const shouldFocusEmptyState = shouldFocusEmptyStateAfterRedo(
            currentNodes,
            nextState.nodes,
            activeElement,
        );
        commitHistoryState(nextState);
        if (replacementFocusNodeId) {
            historyFocusRequestRef.current = scheduleUndoRestoredNodeFocus(replacementFocusNodeId);
        } else if (shouldFocusEmptyState) {
            historyFocusRequestRef.current = scheduleFlowchartEmptyStateFocus();
        }
        return true;
    }, [commitHistoryState, redo]);

    return {
        nodes,
        setNodes,
        edges,
        setEdges,
        nodesRef,
        edgesRef,
        onNodesChange,
        onEdgesChange,
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
                if (target) commitHistoryState(target);
            },
            getPreviousState,
            switchScope,
            removeScope,
            removeScopes,
        }
    };
};
