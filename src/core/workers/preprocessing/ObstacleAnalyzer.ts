/**
 * Obstacle Analyzer
 * 
 * Provides utilities for analyzing obstacle density and distribution.
 */

import { Rectangle, Point, lineIntersectsRect } from '../../algorithms/geometryUtils';
import { Position } from '../../types/routing';
import { SpatialIndex } from '../../algorithms/SpatialIndex';

export class ObstacleAnalyzer {
    /**
     * Check if a line segment intersects with any obstacle
     * 
     * @param start Start point of the segment
     * @param end End point of the segment
     * @param obstacles List of obstacles
     * @param buffer Optional buffer/padding around obstacles (default: 0)
     * @returns True if intersection is found
     */
    intersectsAnyObstacle(
        start: Point,
        end: Point,
        obstacles: Rectangle[] | SpatialIndex,
        buffer: number = 0
    ): boolean {
        if (!obstacles) return false;
        
        const isSpatialIndex = (obs: any): obs is SpatialIndex =>
            typeof (obs as SpatialIndex).query === 'function';

        const segment = { start, end };
        
        // Define bounding box for the segment
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        
        // Expand by buffer for query
        const queryArea = {
            x: minX - buffer,
            y: minY - buffer,
            width: (maxX - minX) + buffer * 2,
            height: (maxY - minY) + buffer * 2
        };

        const candidates = isSpatialIndex(obstacles) 
            ? obstacles.query(queryArea)
            : obstacles;

        if (!Array.isArray(candidates) || candidates.length === 0) return false;

        for (const obs of candidates) {
             // Optimization: Double check bounds if using raw array (redundant for SpatialIndex but cheap)
             if (!isSpatialIndex(obstacles)) {
                 if (maxX < obs.x - buffer || minX > obs.x + obs.width + buffer ||
                     maxY < obs.y - buffer || minY > obs.y + obs.height + buffer) {
                     continue;
                 }
             }

            // Detailed check
            const targetRect = buffer === 0 ? obs : {
                x: obs.x - buffer,
                y: obs.y - buffer,
                width: obs.width + buffer * 2,
                height: obs.height + buffer * 2
            };

            if (lineIntersectsRect(segment, targetRect, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Count obstacles in a specific direction from a reference rectangle
     * 
     * @param nodeRect Reference rectangle
     * @param direction Direction to scan
     * @param obstacles Obstacle list or spatial index
     * @param scanDistance Distance to scan (default: 100)
     * @returns Number of obstacles found
     */
    countObstaclesInDirection(
        nodeRect: Rectangle,
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

        const isSpatialIndex = (obs: any): obs is SpatialIndex =>
            typeof (obs as SpatialIndex).query === 'function';

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
     * Get bounding box for a set of rectangles
     */
    getBounds(rects: Rectangle[]): { minX: number; minY: number; maxX: number; maxY: number } {
        if (rects.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (r.x < minX) minX = r.x;
            if (r.y < minY) minY = r.y;
            if (r.x + r.width > maxX) maxX = r.x + r.width;
            if (r.y + r.height > maxY) maxY = r.y + r.height;
        }

        return { minX, minY, maxX, maxY };
    }
}
