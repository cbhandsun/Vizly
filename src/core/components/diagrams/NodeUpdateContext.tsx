import React, { createContext, useContext, useMemo } from 'react';
import type { NodeDataUpdate } from '../../types/diagram-updates';

type UpdateNodesBatchFn = (ids: string[], data: NodeDataUpdate, options?: { snapshot?: boolean }) => void;

interface NodeUpdateContextValue {
    updateNodesBatch: UpdateNodesBatchFn;
    businessData?: Record<string, any>;
}

const NodeUpdateContext = createContext<NodeUpdateContextValue | undefined>(undefined);

export const NodeUpdateProvider: React.FC<{
    updateNodesBatch: UpdateNodesBatchFn;
    businessData?: Record<string, any>;
    children: React.ReactNode;
}> = ({ updateNodesBatch, businessData, children }) => {
    const value = useMemo(() => ({ updateNodesBatch, businessData }), [updateNodesBatch, businessData]);
    return <NodeUpdateContext.Provider value={value}>{children}</NodeUpdateContext.Provider>;
};

export const useNodeUpdate = (): UpdateNodesBatchFn | undefined => {
    return useContext(NodeUpdateContext)?.updateNodesBatch;
};

export const useBusinessData = (): Record<string, any> | undefined => {
    return useContext(NodeUpdateContext)?.businessData;
};
