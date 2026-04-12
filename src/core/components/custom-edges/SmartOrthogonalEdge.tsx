import React, { memo } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { AdvancedSmartStepEdge } from './AdvancedSmartEdge';

/**
 * Smart Orthogonal Edge
 * 
 * A specialized entry point for pure orthogonal edges (right angles with corner radiuses).
 * Under the hood, this utilizes the same A* web worker pathfinding algorithm 
 * as the advanced smart step edge, but explicit export allows for semantic 
 * distinction and future specialized styling.
 */
export const SmartOrthogonalEdge = memo((props: EdgeProps) => {
    return <AdvancedSmartStepEdge {...props} />;
});

SmartOrthogonalEdge.displayName = 'SmartOrthogonalEdge';

export default SmartOrthogonalEdge;
