import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import { RoutingCrossingScorer, type RoutingCrossingScorerOptions } from './routingCrossingScorer';

export interface WaypointRefinementOptions {
    buddyGroups?: BuddyGroup[];
    fixedEdgeIds?: Set<string>;
    hardObstacles?: Rectangle[];
    softObstacles?: Rectangle[];
    spacing?: number;
    maxPasses?: number;
    maxEdgesPerPass?: number;
    candidateAxes?: {
        horizontal?: number[];
        vertical?: number[];
    };
    enableReroute?: boolean;
    maxRerouteEdges?: number;
    maxRerouteCandidates?: number;
    maxSegmentShiftCandidatesPerEdge?: number;
    scoring?: Omit<RoutingCrossingScorerOptions, 'buddyGroups' | 'softObstacles'>;
}

export interface WaypointRefinementSummary {
    initial: ScoreSummary;
    final: ScoreSummary;
    segmentShiftChanges: number;
    rerouteChanges: number;
    changedEdgeIds: string[];
    consideredEdges: number;
    skippedBuddyEdges: number;
}

interface ScoreSummary {
    totalScore: number;
    hardCrossings: number;
    buddyCrossings: number;
    parallelOverlaps: number;
    softCrossings: number;
    softNearMisses: number;
    turnbacks: number;
    bends: number;
}

export interface WaypointRefinementResult {
    paths: Map<string, Point[]>;
    summary: WaypointRefinementSummary;
}

export function refineOrthogonalWaypoints(
    edgePaths: Map<string, Point[]>,
    options: WaypointRefinementOptions = {}
): Map<string, Point[]> {
    return refineOrthogonalWaypointsDetailed(edgePaths, options).paths;
}

export function refineOrthogonalWaypointsDetailed(
    edgePaths: Map<string, Point[]>,
    options: WaypointRefinementOptions = {}
): WaypointRefinementResult {
    if (edgePaths.size === 0) {
        const emptyScore = summarizeScore(new RoutingCrossingScorer().score(edgePaths));
        return {
            paths: edgePaths,
            summary: {
                initial: emptyScore,
                final: emptyScore,
                segmentShiftChanges: 0,
                rerouteChanges: 0,
                changedEdgeIds: [],
                consideredEdges: 0,
                skippedBuddyEdges: 0,
            },
        };
    }

    // [FIX-dual] 使用 Set 存储类型，支持双身份边同时是 o2m 和 m2o
    const buddyTypesByEdgeId = new Map<string, Set<BuddyGroup['type']>>();
    const fixedEdgeIds = options.fixedEdgeIds ?? new Set<string>();
    (options.buddyGroups ?? []).forEach(group => {
        group.edgeIds.forEach(edgeId => {
            if (!buddyTypesByEdgeId.has(edgeId)) buddyTypesByEdgeId.set(edgeId, new Set());
            buddyTypesByEdgeId.get(edgeId)!.add(group.type);
        });
    });

    const hardObstacles = (options.hardObstacles ?? []).filter(o => o && o.width > 1 && o.height > 1);
    const spacing = options.spacing ?? 12;
    const scorer = new RoutingCrossingScorer({
        ...options.scoring,
        buddyGroups: options.buddyGroups,
        softObstacles: options.softObstacles,
    });

    const result = new Map<string, Point[]>();
    edgePaths.forEach((points, edgeId) => {
        result.set(edgeId, points.map(p => ({ x: p.x, y: p.y })));
    });

    let currentScore = scorer.score(result);
    const initialScore = currentScore;
    const changedEdgeIds = new Set<string>();
    let consideredEdges = 0;
    let segmentShiftChanges = 0;
    let rerouteChanges = 0;

    const buildSummary = (): WaypointRefinementResult => ({
        paths: result,
        summary: {
            initial: summarizeScore(initialScore),
            final: summarizeScore(currentScore),
            segmentShiftChanges,
            rerouteChanges,
            changedEdgeIds: [...changedEdgeIds],
            consideredEdges,
            skippedBuddyEdges: 0,
        },
    });

    if (currentScore.totalScore === 0 && !hasCompressibleDoglegs(result, fixedEdgeIds, spacing)) return buildSummary();

    const maxPasses = Math.min(options.maxPasses ?? 2, getDefaultMaxPasses(result.size));
    const maxEdgesPerPass = Math.min(options.maxEdgesPerPass ?? Infinity, getDefaultMaxEdgesPerPass(result.size));
    const maxSegmentShiftCandidatesPerEdge =
        options.maxSegmentShiftCandidatesPerEdge ?? getDefaultMaxSegmentShiftCandidates(result.size);

    for (let pass = 0; pass < maxPasses && (currentScore.totalScore > 0 || hasCompressibleDoglegs(result, fixedEdgeIds, spacing)); pass++) {
        let changedInPass = false;
        let checked = 0;
        // [FIX-obstacle] Buddy 边不再完全跳过。
        // 它们参与 refiner，但通过 getProtectedTrunkLocks 保护 trunk 段。
        // 只有 fixedEdgeIds（缓存命中的边）才完全跳过。
        const orderedEdgeIds = [...result.keys()]
            .filter(edgeId => !fixedEdgeIds.has(edgeId))
            .filter(edgeId => (currentScore.byEdge.get(edgeId) ?? 0) > 0
                || hasCompressibleDogleg(result.get(edgeId), spacing))
            .sort((a, b) => (currentScore.byEdge.get(b) ?? 0) - (currentScore.byEdge.get(a) ?? 0));

        for (const edgeId of orderedEdgeIds) {
            const points = result.get(edgeId);
            if (!points || points.length < 4) continue;
            checked++;
            consideredEdges++;
            if (checked > maxEdgesPerPass) break;

            const candidate = findLowerScoreVariant(
                edgeId,
                points,
                result,
                scorer,
                hardObstacles,
                options.softObstacles ?? [],
                spacing,
                currentScore,
                options.candidateAxes,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId)),
                maxSegmentShiftCandidatesPerEdge
            );
            const compactedCandidate = candidate ?? findObstacleAwareDoglegCompaction(
                edgeId,
                points,
                result,
                scorer,
                hardObstacles,
                spacing,
                currentScore,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId))
            ) ?? findWrongSideDoglegCompaction(
                edgeId,
                points,
                result,
                scorer,
                hardObstacles,
                spacing,
                currentScore,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId))
            ) ?? findOuterLaneReroute(
                edgeId,
                points,
                result,
                scorer,
                hardObstacles,
                spacing,
                currentScore,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId))
            );

            if (!compactedCandidate) continue;
            result.set(edgeId, compactedCandidate.points);
            changedEdgeIds.add(edgeId);
            segmentShiftChanges++;
            currentScore = compactedCandidate.score;
            changedInPass = true;
        }

        if (!changedInPass) break;
    }

    if (options.enableReroute !== false && currentScore.totalScore > 0) {
        const rerouteResult = rerouteWorstEdges(
            result,
            scorer,
            buddyTypesByEdgeId,
            fixedEdgeIds,
            hardObstacles,
            spacing,
            currentScore,
            options.candidateAxes,
            Math.min(options.maxRerouteEdges ?? Infinity, getDefaultMaxRerouteEdges(result.size)),
            Math.min(options.maxRerouteCandidates ?? Infinity, getDefaultMaxRerouteCandidates(result.size))
        );
        currentScore = rerouteResult.score;
        rerouteResult.changedEdgeIds.forEach(edgeId => changedEdgeIds.add(edgeId));
        rerouteChanges += rerouteResult.changedEdgeIds.length;
        consideredEdges += rerouteResult.consideredEdges;
    }

    return buildSummary();
}

function rerouteWorstEdges(
    paths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    fixedEdgeIds: Set<string>,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    candidateAxes: WaypointRefinementOptions['candidateAxes'],
    maxEdges: number,
    maxCandidatesPerEdge: number
): {
    score: ReturnType<RoutingCrossingScorer['score']>;
    changedEdgeIds: string[];
    consideredEdges: number;
} {
    const ordered = [...paths.keys()]
        .filter(edgeId => !fixedEdgeIds.has(edgeId))
        .filter(edgeId => (currentScore.byEdge.get(edgeId) ?? 0) > 0)
        .sort((a, b) => (currentScore.byEdge.get(b) ?? 0) - (currentScore.byEdge.get(a) ?? 0))
        .slice(0, maxEdges);

    let score = currentScore;
    let consideredEdges = 0;
    const changedEdgeIds: string[] = [];
    for (const edgeId of ordered) {
        const points = paths.get(edgeId);
        if (!points || points.length < 2 || (score.byEdge.get(edgeId) ?? 0) <= 0) continue;
        consideredEdges++;

        const candidate = findLowerScoreReroute(
            edgeId,
            points,
            paths,
            scorer,
            hardObstacles,
            spacing,
            score,
            candidateAxes,
            getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId)),
            maxCandidatesPerEdge
        );

        if (!candidate) continue;
        paths.set(edgeId, candidate.points);
        changedEdgeIds.push(edgeId);
        score = candidate.score;
    }

    return { score, changedEdgeIds, consideredEdges };
}

function getDefaultMaxRerouteEdges(pathCount: number): number {
    if (pathCount > 80) return 3;
    if (pathCount > 40) return 4;
    if (pathCount > 20) return 4;
    return 8;
}

function getDefaultMaxPasses(pathCount: number): number {
    if (pathCount > 80) return 1;
    if (pathCount > 40) return 1;
    if (pathCount > 20) return 2;
    return 2;
}

function getDefaultMaxEdgesPerPass(pathCount: number): number {
    if (pathCount > 80) return 24;
    if (pathCount > 40) return 32;
    if (pathCount > 20) return 18;
    return 80;
}

function getDefaultMaxRerouteCandidates(pathCount: number): number {
    if (pathCount > 80) return 48;
    if (pathCount > 40) return 72;
    if (pathCount > 20) return 160;
    return 128;
}

function getDefaultMaxSegmentShiftCandidates(pathCount: number): number {
    if (pathCount > 80) return 24;
    if (pathCount > 40) return 32;
    if (pathCount > 20) return 32;
    return 128;
}

interface ProtectedTrunkLocks {
    lockFirstJunction?: boolean;
    lockLastJunction?: boolean;
}

type OrthogonalDirection = 'L' | 'R' | 'U' | 'D';

interface EndpointLocks {
    firstJunction?: Point;
    lastJunction?: Point;
}

function getProtectedTrunkLocks(types: Set<BuddyGroup['type']> | undefined): ProtectedTrunkLocks {
    if (!types) return {};
    return {
        lockFirstJunction: types.has('o2m'),
        lockLastJunction: types.has('m2o'),
    };
}

function summarizeScore(score: ReturnType<RoutingCrossingScorer['score']>): ScoreSummary {
    return {
        totalScore: score.totalScore,
        hardCrossings: score.hardCrossings,
        buddyCrossings: score.buddyCrossings,
        parallelOverlaps: score.parallelOverlaps,
        softCrossings: score.softCrossings,
        softNearMisses: score.softNearMisses,
        turnbacks: score.turnbacks,
        bends: score.bends,
    };
}

function findLowerScoreVariant(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    hardObstacles: Rectangle[],
    softObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    candidateAxes?: WaypointRefinementOptions['candidateAxes'],
    protectedTrunkLocks: ProtectedTrunkLocks = {},
    maxCandidates = 128
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    let best: { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;
    const originalLength = RoutingCrossingScorer.pathLength(points);
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);
    let scoredCandidates = 0;

    segmentLoop:
    for (let segIdx = 1; segIdx < points.length - 2; segIdx++) {
        if (touchesProtectedTrunkJunction(segIdx, points.length, protectedTrunkLocks)) continue;
        const a = points[segIdx];
        const b = points[segIdx + 1];
        const isHorizontal = Math.abs(a.y - b.y) < 1.5;
        const isVertical = Math.abs(a.x - b.x) < 1.5;
        if (!isHorizontal && !isVertical) continue;

        const base = isHorizontal ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
        const candidateValues = getCandidateAxisValues(
            base,
            isHorizontal ? candidateAxes?.horizontal : candidateAxes?.vertical,
            spacing,
            [
                ...getCrossingAwareAxisValues(edgeId, a, b, allPaths, softObstacles, isHorizontal, spacing),
                ...getDoglegShrinkAxisValues(edgeId, points, segIdx, allPaths, isHorizontal, spacing),
                ...getDoglegCompactionAxisValues(points, segIdx, isHorizontal, spacing),
            ]
        );

        for (const value of candidateValues) {
            if (Math.abs(value - base) < 1) continue;

            const candidate = points.map(p => ({ x: p.x, y: p.y }));
            if (isHorizontal) {
                candidate[segIdx].y = value;
                candidate[segIdx + 1].y = value;
            } else {
                candidate[segIdx].x = value;
                candidate[segIdx + 1].x = value;
            }

                const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
                if (simplified.length < 2) continue;
                if (samePath(simplified, points)) continue;
                if (!isStrictlyOrthogonalPath(simplified)) continue;
                if (!preservesEndpointDirections(simplified, originalStartDir, originalEndDir)) continue;
                if (!preservesProtectedTrunkJunctions(simplified, points, protectedTrunkLocks)) continue;
                if (RoutingCrossingScorer.pathLength(simplified) > originalLength + spacing * 8) continue;
                if (RoutingCrossingScorer.pathHitsObstacle(simplified, hardObstacles)) continue;
                if (scoredCandidates >= maxCandidates) break segmentLoop;

            const trial = new Map(allPaths);
            trial.set(edgeId, simplified);
            const length = RoutingCrossingScorer.pathLength(simplified);
            scoredCandidates++;
            const score = scorer.score(trial);
            const isImprovement = scorer.isBetter(score, currentScore);
            const isSafeCompaction = isScoreNoWorse(score, currentScore)
                && length < originalLength - spacing * 2;
            if (!isImprovement && !isSafeCompaction) continue;

            if (!best || scorer.isBetter(score, best.score) || (score.totalScore === best.score.totalScore && length < best.length)) {
                best = { points: simplified, score, length };
            }
        }
    }

    return best ? { points: best.points, score: best.score } : null;
}

function findObstacleAwareDoglegCompaction(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    protectedTrunkLocks: ProtectedTrunkLocks = {}
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    if (points.length < 5) return null;

    const start = points[0];
    const end = points[points.length - 1];
    if (Math.abs(start.x - end.x) > spacing * 3) return null;

    const horizontalSegments: Array<{ a: Point; b: Point; index: number }> = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.y - b.y) < 1.5 && Math.abs(a.x - b.x) > spacing * 2) {
            horizontalSegments.push({ a, b, index: i });
        }
    }
    if (horizontalSegments.length < 2) return null;

    const firstSkirt = horizontalSegments[0];
    const lastSkirt = horizontalSegments[horizontalSegments.length - 1];
    const anchorX = (start.x + end.x) / 2;
    const farthest = points
        .slice(1, -1)
        .map(point => ({ point, dev: point.x - anchorX }))
        .reduce((best, item) => Math.abs(item.dev) > Math.abs(best.dev) ? item : best, { point: points[1], dev: 0 });
    const side = Math.sign(farthest.dev);
    if (side === 0 || Math.abs(farthest.dev) < spacing * 8) return null;

    const currentAxis = side > 0
        ? Math.max(...points.map(point => point.x))
        : Math.min(...points.map(point => point.x));
    const topY = firstSkirt.a.y;
    const bottomY = lastSkirt.a.y;
    if (Math.abs(topY - bottomY) < spacing * 3) return null;

    const originalLength = RoutingCrossingScorer.pathLength(points);
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);
    const originalHitObstacleIndexes = collectHitObstacleIndexes(points, hardObstacles);
    const padding = Math.max(8, spacing);
    const minY = Math.min(topY, bottomY);
    const maxY = Math.max(topY, bottomY);
    let requiredAxis = anchorX + side * spacing * 4;

    for (const rect of hardObstacles) {
        const rectTop = rect.y - padding;
        const rectBottom = rect.y + rect.height + padding;
        if (!rangesOverlap(minY, maxY, rectTop, rectBottom)) continue;

        if (side > 0) {
            const blocksCorridor = rect.x + rect.width > anchorX + spacing
                && rect.x < currentAxis - spacing;
            if (blocksCorridor) requiredAxis = Math.max(requiredAxis, rect.x + rect.width + padding);
        } else {
            const blocksCorridor = rect.x < anchorX - spacing
                && rect.x + rect.width > currentAxis + spacing;
            if (blocksCorridor) requiredAxis = Math.min(requiredAxis, rect.x - padding);
        }
    }

    const rawCandidates = side > 0
        ? [requiredAxis, requiredAxis + spacing, requiredAxis + spacing * 2, anchorX + spacing * 5, anchorX + spacing * 6]
        : [requiredAxis, requiredAxis - spacing, requiredAxis - spacing * 2, anchorX - spacing * 5, anchorX - spacing * 6];

    let best: { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;
    for (const axis of rawCandidates) {
        if (side > 0 && (axis >= currentAxis - spacing * 2 || axis <= anchorX + spacing * 2)) continue;
        if (side < 0 && (axis <= currentAxis + spacing * 2 || axis >= anchorX - spacing * 2)) continue;

        const candidate = RoutingCrossingScorer.simplifyOrthogonalPoints([
            start,
            { x: start.x, y: topY },
            { x: axis, y: topY },
            { x: axis, y: bottomY },
            { x: end.x, y: bottomY },
            end,
        ]);

        if (protectedTrunkLocks.lockFirstJunction && candidate.length > 2) {
            const preserved = Math.abs(candidate[1].x - points[1].x) < 1.5
                && Math.abs(candidate[1].y - points[1].y) < 1.5;
            if (!preserved) continue;
        }
        if (protectedTrunkLocks.lockLastJunction && candidate.length > 3) {
            const candidateJunction = candidate[candidate.length - 2];
            const originalJunction = points[points.length - 2];
            const preserved = Math.abs(candidateJunction.x - originalJunction.x) < 1.5
                && Math.abs(candidateJunction.y - originalJunction.y) < 1.5;
            if (!preserved) continue;
        }

        if (candidate.length < 2) continue;
        if (samePath(candidate, points)) continue;
        if (!isStrictlyOrthogonalPath(candidate)) continue;
        if (!preservesEndpointDirections(candidate, originalStartDir, originalEndDir)) continue;
        if (pathIntroducesObstacleHit(candidate, originalHitObstacleIndexes, hardObstacles)) continue;

        const length = RoutingCrossingScorer.pathLength(candidate);
        if (length >= originalLength - spacing * 3) continue;

        const trial = new Map(allPaths);
        trial.set(edgeId, candidate);
        const score = scorer.score(trial);
        const safe = score.hardCrossings <= currentScore.hardCrossings
            && score.buddyCrossings <= currentScore.buddyCrossings
            && score.parallelOverlaps <= currentScore.parallelOverlaps
            && score.softCrossings <= currentScore.softCrossings
            && score.turnbacks <= currentScore.turnbacks
            && score.bends <= currentScore.bends;
        if (!safe) continue;

        if (!best || length < best.length || (length === best.length && scorer.isBetter(score, best.score))) {
            best = { points: candidate, score, length };
        }
    }

    return best ? { points: best.points, score: best.score } : null;
}

function findWrongSideDoglegCompaction(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    protectedTrunkLocks: ProtectedTrunkLocks = {}
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    if (points.length < 5) return null;

    const start = points[0];
    const end = points[points.length - 1];
    const minAnchorX = Math.min(start.x, end.x);
    const maxAnchorX = Math.max(start.x, end.x);
    const anchorWidth = maxAnchorX - minAnchorX;
    if (anchorWidth < spacing * 8) return null;

    const originalLength = RoutingCrossingScorer.pathLength(points);
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);
    const originalHitObstacleIndexes = collectHitObstacleIndexes(points, hardObstacles);
    let best: { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;

    for (let segIdx = 1; segIdx < points.length - 2; segIdx++) {
        if (touchesProtectedTrunkJunction(segIdx, points.length, protectedTrunkLocks)) continue;

        const a = points[segIdx];
        const b = points[segIdx + 1];
        if (Math.abs(a.x - b.x) >= 1.5 || Math.abs(a.y - b.y) < spacing * 3) continue;

        const axis = (a.x + b.x) / 2;
        const isLeftWrongSide = axis < minAnchorX - spacing * 5;
        const isRightWrongSide = axis > maxAnchorX + spacing * 5;
        if (!isLeftWrongSide && !isRightWrongSide) continue;

        const side = isLeftWrongSide ? 1 : -1;
        const yA = a.y;
        const yB = b.y;
        const bypassMinY = Math.min(yA, yB);
        const bypassMaxY = Math.max(yA, yB);
        const padding = Math.max(8, spacing);
        let requiredAxis = side > 0 ? minAnchorX + spacing * 4 : maxAnchorX - spacing * 4;

        for (const rect of hardObstacles) {
            if (!rangesOverlap(bypassMinY, bypassMaxY, rect.y - padding, rect.y + rect.height + padding)) continue;
            if (side > 0) {
                const blocksInterior = rect.x + rect.width > minAnchorX + spacing
                    && rect.x < maxAnchorX - spacing;
                if (blocksInterior) requiredAxis = Math.max(requiredAxis, rect.x + rect.width + padding);
            } else {
                const blocksInterior = rect.x < maxAnchorX - spacing
                    && rect.x + rect.width > minAnchorX + spacing;
                if (blocksInterior) requiredAxis = Math.min(requiredAxis, rect.x - padding);
            }
        }

        const rawCandidates = side > 0
            ? [
                requiredAxis,
                requiredAxis + spacing,
                requiredAxis + spacing * 2,
                requiredAxis + spacing * 3,
                requiredAxis + spacing * 4,
                requiredAxis + spacing * 5,
                (minAnchorX + maxAnchorX) / 2,
                maxAnchorX - spacing * 4,
            ]
            : [
                requiredAxis,
                requiredAxis - spacing,
                requiredAxis - spacing * 2,
                requiredAxis - spacing * 3,
                requiredAxis - spacing * 4,
                requiredAxis - spacing * 5,
                (minAnchorX + maxAnchorX) / 2,
                minAnchorX + spacing * 4,
            ];

        for (const candidateAxis of rawCandidates) {
            if (candidateAxis <= minAnchorX + spacing * 2 || candidateAxis >= maxAnchorX - spacing * 2) continue;
            if (Math.abs(candidateAxis - axis) < spacing * 4) continue;

            const candidate = RoutingCrossingScorer.simplifyOrthogonalPoints([
                start,
                { x: start.x, y: yA },
                { x: candidateAxis, y: yA },
                { x: candidateAxis, y: yB },
                { x: end.x, y: yB },
                end,
            ]);

            if (candidate.length < 2) continue;
            if (samePath(candidate, points)) continue;
            if (!isStrictlyOrthogonalPath(candidate)) continue;
            if (!preservesEndpointDirections(candidate, originalStartDir, originalEndDir)) continue;
            if (pathIntroducesObstacleHit(candidate, originalHitObstacleIndexes, hardObstacles)) continue;

            const length = RoutingCrossingScorer.pathLength(candidate);
            if (length >= originalLength - spacing * 4) continue;

            const trial = new Map(allPaths);
            trial.set(edgeId, candidate);
            const score = scorer.score(trial);
            const safe = score.hardCrossings <= currentScore.hardCrossings
                && score.buddyCrossings <= currentScore.buddyCrossings
                && score.parallelOverlaps <= currentScore.parallelOverlaps
                && score.softCrossings <= currentScore.softCrossings
                && score.softNearMisses <= currentScore.softNearMisses
                && score.turnbacks <= currentScore.turnbacks
                && score.bends <= currentScore.bends;
            if (!safe) continue;

            const clearance = getParallelVerticalClearance(edgeId, candidateAxis, bypassMinY, bypassMaxY, allPaths);
            const bestClearance = best
                ? getParallelVerticalClearance(edgeId, getDominantVerticalAxis(best.points), bypassMinY, bypassMaxY, allPaths)
                : -Infinity;

            if (!best
                || length < best.length
                || (length === best.length && scorer.isBetter(score, best.score))
                || (length === best.length && score.totalScore === best.score.totalScore && clearance > bestClearance + spacing)) {
                best = { points: candidate, score, length };
            }
        }
    }

    return best ? { points: best.points, score: best.score } : null;
}

function findOuterLaneReroute(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    protectedTrunkLocks: ProtectedTrunkLocks = {}
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    if (points.length < 5) return null;
    if ((currentScore.byEdge.get(edgeId) ?? 0) <= 0) return null;

    const start = points[0];
    const end = points[points.length - 1];
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);
    if (!originalStartDir || !originalEndDir) return null;

    const horizontalReturn =
        (originalStartDir === 'R' && originalEndDir === 'L')
        || (originalStartDir === 'L' && originalEndDir === 'R');
    if (!horizontalReturn) return null;

    const minAnchorX = Math.min(start.x, end.x);
    const maxAnchorX = Math.max(start.x, end.x);
    const side = originalStartDir === 'R' ? 1 : -1;
    const axis = side > 0
        ? Math.max(...points.map(point => point.x))
        : Math.min(...points.map(point => point.x));
    if (side > 0 && axis < maxAnchorX + spacing * 2) return null;
    if (side < 0 && axis > minAnchorX - spacing * 2) return null;

    const candidate = RoutingCrossingScorer.simplifyOrthogonalPoints([
        start,
        { x: axis, y: start.y },
        { x: axis, y: end.y },
        end,
    ]);

    if (candidate.length < 2) return null;
    if (samePath(candidate, points)) return null;
    if (!isStrictlyOrthogonalPath(candidate)) return null;
    if (!preservesEndpointDirections(candidate, originalStartDir, originalEndDir)) return null;

    if (protectedTrunkLocks.lockFirstJunction && candidate.length > 2) {
        const preserved = Math.abs(candidate[1].x - points[1].x) < 1.5
            && Math.abs(candidate[1].y - points[1].y) < 1.5;
        if (!preserved) return null;
    }
    if (protectedTrunkLocks.lockLastJunction && candidate.length > 3) {
        const candidateJunction = candidate[candidate.length - 2];
        const originalJunction = points[points.length - 2];
        const preserved = Math.abs(candidateJunction.x - originalJunction.x) < 1.5
            && Math.abs(candidateJunction.y - originalJunction.y) < 1.5;
        if (!preserved) return null;
    }

    const originalLength = RoutingCrossingScorer.pathLength(points);
    const candidateLength = RoutingCrossingScorer.pathLength(candidate);
    if (candidateLength > originalLength + spacing * 12) return null;
    if (pathIntroducesObstacleHit(candidate, collectHitObstacleIndexes(points, hardObstacles), hardObstacles)) return null;

    const trial = new Map(allPaths);
    trial.set(edgeId, candidate);
    const score = scorer.score(trial);
    if (!scorer.isBetter(score, currentScore)) return null;

    return { points: candidate, score };
}

function getDominantVerticalAxis(points: Point[]): number {
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

function getParallelVerticalClearance(
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

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
    return aMax > bMin && bMax > aMin;
}

function pathIntroducesObstacleHit(candidate: Point[], originalHits: Set<number>, obstacles: Rectangle[]): boolean {
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

function collectHitObstacleIndexes(points: Point[], obstacles: Rectangle[]): Set<number> {
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

function isScoreNoWorse(
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

function hasCompressibleDoglegs(edgePaths: Map<string, Point[]>, fixedEdgeIds: Set<string>, spacing: number): boolean {
    for (const [edgeId, points] of edgePaths) {
        if (fixedEdgeIds.has(edgeId) || points.length < 5) continue;
        if (hasCompressibleDogleg(points, spacing)) return true;
    }
    return false;
}

function hasCompressibleDogleg(points: Point[] | undefined, spacing: number): boolean {
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

function touchesProtectedTrunkJunction(segIdx: number, pointCount: number, locks: ProtectedTrunkLocks): boolean {
    // Moving segment segIdx changes points[segIdx] and points[segIdx + 1].
    // O2M shared trunk owns point[1]; M2O shared trunk owns point[n - 2].
    if (locks.lockFirstJunction && segIdx <= 1) return true;
    if (locks.lockLastJunction && segIdx + 1 >= pointCount - 2) return true;
    return false;
}

function buildEndpointLocks(points: Point[], locks: ProtectedTrunkLocks): EndpointLocks {
    return {
        firstJunction: locks.lockFirstJunction && points.length > 2 ? clonePoint(points[1]) : undefined,
        lastJunction: locks.lockLastJunction && points.length > 2 ? clonePoint(points[points.length - 2]) : undefined,
    };
}

function preservesProtectedTrunkJunctions(
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

function findLowerScoreReroute(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    candidateAxes?: WaypointRefinementOptions['candidateAxes'],
    protectedTrunkLocks: ProtectedTrunkLocks = {},
    maxCandidates = 128
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    const start = points[0];
    const end = points[points.length - 1];
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);
    const originalLength = RoutingCrossingScorer.pathLength(points);
    const originalHitObstacleIndexes = collectHitObstacleIndexes(points, hardObstacles);
    const routeAwareAxes = buildRouteAwareAxes(edgeId, allPaths, points, spacing);
    const pathAxes = buildPathAxes(points);
    const candidates = buildRerouteCandidates(
        start,
        end,
        mergeCandidateAxes(mergeCandidateAxes(candidateAxes, routeAwareAxes), pathAxes),
        spacing,
        originalStartDir,
        originalEndDir,
        buildEndpointLocks(points, protectedTrunkLocks),
        maxCandidates
    );
    let best: { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;

    for (const candidate of candidates) {
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        if (simplified.length < 2) continue;
        if (samePath(simplified, points)) continue;
        if (!isStrictlyOrthogonalPath(simplified)) continue;
        if (!preservesEndpointDirections(simplified, originalStartDir, originalEndDir)) continue;
        if (!preservesProtectedTrunkJunctions(simplified, points, protectedTrunkLocks)) continue;
        const length = RoutingCrossingScorer.pathLength(simplified);
        const maxLengthIncrease = Math.max(spacing * 12, originalLength * 0.2);
        if (length > originalLength + maxLengthIncrease) continue;
        if (pathIntroducesObstacleHit(simplified, originalHitObstacleIndexes, hardObstacles)) continue;

        const trial = new Map(allPaths);
        trial.set(edgeId, simplified);
        const score = scorer.score(trial);
        const isImprovement = scorer.isBetter(score, currentScore);
        const isSafeCompaction = isScoreNoWorse(score, currentScore)
            && length < originalLength - spacing * 2;
        if (!isImprovement && !isSafeCompaction) continue;

        if (!best || scorer.isBetter(score, best.score) || (score.totalScore === best.score.totalScore && length < best.length)) {
            best = { points: simplified, score, length };
        }
    }

    return best ? { points: best.points, score: best.score } : null;
}

function mergeCandidateAxes(
    base: WaypointRefinementOptions['candidateAxes'],
    extra: { horizontal: number[]; vertical: number[] }
): { horizontal: number[]; vertical: number[] } {
    return {
        horizontal: [...new Set([...(base?.horizontal ?? []), ...extra.horizontal])],
        vertical: [...new Set([...(base?.vertical ?? []), ...extra.vertical])],
    };
}

function buildRouteAwareAxes(
    edgeId: string,
    allPaths: Map<string, Point[]>,
    points: Point[],
    spacing: number
): { horizontal: number[]; vertical: number[] } {
    const horizontal = new Set<number>();
    const vertical = new Set<number>();
    const minX = Math.min(...points.map(p => p.x)) - spacing * 24;
    const maxX = Math.max(...points.map(p => p.x)) + spacing * 24;
    const minY = Math.min(...points.map(p => p.y)) - spacing * 24;
    const maxY = Math.max(...points.map(p => p.y)) + spacing * 24;

    for (const [otherEdgeId, otherPoints] of allPaths) {
        if (otherEdgeId === edgeId) continue;
        for (let i = 0; i < otherPoints.length - 1; i++) {
            const a = otherPoints[i];
            const b = otherPoints[i + 1];
            const isHorizontal = Math.abs(a.y - b.y) < 1.5;
            const isVertical = Math.abs(a.x - b.x) < 1.5;
            if (isHorizontal) {
                const y = (a.y + b.y) / 2;
                const segMinX = Math.min(a.x, b.x);
                const segMaxX = Math.max(a.x, b.x);
                if (y < minY || y > maxY || segMaxX < minX || segMinX > maxX) continue;
                horizontal.add(Math.round(y - spacing));
                horizontal.add(Math.round(y + spacing));
                horizontal.add(Math.round(y - spacing * 2));
                horizontal.add(Math.round(y + spacing * 2));
                vertical.add(Math.round(segMinX - spacing));
                vertical.add(Math.round(segMaxX + spacing));
                vertical.add(Math.round(segMinX - spacing * 2));
                vertical.add(Math.round(segMaxX + spacing * 2));
            } else if (isVertical) {
                const x = (a.x + b.x) / 2;
                const segMinY = Math.min(a.y, b.y);
                const segMaxY = Math.max(a.y, b.y);
                if (x < minX || x > maxX || segMaxY < minY || segMinY > maxY) continue;
                vertical.add(Math.round(x - spacing));
                vertical.add(Math.round(x + spacing));
                vertical.add(Math.round(x - spacing * 2));
                vertical.add(Math.round(x + spacing * 2));
                horizontal.add(Math.round(segMinY - spacing));
                horizontal.add(Math.round(segMaxY + spacing));
                horizontal.add(Math.round(segMinY - spacing * 2));
                horizontal.add(Math.round(segMaxY + spacing * 2));
            }
        }
    }

    return {
        horizontal: [...horizontal].slice(0, 160),
        vertical: [...vertical].slice(0, 160),
    };
}

function buildPathAxes(points: Point[]): { horizontal: number[]; vertical: number[] } {
    const horizontal = new Set<number>();
    const vertical = new Set<number>();
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.y - b.y) < 1.5) {
            horizontal.add(Math.round((a.y + b.y) / 2));
        } else if (Math.abs(a.x - b.x) < 1.5) {
            vertical.add(Math.round((a.x + b.x) / 2));
        }
    }
    return { horizontal: [...horizontal], vertical: [...vertical] };
}

function preservesEndpointDirections(
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

function isStrictlyOrthogonalPath(points: Point[]): boolean {
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

function getFirstDirection(points: Point[]): OrthogonalDirection | null {
    for (let i = 0; i < points.length - 1; i++) {
        const dir = RoutingCrossingScorer.segmentDirection(points[i], points[i + 1]);
        if (dir) return dir;
    }
    return null;
}

function getLastDirection(points: Point[]): OrthogonalDirection | null {
    for (let i = points.length - 2; i >= 0; i--) {
        const dir = RoutingCrossingScorer.segmentDirection(points[i], points[i + 1]);
        if (dir) return dir;
    }
    return null;
}

function buildRerouteCandidates(
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

function buildStartEscapePoints(
    start: Point,
    direction: OrthogonalDirection | null,
    spacing: number,
    lockedPoint?: Point
): Point[] {
    if (lockedPoint) return [clonePoint(lockedPoint)];
    if (!direction) return [];
    return uniquePoints([4, 8, 12].map(mult => pointAlongDirection(start, direction, spacing * mult)));
}

function buildEndApproachPoints(
    end: Point,
    direction: OrthogonalDirection | null,
    spacing: number,
    lockedPoint?: Point
): Point[] {
    if (lockedPoint) return [clonePoint(lockedPoint)];
    if (!direction) return [];
    return uniquePoints([4, 8, 12].map(mult => pointAlongDirection(end, oppositeDirection(direction), spacing * mult)));
}

function candidatePathLength(points: Point[]): number {
    return RoutingCrossingScorer.pathLength(RoutingCrossingScorer.simplifyOrthogonalPoints(points));
}

function pointAlongDirection(point: Point, direction: OrthogonalDirection, distance: number): Point {
    switch (direction) {
        case 'L': return { x: point.x - distance, y: point.y };
        case 'R': return { x: point.x + distance, y: point.y };
        case 'U': return { x: point.x, y: point.y - distance };
        case 'D': return { x: point.x, y: point.y + distance };
    }
}

function oppositeDirection(direction: OrthogonalDirection): OrthogonalDirection {
    switch (direction) {
        case 'L': return 'R';
        case 'R': return 'L';
        case 'U': return 'D';
        case 'D': return 'U';
    }
}

function isHorizontalDirection(direction: OrthogonalDirection): boolean {
    return direction === 'L' || direction === 'R';
}

function uniquePoints(points: Point[]): Point[] {
    const seen = new Set<string>();
    return points.filter(point => {
        const key = `${Math.round(point.x)},${Math.round(point.y)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function clonePoint(point: Point): Point {
    return { x: point.x, y: point.y };
}

function samePoint(a: Point, b: Point, tolerance = 1.5): boolean {
    return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function samePath(a: Point[], b: Point[], tolerance = 1.5): boolean {
    if (a.length !== b.length) return false;
    return a.every((point, index) => samePoint(point, b[index], tolerance));
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

function getCrossingAwareAxisValues(
    edgeId: string,
    a: Point,
    b: Point,
    allPaths: Map<string, Point[]>,
    softObstacles: Rectangle[],
    isHorizontal: boolean,
    spacing: number
): number[] {
    const values = new Set<number>();
    const segMinX = Math.min(a.x, b.x);
    const segMaxX = Math.max(a.x, b.x);
    const segMinY = Math.min(a.y, b.y);
    const segMaxY = Math.max(a.y, b.y);
    const fixed = isHorizontal ? (a.y + b.y) / 2 : (a.x + b.x) / 2;

    for (const [otherEdgeId, otherPoints] of allPaths) {
        if (otherEdgeId === edgeId) continue;
        for (let i = 0; i < otherPoints.length - 1; i++) {
            const c = otherPoints[i];
            const d = otherPoints[i + 1];
            const otherHorizontal = Math.abs(c.y - d.y) < 1.5;
            const otherVertical = Math.abs(c.x - d.x) < 1.5;
            if (isHorizontal && otherVertical) {
                const x = (c.x + d.x) / 2;
                const minY = Math.min(c.y, d.y);
                const maxY = Math.max(c.y, d.y);
                if (x > segMinX + 2 && x < segMaxX - 2 && fixed > minY + 2 && fixed < maxY - 2) {
                    values.add(minY - spacing);
                    values.add(maxY + spacing);
                }
            } else if (!isHorizontal && otherHorizontal) {
                const y = (c.y + d.y) / 2;
                const minX = Math.min(c.x, d.x);
                const maxX = Math.max(c.x, d.x);
                if (y > segMinY + 2 && y < segMaxY - 2 && fixed > minX + 2 && fixed < maxX - 2) {
                    values.add(minX - spacing);
                    values.add(maxX + spacing);
                }
            }
        }
    }

    for (const rect of softObstacles) {
        if (isHorizontal) {
            if (fixed > rect.y - 1 && fixed < rect.y + rect.height + 1 && segMaxX > rect.x && segMinX < rect.x + rect.width) {
                values.add(rect.y - spacing);
                values.add(rect.y + rect.height + spacing);
            }
        } else if (fixed > rect.x - 1 && fixed < rect.x + rect.width + 1 && segMaxY > rect.y && segMinY < rect.y + rect.height) {
            values.add(rect.x - spacing);
            values.add(rect.x + rect.width + spacing);
        }
    }

    return [...values];
}

function getDoglegShrinkAxisValues(
    edgeId: string,
    points: Point[],
    segIdx: number,
    allPaths: Map<string, Point[]>,
    movingSegmentIsHorizontal: boolean,
    spacing: number
): number[] {
    const values = new Set<number>();
    const before = points[segIdx - 1];
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const after = points[segIdx + 2];
    if (!before || !after) return [];

    const addInwardCandidate = (anchor: number, fixed: number, crossing: number) => {
        const goingPositive = fixed > anchor;
        const between = goingPositive
            ? crossing > anchor + 2 && crossing < fixed - 2
            : crossing < anchor - 2 && crossing > fixed + 2;
        if (!between) return;

        const inward = goingPositive ? crossing - spacing : crossing + spacing;
        values.add(inward);
        values.add(goingPositive ? crossing - spacing * 2 : crossing + spacing * 2);
    };

    for (const [otherEdgeId, otherPoints] of allPaths) {
        if (otherEdgeId === edgeId) continue;

        for (let i = 0; i < otherPoints.length - 1; i++) {
            const c = otherPoints[i];
            const d = otherPoints[i + 1];
            const otherHorizontal = Math.abs(c.y - d.y) < 1.5;
            const otherVertical = Math.abs(c.x - d.x) < 1.5;

            if (!movingSegmentIsHorizontal && otherVertical) {
                const crossingX = (c.x + d.x) / 2;
                const minY = Math.min(c.y, d.y);
                const maxY = Math.max(c.y, d.y);

                if (Math.abs(before.y - a.y) < 1.5 && before.y > minY + 2 && before.y < maxY - 2) {
                    addInwardCandidate(before.x, a.x, crossingX);
                }
                if (Math.abs(b.y - after.y) < 1.5 && b.y > minY + 2 && b.y < maxY - 2) {
                    addInwardCandidate(after.x, b.x, crossingX);
                }
            } else if (movingSegmentIsHorizontal && otherHorizontal) {
                const crossingY = (c.y + d.y) / 2;
                const minX = Math.min(c.x, d.x);
                const maxX = Math.max(c.x, d.x);

                if (Math.abs(before.x - a.x) < 1.5 && before.x > minX + 2 && before.x < maxX - 2) {
                    addInwardCandidate(before.y, a.y, crossingY);
                }
                if (Math.abs(b.x - after.x) < 1.5 && b.x > minX + 2 && b.x < maxX - 2) {
                    addInwardCandidate(after.y, b.y, crossingY);
                }
            }
        }
    }

    return [...values];
}

function getDoglegCompactionAxisValues(
    points: Point[],
    segIdx: number,
    movingSegmentIsHorizontal: boolean,
    spacing: number
): number[] {
    const before = points[segIdx - 1];
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const after = points[segIdx + 2];
    if (!before || !after) return [];

    const values = new Set<number>();
    const addTowardAnchors = (base: number, anchorA: number, anchorB: number) => {
        const lowAnchor = Math.min(anchorA, anchorB);
        const highAnchor = Math.max(anchorA, anchorB);
        if (base > highAnchor + spacing * 3) {
            [1, 2, 3, 4].forEach(mult => values.add(highAnchor + spacing * mult));
        } else if (base < lowAnchor - spacing * 3) {
            [1, 2, 3, 4].forEach(mult => values.add(lowAnchor - spacing * mult));
        }
    };

    if (!movingSegmentIsHorizontal) {
        const prevIsHorizontal = Math.abs(before.y - a.y) < 1.5;
        const nextIsHorizontal = Math.abs(b.y - after.y) < 1.5;
        if (prevIsHorizontal && nextIsHorizontal) {
            addTowardAnchors((a.x + b.x) / 2, before.x, after.x);
        }
    } else {
        const prevIsVertical = Math.abs(before.x - a.x) < 1.5;
        const nextIsVertical = Math.abs(b.x - after.x) < 1.5;
        if (prevIsVertical && nextIsVertical) {
            addTowardAnchors((a.y + b.y) / 2, before.y, after.y);
        }
    }

    return [...values];
}

function getCandidateAxisValues(base: number, semanticAxes: number[] | undefined, spacing: number, localAxes: number[] = []): number[] {
    const values = new Set<number>();
    [-10, 10, -8, 8, -6, 6, -4, 4, -3, 3, -2, 2, -1, 1].forEach(n => values.add(base + n * spacing));
    localAxes.forEach(axis => {
        if (Math.abs(axis - base) <= spacing * 24) values.add(axis);
    });

    for (const axis of semanticAxes ?? []) {
        if (Math.abs(axis - base) <= spacing * 18) {
            values.add(axis);
            values.add(axis - spacing);
            values.add(axis + spacing);
        }
    }

    return [...values]
        .sort((a, b) => Math.abs(a - base) - Math.abs(b - base))
        .slice(0, 36);
}
