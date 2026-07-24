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
    style = {}
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
    const pathStyle = (sourceNode?.data?.pathStyle as string) || (targetNode?.data?.pathStyle as string) || 'bezier';
    // Branch color: prefer TARGET node (the branch color belongs to the destination branch)
    // Fallback to source node's color, then to a neutral gray
    const branchColor = (targetNode?.data?.branchColor as string) 
        || (sourceNode?.data?.branchColor as string) 
        || '#94a3b8';
    const depth = (sourceNode?.data?.depth as number) || 0;
    const isMainBranch = depth === 0;

    let edgePath: string;
    
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
            borderRadius: 20
        });
    } else if (pathStyle === 'rounded' || pathStyle === 'organic') {
        // High-Fidelity Noodle Style: custom bezier with horizontal priority
        const dx = Math.abs(dTX - dSX);
        const controlOffset = Math.min(dx * 0.5, 180);
        const sourceControlX = dSX + (dTX > dSX ? controlOffset : -controlOffset);
        const targetControlX = dTX - (dTX > dSX ? controlOffset : -controlOffset);
        edgePath = `M${dSX},${dSY} C${sourceControlX},${dSY} ${targetControlX},${dTY} ${dTX},${dTY}`;
    } else {
        // Default: Bezier for a nice smooth organic feel
        [edgePath] = getBezierPath({
            ...pathParams,
            curvature: 0.8,
        });
    }

    // XMind-style weighted strokes: root branches thicker, leaf branches thinner
    // depth 0->1: 4px, depth 1->2: 2.5px, depth 2+: 1.8px
    const strokeWidth = isMainBranch ? 4 : depth === 1 ? 2.5 : 1.8;
    // Opacity also decreases slightly at deep levels for visual hierarchy
    const opacity = isMainBranch ? 1 : depth <= 1 ? 0.92 : 0.82;

    return (
        <BaseEdge 
            id={id} 
            path={edgePath} 
            style={{
                 ...style,
                 stroke: branchColor,
                 strokeWidth: strokeWidth,
                 strokeLinecap: 'round',
                 strokeLinejoin: 'round',
                 strokeDasharray: 'none',
                 transition: 'stroke 0.3s ease, stroke-width 0.3s ease, opacity 0.3s ease',
                 filter: isMainBranch
                    ? `drop-shadow(0 2px 4px ${branchColor}60)`
                    : depth === 1 ? `drop-shadow(0 1px 3px ${branchColor}40)` : 'none',
                 opacity,
            }} 
        />
    );
};

export default memo(MindMapEdge);
