import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import { RoutingCrossingScorer } from './routingCrossingScorer';

export interface HardObstacleRepairOptions {
    obstacles?: Rectangle[];
    ignoredRectsByEdge?: Map<string, Rectangle[]>;
    buddyGroups?: BuddyGroup[];
    spacing?: number;
    maxIterationsPerEdge?: number;
}

interface SegmentHit {
    segIdx: number;
    obstacle: Rectangle;
    horizontal: boolean;
}

const EPS = 1.5;

/**
 * Final hard-constraint repair pass.
 *
 * Earlier routing stages optimize crossings, trunks, and labels. This pass is
 * deliberately narrow: if any final orthogonal segment still pierces a node
 * rectangle, add a local dogleg around that rectangle and keep the path
 * orthogonal. It is meant as a last line of defense for the docs priority:
 * orthogonal > obstacle avoidance > shared trunk.
 */
export function repairHardObstacleViolations(
    edgePaths: Map<string, Point[]>,
    options: HardObstacleRepairOptions = {}
): Map<string, Point[]> {
    const obstacles = (options.obstacles ?? []).filter(o => o && o.width > 1 && o.height > 1);
    if (edgePaths.size === 0 || obstacles.length === 0) return edgePaths;

    const result = new Map<string, Point[]>();
    edgePaths.forEach((points, edgeId) => {
        result.set(edgeId, points.map(point => ({ ...point })));
    });

    const spacing = options.spacing ?? 12;
    const maxIterations = options.maxIterationsPerEdge ?? 4;
    const scorer = new RoutingCrossingScorer({
        buddyGroups: options.buddyGroups,
        parallelOverlapMinLength: Math.max(24, spacing * 3),
    });

    for (const edgeId of result.keys()) {
        let points = result.get(edgeId);
        if (!points || points.length < 2) continue;

        const ignored = options.ignoredRectsByEdge?.get(edgeId) ?? [];
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            const hit = findFirstObstacleHit(points, obstacles, ignored);
            if (!hit) break;

            const repaired = chooseBestRepair(edgeId, points, hit, result, obstacles, ignored, spacing, scorer);
            if (!repaired || samePath(repaired, points)) break;

            points = repaired;
            result.set(edgeId, points);
        }
    }

    return result;
}

function chooseBestRepair(
    edgeId: string,
    points: Point[],
    hit: SegmentHit,
    allPaths: Map<string, Point[]>,
    obstacles: Rectangle[],
    ignored: Rectangle[],
    spacing: number,
    scorer: RoutingCrossingScorer
): Point[] | null {
    const candidates = buildRepairCandidates(points, hit, spacing)
        .map(simplifyRepairPoints)
        .filter(candidate => candidate.length >= 2)
        .filter(isOrthogonal)
        .filter(candidate => !samePath(candidate, points));

    const originalHitCount = countObstacleHits(points, obstacles, ignored);
    let best: { points: Point[]; hitCount: number; score: number; length: number } | null = null;
    for (const candidate of candidates) {
        const hitCount = countObstacleHits(candidate, obstacles, ignored);
        if (hitCount >= originalHitCount) continue;

        const trial = new Map(allPaths);
        trial.set(edgeId, candidate);
        const score = scorer.score(trial).totalScore;
        const length = RoutingCrossingScorer.pathLength(candidate);

        if (
            !best ||
            hitCount < best.hitCount ||
            (hitCount === best.hitCount && score < best.score) ||
            (hitCount === best.hitCount && score === best.score && length < best.length)
        ) {
            best = { points: candidate, hitCount, score, length };
        }
    }

    return best?.points ?? null;
}

function buildRepairCandidates(points: Point[], hit: SegmentHit, spacing: number): Point[][] {
    const a = points[hit.segIdx];
    const b = points[hit.segIdx + 1];
    if (!a || !b) return [];

    const rect = hit.obstacle;
    const clearance = Math.max(18, spacing * 2);
    const candidates: Point[][] = [];

    if (!hit.horizontal) {
        const goingDown = b.y > a.y;
        const entryY = goingDown ? rect.y - clearance : rect.y + rect.height + clearance;
        const exitY = goingDown ? rect.y + rect.height + clearance : rect.y - clearance;
        const axes = [rect.x + rect.width + clearance, rect.x - clearance]
            .sort((x1, x2) => Math.abs(x1 - a.x) - Math.abs(x2 - a.x));

        for (const axis of axes) {
            const base = [
                ...points.slice(0, hit.segIdx + 1),
                { x: a.x, y: entryY },
                { x: axis, y: entryY },
                { x: axis, y: exitY },
            ];
            const after = points[hit.segIdx + 2];
            if (after && Math.abs(after.y - b.y) < EPS) {
                candidates.push([
                    ...base,
                    { x: after.x, y: exitY },
                    ...points.slice(hit.segIdx + 2),
                ]);
                candidates.push([
                    ...base,
                    { x: axis, y: b.y },
                    ...points.slice(hit.segIdx + 2),
                ]);
            } else {
                candidates.push([
                    ...base,
                    { x: b.x, y: exitY },
                    ...points.slice(hit.segIdx + 1),
                ]);
            }
        }
    } else {
        const goingRight = b.x > a.x;
        const entryX = goingRight ? rect.x - clearance : rect.x + rect.width + clearance;
        const exitX = goingRight ? rect.x + rect.width + clearance : rect.x - clearance;
        const axes = [rect.y + rect.height + clearance, rect.y - clearance]
            .sort((y1, y2) => Math.abs(y1 - a.y) - Math.abs(y2 - a.y));

        for (const axis of axes) {
            const base = [
                ...points.slice(0, hit.segIdx + 1),
                { x: entryX, y: a.y },
                { x: entryX, y: axis },
                { x: exitX, y: axis },
            ];
            const after = points[hit.segIdx + 2];
            if (after && Math.abs(after.x - b.x) < EPS) {
                candidates.push([
                    ...base,
                    { x: exitX, y: after.y },
                    ...points.slice(hit.segIdx + 2),
                ]);
                candidates.push([
                    ...base,
                    { x: b.x, y: axis },
                    ...points.slice(hit.segIdx + 2),
                ]);
            } else {
                candidates.push([
                    ...base,
                    { x: exitX, y: b.y },
                    ...points.slice(hit.segIdx + 1),
                ]);
            }
        }
    }

    return candidates;
}

function findFirstObstacleHit(points: Point[], obstacles: Rectangle[], ignored: Rectangle[]): SegmentHit | null {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const horizontal = Math.abs(a.y - b.y) < EPS;
        const vertical = Math.abs(a.x - b.x) < EPS;
        if (!horizontal && !vertical) continue;

        for (const obstacle of obstacles) {
            if (ignored.some(rect => sameRect(rect, obstacle))) continue;
            if (segmentIntersectsRectInterior(a, b, obstacle, 2)) {
                return { segIdx: i, obstacle, horizontal };
            }
        }
    }
    return null;
}

function countObstacleHits(points: Point[], obstacles: Rectangle[], ignored: Rectangle[]): number {
    let count = 0;
    for (let i = 0; i < points.length - 1; i++) {
        for (const obstacle of obstacles) {
            if (ignored.some(rect => sameRect(rect, obstacle))) continue;
            if (segmentIntersectsRectInterior(points[i], points[i + 1], obstacle, 2)) count++;
        }
    }
    return count;
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
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        return Math.max(minY, top) < Math.min(maxY, bottom);
    }

    if (Math.abs(a.y - b.y) < EPS) {
        const y = a.y;
        if (y <= top || y >= bottom) return false;
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        return Math.max(minX, left) < Math.min(maxX, right);
    }

    return false;
}

function isOrthogonal(points: Point[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const hasLength = Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS;
        if (hasLength && Math.abs(a.x - b.x) >= EPS && Math.abs(a.y - b.y) >= EPS) {
            return false;
        }
    }
    return true;
}

function simplifyRepairPoints(points: Point[]): Point[] {
    if (points.length <= 2) return points.map(point => ({ ...point }));

    const deduped: Point[] = [];
    for (const point of points) {
        const prev = deduped[deduped.length - 1];
        if (!prev || Math.abs(prev.x - point.x) > EPS || Math.abs(prev.y - point.y) > EPS) {
            deduped.push({ x: point.x, y: point.y });
        }
    }
    if (deduped.length <= 2) return deduped;

    const simplified: Point[] = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
        const prev = simplified[simplified.length - 1];
        const curr = deduped[i];
        const next = deduped[i + 1];
        const collinearX = Math.abs(prev.x - curr.x) < EPS && Math.abs(curr.x - next.x) < EPS;
        const collinearY = Math.abs(prev.y - curr.y) < EPS && Math.abs(curr.y - next.y) < EPS;
        if (!collinearX && !collinearY) simplified.push(curr);
    }
    simplified.push(deduped[deduped.length - 1]);

    return simplified;
}

function samePath(a: Point[], b: Point[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((point, index) =>
        Math.abs(point.x - b[index].x) < EPS && Math.abs(point.y - b[index].y) < EPS
    );
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
    return Math.abs(a.x - b.x) < EPS
        && Math.abs(a.y - b.y) < EPS
        && Math.abs(a.width - b.width) < EPS
        && Math.abs(a.height - b.height) < EPS;
}
