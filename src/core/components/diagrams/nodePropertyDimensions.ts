export type NodePropertyDimensionAxis = 'width' | 'height';

export interface NodePropertyDimensionSubject {
    type?: string;
}

export interface NodePropertyDimensionBounds {
    min: number;
    max: number;
}

interface NodePropertySizeBounds {
    width: NodePropertyDimensionBounds;
    height: NodePropertyDimensionBounds;
}

const DEFAULT_NODE_PROPERTY_SIZE_BOUNDS: NodePropertySizeBounds = {
    width: { min: 80, max: 800 },
    height: { min: 40, max: 600 },
};

const LARGE_CONTAINER_MAX_SIZE = 8_192;

const NODE_PROPERTY_SIZE_BOUNDS_BY_TYPE: Readonly<Record<string, NodePropertySizeBounds>> = {
    icon: {
        width: { min: 32, max: 800 },
        height: { min: 32, max: 600 },
    },
    iconNode: {
        width: { min: 32, max: 800 },
        height: { min: 32, max: 600 },
    },
    networkContainer: {
        width: { min: 100, max: LARGE_CONTAINER_MAX_SIZE },
        height: { min: 80, max: LARGE_CONTAINER_MAX_SIZE },
    },
    subGroup: {
        width: { min: 200, max: LARGE_CONTAINER_MAX_SIZE },
        height: { min: 120, max: LARGE_CONTAINER_MAX_SIZE },
    },
    swimLane: {
        width: { min: 400, max: LARGE_CONTAINER_MAX_SIZE },
        height: { min: 250, max: LARGE_CONTAINER_MAX_SIZE },
    },
    swimlane: {
        width: { min: 400, max: LARGE_CONTAINER_MAX_SIZE },
        height: { min: 250, max: LARGE_CONTAINER_MAX_SIZE },
    },
    titleGroup: {
        width: { min: 200, max: LARGE_CONTAINER_MAX_SIZE },
        height: { min: 120, max: LARGE_CONTAINER_MAX_SIZE },
    },
};

const boundsForSubject = (
    subject: NodePropertyDimensionSubject,
    axis: NodePropertyDimensionAxis,
): NodePropertyDimensionBounds => (
    NODE_PROPERTY_SIZE_BOUNDS_BY_TYPE[subject.type ?? '']?.[axis]
    ?? DEFAULT_NODE_PROPERTY_SIZE_BOUNDS[axis]
);

export const resolveNodePropertyDimensionBounds = (
    subjects: readonly NodePropertyDimensionSubject[],
    axis: NodePropertyDimensionAxis,
): NodePropertyDimensionBounds => {
    if (subjects.length === 0) return DEFAULT_NODE_PROPERTY_SIZE_BOUNDS[axis];

    const limits = subjects.map((subject) => boundsForSubject(subject, axis));
    const min = Math.max(...limits.map((limit) => limit.min));
    const max = Math.max(min, Math.min(...limits.map((limit) => limit.max)));
    return { min, max };
};

export const normalizeNodePropertyDimension = (
    value: unknown,
    bounds: NodePropertyDimensionBounds,
): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.min(bounds.max, Math.max(bounds.min, value));
};
