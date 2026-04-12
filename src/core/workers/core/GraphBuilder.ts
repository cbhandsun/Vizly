/* eslint-disable @typescript-eslint/no-explicit-any */
import { Position } from '../../types/routing';
import { Rectangle } from '../../algorithms/pathfinding';
import { QuadTree, SpatialIndex } from '../../algorithms/SpatialIndex';

/**
 * GraphBuilder: Logic for setting up the pathfinding environment (Grid, Obstacles, Spatial Index).
 */

/**
 * Counts obstacles in a specific direction from a node to detect congestion.
 */
export function countObstaclesInDirection(
    nodeRect: { x: number; y: number; width: number; height: number },
    direction: Position,
    obstacles: Rectangle[] | SpatialIndex,
    scanDistance: number = 100
): number {
    if (!nodeRect || !obstacles) return 0;
    // Check for empty array
    if (Array.isArray(obstacles) && obstacles.length === 0) return 0;

    const center = {
        x: nodeRect.x + nodeRect.width / 2,
        y: nodeRect.y + nodeRect.height / 2
    };

    // Define scan area based on direction
    let scanArea: Rectangle;
    switch (direction) {
        case Position.Right:
            scanArea = {
                x: nodeRect.x + nodeRect.width,
                y: center.y - nodeRect.height,
                width: scanDistance,
                height: nodeRect.height * 2
            };
            break;
        case Position.Left:
            scanArea = {
                x: nodeRect.x - scanDistance,
                y: center.y - nodeRect.height,
                width: scanDistance,
                height: nodeRect.height * 2
            };
            break;
        case Position.Bottom:
            scanArea = {
                x: center.x - nodeRect.width,
                y: nodeRect.y + nodeRect.height,
                width: nodeRect.width * 2,
                height: scanDistance
            };
            break;
        case Position.Top:
            scanArea = {
                x: center.x - nodeRect.width,
                y: nodeRect.y - scanDistance,
                width: nodeRect.width * 2,
                height: scanDistance
            };
            break;
        default:
            return 0;
    }

    // [OPTIMIZATION] Use Spatial Index if available
    const isSpatialIndex = (obs: any): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

    if (isSpatialIndex(obstacles)) {
        const candidates = obstacles.query(scanArea);
        return candidates.length;
    }

    // Count obstacles that intersect with scan area
    let count = 0;
    const obsList = obstacles as Rectangle[];
    for (const obs of obsList) {
        if (
            obs.x < scanArea.x + scanArea.width &&
            obs.x + obs.width > scanArea.x &&
            obs.y < scanArea.y + scanArea.height &&
            obs.y + obs.height > scanArea.y
        ) {
            count++;
        }
    }

    return count;
}

/**
 * Calculates dynamic grid size based on Euclidean distance.
 * Faster/Coarser grid for long distances, finer grid for short exact routing.
 */
export const calculateAdaptiveGridSize = (sX: number, sY: number, tX: number, tY: number, baseConfigGrid: number): number => {
    const dist = Math.hypot(tX - sX, tY - sY);
    // Base Strategy:
    // < 500px: Use config (default 10-20)
    // > 500px: Increase grid size
    // Max cap: 40px (Too large grids lose precision for final docking)

    let adaptive = baseConfigGrid || 10;

    // [NEW] Short distance high precision mode (Hanan-lite support)
    // If nodes are very close, 20px grid is too coarse.
    if (dist < 400) {
        return 10; // Force finer grid
    }

    if (dist > 2000) adaptive = Math.max(adaptive, 30);
    else if (dist > 1000) adaptive = Math.max(adaptive, 20);
    else if (dist > 500) adaptive = Math.max(adaptive, 15);

    return Math.min(40, adaptive);
};

/**
 * Builds or retrieves a SpatialIndex for high-performance collision detection.
 */
export const buildOrGetSpatialIndex = (
    obstacles: Rectangle[],
    prebuiltSpatialIndex?: SpatialIndex
): SpatialIndex | undefined => {

    if (prebuiltSpatialIndex) return prebuiltSpatialIndex;

    // Only build if obstacle count justifies the overhead (> 50)
    if (!obstacles || obstacles.length <= 50) return undefined;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Fast bounds calculation
    for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (obs.x < minX) minX = obs.x;
        if (obs.y < minY) minY = obs.y;
        if (obs.x + obs.width > maxX) maxX = obs.x + obs.width;
        if (obs.y + obs.height > maxY) maxY = obs.y + obs.height;
    }

    // Add padding to bounds
    const padding = 2000;
    const index = new QuadTree({
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2
    });

    // Batch insert
    for (let i = 0; i < obstacles.length; i++) {
        index.insert(obstacles[i]);
    }

    return index;
};
