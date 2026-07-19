import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import type { SegmentRef } from './edgeCrossingRepairTypes';
import { EDGE_CROSSING_EPSILON } from './edgeCrossingRepairTypes';

export function touchesProtectedJunction(segment: SegmentRef, pointCount: number, types: Set<BuddyGroup['type']> | undefined): boolean {
    if (!types) return false;
    if (types.has('o2m') && segment.segIdx <= 1) return true;
    if (types.has('m2o') && segment.segIdx + 1 >= pointCount - 2) return true;
    return false;
}

export function canShiftProtectedBranchSegment(
    segment: SegmentRef,
    pointCount: number,
    types: Set<BuddyGroup['type']> | undefined
): boolean {
    if (!types) return false;
    if (types.has('o2m') && segment.segIdx === 1 && pointCount > 3) return true;
    if (types.has('m2o') && segment.segIdx === pointCount - 3 && pointCount > 3) return true;
    return false;
}

export function preservesProtectedJunctions(candidate: Point[], original: Point[], types: Set<BuddyGroup['type']> | undefined): boolean {
    if (!types) return true;
    if (types.has('o2m') && types.has('m2o')) return preservesBridgeEndpointLanes(candidate, original);
    if (types.has('o2m') && original.length > 2 && !samePoint(candidate[1], original[1])) {
        if (!preservesOrExtendsSourceTrunk(candidate, original)) return false;
    }
    if (types.has('m2o') && original.length > 2 && !samePoint(candidate[candidate.length - 2], original[original.length - 2])) {
        if (!preservesOrExtendsTargetTrunk(candidate, original)) return false;
    }
    return true;
}

function preservesBridgeEndpointLanes(candidate: Point[], original: Point[]): boolean {
    if (candidate.length < 2 || original.length < 2) return false;
    if (!samePoint(candidate[0], original[0]) || !samePoint(candidate[candidate.length - 1], original[original.length - 1])) return false;
    return preservesSameEndpointLane(candidate[0], candidate[1], original[0], original[1])
        && preservesSameEndpointLane(candidate[candidate.length - 1], candidate[candidate.length - 2], original[original.length - 1], original[original.length - 2]);
}

function preservesSameEndpointLane(anchor: Point, next: Point, originalAnchor: Point, originalNext: Point): boolean {
    if (!samePoint(anchor, originalAnchor)) return false;
    const axis = axisOf(originalAnchor, originalNext);
    if (!axis || axisOf(anchor, next) !== axis) return false;
    const originalDelta = axis === 'h' ? originalNext.x - originalAnchor.x : originalNext.y - originalAnchor.y;
    const candidateDelta = axis === 'h' ? next.x - anchor.x : next.y - anchor.y;
    return Math.sign(originalDelta) === Math.sign(candidateDelta) && Math.abs(candidateDelta) > EDGE_CROSSING_EPSILON;
}

export function preservesEndpointDirections(candidate: Point[], original: Point[]): boolean {
    const originalStart = endpointDirection(original, 'start');
    const originalEnd = endpointDirection(original, 'end');
    const candidateStart = endpointDirection(candidate, 'start');
    const candidateEnd = endpointDirection(candidate, 'end');
    if (originalStart && candidateStart !== originalStart) return false;
    if (originalEnd && candidateEnd !== originalEnd) return false;
    return true;
}

function endpointDirection(points: Point[], side: 'start' | 'end'): 'L' | 'R' | 'U' | 'D' | null {
    const start = side === 'start' ? 0 : points.length - 2;
    const end = side === 'start' ? points.length - 1 : -1;
    const step = side === 'start' ? 1 : -1;
    for (let i = start; i !== end; i += step) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > EDGE_CROSSING_EPSILON) return dx > 0 ? 'R' : 'L';
        if (Math.abs(dy) > EDGE_CROSSING_EPSILON) return dy > 0 ? 'D' : 'U';
    }
    return null;
}

function preservesOrExtendsSourceTrunk(candidate: Point[], original: Point[]): boolean {
    if (candidate.length < 2 || original.length < 2) return false;
    if (!samePoint(candidate[0], original[0])) return false;
    return isSameAxisAndNotShorter(original[0], original[1], candidate[1]);
}

function preservesOrExtendsTargetTrunk(candidate: Point[], original: Point[]): boolean {
    if (candidate.length < 2 || original.length < 2) return false;
    const originalEnd = original[original.length - 1];
    const originalJoin = original[original.length - 2];
    const candidateEnd = candidate[candidate.length - 1];
    const candidateJoin = candidate[candidate.length - 2];
    if (!samePoint(candidateEnd, originalEnd)) return false;
    return isSameAxisAndNotShorter(originalEnd, originalJoin, candidateJoin);
}

function isSameAxisAndNotShorter(anchor: Point, originalJoin: Point, candidateJoin: Point): boolean {
    const originalAxis = axisOf(anchor, originalJoin);
    if (!originalAxis) return false;
    if (axisOf(anchor, candidateJoin) !== originalAxis) return false;

    const originalDelta = originalAxis === 'h' ? originalJoin.x - anchor.x : originalJoin.y - anchor.y;
    const candidateDelta = originalAxis === 'h' ? candidateJoin.x - anchor.x : candidateJoin.y - anchor.y;
    if (Math.abs(originalDelta) < EDGE_CROSSING_EPSILON || Math.abs(candidateDelta) < EDGE_CROSSING_EPSILON) return false;
    if (Math.sign(originalDelta) !== Math.sign(candidateDelta)) return false;
    return Math.abs(candidateDelta) + EDGE_CROSSING_EPSILON >= Math.abs(originalDelta);
}

export function countPathObstacleHits(points: Point[], obstacles: Rectangle[], ignored: Rectangle[]): number {
    let hits = 0;
    for (let i = 0; i < points.length - 1; i++) {
        for (const obstacle of obstacles) {
            if (ignored.some(rect => sameRect(rect, obstacle))) continue;
            if (segmentIntersectsRectInterior(points[i], points[i + 1], obstacle, 2)) hits++;
        }
    }
    return hits;
}

function segmentIntersectsRectInterior(a: Point, b: Point, rect: Rectangle, padding: number): boolean {
    const left = rect.x + padding;
    const right = rect.x + rect.width - padding;
    const top = rect.y + padding;
    const bottom = rect.y + rect.height - padding;
    if (right <= left || bottom <= top) return false;

    if (Math.abs(a.x - b.x) < EDGE_CROSSING_EPSILON) {
        const x = a.x;
        if (x <= left || x >= right) return false;
        return Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
    }
    if (Math.abs(a.y - b.y) < EDGE_CROSSING_EPSILON) {
        const y = a.y;
        if (y <= top || y >= bottom) return false;
        return Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
    }
    return false;
}

export function isOrthogonal(points: Point[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const hasLength = Math.abs(a.x - b.x) > EDGE_CROSSING_EPSILON || Math.abs(a.y - b.y) > EDGE_CROSSING_EPSILON;
        if (hasLength && Math.abs(a.x - b.x) >= EDGE_CROSSING_EPSILON && Math.abs(a.y - b.y) >= EDGE_CROSSING_EPSILON) return false;
    }
    return true;
}

export function axisOf(a: Point, b: Point): 'h' | 'v' | null {
    if (Math.abs(a.y - b.y) < EDGE_CROSSING_EPSILON) return 'h';
    if (Math.abs(a.x - b.x) < EDGE_CROSSING_EPSILON) return 'v';
    return null;
}


export function samePoint(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < EDGE_CROSSING_EPSILON && Math.abs(a.y - b.y) < EDGE_CROSSING_EPSILON;
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
    return Math.abs(a.x - b.x) < EDGE_CROSSING_EPSILON
        && Math.abs(a.y - b.y) < EDGE_CROSSING_EPSILON
        && Math.abs(a.width - b.width) < EDGE_CROSSING_EPSILON
        && Math.abs(a.height - b.height) < EDGE_CROSSING_EPSILON;
}
