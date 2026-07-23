import { SpatialIndex } from './SpatialIndex';
import type { PathfindingGrid, Point, Rectangle } from './pathfindingTypes';
import { logPathfindingMassiveGrid } from '../utils/routingLogging';

const MAX_ABSOLUTE_COORDINATE = 10_000_000;
const MAX_GRID_CELLS = 2_000_000;

interface RoutingRectangle extends Rectangle {
    padding?: number;
    isSoftZone?: boolean;
}

const boundedCoordinate = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(-MAX_ABSOLUTE_COORDINATE, Math.min(MAX_ABSOLUTE_COORDINATE, value));
};

const isBoundedRectangle = (value: unknown): value is RoutingRectangle => {
    if (!value || typeof value !== 'object') return false;
    const rectangle = value as Rectangle;
    return Number.isFinite(rectangle.x)
        && Number.isFinite(rectangle.y)
        && Number.isFinite(rectangle.width)
        && Number.isFinite(rectangle.height)
        && rectangle.width >= 0
        && rectangle.height >= 0
        && Math.abs(rectangle.x) <= MAX_ABSOLUTE_COORDINATE
        && Math.abs(rectangle.y) <= MAX_ABSOLUTE_COORDINATE
        && rectangle.width <= MAX_ABSOLUTE_COORDINATE * 2
        && rectangle.height <= MAX_ABSOLUTE_COORDINATE * 2
        && (!('padding' in rectangle)
            || (typeof rectangle.padding === 'number'
                && Number.isFinite(rectangle.padding)
                && rectangle.padding >= 0
                && rectangle.padding <= MAX_ABSOLUTE_COORDINATE))
        && (!('isSoftZone' in rectangle) || typeof rectangle.isSoftZone === 'boolean');
};

const isSpatialIndex = (value: unknown): value is SpatialIndex =>
    !!value && typeof value === 'object' && typeof (value as SpatialIndex).query === 'function';

/**
 * Cost Configuration
 * Industry Standard Tuning:
 * - High Direction Change Cost: Encourages long straight lines (Orthogonal priority).
 * - High Line Cross Cost: Discourages crossing other edges.
 * - Buffer Zones: Keeps paths away from nodes but allows approach.
 */
export const PATHFINDING_COSTS = {
    MERGE_PATH: 1,      // Extremely low cost to encourage merging
    SOURCE_TARGET: 9,   // [NEW] Distinct cost for Source/Target nodes (slightly lower than Normal to encourage entry/exit)
    NORMAL: 10,         // Base cost
    BUFFER_ZONE_CLOSE: 15, // [FIX] Reduced from 20 to 15. Let A* graze nodes much more freely.
    BUFFER_ZONE_FAR: 10,
    DIRECTION_CHANGE: 1000, // [FIX] Increased massively from 400 to 1000. Forcing straight lines over almost everything.
    LINE_OCCUPIED: 10,
    // Expensive but traversable last-resort lanes for existing routed edges.
    LINE_CROSS: 2500,
    OBSTACLE: 10000000,
    CONTAINER_BORDER: 400
};

/**
 * [NEW] Pre-build Grid for Reuse
 */
export function buildPathfindingGrid(
    obstacles: Rectangle[] | SpatialIndex,
    rawBoundsSpec: { startX: number, startY: number, endX: number, endY: number },
    requestedGridSize: number = 20,
    rawAlignTo?: Point
): PathfindingGrid {
    let gridSize = typeof requestedGridSize === 'number' && Number.isFinite(requestedGridSize)
        ? Math.min(1_000, Math.max(2, requestedGridSize))
        : 20;
    const boundsSpec = {
        startX: boundedCoordinate(rawBoundsSpec?.startX),
        startY: boundedCoordinate(rawBoundsSpec?.startY),
        endX: boundedCoordinate(rawBoundsSpec?.endX),
        endY: boundedCoordinate(rawBoundsSpec?.endY),
    };
    const alignTo = rawAlignTo && Number.isFinite(rawAlignTo.x) && Number.isFinite(rawAlignTo.y)
        ? { x: boundedCoordinate(rawAlignTo.x), y: boundedCoordinate(rawAlignTo.y) }
        : undefined;
    // Calculate Bounds (based on provided spec, usually bounding box of all tasks)
    const GRID_PADDING = 200; // [FIX] 200px is sufficient for routing detours. 600px wasted ~60% of grid area.

    // [NEW] Dynamic Grid Alignment (Hanan-inspired)
    // Align grid lines to the start point (alignTo) to ensure key coordinates are exact grid intersections.
    let offsetX = 0;
    let offsetY = 0;
    if (alignTo) {
        offsetX = alignTo.x % gridSize;
        offsetY = alignTo.y % gridSize;
        if (offsetX < 0) offsetX += gridSize;
        if (offsetY < 0) offsetY += gridSize;
    }

    const snapToGrid = (val: number, offset: number) => Math.floor((val - offset) / gridSize) * gridSize + offset;

    // Align to grid
    const sX = snapToGrid(boundsSpec.startX, offsetX);
    const sY = snapToGrid(boundsSpec.startY, offsetY);
    const eX = Math.ceil((boundsSpec.endX - offsetX) / gridSize) * gridSize + offsetX;
    const eY = Math.ceil((boundsSpec.endY - offsetY) / gridSize) * gridSize + offsetY;

    // [FIX] Dynamic Grid Bounds Expansion
    let minX_raw = Math.min(sX, eX) - GRID_PADDING;
    let minY_raw = Math.min(sY, eY) - GRID_PADDING;
    let maxX_raw = Math.max(sX, eX) + GRID_PADDING;
    let maxY_raw = Math.max(sY, eY) + GRID_PADDING;

    let expansionObstacles: RoutingRectangle[];

    if (isSpatialIndex(obstacles)) {
        expansionObstacles = obstacles.query({
            x: minX_raw - 100,
            y: minY_raw - 100,
            width: (maxX_raw - minX_raw) + 200,
            height: (maxY_raw - minY_raw) + 200
        }).filter(isBoundedRectangle);
    } else {
        expansionObstacles = (Array.isArray(obstacles) ? obstacles : []).filter(isBoundedRectangle);
    }

    for (const obs of expansionObstacles) {
        const intersects = !(obs.x > maxX_raw || obs.x + obs.width < minX_raw || obs.y > maxY_raw || obs.y + obs.height < minY_raw);
        if (intersects) {
            const routeMargin = 200;
            minX_raw = Math.min(minX_raw, obs.x - routeMargin);
            maxX_raw = Math.max(maxX_raw, obs.x + obs.width + routeMargin);
            minY_raw = Math.min(minY_raw, obs.y - routeMargin);
            maxY_raw = Math.max(maxY_raw, obs.y + obs.height + routeMargin);
        }
    }

    const spanX = Math.max(1, maxX_raw - minX_raw);
    const spanY = Math.max(1, maxY_raw - minY_raw);
    let estimatedCells = (Math.ceil(spanX / gridSize) + 1) * (Math.ceil(spanY / gridSize) + 1);
    if (estimatedCells > MAX_GRID_CELLS) {
        gridSize = Math.ceil(gridSize * Math.sqrt(estimatedCells / MAX_GRID_CELLS));
        estimatedCells = (Math.ceil(spanX / gridSize) + 1) * (Math.ceil(spanY / gridSize) + 1);
        while (estimatedCells > MAX_GRID_CELLS) {
            gridSize = Math.ceil(gridSize * 1.05);
            estimatedCells = (Math.ceil(spanX / gridSize) + 1) * (Math.ceil(spanY / gridSize) + 1);
        }
    }

    const minX = snapToGrid(minX_raw, offsetX);
    const maxX = Math.ceil((maxX_raw - offsetX) / gridSize) * gridSize + offsetX;
    const minY = snapToGrid(minY_raw, offsetY);
    const maxY = Math.ceil((maxY_raw - offsetY) / gridSize) * gridSize + offsetY;

    const cols = Math.round((maxX - minX) / gridSize) + 1; // Use round to avoid float errors
    const rows = Math.round((maxY - minY) / gridSize) + 1;
    const maxIndex = cols * rows;

    if (maxIndex > 2000000) {
        logPathfindingMassiveGrid(cols, rows, maxIndex);
    }

    const costs = new Int32Array(maxIndex).fill(PATHFINDING_COSTS.NORMAL);

    // Rasterization
    const bufferDistanceClose = gridSize * 1.0;
    const bufferDistanceFar = gridSize * 2.0;

    // Helper: Rasterize Rect (Inline for perf or copied logic)
    const rasterizeRect = (rect: Rectangle, padding: number, cost: number) => {
        const rx = rect.x - padding;
        const ry = rect.y - padding;
        const rw = rect.width + padding * 2;
        const rh = rect.height + padding * 2;

        const startC = Math.max(0, Math.floor((rx - minX) / gridSize));
        const endC = Math.min(cols - 1, Math.floor((rx + rw - minX) / gridSize));

        const startR = Math.max(0, Math.floor((ry - minY) / gridSize));
        const endR = Math.min(rows - 1, Math.floor((ry + rh - minY) / gridSize));

        for (let r = startR; r <= endR; r++) {
            const rowOffset = r * cols;
            for (let c = startC; c <= endC; c++) {
                const idx = rowOffset + c;
                // Don't overwrite hard obstacles
                if (costs[idx] === PATHFINDING_COSTS.OBSTACLE) continue;

                if (cost === PATHFINDING_COSTS.OBSTACLE) {
                    costs[idx] = PATHFINDING_COSTS.OBSTACLE;
                } else {
                    costs[idx] = Math.max(costs[idx], cost);
                }
            }
        }
    };

    // [DEBUG] Log total obstacles applied
    // const shouldLog = obstacles.length > 20; // e10 should have 24 obstacles
    // if (shouldLog) {
    //
    // }

    // Apply Obstacles
    const relevantObstacles: RoutingRectangle[] = isSpatialIndex(obstacles) ? (() => {
        // Query obstacles intersecting the grid area (plus buffer for safety)
        const buffer = bufferDistanceFar;
        const queryRange = {
            x: minX - buffer,
            y: minY - buffer,
            width: (maxX - minX) + buffer * 2,
            height: (maxY - minY) + buffer * 2
        };
        return obstacles.query(queryRange).filter(isBoundedRectangle);
    })() : (Array.isArray(obstacles) ? obstacles : []).filter(isBoundedRectangle);

    for (const obs of relevantObstacles) {
        // [FIX] Extract custom padding and soft zone flags from obstacle
        const customPadding = obs.padding ?? 0;
        const isSoftZone = obs.isSoftZone === true;

        if (isSoftZone) {
            // Soft zone applies a graduated high cost but does not block pathing
            rasterizeRect(obs, bufferDistanceFar + customPadding, PATHFINDING_COSTS.BUFFER_ZONE_FAR);
            rasterizeRect(obs, bufferDistanceClose + customPadding, PATHFINDING_COSTS.BUFFER_ZONE_CLOSE);
            rasterizeRect(obs, customPadding, PATHFINDING_COSTS.CONTAINER_BORDER); // High but traversable cost
        } else {
            // Hard obstacle
            rasterizeRect(obs, bufferDistanceFar + customPadding, PATHFINDING_COSTS.BUFFER_ZONE_FAR);
            rasterizeRect(obs, bufferDistanceClose + customPadding, PATHFINDING_COSTS.BUFFER_ZONE_CLOSE);
            rasterizeRect(obs, customPadding, PATHFINDING_COSTS.OBSTACLE);
        }
    }

    return {
        minX, minY, maxX, maxY, cols, rows, size: gridSize,
        data: costs,
        maxIndex
    };
}
