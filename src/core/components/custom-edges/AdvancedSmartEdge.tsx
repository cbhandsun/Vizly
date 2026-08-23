// src/components/custom-edges/AdvancedSmartEdge.tsx
import React, { memo } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { CanvasRoutedSmartEdge } from './CanvasRoutedSmartEdge';

/**
 * [OPTIMIZATION] Strict props comparison to avoid unnecessary re-renders during drag
 */
function areSmartEdgePropsEqual(prev: EdgeProps, next: EdgeProps) {
    // 1. Comparison of critical props (Shallow)
    if (
        prev.id !== next.id ||
        prev.source !== next.source ||
        prev.target !== next.target ||
        prev.sourceHandleId !== next.sourceHandleId ||
        prev.targetHandleId !== next.targetHandleId ||
        prev.sourceX !== next.sourceX ||
        prev.sourceY !== next.sourceY ||
        prev.targetX !== next.targetX ||
        prev.targetY !== next.targetY ||
        prev.sourcePosition !== next.sourcePosition ||
        prev.targetPosition !== next.targetPosition ||
        prev.selected !== next.selected ||
        prev.animated !== next.animated ||
        prev.label !== next.label ||
        prev.style !== next.style ||
        prev.markerStart !== next.markerStart ||
        prev.markerEnd !== next.markerEnd
    ) {
        return false;
    }

    // 2. Comparison of Data
    const prevData = prev.data as Record<string, unknown> | undefined;
    const nextData = next.data as Record<string, unknown> | undefined;

    if (prevData === nextData) return true;
    if (!prevData || !nextData) return false;

    const keysP = Object.keys(prevData);
    const keysN = Object.keys(nextData);

    if (keysP.length !== keysN.length) return false;

    for (const key of keysP) {
        // Ignore volatile properties injected during drag state that don't effect core geometry cache matching
        if (key === '_dragUpdate' || key === '_livePositions' || key === '_draggingNodeIds') continue;
        if (prevData[key] !== nextData[key]) return false;
    }

    // Crucial: Only re-render on _dragUpdate if this edge is connected to a dragging node.
    // [FIX] Always re-render if _dragUpdate changes to fix sync lags.
    if (prevData._dragUpdate !== nextData._dragUpdate) {
        return false;
    }

    return true;
}

/**
 * AdvancedSmartEdge (Shell Component)
 * Delegating all logic domains into separate controllers and rendering through a pure graphic function.
 */
const InnerAdvancedSmartStepEdge = (props: EdgeProps) => {
    return <CanvasRoutedSmartEdge {...props} />;
};

// Export memoized components
export const AdvancedSmartStepEdge = memo(InnerAdvancedSmartStepEdge, areSmartEdgePropsEqual);

export const AdvancedSmartBezierEdge = memo((props: EdgeProps) => <AdvancedSmartStepEdge {...props} />, areSmartEdgePropsEqual);
AdvancedSmartBezierEdge.displayName = 'AdvancedSmartBezierEdge';

export const AdvancedSmartStraightEdge = memo((props: EdgeProps) => <AdvancedSmartStepEdge {...props} />, areSmartEdgePropsEqual);
AdvancedSmartStraightEdge.displayName = 'AdvancedSmartStraightEdge';

export default {
    AdvancedSmartStepEdge,
    AdvancedSmartBezierEdge,
    AdvancedSmartStraightEdge,
};
