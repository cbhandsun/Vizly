import { useCallback } from 'react';
import { Edge, Node } from '@xyflow/react';
import type React from 'react';

interface UseDesignerEdgeCallbacksOptions {
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    nodesRef: React.MutableRefObject<Node[]>;
    edgesRef: React.MutableRefObject<Edge[]>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
}

const sameWaypoints = (
    current: unknown,
    next: Array<{ x: number; y: number }>,
): boolean => Array.isArray(current)
    && current.length === next.length
    && current.every((point, index) => {
        const nextPoint = next[index];
        return Boolean(
            point
            && typeof point === 'object'
            && 'x' in point
            && 'y' in point
            && point.x === nextPoint.x
            && point.y === nextPoint.y,
        );
    });

/**
 * 边属性变更回调集合（标签偏移、标签样式、Waypoint、标签文本）
 * 从 FlowchartDesigner 提取，通过 EdgeUpdateContext 传递给边组件
 */
export function useDesignerEdgeCallbacks({
    setEdges,
    nodesRef,
    edgesRef,
    takeSnapshot,
}: UseDesignerEdgeCallbacksOptions) {
    const commitEdgeUpdate = useCallback((edgeId: string, update: (edge: Edge) => Edge | null) => {
        const currentEdges = edgesRef.current;
        const index = currentEdges.findIndex(edge => edge.id === edgeId);
        if (index < 0) return false;

        const nextEdge = update(currentEdges[index]);
        if (!nextEdge || nextEdge === currentEdges[index]) return false;

        const nextEdges = [...currentEdges];
        nextEdges[index] = nextEdge;
        takeSnapshot(nodesRef.current, currentEdges);
        edgesRef.current = nextEdges;
        setEdges(nextEdges);
        return true;
    }, [edgesRef, nodesRef, setEdges, takeSnapshot]);

    // 标签偏移变更回调
    const handleLabelOffsetChange = useCallback((edgeId: string, offset: { x: number, y: number }) => {
        setEdges(edges => edges.map(edge =>
            edge.id === edgeId
                ? { ...edge, data: { ...edge.data, labelOffset: offset } }
                : edge
        ));
    }, [setEdges]);

    // 标签样式变更回调
    const handleLabelStyleChange = useCallback((edgeId: string, style: React.CSSProperties) => {
        setEdges(edges => edges.map(edge =>
            edge.id === edgeId
                ? {
                    ...edge,
                    data: { ...edge.data, labelStyle: style },
                    labelStyle: { ...(edge.labelStyle || {}), ...style } // 同步到edge的labelStyle属性
                }
                : edge
        ));
    }, [setEdges]);

    // ⭐ Waypoint变更回调（用于EditableEdge）
    const handleWaypointsChange = useCallback((edgeId: string, waypoints: Array<{ x: number; y: number }>) => {
        commitEdgeUpdate(edgeId, edge => (
            sameWaypoints(edge.data?.waypoints, waypoints)
                ? null
                : { ...edge, data: { ...edge.data, waypoints } }
        ));
    }, [commitEdgeUpdate]);

    // ⭐ 标签变更回调（用于EditableEdge双击编辑）
    const handleEdgeLabelChange = useCallback((edgeId: string, label: string) => {
        commitEdgeUpdate(edgeId, edge => (
            edge.label === label && edge.data?.label === label
                ? null
                : { ...edge, label, data: { ...edge.data, label } }
        ));
    }, [commitEdgeUpdate]);

    return {
        handleLabelOffsetChange,
        handleLabelStyleChange,
        handleWaypointsChange,
        handleEdgeLabelChange,
    };
}
