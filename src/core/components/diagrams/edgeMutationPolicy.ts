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

export const isEdgeUserLocked = (edge: Edge): boolean => (
    getEdgeData(edge).locked === true
);

export const hasMutationLockedEdge = (edges: readonly Edge[]): boolean => (
    edges.some(isEdgeMutationLocked)
);

export const canReconnectEdge = (edge: Edge): boolean => !isEdgeMutationLocked(edge);

export const resolveTargetEdges = (
    edges: readonly Edge[],
    targetIds: ReadonlySet<string>,
): Edge[] => edges.filter(edge => targetIds.has(edge.id));

export interface EdgeLockStateResult {
    edges: Edge[];
    changed: boolean;
}

export const applyEdgeLockState = (
    edges: readonly Edge[],
    targetIds: ReadonlySet<string>,
    locked: boolean,
): EdgeLockStateResult => {
    let changed = false;
    const nextEdges = edges.map((edge) => {
        if (!targetIds.has(edge.id)) return edge;

        const data = getEdgeData(edge);
        const userLocked = data.locked === true;
        const systemLocked = data.isLocked === true || (edge.deletable === false && !userLocked);
        if (systemLocked || userLocked === locked) return edge;

        changed = true;
        return {
            ...edge,
            deletable: !locked,
            reconnectable: !locked,
            data: { ...data, locked },
        };
    });

    return { edges: changed ? nextEdges : [...edges], changed };
};
