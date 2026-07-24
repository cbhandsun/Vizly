import React from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    EdgeProps,
    getBezierPath,
} from '@xyflow/react';

export const RelationshipEdge = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
    markerEnd,
}: EdgeProps) => {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const label = data?.label as string;
    const color = style.stroke || '#f43f5e'; // Relationship default color

    return (
        <>
            <BaseEdge 
                path={edgePath} 
                markerEnd={markerEnd} 
                style={{ 
                    ...style, 
                    strokeWidth: 2, 
                    stroke: color, 
                    strokeDasharray: '5,5', 
                    opacity: 0.8 
                }} 
            />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: 'all', // Allows to click on label if needed
                            background: '#ffffff',
                            color: color,
                            padding: '2px 8px',
                            borderRadius: 12,
                            border: `1px solid ${color}`,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            fontWeight: 500,
                            zIndex: 10 // above edges
                        }}
                        className="nodrag nopan"
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};
