import { useCallback } from 'react';
import { Edge } from '@xyflow/react';

/**
 * 边属性变更回调集合（标签偏移、标签样式、Waypoint、标签文本）
 * 从 FlowchartDesigner 提取，通过 EdgeUpdateContext 传递给边组件
 */
export function useDesignerEdgeCallbacks(
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) {
    // 标签偏移变更回调
    const handleLabelOffsetChange = useCallback((edgeId: string, offset: { x: number, y: number }) => {
        setEdges(edges => edges.map(edge =>
            edge.id === edgeId
                ? { ...edge, data: { ...edge.data, labelOffset: offset } }
                : edge
        ));
    }, [setEdges]);

    // 标签样式变更回调
    const handleLabelStyleChange = useCallback((edgeId: string, style: any) => {
        setEdges(edges => edges.map(edge =>
            edge.id === edgeId
                ? {
                    ...edge,
                    data: { ...edge.data, labelStyle: style },
                    labelStyle: { ...(edge.labelStyle as any), ...style } // 同步到edge的labelStyle属性
                }
                : edge
        ));
    }, [setEdges]);

    // ⭐ Waypoint变更回调（用于EditableEdge）
    const handleWaypointsChange = useCallback((edgeId: string, waypoints: Array<{ x: number; y: number }>) => {
        setEdges(eds => eds.map(edge =>
            edge.id === edgeId
                ? { ...edge, data: { ...edge.data, waypoints } }
                : edge
        ));
    }, [setEdges]);

    // ⭐ 标签变更回调（用于EditableEdge双击编辑）
    const handleEdgeLabelChange = useCallback((edgeId: string, label: string) => {
        setEdges(eds => eds.map(edge =>
            edge.id === edgeId
                ? { ...edge, label, data: { ...edge.data, label } }
                : edge
        ));
    }, [setEdges]);

    return {
        handleLabelOffsetChange,
        handleLabelStyleChange,
        handleWaypointsChange,
        handleEdgeLabelChange,
    };
}
