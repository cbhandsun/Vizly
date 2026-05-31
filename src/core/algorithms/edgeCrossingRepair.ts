import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import { RoutingCrossingScorer } from './routingCrossingScorer';

export interface EdgeCrossingRepairOptions {
    obstacles?: Rectangle[];
    ignoredRectsByEdge?: Map<string, Rectangle[]>;
    buddyGroups?: BuddyGroup[];
    spacing?: number;
    maxIterations?: number;
    mutableEdgeIds?: Set<string>;
    allowObstacleHitIfImprovesCrossing?: boolean;
}

interface SegmentRef {
    edgeId: string;
    segIdx: number;
    a: Point;
    b: Point;
    h: boolean;
    v: boolean;
}

interface CrossingHit {
    h: SegmentRef;
    v: SegmentRef;
    x: number;
    y: number;
    sameBuddy: boolean;
}

const EPS = 1.5;

export function repairEdgeCrossingViolations(
    edgePaths: Map<string, Point[]>,
    options: EdgeCrossingRepairOptions = {}
): Map<string, Point[]> {
    if (edgePaths.size < 2) return edgePaths;

    const result = new Map<string, Point[]>();
    edgePaths.forEach((points, edgeId) => {
        result.set(edgeId, points.map(point => ({ ...point })));
    });

    const spacing = options.spacing ?? 12;
    const obstacles = (options.obstacles ?? []).filter(rect => rect && rect.width > 1 && rect.height > 1);
    const buddyGroupByEdgeId = buildBuddyGroupLookup(options.buddyGroups ?? []);
    const buddyTypesByEdgeId = buildBuddyTypeLookup(options.buddyGroups ?? []);
    const scorer = new RoutingCrossingScorer({
        buddyGroups: options.buddyGroups,
        parallelOverlapMinLength: Math.max(24, spacing * 3),
    });
    let currentScore = scorer.score(result);

    for (let iteration = 0; iteration < (options.maxIterations ?? 4); iteration++) {
        const crossings = findRepairableCrossings(result, buddyGroupByEdgeId);
        if (crossings.length === 0) break;

        let repaired: { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;
        for (const crossing of crossings) {
            repaired = chooseBestCrossingRepair(
                crossing,
                result,
                currentScore,
                scorer,
                obstacles,
                options.ignoredRectsByEdge,
                buddyTypesByEdgeId,
                spacing,
                options.mutableEdgeIds,
                options.allowObstacleHitIfImprovesCrossing
            );
            if (repaired) break;
        }
        if (!repaired) break;

        result.set(repaired.edgeId, repaired.points);
        currentScore = repaired.score;
    }

    return result;
}

function chooseBestCrossingRepair(
    crossing: CrossingHit,
    allPaths: Map<string, Point[]>,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    scorer: RoutingCrossingScorer,
    obstacles: Rectangle[],
    ignoredRectsByEdge: Map<string, Rectangle[]> | undefined,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined,
    allowObstacleHitIfImprovesCrossing: boolean | undefined
): { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null {
    const candidates = [
        ...buildSharedTrunkJunctionCandidates(crossing, allPaths, buddyTypesByEdgeId, mutableEdgeIds),
        ...buildDetourCandidates(crossing.h, crossing.v, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds),
        ...buildDetourCandidates(crossing.v, crossing.h, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds),
        ...buildShiftCandidates(crossing.h, crossing.v, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds),
        ...buildShiftCandidates(crossing.v, crossing.h, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds),
    ];

    let best: { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number; obstacleHits: number } | null = null;
    for (const candidate of candidates) {
        const ignored = ignoredRectsByEdge?.get(candidate.edgeId) ?? [];
        const obstacleHits = countPathObstacleHits(candidate.points, obstacles, ignored);
        if (!allowObstacleHitIfImprovesCrossing && obstacleHits > 0) continue;

        const trial = new Map(allPaths);
        trial.set(candidate.edgeId, candidate.points);
        const score = scorer.score(trial);
        if (!scorer.isBetter(score, currentScore)) continue;

        const length = RoutingCrossingScorer.pathLength(candidate.points);
        if (
            !best ||
            isCandidatePreferred(score, obstacleHits, length, best.score, best.obstacleHits, best.length, scorer)
        ) {
            best = { edgeId: candidate.edgeId, points: candidate.points, score, length, obstacleHits };
        }
    }
    return best;
}

function isCandidatePreferred(
    candidateScore: ReturnType<RoutingCrossingScorer['score']>,
    candidateObstacleHits: number,
    candidateLength: number,
    currentBestScore: ReturnType<RoutingCrossingScorer['score']>,
    currentBestObstacleHits: number,
    currentBestLength: number,
    scorer: RoutingCrossingScorer
): boolean {
    if (candidateScore.hardCrossings !== currentBestScore.hardCrossings) {
        return candidateScore.hardCrossings < currentBestScore.hardCrossings;
    }
    if (candidateObstacleHits !== currentBestObstacleHits) {
        return candidateObstacleHits < currentBestObstacleHits;
    }
    if (candidateScore.buddyCrossings !== currentBestScore.buddyCrossings) {
        return candidateScore.buddyCrossings < currentBestScore.buddyCrossings;
    }
    if (scorer.isBetter(candidateScore, currentBestScore)) return true;
    if (candidateScore.totalScore !== currentBestScore.totalScore) return false;
    return candidateLength < currentBestLength;
}

function buildSharedTrunkJunctionCandidates(
    crossing: CrossingHit,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    mutableEdgeIds: Set<string> | undefined
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
        candidates.push({ edgeId, points: simplified });
    };
    const addCandidate = (segment: SegmentRef, mode: BuddyGroup['type']) => {
        if (mutableEdgeIds && !mutableEdgeIds.has(segment.edgeId)) return;
        const points = allPaths.get(segment.edgeId);
        if (!points || points.length < 3) return;
        const types = buddyTypesByEdgeId.get(segment.edgeId);
        if (!types?.has(mode)) return;

        let candidate: Point[] | null = null;
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

function buildShiftCandidates(
    moving: SegmentRef,
    blocker: SegmentRef,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined
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
        if (!preservesProtectedJunctions(simplified, points, buddyTypes)) continue;
        candidates.push({ edgeId: moving.edgeId, points: simplified });
    }

    return candidates;
}

function buildDetourCandidates(
    moving: SegmentRef,
    blocker: SegmentRef,
    allPaths: Map<string, Point[]>,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined
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
        if (beforeY <= minY + EPS || beforeY >= maxY - EPS) return [];

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
                if (Math.abs(detourY - moving.a.y) < EPS || Math.abs(detourY - moving.b.y) < EPS) continue;
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
        if (beforeX <= minX + EPS || beforeX >= maxX - EPS) return [];

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
                if (Math.abs(detourX - moving.a.x) < EPS || Math.abs(detourX - moving.b.x) < EPS) continue;
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

function axisValues(min: number, max: number, spacing: number): number[] {
    const values: number[] = [];
    for (let step = 1; step <= 16; step++) {
        values.push(min - spacing * step, max + spacing * step);
    }
    return [...new Set(values.map(Math.round))];
}

function findRepairableCrossings(
    paths: Map<string, Point[]>,
    buddyGroupByEdgeId: Map<string, Set<string>>
): CrossingHit[] {
    const hits: CrossingHit[] = [];
    const segments = extractSegments(paths);
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const a = segments[i];
            const b = segments[j];
            if (a.edgeId === b.edgeId) continue;
            if (a.h === b.h) continue;
            const h = a.h ? a : b;
            const v = a.v ? a : b;
            const hx1 = Math.min(h.a.x, h.b.x);
            const hx2 = Math.max(h.a.x, h.b.x);
            const vy1 = Math.min(v.a.y, v.b.y);
            const vy2 = Math.max(v.a.y, v.b.y);
            const x = v.a.x;
            const y = h.a.y;
            if (x > hx1 + 2 && x < hx2 - 2 && y > vy1 + 2 && y < vy2 - 2) {
                hits.push({
                    h,
                    v,
                    x,
                    y,
                    sameBuddy: shareBuddyGroup(a.edgeId, b.edgeId, buddyGroupByEdgeId),
                });
            }
        }
    }
    hits.sort((a, b) => Number(a.sameBuddy) - Number(b.sameBuddy));
    return hits;
}

function extractSegments(paths: Map<string, Point[]>): SegmentRef[] {
    const segments: SegmentRef[] = [];
    for (const [edgeId, points] of paths) {
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const h = Math.abs(a.y - b.y) < EPS;
            const v = Math.abs(a.x - b.x) < EPS;
            if ((!h && !v) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 8) continue;
            segments.push({ edgeId, segIdx: i, a, b, h, v });
        }
    }
    return segments;
}

function touchesProtectedJunction(segment: SegmentRef, pointCount: number, types: Set<BuddyGroup['type']> | undefined): boolean {
    if (!types) return false;
    if (types.has('o2m') && segment.segIdx <= 1) return true;
    if (types.has('m2o') && segment.segIdx + 1 >= pointCount - 2) return true;
    return false;
}

function canShiftProtectedBranchSegment(
    segment: SegmentRef,
    pointCount: number,
    types: Set<BuddyGroup['type']> | undefined
): boolean {
    if (!types) return false;
    if (types.has('o2m') && segment.segIdx === 1 && pointCount > 3) return true;
    if (types.has('m2o') && segment.segIdx === pointCount - 3 && pointCount > 3) return true;
    return false;
}

function preservesProtectedJunctions(candidate: Point[], original: Point[], types: Set<BuddyGroup['type']> | undefined): boolean {
    if (!types) return true;
    if (types.has('o2m') && original.length > 2 && !samePoint(candidate[1], original[1])) {
        if (!preservesOrExtendsSourceTrunk(candidate, original)) return false;
    }
    if (types.has('m2o') && original.length > 2 && !samePoint(candidate[candidate.length - 2], original[original.length - 2])) {
        if (!preservesOrExtendsTargetTrunk(candidate, original)) return false;
    }
    return true;
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
    if (Math.abs(originalDelta) < EPS || Math.abs(candidateDelta) < EPS) return false;
    if (Math.sign(originalDelta) !== Math.sign(candidateDelta)) return false;
    return Math.abs(candidateDelta) + EPS >= Math.abs(originalDelta);
}

function countPathObstacleHits(points: Point[], obstacles: Rectangle[], ignored: Rectangle[]): number {
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

    if (Math.abs(a.x - b.x) < EPS) {
        const x = a.x;
        if (x <= left || x >= right) return false;
        return Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
    }
    if (Math.abs(a.y - b.y) < EPS) {
        const y = a.y;
        if (y <= top || y >= bottom) return false;
        return Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
    }
    return false;
}

function isOrthogonal(points: Point[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const hasLength = Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS;
        if (hasLength && Math.abs(a.x - b.x) >= EPS && Math.abs(a.y - b.y) >= EPS) return false;
    }
    return true;
}

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
    if (Math.abs(a.y - b.y) < EPS) return 'h';
    if (Math.abs(a.x - b.x) < EPS) return 'v';
    return null;
}

function buildBuddyGroupLookup(groups: BuddyGroup[]): Map<string, Set<string>> {
    const lookup = new Map<string, Set<string>>();
    groups.forEach((group, index) => {
        const key = `${group.type}:${index}`;
        group.edgeIds.forEach(edgeId => {
            if (!lookup.has(edgeId)) lookup.set(edgeId, new Set());
            lookup.get(edgeId)!.add(key);
        });
    });
    return lookup;
}

function buildBuddyTypeLookup(groups: BuddyGroup[]): Map<string, Set<BuddyGroup['type']>> {
    const lookup = new Map<string, Set<BuddyGroup['type']>>();
    groups.forEach(group => {
        group.edgeIds.forEach(edgeId => {
            if (!lookup.has(edgeId)) lookup.set(edgeId, new Set());
            lookup.get(edgeId)!.add(group.type);
        });
    });
    return lookup;
}

function shareBuddyGroup(edgeA: string, edgeB: string, lookup: Map<string, Set<string>>): boolean {
    const a = lookup.get(edgeA);
    const b = lookup.get(edgeB);
    if (!a || !b) return false;
    for (const group of a) {
        if (b.has(group)) return true;
    }
    return false;
}

function samePoint(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
    return Math.abs(a.x - b.x) < EPS
        && Math.abs(a.y - b.y) < EPS
        && Math.abs(a.width - b.width) < EPS
        && Math.abs(a.height - b.height) < EPS;
}
