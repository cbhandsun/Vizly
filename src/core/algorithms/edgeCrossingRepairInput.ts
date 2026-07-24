import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import type { EdgeCrossingRepairOptions } from './edgeCrossingRepairTypes';

const MAX_COORDINATE = 10_000_000;
const MAX_DIMENSION = 20_000_000;
const MAX_EDGE_COUNT = 10_000;
const MAX_POINTS_PER_EDGE = 4_096;
export const MAX_REPAIRED_POINTS_PER_EDGE = 8_192;
const MAX_OBSTACLES = 10_000;
const MAX_BUDDY_GROUPS = 10_000;
const MAX_EDGE_ID_LENGTH = 512;
const MAX_ITERATIONS = 32;
const MAX_SPACING = 1_000;

type UnknownRecord = Record<string, unknown>;

export interface NormalizedEdgeCrossingRepairOptions extends EdgeCrossingRepairOptions {
    obstacles: Rectangle[];
    ignoredRectsByEdge: Map<string, Rectangle[]>;
    buddyGroups: BuddyGroup[];
    spacing: number;
    maxIterations: number;
    allowObstacleHitIfImprovesCrossing: boolean;
    preserveEndpointDirections: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value))
        : fallback;
}

function normalizePoint(value: unknown): Point | undefined {
    if (!isRecord(value)) return undefined;
    if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return undefined;
    if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return undefined;
    return {
        x: finiteNumber(value.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
        y: finiteNumber(value.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
    };
}

function normalizePath(value: unknown, maxPointsPerEdge: number): Point[] | undefined {
    if (!Array.isArray(value) || value.length < 2 || value.length > maxPointsPerEdge) return undefined;
    const points: Point[] = [];
    for (const candidate of value) {
        const point = normalizePoint(candidate);
        if (!point) return undefined;
        points.push(point);
    }
    return points;
}

function normalizeRectangle(value: unknown): Rectangle | undefined {
    if (!isRecord(value)) return undefined;
    if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return undefined;
    if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return undefined;
    if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 1) return undefined;
    if (typeof value.height !== 'number' || !Number.isFinite(value.height) || value.height <= 1) return undefined;
    return {
        x: finiteNumber(value.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
        y: finiteNumber(value.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
        width: finiteNumber(value.width, 2, 2, MAX_DIMENSION),
        height: finiteNumber(value.height, 2, 2, MAX_DIMENSION),
    };
}

function normalizeRectangles(value: unknown): Rectangle[] {
    if (!Array.isArray(value)) return [];
    const rectangles: Rectangle[] = [];
    for (const candidate of value.slice(0, MAX_OBSTACLES)) {
        const rectangle = normalizeRectangle(candidate);
        if (rectangle) rectangles.push(rectangle);
    }
    return rectangles;
}

function normalizeEdgeIdSet(value: unknown): Set<string> | undefined {
    if (!(value instanceof Set)) return undefined;
    const edgeIds = new Set<string>();
    for (const candidate of value) {
        if (typeof candidate !== 'string') continue;
        edgeIds.add(candidate.slice(0, MAX_EDGE_ID_LENGTH));
        if (edgeIds.size >= MAX_EDGE_COUNT) break;
    }
    return edgeIds;
}

function normalizeBuddyGroups(value: unknown): BuddyGroup[] {
    if (!Array.isArray(value)) return [];
    const groups: BuddyGroup[] = [];
    for (const candidate of value.slice(0, MAX_BUDDY_GROUPS)) {
        if (!isRecord(candidate) || (candidate.type !== 'o2m' && candidate.type !== 'm2o')) continue;
        const edgeIds = normalizeEdgeIdSet(candidate.edgeIds);
        if (!edgeIds || edgeIds.size === 0) continue;
        groups.push({ type: candidate.type, edgeIds });
    }
    return groups;
}

function normalizeIgnoredRects(value: unknown): Map<string, Rectangle[]> {
    const result = new Map<string, Rectangle[]>();
    if (!(value instanceof Map)) return result;
    for (const [edgeId, rectangles] of value) {
        if (typeof edgeId !== 'string') continue;
        result.set(edgeId.slice(0, MAX_EDGE_ID_LENGTH), normalizeRectangles(rectangles));
        if (result.size >= MAX_EDGE_COUNT) break;
    }
    return result;
}

export function normalizeEdgePaths(
    value: unknown,
    maxPointsPerEdge: number = MAX_POINTS_PER_EDGE
): Map<string, Point[]> {
    const result = new Map<string, Point[]>();
    if (!(value instanceof Map)) return result;
    for (const [edgeId, path] of value) {
        if (typeof edgeId !== 'string') continue;
        const points = normalizePath(path, maxPointsPerEdge);
        if (!points) continue;
        result.set(edgeId.slice(0, MAX_EDGE_ID_LENGTH), points);
        if (result.size >= MAX_EDGE_COUNT) break;
    }
    return result;
}

export function normalizeEdgeCrossingRepairOptions(value: unknown): NormalizedEdgeCrossingRepairOptions {
    const input = isRecord(value) ? value : {};
    return {
        obstacles: normalizeRectangles(input.obstacles),
        ignoredRectsByEdge: normalizeIgnoredRects(input.ignoredRectsByEdge),
        buddyGroups: normalizeBuddyGroups(input.buddyGroups),
        spacing: finiteNumber(input.spacing, 12, 1, MAX_SPACING),
        maxIterations: Math.trunc(finiteNumber(input.maxIterations, 4, 0, MAX_ITERATIONS)),
        mutableEdgeIds: normalizeEdgeIdSet(input.mutableEdgeIds),
        allowObstacleHitIfImprovesCrossing: input.allowObstacleHitIfImprovesCrossing === true,
        preserveEndpointDirections: input.preserveEndpointDirections === true,
    };
}
