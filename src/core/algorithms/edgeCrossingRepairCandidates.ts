import type { Point } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import { RoutingCrossingScorer } from './routingCrossingScorer';
import {
    axisOf,
    canShiftProtectedBranchSegment,
    isOrthogonal,
    preservesEndpointDirections,
    preservesProtectedJunctions,
    samePoint,
    touchesProtectedJunction,
} from './edgeCrossingRepairGeometry';
import type { CrossingHit, SegmentRef } from './edgeCrossingRepairTypes';
import { EDGE_CROSSING_EPSILON } from './edgeCrossingRepairTypes';

export function buildSharedTrunkJunctionCandidates(
    crossing: CrossingHit,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    mutableEdgeIds: Set<string> | undefined,
    preserveEndpointDirectionsOption: boolean | undefined
): Array<{ edgeId: string; points: Point[] }> {
    if (!crossing.sameBuddy) return [];

    const point = { x: crossing.x, y: crossing.y };
    const candidates: Array<{ edgeId: string; points: Point[] }> = [];
    const addCandidatePath = (edgeId: string, original: Point[] | undefined, candidate: Point[]) => {
        if (!original || candidate.length < 2) return;
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        if (simplified.length < 2) return;
        if (!isOrthogonal(simplified)) return;
        if (!samePoint(simplified[0], original[0])) return;
        if (!samePoint(simplified[simplified.length - 1], original[original.length - 1])) return;
        if (preserveEndpointDirectionsOption && !preservesEndpointDirections(simplified, original)) return;
        candidates.push({ edgeId, points: simplified });
    };
    const addCandidate = (segment: SegmentRef, mode: BuddyGroup['type']) => {
        if (mutableEdgeIds && !mutableEdgeIds.has(segment.edgeId)) return;
        const points = allPaths.get(segment.edgeId);
        if (!points || points.length < 3) return;
        const types = buddyTypesByEdgeId.get(segment.edgeId);
        if (!types?.has(mode)) return;

        let candidate: Point[];
        if (mode === 'o2m') {
            const start = points[0];
            if (!samePoint(start, allPaths.get(crossing.h.edgeId)?.[0] ?? start)
                || !samePoint(start, allPaths.get(crossing.v.edgeId)?.[0] ?? start)) {
                return;
            }
            candidate = [
                { ...start },
                point,
                ...points.slice(segment.segIdx + 1).map(p => ({ ...p })),
            ];
        } else {
            const end = points[points.length - 1];
            const hPath = allPaths.get(crossing.h.edgeId);
            const vPath = allPaths.get(crossing.v.edgeId);
            if (!samePoint(end, hPath?.[hPath.length - 1] ?? end)
                || !samePoint(end, vPath?.[vPath.length - 1] ?? end)) {
                return;
            }
            candidate = [
                ...points.slice(0, segment.segIdx + 1).map(p => ({ ...p })),
                point,
                { ...end },
            ];
        }

        addCandidatePath(segment.edgeId, points, candidate);
    };

    const addBorrowedFanInSuffixCandidate = (moving: SegmentRef, peer: SegmentRef) => {
        if (mutableEdgeIds && !mutableEdgeIds.has(moving.edgeId)) return;
        const movingPoints = allPaths.get(moving.edgeId);
        const peerPoints = allPaths.get(peer.edgeId);
        if (!movingPoints || !peerPoints || movingPoints.length < 3 || peerPoints.length < 3) return;
        if (!buddyTypesByEdgeId.get(moving.edgeId)?.has('m2o')) return;
        if (!buddyTypesByEdgeId.get(peer.edgeId)?.has('m2o')) return;

        const movingEnd = movingPoints[movingPoints.length - 1];
        const peerEnd = peerPoints[peerPoints.length - 1];
        if (!samePoint(movingEnd, peerEnd)) return;

        const suffix = peerPoints.slice(peer.segIdx + 1).map(p => ({ ...p }));
        if (suffix.length < 1) return;
        if (!axisOf(point, suffix[0]) && !samePoint(point, suffix[0])) return;

        addCandidatePath(moving.edgeId, movingPoints, [
            ...movingPoints.slice(0, moving.segIdx + 1).map(p => ({ ...p })),
            point,
            ...suffix,
        ]);
    };

    addCandidate(crossing.h, 'o2m');
    addCandidate(crossing.v, 'o2m');
    addCandidate(crossing.h, 'm2o');
    addCandidate(crossing.v, 'm2o');
    addBorrowedFanInSuffixCandidate(crossing.h, crossing.v);
    addBorrowedFanInSuffixCandidate(crossing.v, crossing.h);

    return candidates;
}

export function buildShiftCandidates(
    moving: SegmentRef,
    blocker: SegmentRef,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined,
    preserveEndpointDirectionsOption: boolean | undefined
): Array<{ edgeId: string; points: Point[] }> {
    if (mutableEdgeIds && !mutableEdgeIds.has(moving.edgeId)) return [];
    const points = allPaths.get(moving.edgeId);
    if (!points || points.length < 3) return [];
    const buddyTypes = buddyTypesByEdgeId.get(moving.edgeId);
    if (touchesProtectedJunction(moving, points.length, buddyTypes)
        && !canShiftProtectedBranchSegment(moving, points.length, buddyTypes)) {
        return [];
    }

    const values = moving.h
        ? axisValues(Math.min(blocker.a.y, blocker.b.y), Math.max(blocker.a.y, blocker.b.y), spacing)
        : axisValues(Math.min(blocker.a.x, blocker.b.x), Math.max(blocker.a.x, blocker.b.x), spacing);

    const candidates: Array<{ edgeId: string; points: Point[] }> = [];
    const originalAxis = moving.h ? moving.a.y : moving.a.x;
    for (const value of values) {
        if (Math.abs(value - originalAxis) < spacing) continue;
        const candidate = points.map(point => ({ ...point }));
        if (moving.h) {
            candidate[moving.segIdx].y = value;
            candidate[moving.segIdx + 1].y = value;
        } else {
            candidate[moving.segIdx].x = value;
            candidate[moving.segIdx + 1].x = value;
        }
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        if (simplified.length < 2) continue;
        if (!isOrthogonal(simplified)) continue;
        if (!samePoint(simplified[0], points[0])) continue;
        if (!samePoint(simplified[simplified.length - 1], points[points.length - 1])) continue;
        if (preserveEndpointDirectionsOption && !preservesEndpointDirections(simplified, points)) continue;
        if (!preservesProtectedJunctions(simplified, points, buddyTypes)) continue;
        candidates.push({ edgeId: moving.edgeId, points: simplified });
    }

    return candidates;
}

export function buildDetourCandidates(
    moving: SegmentRef,
    blocker: SegmentRef,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined,
    preserveEndpointDirectionsOption: boolean | undefined
): Array<{ edgeId: string; points: Point[] }> {
    if (mutableEdgeIds && !mutableEdgeIds.has(moving.edgeId)) return [];
    const points = allPaths.get(moving.edgeId);
    if (!points || points.length < 2) return [];
    if (moving.h === blocker.h) return [];

    const buddyTypes = buddyTypesByEdgeId.get(moving.edgeId);
    const candidates: Array<{ edgeId: string; points: Point[] }> = [];
    const add = (candidate: Point[]) => {
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        if (simplified.length < 2) return;
        if (!isOrthogonal(simplified)) return;
        if (!samePoint(simplified[0], points[0])) return;
        if (!samePoint(simplified[simplified.length - 1], points[points.length - 1])) return;
        if (preserveEndpointDirectionsOption && !preservesEndpointDirections(simplified, points)) return;
        if (!preservesProtectedJunctions(simplified, points, buddyTypes)) return;
        candidates.push({ edgeId: moving.edgeId, points: simplified });
    };

    if (moving.v && blocker.h) {
        const direction = Math.sign(moving.b.y - moving.a.y);
        if (direction === 0) return [];
        const crossingY = blocker.a.y;
        const beforeY = crossingY - direction * spacing;
        const minY = Math.min(moving.a.y, moving.b.y);
        const maxY = Math.max(moving.a.y, moving.b.y);
        if (beforeY <= minY + EDGE_CROSSING_EPSILON || beforeY >= maxY - EDGE_CROSSING_EPSILON) return [];

        const blockerMinX = Math.min(blocker.a.x, blocker.b.x);
        const blockerMaxX = Math.max(blocker.a.x, blocker.b.x);
        const sideXs = [blockerMinX - spacing, blockerMaxX + spacing]
            .sort((a, b) => Math.abs(a - moving.a.x) - Math.abs(b - moving.a.x));

        for (const sideX of sideXs) {
            add([
                ...points.slice(0, moving.segIdx + 1).map(p => ({ ...p })),
                { x: moving.a.x, y: beforeY },
                { x: sideX, y: beforeY },
                { x: sideX, y: moving.b.y },
                ...points.slice(moving.segIdx + 1).map(p => ({ ...p })),
            ]);
        }

        const blockerPoints = allPaths.get(blocker.edgeId);
        if (blockerPoints && blockerPoints.length >= 2) {
            const minBlockerX = Math.min(...blockerPoints.map(point => point.x));
            const maxBlockerX = Math.max(...blockerPoints.map(point => point.x));
            const detourYs = [...new Set(blockerPoints.flatMap(point => [
                Math.round(point.y - spacing),
                Math.round(point.y + spacing),
            ]))].sort((y1, y2) => Math.abs(y1 - moving.a.y) - Math.abs(y2 - moving.a.y));
            const wideSideXs = [minBlockerX - spacing, maxBlockerX + spacing]
                .sort((x1, x2) => Math.abs(x1 - moving.a.x) - Math.abs(x2 - moving.a.x));

            for (const detourY of detourYs) {
                if (Math.abs(detourY - moving.a.y) < EDGE_CROSSING_EPSILON || Math.abs(detourY - moving.b.y) < EDGE_CROSSING_EPSILON) continue;
                for (const sideX of wideSideXs) {
                    add([
                        ...points.slice(0, moving.segIdx + 1).map(p => ({ ...p })),
                        { x: moving.a.x, y: detourY },
                        { x: sideX, y: detourY },
                        { x: sideX, y: moving.b.y },
                        ...points.slice(moving.segIdx + 1).map(p => ({ ...p })),
                    ]);
                }
            }
        }
    } else if (moving.h && blocker.v) {
        const direction = Math.sign(moving.b.x - moving.a.x);
        if (direction === 0) return [];
        const crossingX = blocker.a.x;
        const beforeX = crossingX - direction * spacing;
        const minX = Math.min(moving.a.x, moving.b.x);
        const maxX = Math.max(moving.a.x, moving.b.x);
        if (beforeX <= minX + EDGE_CROSSING_EPSILON || beforeX >= maxX - EDGE_CROSSING_EPSILON) return [];

        const blockerMinY = Math.min(blocker.a.y, blocker.b.y);
        const blockerMaxY = Math.max(blocker.a.y, blocker.b.y);
        const sideYs = [blockerMinY - spacing, blockerMaxY + spacing]
            .sort((a, b) => Math.abs(a - moving.a.y) - Math.abs(b - moving.a.y));

        for (const sideY of sideYs) {
            add([
                ...points.slice(0, moving.segIdx + 1).map(p => ({ ...p })),
                { x: beforeX, y: moving.a.y },
                { x: beforeX, y: sideY },
                { x: moving.b.x, y: sideY },
                ...points.slice(moving.segIdx + 1).map(p => ({ ...p })),
            ]);
        }

        const blockerPoints = allPaths.get(blocker.edgeId);
        if (blockerPoints && blockerPoints.length >= 2) {
            const minBlockerY = Math.min(...blockerPoints.map(point => point.y));
            const maxBlockerY = Math.max(...blockerPoints.map(point => point.y));
            const detourXs = [...new Set(blockerPoints.flatMap(point => [
                Math.round(point.x - spacing),
                Math.round(point.x + spacing),
            ]))].sort((x1, x2) => Math.abs(x1 - moving.a.x) - Math.abs(x2 - moving.a.x));
            const wideSideYs = [minBlockerY - spacing, maxBlockerY + spacing]
                .sort((y1, y2) => Math.abs(y1 - moving.a.y) - Math.abs(y2 - moving.a.y));

            for (const detourX of detourXs) {
                if (Math.abs(detourX - moving.a.x) < EDGE_CROSSING_EPSILON || Math.abs(detourX - moving.b.x) < EDGE_CROSSING_EPSILON) continue;
                for (const sideY of wideSideYs) {
                    add([
                        ...points.slice(0, moving.segIdx + 1).map(p => ({ ...p })),
                        { x: detourX, y: moving.a.y },
                        { x: detourX, y: sideY },
                        { x: moving.b.x, y: sideY },
                        ...points.slice(moving.segIdx + 1).map(p => ({ ...p })),
                    ]);
                }
            }
        }
    }

    return candidates;
}

export function buildParallelOverlapShiftCandidates(
    moving: SegmentRef,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined,
    preserveEndpointDirectionsOption: boolean | undefined
): Array<{ edgeId: string; points: Point[] }> {
    if (mutableEdgeIds && !mutableEdgeIds.has(moving.edgeId)) return [];
    const points = allPaths.get(moving.edgeId);
    if (!points || points.length < 2) return [];
    const buddyTypes = buddyTypesByEdgeId.get(moving.edgeId);
    const protectedEndpointOnly = touchesProtectedJunction(moving, points.length, buddyTypes)
        && !canShiftProtectedBranchSegment(moving, points.length, buddyTypes);

    const candidates: Array<{ edgeId: string; points: Point[] }> = [];
    if (!protectedEndpointOnly && points.length >= 3) {
        for (const delta of parallelOverlapOffsets(spacing)) {
            const candidate = points.map(point => ({ ...point }));
            if (moving.h) {
                candidate[moving.segIdx].y += delta;
                candidate[moving.segIdx + 1].y += delta;
            } else {
                candidate[moving.segIdx].x += delta;
                candidate[moving.segIdx + 1].x += delta;
            }
            const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
            if (simplified.length < 2) continue;
            if (!isOrthogonal(simplified)) continue;
            if (!samePoint(simplified[0], points[0])) continue;
            if (!samePoint(simplified[simplified.length - 1], points[points.length - 1])) continue;
            if (preserveEndpointDirectionsOption && !preservesEndpointDirections(simplified, points)) continue;
            if (!preservesProtectedJunctions(simplified, points, buddyTypes)) continue;
            candidates.push({ edgeId: moving.edgeId, points: simplified });
        }
    }
    candidates.push(...buildParallelOverlapDoglegCandidates(
        moving,
        points,
        buddyTypes,
        spacing,
        preserveEndpointDirectionsOption,
        protectedEndpointOnly,
    ));
    return candidates;
}

function buildParallelOverlapDoglegCandidates(
    moving: SegmentRef,
    points: Point[],
    buddyTypes: Set<BuddyGroup['type']> | undefined,
    spacing: number,
    preserveEndpointDirectionsOption: boolean | undefined,
    allowProtectedEndpointDogleg: boolean,
): Array<{ edgeId: string; points: Point[] }> {
    const candidates: Array<{ edgeId: string; points: Point[] }> = [];
    const segmentLength = Math.abs(moving.a.x - moving.b.x) + Math.abs(moving.a.y - moving.b.y);
    const stub = Math.max(8, Math.min(spacing * 1.5, 36, segmentLength / 5));
    if (segmentLength < stub * 2 + spacing) return candidates;

    for (const delta of parallelOverlapOffsets(spacing)) {
        const replacement = buildDoglegReplacement(moving.a, moving.b, delta, stub);
        if (replacement.length === 0) continue;

        const candidate = [
            ...points.slice(0, moving.segIdx).map(point => ({ ...point })),
            ...replacement,
            ...points.slice(moving.segIdx + 2).map(point => ({ ...point })),
        ];
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        if (simplified.length < 2) continue;
        if (!isOrthogonal(simplified)) continue;
        if (!samePoint(simplified[0], points[0])) continue;
        if (!samePoint(simplified[simplified.length - 1], points[points.length - 1])) continue;
        if (preserveEndpointDirectionsOption && !preservesEndpointDirections(simplified, points)) continue;
        if (allowProtectedEndpointDogleg && !preservesEndpointDirections(simplified, points)) continue;
        if (!allowProtectedEndpointDogleg && !preservesProtectedJunctions(simplified, points, buddyTypes)) continue;
        candidates.push({ edgeId: moving.edgeId, points: simplified });
    }

    return candidates;
}

function parallelOverlapOffsets(spacing: number): number[] {
    return [1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8, 12, -12, 16, -16]
        .map(step => Math.round(step * spacing));
}

function buildDoglegReplacement(a: Point, b: Point, delta: number, stub: number): Point[] {
    if (Math.abs(a.y - b.y) < EDGE_CROSSING_EPSILON) {
        const direction = Math.sign(b.x - a.x);
        if (direction === 0) return [];
        const first = { x: a.x + direction * stub, y: a.y };
        const second = { x: first.x, y: a.y + delta };
        const third = { x: b.x - direction * stub, y: a.y + delta };
        const fourth = { x: third.x, y: b.y };
        return [{ ...a }, first, second, third, fourth, { ...b }];
    }
    if (Math.abs(a.x - b.x) < EDGE_CROSSING_EPSILON) {
        const direction = Math.sign(b.y - a.y);
        if (direction === 0) return [];
        const first = { x: a.x, y: a.y + direction * stub };
        const second = { x: a.x + delta, y: first.y };
        const third = { x: a.x + delta, y: b.y - direction * stub };
        const fourth = { x: b.x, y: third.y };
        return [{ ...a }, first, second, third, fourth, { ...b }];
    }
    return [];
}

function axisValues(min: number, max: number, spacing: number): number[] {
    const values: number[] = [];
    for (let step = 1; step <= 16; step++) {
        values.push(min - spacing * step, max + spacing * step);
    }
    return [...new Set(values.map(Math.round))];
}
