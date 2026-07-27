import type { Edge } from '@xyflow/react';

export interface StablePathPoint {
    x: number;
    y: number;
}

interface StablePathEdgeData {
    computedPath?: unknown;
}

const isStablePathPoint = (value: unknown): value is StablePathPoint => {
    if (value === null || typeof value !== 'object') return false;
    const point = value as Record<string, unknown>;
    return typeof point.x === 'number'
        && Number.isFinite(point.x)
        && typeof point.y === 'number'
        && Number.isFinite(point.y);
};

export const collectStablePathPeerPaths = (
    edges: readonly Edge[],
    ownEdgeId: string,
    enabled: boolean,
): StablePathPoint[][] => {
    if (!enabled) return [];

    return edges
        .filter(edge => edge.id !== ownEdgeId)
        .map(edge => (edge.data as StablePathEdgeData | undefined)?.computedPath)
        .filter((path: unknown): path is StablePathPoint[] => (
            Array.isArray(path)
            && path.length >= 2
            && path.every(isStablePathPoint)
        ));
};
