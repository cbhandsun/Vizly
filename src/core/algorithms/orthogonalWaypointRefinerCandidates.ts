import type { Point, Rectangle } from '../types/routing';
import {
  buildPathAxes,
  buildRouteAwareAxes,
  getCandidateAxisValues,
  getCrossingAwareAxisValues,
  getDoglegCompactionAxisValues,
  getDoglegShrinkAxisValues,
  mergeCandidateAxes,
  samePath,
} from './orthogonalWaypointRefinerUtils';
import {
  RoutingCrossingScorer,
  type RoutingCrossingScoreReplacementContext,
} from './routingCrossingScorer';
import type {
  ProtectedTrunkLocks,
  WaypointRefinementOptions,
} from './orthogonalWaypointRefinerTypes';
import {
  buildEndpointLocks,
  buildRerouteCandidates,
  collectHitObstacleIndexes,
  getDominantVerticalAxis,
  getFirstDirection,
  getLastDirection,
  getParallelVerticalClearance,
  isScoreNoWorse,
  isStrictlyOrthogonalPath,
  pathIntroducesObstacleHit,
  preservesEndpointDirections,
  preservesProtectedTrunkJunctions,
  rangesOverlap,
  touchesProtectedTrunkJunction,
} from './orthogonalWaypointRefinerGeometry';

export function findLowerScoreVariant(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    scoringContext: RoutingCrossingScoreReplacementContext,
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

            const length = RoutingCrossingScorer.pathLength(simplified);
            scoredCandidates++;
            const score = scoringContext.scoreReplacement(edgeId, simplified);
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

export function findObstacleAwareDoglegCompaction(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    scoringContext: RoutingCrossingScoreReplacementContext,
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

        const score = scoringContext.scoreReplacement(edgeId, candidate);
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

export function findWrongSideDoglegCompaction(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    scoringContext: RoutingCrossingScoreReplacementContext,
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

            const score = scoringContext.scoreReplacement(edgeId, candidate);
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

export function findOuterLaneReroute(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    scoringContext: RoutingCrossingScoreReplacementContext,
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

    const score = scoringContext.scoreReplacement(edgeId, candidate);
    if (!scorer.isBetter(score, currentScore)) return null;

    return { points: candidate, score };
}

export function findLowerScoreReroute(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    scoringContext: RoutingCrossingScoreReplacementContext,
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

        const score = scoringContext.scoreReplacement(edgeId, simplified);
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
