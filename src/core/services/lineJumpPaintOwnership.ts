export interface LineJumpPaintPoint {
    x: number;
    y: number;
}

export interface LineJumpPaintRange {
    from: number;
    to: number;
    ownerEdgeId: string;
}

export interface LineJumpPaintOwnership {
    hiddenRanges: readonly LineJumpPaintRange[];
}

export interface LineJumpOwnershipEdgePath {
    edgeId: string;
    points: readonly LineJumpPaintPoint[];
    paintOwnership?: LineJumpPaintOwnership | null;
}

export interface LineJumpOwnershipIntersection {
    point: LineJumpPaintPoint;
    horizontalEdgeId: string;
    verticalEdgeId: string;
}

const COORDINATE_TOLERANCE = 0.5;
const RANGE_TOLERANCE = 0.01;

const segmentLength = (first: LineJumpPaintPoint, second: LineJumpPaintPoint): number => (
    Math.hypot(second.x - first.x, second.y - first.y)
);

const horizontalDistancesAtPoint = (
    points: readonly LineJumpPaintPoint[],
    point: LineJumpPaintPoint,
): number[] => {
    const distances: number[] = [];
    let travelled = 0;
    for (let index = 1; index < points.length; index += 1) {
        const first = points[index - 1];
        const second = points[index];
        const length = segmentLength(first, second);
        const horizontal = Number.isFinite(length)
            && Math.abs(first.y - second.y) <= COORDINATE_TOLERANCE;
        const onSegment = horizontal
            && Math.abs(point.y - first.y) <= COORDINATE_TOLERANCE
            && point.x >= Math.min(first.x, second.x) - COORDINATE_TOLERANCE
            && point.x <= Math.max(first.x, second.x) + COORDINATE_TOLERANCE;
        if (onSegment) distances.push(travelled + Math.abs(point.x - first.x));
        travelled += length;
    }
    return distances;
};

const hiddenOwnerAtPoint = (
    edge: LineJumpOwnershipEdgePath,
    point: LineJumpPaintPoint,
): string | undefined => {
    const ranges = edge.paintOwnership?.hiddenRanges ?? [];
    if (ranges.length === 0) return undefined;
    const distances = horizontalDistancesAtPoint(edge.points, point);
    if (distances.length === 0) return undefined;
    const owners = new Set(ranges.flatMap(range => (
        Number.isFinite(range.from)
        && Number.isFinite(range.to)
        && range.to > range.from
        && typeof range.ownerEdgeId === 'string'
        && range.ownerEdgeId.length > 0
        && distances.some(distance => (
            distance > range.from + RANGE_TOLERANCE
            && distance < range.to - RANGE_TOLERANCE
        ))
            ? [range.ownerEdgeId]
            : []
    )));
    return owners.size === 1 ? owners.values().next().value : undefined;
};

const projectToOwnerHorizontalPoint = (
    owner: LineJumpOwnershipEdgePath,
    point: LineJumpPaintPoint,
): LineJumpPaintPoint | undefined => {
    for (let index = 1; index < owner.points.length; index += 1) {
        const first = owner.points[index - 1];
        const second = owner.points[index];
        const horizontal = Math.abs(first.y - second.y) <= COORDINATE_TOLERANCE;
        if (horizontal
            && Math.abs(point.y - first.y) <= COORDINATE_TOLERANCE
            && point.x >= Math.min(first.x, second.x) - COORDINATE_TOLERANCE
            && point.x <= Math.max(first.x, second.x) + COORDINATE_TOLERANCE) {
            return { x: point.x, y: first.y };
        }
    }
    return undefined;
};

const resolveHorizontalPaintOwner = (
    intersection: LineJumpOwnershipIntersection,
    pathsById: ReadonlyMap<string, LineJumpOwnershipEdgePath>,
): { edgeId: string; point: LineJumpPaintPoint } => {
    let currentEdgeId = intersection.horizontalEdgeId;
    let currentPoint = intersection.point;
    const visited = new Set<string>();
    while (!visited.has(currentEdgeId) && visited.size <= pathsById.size) {
        visited.add(currentEdgeId);
        const current = pathsById.get(currentEdgeId);
        if (!current) break;
        const ownerEdgeId = hiddenOwnerAtPoint(current, currentPoint);
        if (!ownerEdgeId || ownerEdgeId === currentEdgeId || visited.has(ownerEdgeId)) break;
        const owner = pathsById.get(ownerEdgeId);
        if (!owner) break;
        const ownerPoint = projectToOwnerHorizontalPoint(owner, currentPoint);
        if (!ownerPoint) break;
        currentEdgeId = ownerEdgeId;
        currentPoint = ownerPoint;
    }
    return { edgeId: currentEdgeId, point: currentPoint };
};

const intersectionKey = (intersection: LineJumpOwnershipIntersection): string => (
    `${intersection.horizontalEdgeId}\u0000${intersection.verticalEdgeId}`
    + `\u0000${intersection.point.x.toFixed(3)}\u0000${intersection.point.y.toFixed(3)}`
);

/**
 * Reassigns bridge paint from a hidden shared-trunk member to the edge that
 * actually paints that geometry. Boundaries stay with the member so a split
 * fragment can render the full bridge without producing a duplicate owner arc.
 */
export const resolveLineJumpPaintOwnership = <T extends LineJumpOwnershipIntersection>(
    intersections: readonly T[],
    edgePaths: readonly LineJumpOwnershipEdgePath[],
): T[] => {
    if (intersections.length === 0 || edgePaths.length === 0) return [...intersections];
    const pathsById = new Map(edgePaths.map(path => [path.edgeId, path]));
    const seen = new Set<string>();
    const resolved: T[] = [];
    for (const intersection of intersections) {
        const owner = resolveHorizontalPaintOwner(intersection, pathsById);
        const candidate = owner.edgeId === intersection.horizontalEdgeId
            ? intersection
            : { ...intersection, horizontalEdgeId: owner.edgeId, point: owner.point };
        const key = intersectionKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);
        resolved.push(candidate);
    }
    return resolved;
};
