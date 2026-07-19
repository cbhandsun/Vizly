import type { Point, Rectangle } from '../types/routing';
import {
  buildEndApproachPoints,
  buildStartEscapePoints,
  candidatePathLength,
  clonePoint,
  getDoglegCompactionAxisValues,
  isHorizontalDirection,
  samePoint,
} from './orthogonalWaypointRefinerUtils';
import { RoutingCrossingScorer } from './routingCrossingScorer';
import type {
  EndpointLocks,
  OrthogonalDirection,
  ProtectedTrunkLocks,
  WaypointRefinementOptions,
} from './orthogonalWaypointRefinerTypes';

export function getDominantVerticalAxis(points: Point[]): number {
    let bestAxis = points[0]?.x ?? 0;
    let bestLength = -Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.x - b.x) >= 1.5) continue;
        const length = Math.abs(a.y - b.y);
        if (length > bestLength) {
            bestLength = length;
            bestAxis = (a.x + b.x) / 2;
        }
    }
    return bestAxis;
}

export function getParallelVerticalClearance(
    edgeId: string,
    axis: number,
    minY: number,
    maxY: number,
    allPaths: Map<string, Point[]>
): number {
    let clearance = Infinity;
    for (const [otherEdgeId, points] of allPaths) {
        if (otherEdgeId === edgeId) continue;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (Math.abs(a.x - b.x) >= 1.5) continue;
            const otherMinY = Math.min(a.y, b.y);
            const otherMaxY = Math.max(a.y, b.y);
            if (!rangesOverlap(minY, maxY, otherMinY, otherMaxY)) continue;
            clearance = Math.min(clearance, Math.abs(axis - ((a.x + b.x) / 2)));
        }
    }
    return Number.isFinite(clearance) ? clearance : 9999;
}

export function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
    return aMax > bMin && bMax > aMin;
}

export function pathIntroducesObstacleHit(candidate: Point[], originalHits: Set<number>, obstacles: Rectangle[]): boolean {
    for (let i = 0; i < candidate.length - 1; i++) {
        const a = candidate[i];
        const b = candidate[i + 1];
        for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
            if (originalHits.has(obstacleIndex)) continue;
            if (RoutingCrossingScorer.segmentIntersectsRect(a, b, obstacles[obstacleIndex], 3)) {
                return true;
            }
        }
    }
    return false;
}

export function collectHitObstacleIndexes(points: Point[], obstacles: Rectangle[]): Set<number> {
    const hits = new Set<number>();
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
            if (RoutingCrossingScorer.segmentIntersectsRect(a, b, obstacles[obstacleIndex], 3)) {
                hits.add(obstacleIndex);
            }
        }
    }
    return hits;
}

export function isScoreNoWorse(
    candidate: ReturnType<RoutingCrossingScorer['score']>,
    current: ReturnType<RoutingCrossingScorer['score']>
): boolean {
    return candidate.hardCrossings <= current.hardCrossings
        && candidate.buddyCrossings <= current.buddyCrossings
        && candidate.parallelOverlaps <= current.parallelOverlaps
        && candidate.softCrossings <= current.softCrossings
        && candidate.softNearMisses <= current.softNearMisses
        && candidate.turnbacks <= current.turnbacks
        && candidate.bends <= current.bends;
}

export function hasCompressibleDoglegs(edgePaths: Map<string, Point[]>, fixedEdgeIds: Set<string>, spacing: number): boolean {
    for (const [edgeId, points] of edgePaths) {
        if (fixedEdgeIds.has(edgeId) || points.length < 5) continue;
        if (hasCompressibleDogleg(points, spacing)) return true;
    }
    return false;
}

export function hasCompressibleDogleg(points: Point[] | undefined, spacing: number): boolean {
    if (!points || points.length < 5) return false;
    for (let segIdx = 1; segIdx < points.length - 2; segIdx++) {
        const a = points[segIdx];
        const b = points[segIdx + 1];
        const isHorizontal = Math.abs(a.y - b.y) < 1.5;
        const isVertical = Math.abs(a.x - b.x) < 1.5;
        if (!isHorizontal && !isVertical) continue;
        if (getDoglegCompactionAxisValues(points, segIdx, isHorizontal, spacing).length > 0) {
            return true;
        }
    }
    return false;
}

export function touchesProtectedTrunkJunction(segIdx: number, pointCount: number, locks: ProtectedTrunkLocks): boolean {
    // Moving segment segIdx changes points[segIdx] and points[segIdx + 1].
    // O2M shared trunk owns point[1]; M2O shared trunk owns point[n - 2].
    if (locks.lockFirstJunction && segIdx <= 1) return true;
    if (locks.lockLastJunction && segIdx + 1 >= pointCount - 2) return true;
    return false;
}

export function buildEndpointLocks(points: Point[], locks: ProtectedTrunkLocks): EndpointLocks {
    return {
        firstJunction: locks.lockFirstJunction && points.length > 2 ? clonePoint(points[1]) : undefined,
        lastJunction: locks.lockLastJunction && points.length > 2 ? clonePoint(points[points.length - 2]) : undefined,
    };
}

export function preservesProtectedTrunkJunctions(
    candidate: Point[],
    original: Point[],
    locks: ProtectedTrunkLocks
): boolean {
    if (locks.lockFirstJunction) {
        if (candidate.length < 3 || original.length < 3) return false;
        if (!samePoint(candidate[1], original[1])) return false;
    }
    if (locks.lockLastJunction) {
        if (candidate.length < 3 || original.length < 3) return false;
        if (!samePoint(candidate[candidate.length - 2], original[original.length - 2])) return false;
    }
    return true;
}

export function preservesEndpointDirections(
    points: Point[],
    startDir: ReturnType<typeof getFirstDirection>,
    endDir: ReturnType<typeof getLastDirection>
): boolean {
    if (startDir) {
        const candidateStartDir = getFirstDirection(points);
        if (candidateStartDir !== startDir) return false;
    }
    if (endDir) {
        const candidateEndDir = getLastDirection(points);
        if (candidateEndDir !== endDir) return false;
    }
    return true;
}

export function isStrictlyOrthogonalPath(points: Point[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const isHorizontal = Math.abs(a.y - b.y) < 1.5;
        const isVertical = Math.abs(a.x - b.x) < 1.5;
        const hasLength = Math.abs(a.x - b.x) > 1.5 || Math.abs(a.y - b.y) > 1.5;
        if (hasLength && !isHorizontal && !isVertical) return false;
    }
    return true;
}

export function getFirstDirection(points: Point[]): OrthogonalDirection | null {
    for (let i = 0; i < points.length - 1; i++) {
        const dir = RoutingCrossingScorer.segmentDirection(points[i], points[i + 1]);
        if (dir) return dir;
    }
    return null;
}

export function getLastDirection(points: Point[]): OrthogonalDirection | null {
    for (let i = points.length - 2; i >= 0; i--) {
        const dir = RoutingCrossingScorer.segmentDirection(points[i], points[i + 1]);
        if (dir) return dir;
    }
    return null;
}

export function buildRerouteCandidates(
    start: Point,
    end: Point,
    candidateAxes: WaypointRefinementOptions['candidateAxes'],
    spacing: number,
    startDir: OrthogonalDirection | null,
    endDir: OrthogonalDirection | null,
    endpointLocks: EndpointLocks = {},
    maxCandidates = 128
): Point[][] {
    const candidates: Point[][] = [];
    const horizontalAxes = selectNearAxes(candidateAxes?.horizontal, start.y, end.y, spacing);
    const verticalAxes = selectNearAxes(candidateAxes?.vertical, start.x, end.x, spacing);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    // Simple one-bend choices.
    candidates.push([start, { x: end.x, y: start.y }, end]);
    candidates.push([start, { x: start.x, y: end.y }, end]);

    // H/V-first doglegs through semantic axes.
    const escapeVerticalAxes = new Set<number>([
        ...verticalAxes,
        midX,
        minX - spacing * 8,
        minX - spacing * 14,
        maxX + spacing * 8,
        maxX + spacing * 14,
    ]);
    const escapeHorizontalAxes = new Set<number>([
        ...horizontalAxes,
        midY,
        minY - spacing * 8,
        minY - spacing * 14,
        maxY + spacing * 8,
        maxY + spacing * 14,
    ]);

    for (const axis of escapeVerticalAxes) {
        candidates.push([start, { x: axis, y: start.y }, { x: axis, y: end.y }, end]);
    }
    for (const axis of escapeHorizontalAxes) {
        candidates.push([start, { x: start.x, y: axis }, { x: end.x, y: axis }, end]);
    }

    const startEscapes = buildStartEscapePoints(start, startDir, spacing, endpointLocks.firstJunction);
    const endApproaches = buildEndApproachPoints(end, endDir, spacing, endpointLocks.lastJunction);
    const horizontalCorridors = [...escapeHorizontalAxes].slice(0, 40);
    const verticalCorridors = [...escapeVerticalAxes].slice(0, 40);

    if (startDir && endDir) {
        if (isHorizontalDirection(startDir) && isHorizontalDirection(endDir)) {
            for (const startEscape of startEscapes) {
                for (const endApproach of endApproaches) {
                    for (const axis of horizontalCorridors) {
                        if (endpointLocks.firstJunction && Math.abs(axis - startEscape.y) < 1.5) continue;
                        if (endpointLocks.lastJunction && Math.abs(axis - endApproach.y) < 1.5) continue;
                        candidates.push([
                            start,
                            startEscape,
                            { x: startEscape.x, y: axis },
                            { x: endApproach.x, y: axis },
                            endApproach,
                            end,
                        ]);
                    }
                }
            }
        } else if (!isHorizontalDirection(startDir) && !isHorizontalDirection(endDir)) {
            for (const startEscape of startEscapes) {
                for (const endApproach of endApproaches) {
                    for (const axis of verticalCorridors) {
                        if (endpointLocks.firstJunction && Math.abs(axis - startEscape.x) < 1.5) continue;
                        if (endpointLocks.lastJunction && Math.abs(axis - endApproach.x) < 1.5) continue;
                        candidates.push([
                            start,
                            startEscape,
                            { x: axis, y: startEscape.y },
                            { x: axis, y: endApproach.y },
                            endApproach,
                            end,
                        ]);
                    }
                }
            }
        } else if (isHorizontalDirection(startDir) && !isHorizontalDirection(endDir)) {
            for (const startEscape of startEscapes) {
                for (const endApproach of endApproaches) {
                    candidates.push([
                        start,
                        startEscape,
                        { x: startEscape.x, y: endApproach.y },
                        endApproach,
                        end,
                    ]);
                }
            }
        } else {
            for (const startEscape of startEscapes) {
                for (const endApproach of endApproaches) {
                    candidates.push([
                        start,
                        startEscape,
                        { x: endApproach.x, y: startEscape.y },
                        endApproach,
                        end,
                    ]);
                }
            }
        }
    }

    // Centered fallback doglegs keep the path short when semantic axes are sparse.
    candidates.push([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
    candidates.push([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);

    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        const key = simplified.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => candidatePathLength(a) - candidatePathLength(b))
        .slice(0, maxCandidates);
}

function selectNearAxes(axes: number[] | undefined, a: number, b: number, spacing: number): number[] {
    const min = Math.min(a, b) - spacing * 18;
    const max = Math.max(a, b) + spacing * 18;
    const values = new Set<number>();
    for (const axis of axes ?? []) {
        if (axis >= min && axis <= max) values.add(axis);
    }
    values.add((a + b) / 2);
    return [...values]
        .sort((x, y) => Math.abs(x - (a + b) / 2) - Math.abs(y - (a + b) / 2))
        .slice(0, 12);
}
