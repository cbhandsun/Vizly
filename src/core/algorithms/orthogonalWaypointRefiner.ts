import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import {
  RoutingCrossingScorer,
  type RoutingCrossingScoreReplacementContext,
} from './routingCrossingScorer';
import {
  findLowerScoreReroute,
  findLowerScoreVariant,
  findObstacleAwareDoglegCompaction,
  findOuterLaneReroute,
  findWrongSideDoglegCompaction,
} from './orthogonalWaypointRefinerCandidates';
import {
  hasCompressibleDogleg,
  hasCompressibleDoglegs,
} from './orthogonalWaypointRefinerGeometry';
import {
  normalizeWaypointPaths,
  normalizeWaypointRefinementOptions,
} from './orthogonalWaypointRefinerInput';
import type {
  ProtectedTrunkLocks,
  ScoreSummary,
  WaypointRefinementOptions,
  WaypointRefinementResult,
} from './orthogonalWaypointRefinerTypes';

export type {
  ScoreSummary,
  WaypointRefinementOptions,
  WaypointRefinementResult,
  WaypointRefinementSummary,
} from './orthogonalWaypointRefinerTypes';

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
    edgePaths = normalizeWaypointPaths(edgePaths);
    options = normalizeWaypointRefinementOptions(options);
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

    const scoringContext = scorer.createReplacementContext(result);
    let currentScore = scoringContext.currentScore;
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
                scoringContext,
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
                scoringContext,
                hardObstacles,
                spacing,
                currentScore,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId))
            ) ?? findWrongSideDoglegCompaction(
                edgeId,
                points,
                result,
                scorer,
                scoringContext,
                hardObstacles,
                spacing,
                currentScore,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId))
            ) ?? findOuterLaneReroute(
                edgeId,
                points,
                result,
                scorer,
                scoringContext,
                hardObstacles,
                spacing,
                currentScore,
                getProtectedTrunkLocks(buddyTypesByEdgeId.get(edgeId))
            );

            if (!compactedCandidate) continue;
            result.set(edgeId, compactedCandidate.points);
            changedEdgeIds.add(edgeId);
            segmentShiftChanges++;
            currentScore = scoringContext.commitReplacement(edgeId, compactedCandidate.points);
            changedInPass = true;
        }

        if (!changedInPass) break;
    }

    if (options.enableReroute !== false && currentScore.totalScore > 0) {
        const rerouteResult = rerouteWorstEdges(
            result,
            scorer,
            scoringContext,
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
    scoringContext: RoutingCrossingScoreReplacementContext,
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
            scoringContext,
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
        score = scoringContext.commitReplacement(edgeId, candidate.points);
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
