import React, { useMemo } from 'react';
import { NodeUpdateContext, type UpdateNodesBatchFn } from './NodeUpdateContextValue';

export const NodeUpdateProvider: React.FC<{
    updateNodesBatch: UpdateNodesBatchFn;
    beforeStructuralChange?: () => void;
    businessData?: Record<string, unknown>;
    children: React.ReactNode;
}> = ({ updateNodesBatch, beforeStructuralChange, businessData, children }) => {
    const value = useMemo(
        () => ({ updateNodesBatch, beforeStructuralChange, businessData }),
        [beforeStructuralChange, businessData, updateNodesBatch],
    );
    return <NodeUpdateContext.Provider value={value}>{children}</NodeUpdateContext.Provider>;
};
