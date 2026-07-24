import { isPathBlocked } from './pathfindingCollision';
import { simplifyPath } from './pathfindingSimplePaths';
import type { LineObstacle, Point, Rectangle } from './pathfindingTypes';
import { SpatialIndex } from './SpatialIndex';

export function optimizePath(
    rawPath: Point[],
    obstacles: Rectangle[] | SpatialIndex,
    extraObstacles: Rectangle[] = [], // [NEW] Support for soft borders/containers
    lineObstacles: LineObstacle[] = []
): Point[] {
    const path = simplifyPath(rawPath);
    if (path.length <= 2) return path;

    // Helper to verify if a candidate sub-path is collision-free
    const checkClear = (pts: Point[]) => {
        // Use 15px padding for smoothing to ensure we don't graze obstacles too tightly
        if (isPathBlocked(pts, obstacles, 15, lineObstacles)) return false;
        if (extraObstacles.length > 0 && isPathBlocked(pts, extraObstacles, 0)) return false;
        return true;
    };

    const newPath: Point[] = [path[0]];
    let currIdx = 0;

    // Greedy look-ahead strategy
    while (currIdx < path.length - 1) {
        const curr = path[currIdx];
        let jumped = false;

        // Scan backwards from the end of the path to find the longest possible clear jump
        for (let targetIdx = path.length - 1; targetIdx >= currIdx + 2; targetIdx--) {
            const target = path[targetIdx];

            // 1. Check if they can be connected by a STRAIGHT line
            if (Math.abs(curr.x - target.x) < 0.1 || Math.abs(curr.y - target.y) < 0.1) {
                if (checkClear([curr, target])) {
                    newPath.push(target);
                    currIdx = targetIdx;
                    jumped = true;
                    break;
                }
                continue;
            }

            // 2. Off-axis: Check if they can be connected by an L-SHAPE (1 corner)
            const c1 = { x: target.x, y: curr.y };
            const c2 = { x: curr.x, y: target.y };

            // Start with the corner that continues the largest direction vector
            const checkOrder = Math.abs(target.x - curr.x) > Math.abs(target.y - curr.y) ? [c1, c2] : [c2, c1];

            let lJumpFound = false;
            for (const corner of checkOrder) {
                if (checkClear([curr, corner, target])) {
                    newPath.push(corner);
                    newPath.push(target);
                    currIdx = targetIdx;
                    lJumpFound = true;
                    break;
                }
            }

            if (lJumpFound) {
                jumped = true;
                break;
            }
        }

        // If no large jump was possible, step to the immediate next point
        if (!jumped) {
            currIdx++;
            newPath.push(path[currIdx]);
        }
    }

    return simplifyPath(newPath);
}
