import { Position, type EdgeConstraint, type PortSelectionConfig } from '../types/routing';
import type { LineObstacle, Rectangle } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';
import type { NodeRect } from './costAwarePortTypes';

const MAX_COORDINATE = 10_000_000;
const MAX_DIMENSION = 20_000_000;
const MAX_COLLECTION_SIZE = 10_000;
const MAX_IDENTIFIER_LENGTH = 512;
const MAX_USAGE_ENTRIES = 10_000;
const MAX_COST = 10_000_000;

type UnknownRecord = Record<string, unknown>;

export type NormalizedPortSelectionConfig = PortSelectionConfig;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, min, max)
        : fallback;
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
    return Math.trunc(finiteNumber(value, fallback, min, max));
}

function boundedString(value: unknown, fallback: string = ''): string {
    return typeof value === 'string' ? value.slice(0, MAX_IDENTIFIER_LENGTH) : fallback;
}

function isPosition(value: unknown): value is Position {
    return value === Position.Top
        || value === Position.Bottom
        || value === Position.Left
        || value === Position.Right;
}

function normalizeRectangle(value: unknown): Rectangle | undefined {
    if (!isRecord(value)) return undefined;

    const x = finiteNumber(value.x, Number.NaN, -MAX_COORDINATE, MAX_COORDINATE);
    const y = finiteNumber(value.y, Number.NaN, -MAX_COORDINATE, MAX_COORDINATE);
    const width = finiteNumber(value.width, Number.NaN, 0, MAX_DIMENSION);
    const height = finiteNumber(value.height, Number.NaN, 0, MAX_DIMENSION);
    if (![x, y, width, height].every(Number.isFinite)) return undefined;

    const rectangle: Rectangle & { id?: string; padding?: number } = { x, y, width, height };
    if (typeof value.id === 'string') rectangle.id = boundedString(value.id);
    if (typeof value.padding === 'number' && Number.isFinite(value.padding)) {
        rectangle.padding = clamp(value.padding, 0, MAX_DIMENSION);
    }
    return rectangle;
}

function normalizeRectangles(value: unknown): Rectangle[] {
    if (!Array.isArray(value)) return [];
    const rectangles: Rectangle[] = [];
    for (const candidate of value.slice(0, MAX_COLLECTION_SIZE)) {
        const rectangle = normalizeRectangle(candidate);
        if (rectangle) rectangles.push(rectangle);
    }
    return rectangles;
}

function isSpatialIndex(value: unknown): value is SpatialIndex {
    if (!isRecord(value)) return false;
    return typeof value.insert === 'function'
        && typeof value.remove === 'function'
        && typeof value.query === 'function'
        && typeof value.queryLine === 'function'
        && typeof value.getAll === 'function'
        && typeof value.clear === 'function';
}

function safeIndexCall<T>(callback: () => T, fallback: T): T {
    try {
        return callback();
    } catch {
        return fallback;
    }
}

function wrapSpatialIndex(index: SpatialIndex): SpatialIndex {
    return {
        insert(item) {
            const rectangle = normalizeRectangle(item);
            if (rectangle) safeIndexCall(() => index.insert(rectangle), undefined);
        },
        remove(item) {
            const rectangle = normalizeRectangle(item);
            if (rectangle) safeIndexCall(() => index.remove(rectangle), undefined);
        },
        query(range) {
            const normalizedRange = normalizeRectangle(range);
            if (!normalizedRange) return [];
            return normalizeRectangles(safeIndexCall(() => index.query(normalizedRange), []));
        },
        queryLine(x1, y1, x2, y2) {
            const points = [x1, y1, x2, y2];
            if (!points.every(value => typeof value === 'number' && Number.isFinite(value))) return [];
            return normalizeRectangles(safeIndexCall(() => index.queryLine(
                clamp(x1, -MAX_COORDINATE, MAX_COORDINATE),
                clamp(y1, -MAX_COORDINATE, MAX_COORDINATE),
                clamp(x2, -MAX_COORDINATE, MAX_COORDINATE),
                clamp(y2, -MAX_COORDINATE, MAX_COORDINATE)
            ), []));
        },
        getAll() {
            return normalizeRectangles(safeIndexCall(() => index.getAll(), []));
        },
        clear() {
            safeIndexCall(() => index.clear(), undefined);
        }
    };
}

export function normalizeNodeRect(value: unknown): NodeRect {
    const rectangle = normalizeRectangle(value);
    return rectangle
        ? { ...rectangle, width: Math.max(1, rectangle.width), height: Math.max(1, rectangle.height) }
        : { x: 0, y: 0, width: 1, height: 1 };
}

export function normalizeObstacles(value: unknown): Rectangle[] | SpatialIndex {
    return isSpatialIndex(value) ? wrapSpatialIndex(value) : normalizeRectangles(value);
}

export function normalizeDynamicObstacles(value: unknown): Rectangle[] {
    return normalizeRectangles(value);
}

export function normalizeLineObstacles(value: unknown): LineObstacle[] {
    if (!Array.isArray(value)) return [];
    const lines: LineObstacle[] = [];
    for (const candidate of value.slice(0, MAX_COLLECTION_SIZE)) {
        if (!isRecord(candidate) || !isRecord(candidate.start) || !isRecord(candidate.end)) continue;
        const startX = finiteNumber(candidate.start.x, Number.NaN, -MAX_COORDINATE, MAX_COORDINATE);
        const startY = finiteNumber(candidate.start.y, Number.NaN, -MAX_COORDINATE, MAX_COORDINATE);
        const endX = finiteNumber(candidate.end.x, Number.NaN, -MAX_COORDINATE, MAX_COORDINATE);
        const endY = finiteNumber(candidate.end.y, Number.NaN, -MAX_COORDINATE, MAX_COORDINATE);
        if (![startX, startY, endX, endY].every(Number.isFinite)) continue;
        lines.push({ start: { x: startX, y: startY }, end: { x: endX, y: endY } });
    }
    return lines;
}

function normalizePortUsage(value: unknown): Record<string, number> {
    if (!isRecord(value)) return {};
    const usage: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [key, count] of Object.entries(value).slice(0, MAX_USAGE_ENTRIES)) {
        if (key.length > MAX_IDENTIFIER_LENGTH || typeof count !== 'number' || !Number.isFinite(count)) continue;
        usage[key] = clamp(count, 0, MAX_COST);
    }
    return usage;
}

export function normalizePortSelectionConfig(
    value: unknown,
    defaults: PortSelectionConfig
): NormalizedPortSelectionConfig {
    const input = isRecord(value) ? value : {};
    const globalChannelCount = finiteInteger(input.globalChannelCount, 1, 1, MAX_COLLECTION_SIZE);
    const config: NormalizedPortSelectionConfig = {
        bonusCostThreshold: finiteNumber(input.bonusCostThreshold, defaults.bonusCostThreshold, -MAX_COST, MAX_COST),
        lowConfidenceThreshold: finiteNumber(input.lowConfidenceThreshold, defaults.lowConfidenceThreshold, 0, 1),
        highConfidenceThreshold: finiteNumber(input.highConfidenceThreshold, defaults.highConfidenceThreshold, 0, 1),
        preferGeometryOverBus: typeof input.preferGeometryOverBus === 'boolean'
            ? input.preferGeometryOverBus
            : defaults.preferGeometryOverBus,
        enableObstacleAwareness: typeof input.enableObstacleAwareness === 'boolean'
            ? input.enableObstacleAwareness
            : defaults.enableObstacleAwareness,
        portUsageWeight: finiteNumber(input.portUsageWeight, defaults.portUsageWeight, 0, MAX_COST),
        enableDynamicPorts: typeof input.enableDynamicPorts === 'boolean'
            ? input.enableDynamicPorts
            : defaults.enableDynamicPorts,
        portSlidePadding: finiteNumber(input.portSlidePadding, defaults.portSlidePadding, 0, MAX_DIMENSION),
        bendPenalty: finiteNumber(input.bendPenalty, defaults.bendPenalty ?? 50, 0, MAX_COST),
        obstaclePenalty: finiteNumber(input.obstaclePenalty, defaults.obstaclePenalty ?? 100, 0, MAX_COST),
        crossingPenalty: finiteNumber(input.crossingPenalty, defaults.crossingPenalty ?? 1200, 0, MAX_COST),
        layoutDirection: input.layoutDirection === 'TB' || input.layoutDirection === 'LR'
            || input.layoutDirection === 'BT' || input.layoutDirection === 'RL'
            ? input.layoutDirection
            : defaults.layoutDirection,
        portUsage: normalizePortUsage(input.portUsage),
        sourceId: boundedString(input.sourceId, defaults.sourceId),
        targetId: boundedString(input.targetId, defaults.targetId),
        returnAllCandidates: typeof input.returnAllCandidates === 'boolean'
            ? input.returnAllCandidates
            : defaults.returnAllCandidates,
        globalChannelCount,
        globalChannelIndex: finiteInteger(input.globalChannelIndex, 0, 0, globalChannelCount - 1)
    };

    if (input.globalChannelType === 'horizontal' || input.globalChannelType === 'vertical') {
        config.globalChannelType = input.globalChannelType;
    }
    if (isPosition(input.preferredSourcePort)) config.preferredSourcePort = input.preferredSourcePort;
    if (isPosition(input.preferredTargetPort)) config.preferredTargetPort = input.preferredTargetPort;
    if (isPosition(input.constrainedSourcePos)) config.constrainedSourcePos = input.constrainedSourcePos;
    if (isPosition(input.constrainedTargetPos)) config.constrainedTargetPos = input.constrainedTargetPos;
    return config;
}

export function normalizeEdgeConstraint(value: unknown): EdgeConstraint | undefined {
    if (!isRecord(value)) return undefined;
    const routingTypes = ['standard', 'bus', 'direct', 'orthogonal'] as const;
    const obstacleBehaviors = ['strict', 'relaxed', 'ignore'] as const;
    const lanePreferences = ['inner', 'outer', 'center'] as const;
    const routingType = routingTypes.find(candidate => candidate === value.routingType);
    const obstacleBehavior = obstacleBehaviors.find(candidate => candidate === value.obstacleBehavior);
    if (!routingType || !obstacleBehavior) return undefined;

    const constraint: EdgeConstraint = {
        routingType,
        obstacleBehavior,
        priority: finiteNumber(value.priority, 0, -MAX_COST, MAX_COST),
        debug: value.debug === true
    };
    const lanePreference = lanePreferences.find(candidate => candidate === value.lanePreference);
    if (lanePreference) constraint.lanePreference = lanePreference;
    return constraint;
}
