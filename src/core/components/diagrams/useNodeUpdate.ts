import { useContext } from 'react';
import { NodeUpdateContext, type UpdateNodesBatchFn } from './NodeUpdateContextValue';

export const useNodeUpdate = (): UpdateNodesBatchFn | undefined => {
    return useContext(NodeUpdateContext)?.updateNodesBatch;
};

export const useBeforeDiagramStructuralChange = (): (() => void) | undefined => {
    return useContext(NodeUpdateContext)?.beforeStructuralChange;
};

export const useBusinessData = (): Record<string, unknown> | undefined => {
    return useContext(NodeUpdateContext)?.businessData;
};
