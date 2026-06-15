import { useContext } from 'react';
import { NodeUpdateContext, type UpdateNodesBatchFn } from './NodeUpdateContextValue';

export const useNodeUpdate = (): UpdateNodesBatchFn | undefined => {
    return useContext(NodeUpdateContext)?.updateNodesBatch;
};

export const useBusinessData = (): Record<string, any> | undefined => {
    return useContext(NodeUpdateContext)?.businessData;
};
