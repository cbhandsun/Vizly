import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import { RoutingCrossingScorer } from './routingCrossingScorer';
import {
    buildDetourCandidates,
    buildParallelOverlapShiftCandidates,
    buildSharedTrunkJunctionCandidates,
    buildShiftCandidates,
} from './edgeCrossingRepairCandidates';
import {
    buildBuddyGroupLookup,
    buildBuddyTypeLookup,
    findRepairableCrossings,
    findRepairableParallelOverlaps,
} from './edgeCrossingRepairDetection';
import { countPathObstacleHits } from './edgeCrossingRepairGeometry';
import {
    MAX_REPAIRED_POINTS_PER_EDGE,
    normalizeEdgeCrossingRepairOptions,
    normalizeEdgePaths,
} from './edgeCrossingRepairInput';
import type {
    CrossingHit,
    EdgeCrossingRepairOptions,
    ParallelOverlapHit,
} from './edgeCrossingRepairTypes';

export type { EdgeCrossingRepairOptions } from './edgeCrossingRepairTypes';

type RoutingReplacementContext = ReturnType<RoutingCrossingScorer['createReplacementContext']>;

export function repairEdgeCrossingViolations(
    edgePaths: Map<string, Point[]>,
    options: EdgeCrossingRepairOptions = {}
): Map<string, Point[]> {
    const safeEdgePaths = normalizeEdgePaths(edgePaths);
    const safeOptions = normalizeEdgeCrossingRepairOptions(options);
    if (safeEdgePaths.size < 2) return safeEdgePaths;

    const result = new Map(safeEdgePaths);
    const spacing = safeOptions.spacing;
    const obstacles = safeOptions.obstacles;
    const buddyGroupByEdgeId = buildBuddyGroupLookup(safeOptions.buddyGroups);
    const buddyTypesByEdgeId = buildBuddyTypeLookup(safeOptions.buddyGroups);
    const scorer = new RoutingCrossingScorer({
        buddyGroups: safeOptions.buddyGroups,
        parallelOverlapMinLength: Math.max(24, spacing * 3),
    });
    const scoreContext = scorer.createReplacementContext(result);
    let currentScore = scoreContext.currentScore;

    for (let iteration = 0; iteration < safeOptions.maxIterations; iteration++) {
        const crossings = findRepairableCrossings(result, buddyGroupByEdgeId);

        let repaired: { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;
        for (const crossing of crossings) {
            repaired = chooseBestCrossingRepair(
                crossing,
                result,
                currentScore,
                scorer,
                scoreContext,
                obstacles,
                safeOptions.ignoredRectsByEdge,
                buddyTypesByEdgeId,
                spacing,
                safeOptions.mutableEdgeIds,
                safeOptions.allowObstacleHitIfImprovesCrossing,
                safeOptions.preserveEndpointDirections
            );
            if (repaired) break;
        }

        if (!repaired) {
            const overlaps = findRepairableParallelOverlaps(result, buddyGroupByEdgeId, Math.max(24, spacing * 3));
            for (const overlap of overlaps) {
                repaired = chooseBestParallelOverlapRepair(
                    overlap,
                    result,
                    currentScore,
                    scorer,
                    scoreContext,
                    obstacles,
                    safeOptions.ignoredRectsByEdge,
                    buddyTypesByEdgeId,
                    spacing,
                    safeOptions.mutableEdgeIds,
                    safeOptions.allowObstacleHitIfImprovesCrossing,
                    safeOptions.preserveEndpointDirections
                );
                if (repaired) break;
            }
        }
        if (!repaired) break;

        result.set(repaired.edgeId, repaired.points);
        currentScore = scoreContext.commitReplacement(repaired.edgeId, repaired.points);
    }

    return normalizeEdgePaths(result, MAX_REPAIRED_POINTS_PER_EDGE);
}

function chooseBestCrossingRepair(
    crossing: CrossingHit,
    allPaths: Map<string, Point[]>,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    scorer: RoutingCrossingScorer,
    scoreContext: RoutingReplacementContext,
    obstacles: Rectangle[],
    ignoredRectsByEdge: Map<string, Rectangle[]> | undefined,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined,
    allowObstacleHitIfImprovesCrossing: boolean | undefined,
    preserveEndpointDirectionsOption: boolean | undefined
): { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null {
    const candidates = [
        ...buildSharedTrunkJunctionCandidates(crossing, allPaths, buddyTypesByEdgeId, mutableEdgeIds, preserveEndpointDirectionsOption),
        ...buildDetourCandidates(crossing.h, crossing.v, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds, preserveEndpointDirectionsOption),
        ...buildDetourCandidates(crossing.v, crossing.h, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds, preserveEndpointDirectionsOption),
        ...buildShiftCandidates(crossing.h, crossing.v, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds, preserveEndpointDirectionsOption),
        ...buildShiftCandidates(crossing.v, crossing.h, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds, preserveEndpointDirectionsOption),
    ];

    let best: { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number; obstacleHits: number } | null = null;
    for (const candidate of candidates) {
        const ignored = ignoredRectsByEdge?.get(candidate.edgeId) ?? [];
        const obstacleHits = countPathObstacleHits(candidate.points, obstacles, ignored);
        if (!allowObstacleHitIfImprovesCrossing && obstacleHits > 0) continue;

        const score = scoreContext.scoreReplacement(candidate.edgeId, candidate.points);
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

function chooseBestParallelOverlapRepair(
    overlap: ParallelOverlapHit,
    allPaths: Map<string, Point[]>,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    scorer: RoutingCrossingScorer,
    scoreContext: RoutingReplacementContext,
    obstacles: Rectangle[],
    ignoredRectsByEdge: Map<string, Rectangle[]> | undefined,
    buddyTypesByEdgeId: Map<string, Set<BuddyGroup['type']>>,
    spacing: number,
    mutableEdgeIds: Set<string> | undefined,
    allowObstacleHitIfImprovesCrossing: boolean | undefined,
    preserveEndpointDirectionsOption: boolean | undefined
): { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null {
    const candidates = [
        ...buildParallelOverlapShiftCandidates(overlap.a, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds, preserveEndpointDirectionsOption),
        ...buildParallelOverlapShiftCandidates(overlap.b, allPaths, buddyTypesByEdgeId, spacing, mutableEdgeIds, preserveEndpointDirectionsOption),
    ];

    let best: { edgeId: string; points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number; obstacleHits: number } | null = null;
    for (const candidate of candidates) {
        const ignored = ignoredRectsByEdge?.get(candidate.edgeId) ?? [];
        const obstacleHits = countPathObstacleHits(candidate.points, obstacles, ignored);
        if (!allowObstacleHitIfImprovesCrossing && obstacleHits > 0) continue;

        const score = scoreContext.scoreReplacement(candidate.edgeId, candidate.points);
        if (!scorer.isBetter(score, currentScore)) continue;

        const length = RoutingCrossingScorer.pathLength(candidate.points);
        if (!best || isCandidatePreferred(score, obstacleHits, length, best.score, best.obstacleHits, best.length, scorer)) {
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
