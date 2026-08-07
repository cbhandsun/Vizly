import type { Edge } from '@xyflow/react';

const getEdgeData = (edge: Edge): Record<string, unknown> => (
    edge.data && typeof edge.data === 'object'
        ? edge.data as Record<string, unknown>
        : {}
);

export const isEdgeMutationLocked = (edge: Edge): boolean => {
    const data = getEdgeData(edge);
    return data.locked === true || data.isLocked === true || edge.deletable === false;
};
