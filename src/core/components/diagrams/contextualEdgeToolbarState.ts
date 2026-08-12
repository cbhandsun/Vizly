import type { Edge } from '@xyflow/react';
import type { EdgeDataUpdate } from '../../types/diagram-updates';

interface PointLike {
    x: number;
    y: number;
}

export interface ContextualEdgeRoutingState {
    isOrthogonal: boolean;
    nextType: 'smart-bezier' | 'smart-orthogonal';
}

const ORTHOGONAL_EDGE_TYPES = new Set([
    'advanced-smart',
    'advanced-smart-step',
    'smart',
    'smart-orthogonal',
    'smart-step',
    'smoothstep',
    'step',
]);

const CURVED_EDGE_TYPES = new Set([
    'advanced-smart-bezier',
    'bezier',
    'default',
    'smart-bezier',
]);

const asRecord = (value: unknown): Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const normalizeType = (value: unknown): string => (
    typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const isFinitePoint = (value: unknown): value is PointLike => {
    const point = asRecord(value);
    return Number.isFinite(point.x) && Number.isFinite(point.y);
};

const hasOrthogonalComputedPath = (value: unknown): boolean => {
    if (!Array.isArray(value) || value.length < 2 || !value.every(isFinitePoint)) return false;
    return value.slice(1).every((point, index) => {
        const previous = value[index] as PointLike;
        return point.x === previous.x || point.y === previous.y;
    });
};

export const resolveContextualEdgeRoutingState = (
    edge: Pick<Edge, 'type' | 'data'>,
): ContextualEdgeRoutingState => {
    const data = asRecord(edge.data);
    const typeCandidates = [data.pathType, data.originalType, edge.type]
        .map(normalizeType)
        .filter(Boolean);
    const explicitType = typeCandidates.find(type => (
        ORTHOGONAL_EDGE_TYPES.has(type) || CURVED_EDGE_TYPES.has(type)
    ));
    const isOrthogonal = explicitType
        ? ORTHOGONAL_EDGE_TYPES.has(explicitType)
        : hasOrthogonalComputedPath(data.computedPath);

    return {
        isOrthogonal,
        nextType: isOrthogonal ? 'smart-bezier' : 'smart-orthogonal',
    };
};

export const createContextualEdgeRoutingUpdate = (
    state: ContextualEdgeRoutingState,
): EdgeDataUpdate => ({
    type: state.nextType,
    data: {
        pathType: state.nextType,
        computedPath: undefined,
        elkPath: undefined,
        algorithm: undefined,
        layoutPathLocked: false,
        _layoutPathLocked: false,
        waypoints: [],
    },
});
