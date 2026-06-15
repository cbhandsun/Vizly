import React, { useMemo } from 'react';
import { NodeUpdateContext, type UpdateNodesBatchFn } from './NodeUpdateContextValue';

export const NodeUpdateProvider: React.FC<{
    updateNodesBatch: UpdateNodesBatchFn;
    businessData?: Record<string, any>;
    children: React.ReactNode;
}> = ({ updateNodesBatch, businessData, children }) => {
    const value = useMemo(() => ({ updateNodesBatch, businessData }), [updateNodesBatch, businessData]);
    return <NodeUpdateContext.Provider value={value}>{children}</NodeUpdateContext.Provider>;
};
