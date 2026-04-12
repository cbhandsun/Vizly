import React, { memo } from 'react';
import { BaseEdge, EdgeProps, getBezierPath, getStraightPath, getSmoothStepPath, Position, useInternalNode } from '@xyflow/react';

export const MindMapEdge = ({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data
}: EdgeProps) => {

    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);

    // Fallback to defaults if nodes are not fully loaded in internal store
    let dSX = sourceX;
    let dSY = sourceY;
    let dTX = targetX;
    let dTY = targetY;
    let dynamicSourcePos = sourcePosition;
    let dynamicTargetPos = targetPosition;

    if (sourceNode && targetNode && sourceNode.measured && targetNode.measured) {
        const sDepth = (sourceNode.data?.depth as number) || 0;
        const tDepth = (targetNode.data?.depth as number) || 0;

        const sBounds = {
            x: sourceNode.internals.positionAbsolute.x,
            y: sourceNode.internals.positionAbsolute.y,
            w: sourceNode.measured.width || 0,
            h: sourceNode.measured.height || 0,
        };

        const tBounds = {
            x: targetNode.internals.positionAbsolute.x,
            y: targetNode.internals.positionAbsolute.y,
            w: targetNode.measured.width || 0,
            h: targetNode.measured.height || 0,
        };

        const sX = sBounds.x + sBounds.w / 2;
        const sY = sBounds.y + sBounds.h / 2;
        const tX = tBounds.x + tBounds.w / 2;
        const tY = tBounds.y + tBounds.h / 2;

        const dx = tX - sX;
        const dy = tY - sY;

        // Prefer left/right connections for mindmaps unless the vertical distance is 1.2x bigger
        const isVertical = Math.abs(dy) > Math.abs(dx) * 1.2;

        if (isVertical) {
            if (dy > 0) {
                dynamicSourcePos = Position.Bottom;
                dynamicTargetPos = Position.Top;
            } else {
                dynamicSourcePos = Position.Top;
                dynamicTargetPos = Position.Bottom;
            }
        } else {
            if (dx > 0) {
                dynamicSourcePos = Position.Right;
                dynamicTargetPos = Position.Left;
            } else {
                dynamicSourcePos = Position.Left;
                dynamicTargetPos = Position.Right;
            }
        }

        // Calculate Pixel bounds respecting depth styling
        const sYAnchor = sDepth === 0 ? sBounds.h / 2 : sBounds.h - 1;
        const tYAnchor = tDepth === 0 ? tBounds.h / 2 : tBounds.h - 1;

        if (dynamicSourcePos === Position.Right) {
            dSX = sBounds.x + sBounds.w;
            dSY = sBounds.y + sYAnchor;
        } else if (dynamicSourcePos === Position.Left) {
            dSX = sBounds.x;
            dSY = sBounds.y + sYAnchor;
        } else if (dynamicSourcePos === Position.Bottom) {
            dSX = sX;
            dSY = sBounds.y + sBounds.h;
        } else {
            dSX = sX;
            dSY = sBounds.y;
        }

        if (dynamicTargetPos === Position.Right) {
            dTX = tBounds.x + tBounds.w;
            dTY = tBounds.y + tYAnchor;
        } else if (dynamicTargetPos === Position.Left) {
            dTX = tBounds.x;
            dTY = tBounds.y + tYAnchor;
        } else if (dynamicTargetPos === Position.Bottom) {
            dTX = tX;
            dTY = tBounds.y + tBounds.h;
        } else {
            dTX = tX;
            dTY = tBounds.y;
        }
    }

    // We strictly DO NOT pass markerEnd to BaseEdge to ensure NO arrowheads.
    const pathStyle = (sourceNode?.data?.pathStyle as string) || 'bezier';
    
    let edgePath = '';
    
    const pathParams = {
        sourceX: dSX,
        sourceY: dSY,
        sourcePosition: dynamicSourcePos,
        targetX: dTX,
        targetY: dTY,
        targetPosition: dynamicTargetPos,
    };

    if (pathStyle === 'straight') {
        [edgePath] = getStraightPath(pathParams);
    } else if (pathStyle === 'step') {
        [edgePath] = getSmoothStepPath({
            ...pathParams,
            borderRadius: 16
        });
    } else {
        // Default: Bezier for a nice smooth organic feel
        [edgePath] = getBezierPath({
            ...pathParams,
            curvature: 0.7,
        });
    }

    return (
        <BaseEdge 
            id={id} 
            path={edgePath} 
            style={{
                 ...style,
                 strokeLinecap: 'round',
                 strokeLinejoin: 'round',
                 strokeDasharray: 'none'
            }} 
        />
    );
};

export default memo(MindMapEdge);
