export interface StablePathPoint {
    x: number;
    y: number;
}

const ENDPOINT_DRIFT_TOLERANCE = 2;
const CANVAS_ENDPOINT_DRIFT_TOLERANCE = 12;
const CANVAS_TERMINAL_LANE_OFFSET_LIMIT = 320;

type LiveNodeRect = { x: number; y: number; width: number; height: number };

const readFiniteNumber = (value: unknown): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const readLiveNodeRect = (value: unknown): LiveNodeRect | null => {
    if (!value || typeof value !== 'object') return null;
    const node = value as Record<string, unknown>;
    const internals = node.internals && typeof node.internals === 'object'
        ? node.internals as Record<string, unknown>
        : {};
    const absolute = internals.positionAbsolute && typeof internals.positionAbsolute === 'object'
        ? internals.positionAbsolute as Record<string, unknown>
        : {};
    const measured = node.measured && typeof node.measured === 'object'
        ? node.measured as Record<string, unknown>
        : {};
    const x = readFiniteNumber(absolute.x);
    const y = readFiniteNumber(absolute.y);
    const width = readFiniteNumber(measured.width) ?? readFiniteNumber(node.width);
    const height = readFiniteNumber(measured.height) ?? readFiniteNumber(node.height);
    return x !== undefined && y !== undefined && width !== undefined && width > 1
        && height !== undefined && height > 1
        ? { x, y, width, height }
        : null;
};

export const hasStablePathLiveNodeGeometry = (value: unknown): boolean => (
    readLiveNodeRect(value) !== null
);

const isPointOnDeclaredNodeSide = (
    point: StablePathPoint,
    node: unknown,
    position: unknown,
): boolean => {
    const rect = readLiveNodeRect(node);
    if (!rect) return false;
    const side = String(position ?? '').toLowerCase();
    const withinHorizontalSpan = point.x >= rect.x - CANVAS_ENDPOINT_DRIFT_TOLERANCE
        && point.x <= rect.x + rect.width + CANVAS_ENDPOINT_DRIFT_TOLERANCE;
    const withinVerticalSpan = point.y >= rect.y - CANVAS_ENDPOINT_DRIFT_TOLERANCE
        && point.y <= rect.y + rect.height + CANVAS_ENDPOINT_DRIFT_TOLERANCE;
    if (side === 'top') {
        return withinHorizontalSpan
            && Math.abs(point.y - rect.y) <= CANVAS_ENDPOINT_DRIFT_TOLERANCE;
    }
    if (side === 'bottom') {
        return withinHorizontalSpan
            && Math.abs(point.y - (rect.y + rect.height)) <= CANVAS_ENDPOINT_DRIFT_TOLERANCE;
    }
    if (side === 'left') {
        return withinVerticalSpan
            && Math.abs(point.x - rect.x) <= CANVAS_ENDPOINT_DRIFT_TOLERANCE;
    }
    if (side === 'right') {
        return withinVerticalSpan
            && Math.abs(point.x - (rect.x + rect.width)) <= CANVAS_ENDPOINT_DRIFT_TOLERANCE;
    }
    return false;
};

const isPointAttachedToLiveEndpoint = (
    point: StablePathPoint,
    liveX: number,
    liveY: number,
    position: unknown,
    canvasOwned: boolean,
): boolean => {
    const tolerance = canvasOwned
        ? CANVAS_ENDPOINT_DRIFT_TOLERANCE
        : ENDPOINT_DRIFT_TOLERANCE;
    if (Math.hypot(point.x - liveX, point.y - liveY) <= tolerance) return true;
    if (!canvasOwned) return false;

    // The display worker distributes ports along a declared node side, while
    // React Flow exposes the centre of that side as sourceX/targetX.
    const side = String(position ?? '').toLowerCase();
    if (side === 'top' || side === 'bottom') {
        return Math.abs(point.y - liveY) <= tolerance
            && Math.abs(point.x - liveX) <= CANVAS_TERMINAL_LANE_OFFSET_LIMIT;
    }
    if (side === 'left' || side === 'right') {
        return Math.abs(point.x - liveX) <= tolerance
            && Math.abs(point.y - liveY) <= CANVAS_TERMINAL_LANE_OFFSET_LIMIT;
    }
    return false;
};

/**
 * Accept a worker-distributed terminal lane only while it is still attached to
 * the declared side of both live nodes. This preserves obstacle-safe routes
 * without trusting stale or malformed canvas paths.
 */
export const isStablePathAttachedToLiveEndpoints = (
    points: StablePathPoint[],
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    sourcePosition: unknown,
    targetPosition: unknown,
    canvasOwned: boolean,
    sourceNode: unknown,
    targetNode: unknown,
): boolean => {
    const start = points[0];
    const end = points.at(-1);
    if (!start || !end) return false;

    if (
        canvasOwned
        && isPointOnDeclaredNodeSide(start, sourceNode, sourcePosition)
        && isPointOnDeclaredNodeSide(end, targetNode, targetPosition)
    ) return true;

    return isPointAttachedToLiveEndpoint(
        start,
        sourceX,
        sourceY,
        sourcePosition,
        canvasOwned,
    ) && isPointAttachedToLiveEndpoint(
        end,
        targetX,
        targetY,
        targetPosition,
        canvasOwned,
    );
};
