import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';

export interface CrossingScore {
    totalScore: number;
    hardCrossings: number;
    buddyCrossings: number;
    parallelOverlaps: number;
    softCrossings: number;
    softNearMisses: number;
    turnbacks: number;
    bends: number;
    byEdge: Map<string, number>;
}

export interface RoutingCrossingScorerOptions {
    buddyGroups?: BuddyGroup[];
    softObstacles?: Rectangle[];
    hardCrossingWeight?: number;
    softObstacleWeight?: number;
    softNearMissWeight?: number;
    softNearMissPadding?: number;
    buddyCrossingWeight?: number;
    parallelOverlapWeight?: number;
    parallelOverlapMinLength?: number;
    turnbackWeight?: number;
    bendWeight?: number;
}

interface OrthogonalSegment {
    edgeId: string;
    segmentIndex: number;
    pointCount: number;
    a: Point;
    b: Point;
    isHorizontal: boolean;
    isVertical: boolean;
}

export class RoutingCrossingScorer {
    private readonly buddyGroupByEdgeId = new Map<string, Set<string>>();
    private readonly softObstacles: Rectangle[];
    private readonly hardCrossingWeight: number;
    private readonly softObstacleWeight: number;
    private readonly softNearMissWeight: number;
    private readonly softNearMissPadding: number;
    private readonly buddyCrossingWeight: number;
    private readonly parallelOverlapWeight: number;
    private readonly parallelOverlapMinLength: number;
    private readonly turnbackWeight: number;
    private readonly bendWeight: number;

    constructor(options: RoutingCrossingScorerOptions = {}) {
        this.softObstacles = options.softObstacles ?? [];
        this.hardCrossingWeight = options.hardCrossingWeight ?? 1000;
        this.softObstacleWeight = options.softObstacleWeight ?? 120;
        this.softNearMissWeight = options.softNearMissWeight ?? 35;
        this.softNearMissPadding = options.softNearMissPadding ?? 10;
        this.buddyCrossingWeight = options.buddyCrossingWeight ?? 220;
        this.parallelOverlapWeight = options.parallelOverlapWeight ?? 45;
        this.parallelOverlapMinLength = options.parallelOverlapMinLength ?? 48;
        this.turnbackWeight = options.turnbackWeight ?? 18;
        this.bendWeight = options.bendWeight ?? 2;

        options.buddyGroups?.forEach((group, index) => {
            const key = `${group.type}:${index}`;
            group.edgeIds.forEach(edgeId => {
                if (!this.buddyGroupByEdgeId.has(edgeId)) {
                    this.buddyGroupByEdgeId.set(edgeId, new Set());
                }
                this.buddyGroupByEdgeId.get(edgeId)!.add(key);
            });
        });
    }

    public score(paths: Map<string, Point[]>): CrossingScore {
        const segments = this.extractSegments(paths);
        const byEdge = new Map<string, number>();
        let hardCrossings = 0;
        let buddyCrossings = 0;
        let parallelOverlaps = 0;
        let softCrossings = 0;
        let softNearMisses = 0;
        let turnbacks = 0;
        let bends = 0;

        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const s1 = segments[i];
                const s2 = segments[j];
                if (s1.edgeId === s2.edgeId) continue;
                const sameBuddy = this.sameBuddyGroup(s1.edgeId, s2.edgeId);

                if (RoutingCrossingScorer.segmentsStrictlyCross(s1, s2)) {
                    if (sameBuddy) {
                        buddyCrossings++;
                        this.addEdgeScore(byEdge, s1.edgeId, this.buddyCrossingWeight);
                        this.addEdgeScore(byEdge, s2.edgeId, this.buddyCrossingWeight);
                    } else {
                        hardCrossings++;
                        this.addEdgeScore(byEdge, s1.edgeId, this.hardCrossingWeight);
                        this.addEdgeScore(byEdge, s2.edgeId, this.hardCrossingWeight);
                    }
                    continue;
                }

                // Same-buddy collinear overlap is intentional only while it remains
                // a short source/target junction. Long shared trunks obscure flow.
                if (
                    sameBuddy
                    && this.isProtectedSharedTrunkOverlap(s1, s2)
                ) {
                    continue;
                }

                const overlapUnits = RoutingCrossingScorer.parallelOverlapUnits(
                    s1,
                    s2,
                    this.parallelOverlapMinLength
                );
                if (overlapUnits > 0) {
                    parallelOverlaps += overlapUnits;
                    const delta = overlapUnits * this.parallelOverlapWeight;
                    this.addEdgeScore(byEdge, s1.edgeId, delta);
                    this.addEdgeScore(byEdge, s2.edgeId, delta);
                }
            }
        }

        if (this.softObstacles.length > 0) {
            for (const segment of segments) {
                for (const rect of this.softObstacles) {
                    if (RoutingCrossingScorer.segmentIntersectsRect(segment.a, segment.b, rect, 1)) {
                        softCrossings++;
                        this.addEdgeScore(byEdge, segment.edgeId, this.softObstacleWeight);
                    } else if (RoutingCrossingScorer.segmentIntersectsRect(segment.a, segment.b, rect, this.softNearMissPadding)) {
                        softNearMisses++;
                        this.addEdgeScore(byEdge, segment.edgeId, this.softNearMissWeight);
                    }
                }
            }
        }

        for (const [edgeId, points] of paths) {
            const complexity = RoutingCrossingScorer.pathComplexity(points);
            turnbacks += complexity.turnbacks;
            bends += complexity.bends;
            if (complexity.turnbacks > 0) {
                this.addEdgeScore(byEdge, edgeId, complexity.turnbacks * this.turnbackWeight);
            }
            if (complexity.bends > 0) {
                this.addEdgeScore(byEdge, edgeId, complexity.bends * this.bendWeight);
            }
        }

        return {
            totalScore: hardCrossings * this.hardCrossingWeight
                + buddyCrossings * this.buddyCrossingWeight
                + parallelOverlaps * this.parallelOverlapWeight
                + softCrossings * this.softObstacleWeight
                + softNearMisses * this.softNearMissWeight
                + turnbacks * this.turnbackWeight
                + bends * this.bendWeight,
            hardCrossings,
            buddyCrossings,
            parallelOverlaps,
            softCrossings,
            softNearMisses,
            turnbacks,
            bends,
            byEdge,
        };
    }

    public isBetter(candidate: CrossingScore, current: CrossingScore): boolean {
        if (candidate.hardCrossings !== current.hardCrossings) return candidate.hardCrossings < current.hardCrossings;
        if (candidate.buddyCrossings !== current.buddyCrossings) return candidate.buddyCrossings < current.buddyCrossings;
        if (candidate.totalScore !== current.totalScore) return candidate.totalScore < current.totalScore;
        if (candidate.parallelOverlaps !== current.parallelOverlaps) return candidate.parallelOverlaps < current.parallelOverlaps;
        if (candidate.softCrossings !== current.softCrossings) return candidate.softCrossings < current.softCrossings;
        if (candidate.softNearMisses !== current.softNearMisses) return candidate.softNearMisses < current.softNearMisses;
        if (candidate.turnbacks !== current.turnbacks) return candidate.turnbacks < current.turnbacks;
        return candidate.bends < current.bends;
    }

    public static pathLength(points: Point[]): number {
        let length = 0;
        for (let i = 0; i < points.length - 1; i++) {
            length += RoutingCrossingScorer.manhattanDistance(points[i], points[i + 1]);
        }
        return length;
    }

    public static simplifyOrthogonalPoints(points: Point[]): Point[] {
        const deduped: Point[] = [];
        for (const point of points) {
            const prev = deduped[deduped.length - 1];
            if (!prev || RoutingCrossingScorer.manhattanDistance(prev, point) > 1) {
                deduped.push({ x: point.x, y: point.y });
            }
        }
        if (deduped.length <= 2) return deduped;

        const simplified: Point[] = [deduped[0]];
        for (let i = 1; i < deduped.length - 1; i++) {
            const prev = simplified[simplified.length - 1];
            const curr = deduped[i];
            const next = deduped[i + 1];
            const collinearX = Math.abs(prev.x - curr.x) < 1.5 && Math.abs(curr.x - next.x) < 1.5;
            const collinearY = Math.abs(prev.y - curr.y) < 1.5 && Math.abs(curr.y - next.y) < 1.5;
            if (!collinearX && !collinearY) simplified.push(curr);
        }
        simplified.push(deduped[deduped.length - 1]);

        return simplified;
    }

    public static pathHitsObstacle(points: Point[], obstacles: Rectangle[], padding = 3): boolean {
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            for (const rect of obstacles) {
                if (RoutingCrossingScorer.segmentIntersectsRect(a, b, rect, padding)) return true;
            }
        }
        return false;
    }

    public static pathComplexity(points: Point[]): { turnbacks: number; bends: number } {
        const dirs: Array<'L' | 'R' | 'U' | 'D'> = [];
        for (let i = 0; i < points.length - 1; i++) {
            const dir = RoutingCrossingScorer.segmentDirection(points[i], points[i + 1]);
            if (dir) dirs.push(dir);
        }

        let bends = 0;
        let turnbacks = 0;
        for (let i = 1; i < dirs.length; i++) {
            if (dirs[i] !== dirs[i - 1]) bends++;
            if (RoutingCrossingScorer.isOppositeDirection(dirs[i - 1], dirs[i])) turnbacks++;
        }

        return { turnbacks, bends };
    }

    public static segmentDirection(a: Point, b: Point): 'L' | 'R' | 'U' | 'D' | null {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 1.5) return dx > 0 ? 'R' : 'L';
        if (Math.abs(dy) > 1.5) return dy > 0 ? 'D' : 'U';
        return null;
    }

    public static isOppositeDirection(a: 'L' | 'R' | 'U' | 'D', b: 'L' | 'R' | 'U' | 'D'): boolean {
        return (a === 'L' && b === 'R')
            || (a === 'R' && b === 'L')
            || (a === 'U' && b === 'D')
            || (a === 'D' && b === 'U');
    }

    public static segmentIntersectsRect(a: Point, b: Point, rect: Rectangle, padding: number): boolean {
        const left = rect.x - padding;
        const right = rect.x + rect.width + padding;
        const top = rect.y - padding;
        const bottom = rect.y + rect.height + padding;

        if (Math.abs(a.y - b.y) < 1.5) {
            const y = (a.y + b.y) / 2;
            if (y <= top || y >= bottom) return false;
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            return maxX > left && minX < right;
        }

        if (Math.abs(a.x - b.x) < 1.5) {
            const x = (a.x + b.x) / 2;
            if (x <= left || x >= right) return false;
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            return maxY > top && minY < bottom;
        }

        return false;
    }

    private extractSegments(paths: Map<string, Point[]>): OrthogonalSegment[] {
        const segments: OrthogonalSegment[] = [];
        for (const [edgeId, points] of paths) {
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const isHorizontal = Math.abs(a.y - b.y) < 1.5;
                const isVertical = Math.abs(a.x - b.x) < 1.5;
                if ((!isHorizontal && !isVertical) || RoutingCrossingScorer.manhattanDistance(a, b) < 8) continue;
                segments.push({ edgeId, segmentIndex: i, pointCount: points.length, a, b, isHorizontal, isVertical });
            }
        }
        return segments;
    }

    private sameBuddyGroup(edgeA: string, edgeB: string): boolean {
        const groupsA = this.buddyGroupByEdgeId.get(edgeA);
        const groupsB = this.buddyGroupByEdgeId.get(edgeB);
        if (!groupsA || !groupsB) return false;
        for (const group of groupsA) {
            if (groupsB.has(group)) return true;
        }
        return false;
    }

    private isProtectedSharedTrunkOverlap(a: OrthogonalSegment, b: OrthogonalSegment): boolean {
        const groupsA = this.buddyGroupByEdgeId.get(a.edgeId);
        const groupsB = this.buddyGroupByEdgeId.get(b.edgeId);
        if (!groupsA || !groupsB) return false;

        for (const group of groupsA) {
            if (!groupsB.has(group)) continue;
            if (group.startsWith('o2m:') && a.segmentIndex === 0 && b.segmentIndex === 0) return true;
            if (group.startsWith('m2o:')
                && a.segmentIndex >= a.pointCount - 3
                && b.segmentIndex >= b.pointCount - 3) {
                return true;
            }
        }
        return false;
    }

    private addEdgeScore(byEdge: Map<string, number>, edgeId: string, delta: number): void {
        byEdge.set(edgeId, (byEdge.get(edgeId) ?? 0) + delta);
    }

    private static segmentsStrictlyCross(s1: OrthogonalSegment, s2: OrthogonalSegment): boolean {
        if (s1.isHorizontal === s2.isHorizontal) return false;

        const h = s1.isHorizontal ? s1 : s2;
        const v = s1.isVertical ? s1 : s2;
        const hx1 = Math.min(h.a.x, h.b.x);
        const hx2 = Math.max(h.a.x, h.b.x);
        const vy1 = Math.min(v.a.y, v.b.y);
        const vy2 = Math.max(v.a.y, v.b.y);
        const x = v.a.x;
        const y = h.a.y;

        const EPS = 2;
        const crossesInterior = x > hx1 + EPS && x < hx2 - EPS && y > vy1 + EPS && y < vy2 - EPS;
        if (!crossesInterior) return false;

        return !RoutingCrossingScorer.pointsNear(h.a, { x, y }, EPS)
            && !RoutingCrossingScorer.pointsNear(h.b, { x, y }, EPS)
            && !RoutingCrossingScorer.pointsNear(v.a, { x, y }, EPS)
            && !RoutingCrossingScorer.pointsNear(v.b, { x, y }, EPS);
    }

    private static parallelOverlapUnits(s1: OrthogonalSegment, s2: OrthogonalSegment, minLength: number): number {
        const overlap = RoutingCrossingScorer.parallelOverlapLength(s1, s2);
        if (overlap < minLength) return 0;
        return Math.max(1, Math.round(overlap / minLength));
    }

    private static parallelOverlapLength(s1: OrthogonalSegment, s2: OrthogonalSegment): number {
        if (s1.isHorizontal !== s2.isHorizontal) return 0;
        const EPS = 2;
        if (s1.isHorizontal && Math.abs(s1.a.y - s2.a.y) > EPS) return 0;
        if (!s1.isHorizontal && Math.abs(s1.a.x - s2.a.x) > EPS) return 0;
        return s1.isHorizontal
            ? Math.max(0, Math.min(Math.max(s1.a.x, s1.b.x), Math.max(s2.a.x, s2.b.x))
                - Math.max(Math.min(s1.a.x, s1.b.x), Math.min(s2.a.x, s2.b.x)))
            : Math.max(0, Math.min(Math.max(s1.a.y, s1.b.y), Math.max(s2.a.y, s2.b.y))
                - Math.max(Math.min(s1.a.y, s1.b.y), Math.min(s2.a.y, s2.b.y)));
    }

    private static pointsNear(a: Point, b: Point, tolerance: number): boolean {
        return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
    }

    private static manhattanDistance(a: Point, b: Point): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }
}
