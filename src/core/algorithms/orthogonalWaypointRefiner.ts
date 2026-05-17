import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import { RoutingCrossingScorer, type RoutingCrossingScorerOptions } from './routingCrossingScorer';

export interface WaypointRefinementOptions {
    buddyGroups?: BuddyGroup[];
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
    if (edgePaths.size === 0 || (edgePaths.size === 1 && (options.softObstacles ?? []).length === 0)) {
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

    const buddyEdgeIds = new Set<string>();
    const buddyTypeByEdgeId = new Map<string, BuddyGroup['type']>();
    (options.buddyGroups ?? []).forEach(group => {
        group.edgeIds.forEach(edgeId => {
            buddyEdgeIds.add(edgeId);
            buddyTypeByEdgeId.set(edgeId, group.type);
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
            skippedBuddyEdges: buddyEdgeIds.size,
        },
    });

    if (currentScore.totalScore === 0) return buildSummary();

    const maxPasses = options.maxPasses ?? 2;
    const maxEdgesPerPass = options.maxEdgesPerPass ?? 80;

    for (let pass = 0; pass < maxPasses && currentScore.totalScore > 0; pass++) {
        let changedInPass = false;
        let checked = 0;
        const orderedEdgeIds = [...result.keys()]
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
                getProtectedTrunkLocks(buddyTypeByEdgeId.get(edgeId))
            );

            if (!candidate) continue;
            result.set(edgeId, candidate.points);
            changedEdgeIds.add(edgeId);
            segmentShiftChanges++;
            currentScore = candidate.score;
            changedInPass = true;
        }

        if (!changedInPass) break;
    }

    if (options.enableReroute !== false && currentScore.totalScore > 0) {
        const rerouteResult = rerouteWorstEdges(
            result,
            scorer,
            buddyEdgeIds,
            hardObstacles,
            spacing,
            currentScore,
            options.candidateAxes,
            options.maxRerouteEdges ?? 8
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
    buddyEdgeIds: Set<string>,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    candidateAxes: WaypointRefinementOptions['candidateAxes'],
    maxEdges: number
): {
    score: ReturnType<RoutingCrossingScorer['score']>;
    changedEdgeIds: string[];
    consideredEdges: number;
} {
    const ordered = [...paths.keys()]
        .filter(edgeId => !buddyEdgeIds.has(edgeId))
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
            candidateAxes
        );

        if (!candidate) continue;
        paths.set(edgeId, candidate.points);
        changedEdgeIds.push(edgeId);
        score = candidate.score;
    }

    return { score, changedEdgeIds, consideredEdges };
}

interface ProtectedTrunkLocks {
    lockFirstJunction?: boolean;
    lockLastJunction?: boolean;
}

function getProtectedTrunkLocks(type: BuddyGroup['type'] | undefined): ProtectedTrunkLocks {
    return {
        lockFirstJunction: type === 'o2m',
        lockLastJunction: type === 'm2o',
    };
}

function summarizeScore(score: ReturnType<RoutingCrossingScorer['score']>): ScoreSummary {
    return {
        totalScore: score.totalScore,
        hardCrossings: score.hardCrossings,
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
    protectedTrunkLocks: ProtectedTrunkLocks = {}
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    let best: { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;
    const originalLength = RoutingCrossingScorer.pathLength(points);
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);

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
            getCrossingAwareAxisValues(edgeId, a, b, allPaths, softObstacles, isHorizontal, spacing)
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
                if (!isStrictlyOrthogonalPath(simplified)) continue;
                if (!preservesEndpointDirections(simplified, originalStartDir, originalEndDir)) continue;
                if (RoutingCrossingScorer.pathLength(simplified) > originalLength + spacing * 8) continue;
                if (RoutingCrossingScorer.pathHitsObstacle(simplified, hardObstacles)) continue;

            const trial = new Map(allPaths);
            trial.set(edgeId, simplified);
            const score = scorer.score(trial);
            if (!scorer.isBetter(score, currentScore)) continue;

            const length = RoutingCrossingScorer.pathLength(simplified);
            if (!best || scorer.isBetter(score, best.score) || (score.totalScore === best.score.totalScore && length < best.length)) {
                best = { points: simplified, score, length };
            }
        }
    }

    return best ? { points: best.points, score: best.score } : null;
}

function touchesProtectedTrunkJunction(segIdx: number, pointCount: number, locks: ProtectedTrunkLocks): boolean {
    // Moving segment segIdx changes points[segIdx] and points[segIdx + 1].
    // O2M shared trunk owns point[1]; M2O shared trunk owns point[n - 2].
    if (locks.lockFirstJunction && segIdx <= 1) return true;
    if (locks.lockLastJunction && segIdx + 1 >= pointCount - 2) return true;
    return false;
}

function findLowerScoreReroute(
    edgeId: string,
    points: Point[],
    allPaths: Map<string, Point[]>,
    scorer: RoutingCrossingScorer,
    hardObstacles: Rectangle[],
    spacing: number,
    currentScore: ReturnType<RoutingCrossingScorer['score']>,
    candidateAxes?: WaypointRefinementOptions['candidateAxes']
): { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']> } | null {
    const start = points[0];
    const end = points[points.length - 1];
    const originalStartDir = getFirstDirection(points);
    const originalEndDir = getLastDirection(points);
    const originalLength = RoutingCrossingScorer.pathLength(points);
    const candidates = buildRerouteCandidates(start, end, candidateAxes, spacing);
    let best: { points: Point[]; score: ReturnType<RoutingCrossingScorer['score']>; length: number } | null = null;

    for (const candidate of candidates) {
        const simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(candidate);
        if (simplified.length < 2) continue;
        if (!isStrictlyOrthogonalPath(simplified)) continue;
        if (!preservesEndpointDirections(simplified, originalStartDir, originalEndDir)) continue;
        const length = RoutingCrossingScorer.pathLength(simplified);
        if (length > originalLength + spacing * 12) continue;
        if (RoutingCrossingScorer.pathHitsObstacle(simplified, hardObstacles)) continue;

        const trial = new Map(allPaths);
        trial.set(edgeId, simplified);
        const score = scorer.score(trial);
        if (!scorer.isBetter(score, currentScore)) continue;

        if (!best || scorer.isBetter(score, best.score) || (score.totalScore === best.score.totalScore && length < best.length)) {
            best = { points: simplified, score, length };
        }
    }

    return best ? { points: best.points, score: best.score } : null;
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

function getFirstDirection(points: Point[]): 'L' | 'R' | 'U' | 'D' | null {
    for (let i = 0; i < points.length - 1; i++) {
        const dir = RoutingCrossingScorer.segmentDirection(points[i], points[i + 1]);
        if (dir) return dir;
    }
    return null;
}

function getLastDirection(points: Point[]): 'L' | 'R' | 'U' | 'D' | null {
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
    spacing: number
): Point[][] {
    const candidates: Point[][] = [];
    const horizontalAxes = selectNearAxes(candidateAxes?.horizontal, start.y, end.y, spacing);
    const verticalAxes = selectNearAxes(candidateAxes?.vertical, start.x, end.x, spacing);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Simple one-bend choices.
    candidates.push([start, { x: end.x, y: start.y }, end]);
    candidates.push([start, { x: start.x, y: end.y }, end]);

    // H/V-first doglegs through semantic axes.
    for (const axis of verticalAxes) {
        candidates.push([start, { x: axis, y: start.y }, { x: axis, y: end.y }, end]);
    }
    for (const axis of horizontalAxes) {
        candidates.push([start, { x: start.x, y: axis }, { x: end.x, y: axis }, end]);
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
    });
}

function selectNearAxes(axes: number[] | undefined, a: number, b: number, spacing: number): number[] {
    const min = Math.min(a, b) - spacing * 8;
    const max = Math.max(a, b) + spacing * 8;
    const values = new Set<number>();
    for (const axis of axes ?? []) {
        if (axis >= min && axis <= max) values.add(axis);
    }
    values.add((a + b) / 2);
    return [...values]
        .sort((x, y) => Math.abs(x - (a + b) / 2) - Math.abs(y - (a + b) / 2))
        .slice(0, 10);
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

function getCandidateAxisValues(base: number, semanticAxes: number[] | undefined, spacing: number, localAxes: number[] = []): number[] {
    const values = new Set<number>();
    [-3, 3, -2, 2, -1, 1].forEach(n => values.add(base + n * spacing));
    localAxes.forEach(axis => {
        if (Math.abs(axis - base) <= spacing * 12) values.add(axis);
    });

    for (const axis of semanticAxes ?? []) {
        if (Math.abs(axis - base) <= spacing * 6) {
            values.add(axis);
            values.add(axis - spacing);
            values.add(axis + spacing);
        }
    }

    return [...values].sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
}
