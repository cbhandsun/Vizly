import type { Point } from '../types/routing';
import type { Rectangle } from './pathfinding';

export interface ManyToOneFanInGroup {
    targetId: string;
    edgeIds: string[];
}

export interface ManyToOneFanInOptions {
    spacing?: number;
    obstacles?: Rectangle[];
    ignoredRectsByEdge?: Map<string, Rectangle[]>;
}

const EPS = 1.5;

export function refineManyToOneFanIn(
    edgePaths: Map<string, Point[]>,
    groups: ManyToOneFanInGroup[],
    options: ManyToOneFanInOptions = {}
): Map<string, Point[]> {
    if (edgePaths.size === 0 || groups.length === 0) return edgePaths;

    const spacing = options.spacing ?? 12;
    const result = new Map(edgePaths);

    for (const group of groups) {
        const members = group.edgeIds
            .map(edgeId => ({ edgeId, points: result.get(edgeId) }))
            .filter((entry): entry is { edgeId: string; points: Point[] } => !!entry.points && entry.points.length >= 2);
        if (members.length < 2) continue;

        const refined = buildVerticalFanIn(members, spacing, options);
        if (!refined) continue;

        refined.forEach((points, edgeId) => result.set(edgeId, points));
    }

    return result;
}

function buildVerticalFanIn(
    members: Array<{ edgeId: string; points: Point[] }>,
    spacing: number,
    options: ManyToOneFanInOptions
): Map<string, Point[]> | null {
    const verticalTailMembers = members.filter(({ points }) => {
        const prev = points[points.length - 2];
        const end = points[points.length - 1];
        return Math.abs(prev.x - end.x) < EPS;
    });
    if (verticalTailMembers.length < Math.ceil(members.length * 0.6)) return null;

    const tailEnds = members.map(({ points }) => points[points.length - 1]);
    const axisSpread = max(tailEnds.map(p => p.x)) - min(tailEnds.map(p => p.x));
    if (axisSpread > Math.max(48, spacing * 5)) return null;

    const trunkX = median(tailEnds.map(p => p.x));
    const targetY = median(tailEnds.map(p => p.y));
    const entryDirection = inferVerticalEntryDirection(members, targetY);
    if (entryDirection === 0) return null;

    const targetClearance = Math.max(52, spacing * 4.5);
    const collectorY = targetY - entryDirection * targetClearance;
    const candidates = new Map<string, Point[]>();

    for (const { edgeId, points } of members) {
        const junction = { x: trunkX, y: collectorY };
        const candidate = buildPathToVerticalTrunk(points, junction, { x: trunkX, y: targetY }, spacing);
        if (!isCandidateAcceptable(edgeId, points, candidate, spacing, options)) return null;
        candidates.set(edgeId, candidate);
    }

    if (internalCrossings(candidates) > internalCrossings(new Map(members.map(m => [m.edgeId, m.points])))) {
        return null;
    }

    return candidates;
}

function buildPathToVerticalTrunk(points: Point[], junction: Point, target: Point, spacing: number): Point[] {
    const prefix = sourcePrefix(points);
    const anchor = prefix[prefix.length - 1];
    const candidate = [...prefix];
    const lateralGap = Math.abs(anchor.x - junction.x);
    const shortCollectorJog = lateralGap > EPS && lateralGap < Math.max(24, spacing * 2);

    if (shortCollectorJog && Math.abs(anchor.y - junction.y) > EPS) {
        candidate.push({ x: junction.x, y: anchor.y });
        candidate.push(junction);
    } else {
        if (Math.abs(anchor.y - junction.y) > EPS) {
            candidate.push({ x: anchor.x, y: junction.y });
        }
        if (Math.abs(anchor.x - junction.x) > EPS) {
            candidate.push(junction);
        } else {
            candidate[candidate.length - 1] = junction;
        }
    }

    if (Math.abs(junction.y - target.y) > EPS) {
        candidate.push(target);
    }

    return simplifyOrthogonal(candidate);
}

function sourcePrefix(points: Point[]): Point[] {
    const prefix = [{ ...points[0] }];
    const next = points[1];
    const keepsOrthogonalStub = next
        && (Math.abs(next.x - points[0].x) < EPS || Math.abs(next.y - points[0].y) < EPS)
        && (Math.abs(next.x - points[0].x) > EPS || Math.abs(next.y - points[0].y) > EPS);
    if (points.length > 2 && keepsOrthogonalStub) {
        prefix.push({ ...next });
    }
    return prefix;
}

function sourceAnchor(points: Point[]): Point {
    return points[1] ?? points[0];
}

function inferVerticalEntryDirection(members: Array<{ points: Point[] }>, targetY: number): number {
    let sum = 0;
    for (const { points } of members) {
        const prev = points[points.length - 2];
        const end = points[points.length - 1];
        const dy = end.y - prev.y;
        if (Math.abs(dy) > EPS) sum += Math.sign(dy);
    }
    if (sum !== 0) return Math.sign(sum);

    const sourceMedianY = median(members.map(({ points }) => sourceAnchor(points).y));
    const dy = targetY - sourceMedianY;
    return Math.abs(dy) > EPS ? Math.sign(dy) : 0;
}

function isCandidateAcceptable(
    edgeId: string,
    original: Point[],
    candidate: Point[],
    spacing: number,
    options: ManyToOneFanInOptions
): boolean {
    if (candidate.length < 2 || !isOrthogonal(candidate)) return false;
    if (pathLength(candidate) > pathLength(original) + spacing * 24) return false;
    if (hitsObstacles(edgeId, candidate, options)) return false;
    return true;
}

function hitsObstacles(edgeId: string, points: Point[], options: ManyToOneFanInOptions): boolean {
    const obstacles = options.obstacles ?? [];
    if (obstacles.length === 0) return false;
    const ignored = options.ignoredRectsByEdge?.get(edgeId) ?? [];

    for (let i = 0; i < points.length - 1; i++) {
        for (const obstacle of obstacles) {
            if (ignored.some(rect => sameRect(rect, obstacle))) continue;
            if (segmentIntersectsRect(points[i], points[i + 1], obstacle, 2)) return true;
        }
    }
    return false;
}

function segmentIntersectsRect(a: Point, b: Point, rect: Rectangle, padding: number): boolean {
    const left = rect.x - padding;
    const right = rect.x + rect.width + padding;
    const top = rect.y - padding;
    const bottom = rect.y + rect.height + padding;

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

function sameRect(a: Rectangle, b: Rectangle): boolean {
    return Math.abs(a.x - b.x) < EPS
        && Math.abs(a.y - b.y) < EPS
        && Math.abs(a.width - b.width) < EPS
        && Math.abs(a.height - b.height) < EPS;
}

function simplifyOrthogonal(points: Point[]): Point[] {
    const deduped: Point[] = [];
    for (const point of points) {
        const prev = deduped[deduped.length - 1];
        if (!prev || Math.abs(prev.x - point.x) > EPS || Math.abs(prev.y - point.y) > EPS) {
            deduped.push({ x: point.x, y: point.y });
        }
    }

    if (deduped.length < 3) return deduped;
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

function isOrthogonal(points: Point[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        if (Math.abs(points[i].x - points[i + 1].x) >= EPS && Math.abs(points[i].y - points[i + 1].y) >= EPS) {
            return false;
        }
    }
    return true;
}

function internalCrossings(paths: Map<string, Point[]>): number {
    const entries = [...paths.entries()];
    let count = 0;
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            count += countCrossings(entries[i][1], entries[j][1]);
        }
    }
    return count;
}

function countCrossings(a: Point[], b: Point[]): number {
    let count = 0;
    for (let i = 0; i < a.length - 1; i++) {
        for (let j = 0; j < b.length - 1; j++) {
            if (segmentsCross(a[i], a[i + 1], b[j], b[j + 1])) count++;
        }
    }
    return count;
}

function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
    const aHorizontal = Math.abs(a1.y - a2.y) < EPS;
    const bHorizontal = Math.abs(b1.y - b2.y) < EPS;
    if (aHorizontal === bHorizontal) return false;

    const h1 = aHorizontal ? a1 : b1;
    const h2 = aHorizontal ? a2 : b2;
    const v1 = aHorizontal ? b1 : a1;
    const v2 = aHorizontal ? b2 : a2;
    const hxMin = Math.min(h1.x, h2.x);
    const hxMax = Math.max(h1.x, h2.x);
    const vyMin = Math.min(v1.y, v2.y);
    const vyMax = Math.max(v1.y, v2.y);
    const x = v1.x;
    const y = h1.y;

    if (x <= hxMin + EPS || x >= hxMax - EPS || y <= vyMin + EPS || y >= vyMax - EPS) return false;
    return true;
}

function pathLength(points: Point[]): number {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        length += Math.abs(points[i].x - points[i + 1].x) + Math.abs(points[i].y - points[i + 1].y);
    }
    return length;
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function min(values: number[]): number {
    return Math.min(...values);
}

function max(values: number[]): number {
    return Math.max(...values);
}
