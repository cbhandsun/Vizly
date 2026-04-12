import { useMemo, useRef, useEffect, useCallback } from 'react';
import { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';

export interface UseLayeredVirtualizationProps {
    nodes: Node[];
    edges: Edge[];
    virtualizedNodes: Node[];
    edgesWithCollapseState: Edge[];
    layers: any[];
    getLayer: (id: string) => any | undefined;
    isDragging: boolean;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
}

export function useLayeredVirtualization({
    nodes,
    edges,
    virtualizedNodes,
    edgesWithCollapseState,
    layers,
    getLayer,
    isDragging,
    onNodesChange,
    onEdgesChange
}: UseLayeredVirtualizationProps) {
    // 图层同步 nodes
    const layerSyncedNodes = useMemo(() => {
        return virtualizedNodes.map(node => {
            const layerId = String(node.data?.layer || 'layer-0');
            const layer = getLayer(layerId);
            const layerVisible = layer ? layer.visible : true;
            const layerLocked = layer ? layer.locked : false;
            const zIndex = layer ? layer.zIndex : 0;

            const nextHidden = !layerVisible || (node.hidden || false);
            const nextDraggable = !layerLocked && (node.draggable !== false);
            const nextSelectable = !layerLocked && (node.selectable !== false);
            const nextZIndex = zIndex * 100 + (Number(node.style?.zIndex) || 0);

            // [PERFORMANCE] Short-circuit evaluation for pure reference stability
            // Only unpack into a new object if there is an actual data divergence.
            // This rescues React Flow's shallow comparison optimizations (React.memo).
            const isHiddenSame = nextHidden === (node.hidden || false);
            const isDraggableSame = nextDraggable === (node.draggable !== false);
            const isSelectableSame = nextSelectable === (node.selectable !== false);
            const isZIndexSame = nextZIndex === (Number(node.style?.zIndex) || 0);

            if (isHiddenSame && isDraggableSame && isSelectableSame && isZIndexSame) {
                return node;
            }

            return {
                ...node,
                hidden: nextHidden,
                draggable: nextDraggable,
                selectable: nextSelectable,
                style: {
                    ...node.style,
                    zIndex: nextZIndex
                }
            };
        });
    }, [virtualizedNodes, layers, getLayer]);

    // 过滤可见 edges
    const visibleEdges = useMemo(() => {
        return edgesWithCollapseState.map(edge => {
            const layerId = String(edge.data?.layer || 'layer-0');
            const layer = getLayer(layerId);
            const visible = layer ? layer.visible : true;

            const nextHidden = !visible || (edge.hidden || false);

            // [PERFORMANCE] Short-circuit pure reference preservation for edges
            if (nextHidden === (edge.hidden || false)) {
                return edge;
            }

            return {
                ...edge,
                hidden: nextHidden
            };
        });
    }, [edgesWithCollapseState, layers, getLayer]);

    // 锁定拦截
    const nodesRef = useRef(nodes);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);

    const onNodesChangeWithLock = useCallback((changes: NodeChange[]) => {
        const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));
        const filteredChanges = changes.filter(change => {
            if ('id' in change) {
                const node = nodeMap.get(change.id);
                if (node) {
                    const layerId = String(node.data?.layer || 'layer-0');
                    const layer = getLayer(layerId);
                    if (layer && layer.locked) {
                        return false;
                    }
                }
            }
            return true;
        });
        onNodesChange(filteredChanges);
    }, [getLayer, onNodesChange]);

    const edgesRef = useRef(edges);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    const onEdgesChangeWithLock = useCallback((changes: EdgeChange[]) => {
        const edgeMap = new Map(edgesRef.current.map(e => [e.id, e]));
        const filteredChanges = changes.filter(change => {
            if ('id' in change) {
                const edge = edgeMap.get(change.id);
                if (edge) {
                    const layerId = String(edge.data?.layer || 'layer-0');
                    const layer = getLayer(layerId);
                    if (layer && layer.locked) {
                        return false;
                    }
                }
            }
            return true;
        });
        onEdgesChange(filteredChanges);
    }, [getLayer, onEdgesChange]);

    return {
        layerSyncedNodes,
        visibleEdges,
        onNodesChangeWithLock,
        onEdgesChangeWithLock
    };
}
