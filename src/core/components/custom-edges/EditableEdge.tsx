import React, { useCallback } from 'react';
import { EdgeProps, useViewport } from '@xyflow/react';
import { useEdgeUpdate } from '../diagrams/useEdgeUpdate';
import { useEditableEdgeInteractions } from './hooks/useEditableEdgeInteractions';
import { EditableEdgeGraphics } from './renderers/EditableEdgeGraphics';

export interface Waypoint {
    x: number;
    y: number;
}

export interface EditableEdgeData {
    waypoints?: Waypoint[];
    onWaypointsChange?: (edgeId: string, waypoints: Waypoint[]) => void;
    onLabelChange?: (edgeId: string, label: string) => void;
    label?: string;
    [key: string]: unknown;
}

const EditableEdge: React.FC<EdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    markerStart,
    data = {},
    selected = false,
}) => {
    const waypoints = (data as EditableEdgeData)?.waypoints || [];
    const label = (data as EditableEdgeData)?.label;
    const viewport = useViewport();
    const edgeCallbacks = useEdgeUpdate();

    const interactions = useEditableEdgeInteractions({
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        waypoints,
        viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
        edgeCallbacks,
        initialLabel: label
    });

    const handleLabelChangeSubmit = useCallback(() => {
        if (edgeCallbacks?.onLabelChange) {
            edgeCallbacks.onLabelChange(id, interactions.editingLabelValue);
        }
    }, [edgeCallbacks, id, interactions.editingLabelValue]);

    return (
        <EditableEdgeGraphics
            id={id}
            edgePath={interactions.edgePath}
            style={style}
            markerEnd={markerEnd as string}
            markerStart={markerStart as string}
            selected={selected}
            viewportZoom={viewport.zoom}
            bendPoints={interactions.bendPoints}
            segments={interactions.segments}
            labelPos={interactions.labelPos}
            label={label}
            draggingIndex={interactions.draggingIndex}
            draggingSegment={interactions.draggingSegment}
            hoveredSegment={interactions.hoveredSegment}
            setHoveredSegment={interactions.setHoveredSegment}
            isEditingLabel={interactions.isEditingLabel}
            setIsEditingLabel={interactions.setIsEditingLabel}
            editingLabelValue={interactions.editingLabelValue}
            setEditingLabelValue={interactions.setEditingLabelValue}
            onBendPointDown={interactions.handleBendPointPointerDown}
            onBendPointMove={interactions.handleBendPointPointerMove}
            onBendPointUp={interactions.handleBendPointPointerUp}
            onSegmentDown={interactions.handleSegmentPointerDown}
            onSegmentMove={interactions.handleSegmentPointerMove}
            onSegmentUp={interactions.handleSegmentPointerUp}
            onEdgeClick={interactions.handleEdgeClick}
            onDeleteWaypoint={interactions.handleDeleteWaypoint}
            onAddWaypointToSegment={interactions.handleAddWaypointToSegment}
            onLabelChangeSubmit={handleLabelChangeSubmit}
        />
    );
};

/**
 * ⭐ 自定义比较函数 - 只在关键props变化时重渲染
 */
const arePropsEqual = (prev: EdgeProps, next: EdgeProps) => {
    // 位置变化
    if (
        prev.sourceX !== next.sourceX ||
        prev.sourceY !== next.sourceY ||
        prev.targetX !== next.targetX ||
        prev.targetY !== next.targetY
    ) {
        return false;
    }

    // 选中状态变化
    if (prev.selected !== next.selected) {
        return false;
    }

    // waypoints变化
    const prevWaypoints = (prev.data as EditableEdgeData)?.waypoints || [];
    const nextWaypoints = (next.data as EditableEdgeData)?.waypoints || [];

    if (prevWaypoints.length !== nextWaypoints.length) {
        return false; // length changed
    }

    for (let i = 0; i < prevWaypoints.length; i++) {
        if (
            prevWaypoints[i].x !== nextWaypoints[i].x ||
            prevWaypoints[i].y !== nextWaypoints[i].y
        ) {
            return false;
        }
    }

    // label变化
    if ((prev.data as EditableEdgeData)?.label !== (next.data as EditableEdgeData)?.label) {
        return false;
    }

    return true; // props相同,跳过重渲染
};

export default React.memo(EditableEdge, arePropsEqual);
