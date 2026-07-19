import type { AlgorithmDebugInfo, Point } from '@/core/types/routing';

export interface DebugObstacle {
    id?: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    width?: number;
    height?: number;
}

export type DebugEdge = [Point, Point];

export interface RawDebugEdge {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export type VisibilityGraphLike =
    | unknown[]
    | { edges?: unknown[] };

export interface AlgorithmDebugPayload {
    grid?: AlgorithmDebugInfo['grid'];
    visited?: Point[];
    obstacles?: DebugObstacle[];
    rawPoints?: Point[];
    vg?: DebugEdge[];
    visibilityGraph?: DebugEdge[];
    quadTree?: DebugObstacle[];
    spatialIndex?: DebugObstacle[];
    strategy?: string;
    sourceRect?: DebugObstacle;
    targetRect?: DebugObstacle;
}

export interface DebugMetadata {
    strategy?: string;
    duration?: number;
    steps?: number;
    length?: number;
    executionTime?: number;
    bendCount?: number;
    pathLength?: number;
    efficiencyRatio?: number;
}

export interface DebugPayload extends AlgorithmDebugInfo {
    edgeId?: string;
    pathPoints?: Point[];
    path?: Point[];
    obstacles?: DebugObstacle[];
    vg?: DebugEdge[];
    points?: Array<Point & { type: 'start' | 'end' | string }>;
    quadTree?: DebugObstacle[];
    metadata?: DebugMetadata;
}

export interface VisualizerTransform {
    x: number;
    y: number;
    k: number;
}

export interface VisualizerViewport {
    width: number;
    height: number;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
    if (!value || typeof value !== 'object') return false;
    const point = value as Partial<Point>;
    return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

function isRawDebugEdge(value: unknown): value is RawDebugEdge {
    if (!value || typeof value !== 'object') return false;
    const edge = value as Partial<RawDebugEdge>;
    return isFiniteNumber(edge.x1)
        && isFiniteNumber(edge.y1)
        && isFiniteNumber(edge.x2)
        && isFiniteNumber(edge.y2);
}

export function normalizeVisibilityGraph(vg: VisibilityGraphLike | undefined | null): DebugEdge[] {
    const rawEdges = Array.isArray(vg) ? vg : vg?.edges;
    if (!Array.isArray(rawEdges)) return [];

    return rawEdges.flatMap((edge): DebugEdge[] => {
        if (Array.isArray(edge) && edge.length >= 2 && isPoint(edge[0]) && isPoint(edge[1])) {
            return [[edge[0], edge[1]]];
        }
        if (isRawDebugEdge(edge)) {
            return [[{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }]];
        }
        return [];
    });
}

function getAlgorithmDebug(data: DebugPayload): AlgorithmDebugPayload | null {
    return data.algorithmDebug && typeof data.algorithmDebug === 'object'
        ? data.algorithmDebug as AlgorithmDebugPayload
        : null;
}

/** Computes a safe fit transform from untrusted runtime debug payloads. */
export function calculateVisualizerFit(
    data: DebugPayload,
    viewport: VisualizerViewport,
): VisualizerTransform | null {
    if (!isFiniteNumber(viewport.width) || !isFiniteNumber(viewport.height)
        || viewport.width <= 0 || viewport.height <= 0) {
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasContent = false;

    const updateBounds = (x: unknown, y: unknown) => {
        if (!isFiniteNumber(x) || !isFiniteNumber(y)) return;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hasContent = true;
    };
    const updateRect = (rect: DebugObstacle | undefined) => {
        if (!rect || !isFiniteNumber(rect.x) || !isFiniteNumber(rect.y)) return;
        const width = rect.w ?? rect.width ?? 0;
        const height = rect.h ?? rect.height ?? 0;
        if (!isFiniteNumber(width) || !isFiniteNumber(height) || width < 0 || height < 0) return;
        updateBounds(rect.x, rect.y);
        updateBounds(rect.x + width, rect.y + height);
    };
    const updatePoints = (points: unknown) => {
        if (Array.isArray(points)) points.forEach((point) => {
            if (isPoint(point)) updateBounds(point.x, point.y);
        });
    };

    const algorithmDebug = getAlgorithmDebug(data);
    updatePoints(data.pathPoints ?? data.path);
    updatePoints(algorithmDebug?.rawPoints);
    updateRect(algorithmDebug?.sourceRect);
    updateRect(algorithmDebug?.targetRect);
    updatePoints(data.points);

    const hadPrimaryContent = hasContent;
    const primaryBounds = { minX, minY, maxX, maxY };
    const primaryWidth = Math.max(maxX - minX, 200);
    const primaryHeight = Math.max(maxY - minY, 200);
    const obstacles = data.obstacles ?? algorithmDebug?.obstacles;
    if (Array.isArray(obstacles)) {
        obstacles.forEach((obstacle) => {
            const width = obstacle.w ?? obstacle.width ?? 0;
            const height = obstacle.h ?? obstacle.height ?? 0;
            if (!hadPrimaryContent) {
                updateRect(obstacle);
                return;
            }
            const nearX = obstacle.x + width >= primaryBounds.minX - primaryWidth * 2
                && obstacle.x <= primaryBounds.maxX + primaryWidth * 2;
            const nearY = obstacle.y + height >= primaryBounds.minY - primaryHeight * 2
                && obstacle.y <= primaryBounds.maxY + primaryHeight * 2;
            if (nearX && nearY) updateRect(obstacle);
        });
    }

    const grid = data.grid ?? algorithmDebug?.grid;
    if (grid && 'data' in grid && isFiniteNumber(grid.minX) && isFiniteNumber(grid.minY)
        && isFiniteNumber(grid.cols) && isFiniteNumber(grid.rows) && isFiniteNumber(grid.size)
        && grid.cols >= 0 && grid.rows >= 0 && grid.size >= 0) {
        updateBounds(grid.minX, grid.minY);
        updateBounds(grid.minX + grid.cols * grid.size, grid.minY + grid.rows * grid.size);
    }
    updatePoints(data.visited ?? algorithmDebug?.visited);

    const visibilityGraph = data.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
    normalizeVisibilityGraph(visibilityGraph).forEach(([start, end]) => {
        updateBounds(start.x, start.y);
        updateBounds(end.x, end.y);
    });

    if (!hasContent) return null;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    if (contentWidth <= 0 || contentHeight <= 0) return null;

    const padding = 50;
    const rawScale = Math.min(
        (viewport.width - padding * 2) / contentWidth,
        (viewport.height - padding * 2) / contentHeight,
    );
    const scale = Number.isFinite(rawScale) && rawScale > 0
        ? Math.max(0.05, Math.min(rawScale, 4))
        : 1;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return {
        x: viewport.width / 2 - centerX * scale,
        y: viewport.height / 2 - centerY * scale,
        k: scale,
    };
}
