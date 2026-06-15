import { createContext } from 'react';
import type { NodeDataUpdate } from '../../types/diagram-updates';

export type UpdateNodesBatchFn = (ids: string[], data: NodeDataUpdate, options?: { snapshot?: boolean }) => void;

export interface NodeUpdateContextValue {
    updateNodesBatch: UpdateNodesBatchFn;
    businessData?: Record<string, any>;
}

export const NodeUpdateContext = createContext<NodeUpdateContextValue | undefined>(undefined);
