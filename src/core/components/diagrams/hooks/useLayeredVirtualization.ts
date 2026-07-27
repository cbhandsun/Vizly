import { useMemo, useRef, useEffect, useCallback } from 'react';
import { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';
import type { LayerConfig } from './useLayerManagement';
import {
    reconcileLayeredNodePresentation,
    type LayeredNodePresentationCache,
} from './layeredNodePresentation';

export interface UseLayeredVirtualizationProps {
    nodes: Node[];
    edges: Edge[];
    virtualizedNodes: Node[];
    edgesWithCollapseState: Edge[];
    layers: LayerConfig[];
    getLayer: (id: string) => LayerConfig | undefined;
    isDragging: boolean;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
}

export function useLayeredVirtualization({
    nodes,
    edges,
    virtualizedNodes,
    edgesWithCollapseState,
    layers: _layers,
    getLayer,
    onNodesChange,
    onEdgesChange
}: UseLayeredVirtualizationProps) {
    const layeredNodeCache = useMemo<LayeredNodePresentationCache>(() => new Map(), []);

    // 图层同步 nodes
    const layerSyncedNodes = useMemo(() => {
        return reconcileLayeredNodePresentation({
            nodes: virtualizedNodes,
            getLayer,
            previous: layeredNodeCache,
        });
    }, [virtualizedNodes, getLayer, layeredNodeCache]);

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
    }, [edgesWithCollapseState, getLayer]);

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
