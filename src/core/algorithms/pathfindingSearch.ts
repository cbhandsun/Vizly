import type { Position } from '@xyflow/react';
import {
  findPathOnVisibilityGraph,
  type VisibilityGraph,
} from './visibilityGraph';
import { RoutingAlgorithm } from './RoutingStrategySelector';
import { SpatialIndex } from './SpatialIndex';
import { MinHeap } from './pathfindingMinHeap';
import { isPathBlocked, isPointInRectangle } from './pathfindingCollision';
import { generateSimplePath, simplifyPath } from './pathfindingSimplePaths';
import type {
  LineObstacle,
  PathfindingGrid,
  Point,
  Rectangle,
} from './pathfindingTypes';
import { getPathfindingConfig } from './pathfindingConfig';
import {
  buildPathfindingGrid,
  PATHFINDING_COSTS as COSTS,
} from './pathfindingGrid';
import { optimizePath } from './pathfindingOptimization';
import {
  logPathfindingFallbackLShape,
  logPathfindingIterationLimit,
  logPathfindingOpenSetExhausted,
  logPathfindingWalkableEndpointFailure,
} from '../utils/routingLogging';

const isRuntimeRectangle = (value: unknown): value is Rectangle => {
    if (!value || typeof value !== 'object') return false;
    const rectangle = value as Rectangle;
    return Number.isFinite(rectangle.x)
        && Number.isFinite(rectangle.y)
        && Number.isFinite(rectangle.width)
        && Number.isFinite(rectangle.height)
        && rectangle.width >= 0
        && rectangle.height >= 0;
};

export function findPath(
    start: Point,
    end: Point,
    obstacles: Rectangle[] | SpatialIndex,
    gridSize: number = 20,
    lineObstacles: LineObstacle[] = [],
    debugOut?: { visited?: Point[]; grid?: { minX: number, minY: number, cols: number, rows: number, size: number, data: Int32Array } },
    prebuiltGrid?: PathfindingGrid, // [NEW] Optional reused grid
    guideLines: LineObstacle[] = [], // [NEW] Low-cost lines to attract path
    returnNullOnFail: boolean = false, // [NEW] Allow caller to handle failure
    dynamicObstacles: Rectangle[] = [], // [NEW] Dynamic obstacles (e.g., strict padding) to be added to grid
    containerBorders: Rectangle[] = [], // [NEW] Soft penalty for container borders
    congestionGrid?: Int32Array,   // [NEW] Congestion map
    _clearanceRects: Rectangle[] = [],   // [NEW] Areas to force clear (source/target)
    generateOpts?: { sourcePos?: Position, targetPos?: Position } // [NEW] Port directions for simple path validation
): Point[] | null {
    const isSpatialIndex = (obs: unknown): obs is SpatialIndex =>
        !!obs && typeof obs === 'object' && typeof (obs as SpatialIndex).query === 'function';
    if (!isSpatialIndex(obstacles)) {
        obstacles = (Array.isArray(obstacles) ? obstacles : []).filter(isRuntimeRectangle);
    }
    const spatialIndex = isSpatialIndex(obstacles) ? obstacles : undefined;
    const obstacleList: Rectangle[] = spatialIndex ? spatialIndex.getAll() : (obstacles as Rectangle[]);
    const simplePath = generateSimplePath(start, end, obstacles, lineObstacles, generateOpts);
    if (simplePath) {
        const hasDynamicObstacles = dynamicObstacles.length > 0;
        if (!hasDynamicObstacles) {
            if (debugOut) {
                const debugGrid = buildPathfindingGrid(
                    obstacles,
                    { startX: start.x, startY: start.y, endX: end.x, endY: end.y },
                    gridSize
                );
                debugOut.grid = {
                    minX: debugGrid.minX,
                    minY: debugGrid.minY,
                    cols: debugGrid.cols,
                    rows: debugGrid.rows,
                    size: debugGrid.size,
                    data: new Int32Array(debugGrid.data)
                };
            }
            return simplePath;
        }
    }
    const config = getPathfindingConfig();
    if (!prebuiltGrid && config.enableSmartStrategy && config.strategySelector) {
        const strategy = config.strategySelector.selectStrategy({
            obstacleCount: obstacleList.length,
            canvasBounds: {
                width: Math.abs(end.x - start.x) * 2,
                height: Math.abs(end.y - start.y) * 2
            },
            obstacles: obstacleList
        });
        if (strategy === RoutingAlgorithm.VISIBILITY_GRAPH) {
            const vgCache = config.vgCacheManager;
            let visibilityGraph: VisibilityGraph | undefined;
            if (vgCache) {
                visibilityGraph = vgCache.getOrBuild(obstacleList, spatialIndex, undefined, { obstacleOffset: 20 });
            } else if (config.visibilityGraphCache) {
                visibilityGraph = config.visibilityGraphCache;
            }
            const visibilityPath = findPathOnVisibilityGraph(
                start,
                end,
                obstacles,
                visibilityGraph,
                { obstacleOffset: 20 }
            );
            if (visibilityPath) {
                if (debugOut) {
                    const debugGrid = buildPathfindingGrid(
                        obstacles,
                        { startX: start.x, startY: start.y, endX: end.x, endY: end.y },
                        gridSize
                    );
                    debugOut.grid = {
                        minX: debugGrid.minX,
                        minY: debugGrid.minY,
                        cols: debugGrid.cols,
                        rows: debugGrid.rows,
                        size: debugGrid.size,
                        data: new Int32Array(debugGrid.data)
                    };
                }
                return visibilityPath;
            }
        }
    } else {
        const obstacleCount = isSpatialIndex(obstacles) ? 100 : obstacleList.length;
        if (config.useVisibilityGraph &&
            obstacleCount >= (config.visibilityGraphMinObstacles || 10)) {
            const visibilityPath = findPathOnVisibilityGraph(
                start,
                end,
                obstacles,
                config.visibilityGraphCache,
                { obstacleOffset: 20 }
            );
            if (visibilityPath) {
                return visibilityPath;
            }
        }
    }
    let grid: PathfindingGrid;
    const congestionCosts = prebuiltGrid && congestionGrid && congestionGrid.length === prebuiltGrid.data.length
        ? congestionGrid
        : undefined;
    if (prebuiltGrid) {
        grid = prebuiltGrid;
    } else {
        grid = buildPathfindingGrid(obstacles, { startX: start.x, startY: start.y, endX: end.x, endY: end.y }, gridSize);
    }
    if (debugOut) {
        debugOut.grid = {
            minX: grid.minX,
            minY: grid.minY,
            cols: grid.cols,
            rows: grid.rows,
            size: grid.size,
            data: new Int32Array(grid.data)
        };
    }
    const { minX, minY, maxX, maxY, cols, rows, maxIndex, size, data: costs } = grid;
    const needsRestore = prebuiltGrid && grid === prebuiltGrid;
    const savedCells: { idx: number; val: number }[] = [];
    const saveCost = (idx: number) => {
        if (needsRestore && idx >= 0 && idx < maxIndex) {
            savedCells.push({ idx, val: costs[idx] });
        }
    };
    const getIdx = (x: number, y: number) => {
        const c = Math.floor((x - minX) / size);
        const r = Math.floor((y - minY) / size);
        if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
        return r * cols + c;
    };
    const getCoords = (idx: number) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        return { x: minX + c * size, y: minY + r * size };
    };
    if (debugOut) {
        if (!debugOut.grid) {
            debugOut.grid = { minX, minY, cols, rows, size, data: new Int32Array(costs) };
        }
    }
    const restoreSavedCells = () => {
        if (needsRestore && savedCells) {
            for (let i = savedCells.length - 1; i >= 0; i--) {
                costs[savedCells[i].idx] = savedCells[i].val;
            }
        }
    };
    const clearLaunchZone = (p: Point) => {
        const cx = Math.round(p.x / size) * size;
        const cy = Math.round(p.y / size) * size;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const idx = getIdx(cx + dc * size, cy + dr * size);
                if (idx !== -1 && costs[idx] < COSTS.OBSTACLE) {
                    saveCost(idx);
                    costs[idx] = COSTS.NORMAL;
                }
            }
        }
    };
    clearLaunchZone(start);
    clearLaunchZone(end);
    const sIdx = getIdx(Math.round(start.x / size) * size, Math.round(start.y / size) * size);
    if (sIdx !== -1 && costs[sIdx] === COSTS.OBSTACLE) { saveCost(sIdx); costs[sIdx] = COSTS.NORMAL; }
    const eIdx = getIdx(Math.round(end.x / size) * size, Math.round(end.y / size) * size);
    if (eIdx !== -1 && costs[eIdx] === COSTS.OBSTACLE) { saveCost(eIdx); costs[eIdx] = COSTS.NORMAL; }
    const LINE_COST = COSTS.LINE_CROSS;
    for (const line of lineObstacles) {
        const lx1 = Math.min(line.start.x, line.end.x);
        const lx2 = Math.max(line.start.x, line.end.x);
        const ly1 = Math.min(line.start.y, line.end.y);
        const ly2 = Math.max(line.start.y, line.end.y);
        if (lx2 < minX || lx1 > maxX || ly2 < minY || ly1 > maxY) continue;
        const gStart = {
            x: Math.round(line.start.x / size) * size,
            y: Math.round(line.start.y / size) * size
        };
        const gEnd = {
            x: Math.round(line.end.x / size) * size,
            y: Math.round(line.end.y / size) * size
        };
        const idxStart = getIdx(gStart.x, gStart.y);
        const idxEnd = getIdx(gEnd.x, gEnd.y);
        if (idxStart !== -1 && costs[idxStart] < COSTS.OBSTACLE) { saveCost(idxStart); costs[idxStart] = Math.max(costs[idxStart], LINE_COST); }
        if (idxEnd !== -1 && costs[idxEnd] < COSTS.OBSTACLE) { saveCost(idxEnd); costs[idxEnd] = Math.max(costs[idxEnd], LINE_COST); }
        if (Math.abs(gStart.y - gEnd.y) < 1) { // Horizontal
            const sIdx = Math.min(idxStart, idxEnd);
            const eIdx = Math.max(idxStart, idxEnd);
            for (let i = sIdx; i <= eIdx; i++) {
                if (i >= 0 && i < maxIndex && costs[i] < COSTS.OBSTACLE) { saveCost(i); costs[i] = Math.max(costs[i], LINE_COST); }
            }
        } else if (Math.abs(gStart.x - gEnd.x) < 1) { // Vertical
            const sIdx = Math.min(idxStart, idxEnd);
            const eIdx = Math.max(idxStart, idxEnd);
            for (let i = sIdx; i <= eIdx; i += cols) {
                if (i >= 0 && i < maxIndex && costs[i] < COSTS.OBSTACLE) { saveCost(i); costs[i] = Math.max(costs[i], LINE_COST); }
            }
        }
    }
    if (guideLines && guideLines.length > 0) {
        const GUIDE_COST = COSTS.MERGE_PATH;
        for (const line of guideLines) {
            const lx1 = Math.min(line.start.x, line.end.x);
            const lx2 = Math.max(line.start.x, line.end.x);
            const ly1 = Math.min(line.start.y, line.end.y);
            const ly2 = Math.max(line.start.y, line.end.y);
            if (lx2 < minX || lx1 > maxX || ly2 < minY || ly1 > maxY) continue;
            const gStart = {
                x: Math.round(line.start.x / size) * size,
                y: Math.round(line.start.y / size) * size
            };
            const gEnd = {
                x: Math.round(line.end.x / size) * size,
                y: Math.round(line.end.y / size) * size
            };
            const idxStart = getIdx(gStart.x, gStart.y);
            const idxEnd = getIdx(gEnd.x, gEnd.y);
            const applyGuideCost = (i: number) => {
                if (i >= 0 && i < maxIndex && costs[i] < COSTS.OBSTACLE) {
                    saveCost(i);
                    costs[i] = GUIDE_COST;
                }
            };
            if (Math.abs(gStart.y - gEnd.y) < 1) { // Horizontal
                const sIdx = Math.min(idxStart, idxEnd);
                const eIdx = Math.max(idxStart, idxEnd);
                for (let i = sIdx; i <= eIdx; i++) applyGuideCost(i);
            } else if (Math.abs(gStart.x - gEnd.x) < 1) { // Vertical
                const sIdx = Math.min(idxStart, idxEnd);
                const eIdx = Math.max(idxStart, idxEnd);
                for (let i = sIdx; i <= eIdx; i += cols) applyGuideCost(i);
            }
        }
    }
    if (dynamicObstacles.length > 0) {
        for (const rect of dynamicObstacles) {
            const rx = rect.x;
            const ry = rect.y;
            const rw = rect.width;
            const rh = rect.height;
            const startC = Math.max(0, Math.floor((rx - minX) / size));
            const endC = Math.min(cols - 1, Math.floor((rx + rw - minX) / size));
            const startR = Math.max(0, Math.floor((ry - minY) / size));
            const endR = Math.min(rows - 1, Math.floor((ry + rh - minY) / size));
            for (let r = startR; r <= endR; r++) {
                const rowOffset = r * cols;
                for (let c = startC; c <= endC; c++) {
                    const idx = rowOffset + c;
                    saveCost(idx);
                    costs[idx] = COSTS.OBSTACLE;
                }
            }
        }
    }
    if (containerBorders.length > 0) {
        for (const rect of containerBorders) {
            const rx = rect.x;
            const ry = rect.y;
            const rw = rect.width;
            const rh = rect.height;
            const startC = Math.max(0, Math.floor((rx - minX) / size));
            const endC = Math.min(cols - 1, Math.floor((rx + rw - minX) / size));
            const startR = Math.max(0, Math.floor((ry - minY) / size));
            const endR = Math.min(rows - 1, Math.floor((ry + rh - minY) / size));
            const applyPenalty = (r: number, c: number) => {
                if (r < 0 || r >= rows || c < 0 || c >= cols) return;
                const idx = r * cols + c;
                if (idx >= 0 && idx < maxIndex && costs[idx] < COSTS.OBSTACLE) {
                    saveCost(idx);
                    costs[idx] = Math.max(costs[idx], COSTS.CONTAINER_BORDER);
                }
            };
            for (let c = startC; c <= endC; c++) {
                applyPenalty(startR, c);
                applyPenalty(startR - 1, c);
                applyPenalty(startR + 1, c);
                applyPenalty(endR, c);
                applyPenalty(endR - 1, c);
                applyPenalty(endR + 1, c);
            }
            for (let r = startR; r <= endR; r++) {
                applyPenalty(r, startC);
                applyPenalty(r, startC - 1);
                applyPenalty(r, startC + 1);
                applyPenalty(r, endC);
                applyPenalty(r, endC - 1);
                applyPenalty(r, endC + 1);
            }
        }
    }
    const startX = Math.round(start.x / size) * size;
    const startY = Math.round(start.y / size) * size;
    const endX = Math.round(end.x / size) * size;
    const endY = Math.round(end.y / size) * size;
    const startIdx = getIdx(startX, startY);
    const endIdx = getIdx(endX, endY);
    const findNearestWalkable = (idx: number, centerX: number, centerY: number, radiusSteps: number = 8): number => {
        if (idx !== -1 && costs[idx] < COSTS.OBSTACLE) return idx;
        let bestIdx = -1;
        let minCost = Infinity;
        const c0 = Math.floor((centerX - minX) / size);
        const r0 = Math.floor((centerY - minY) / size);
        for (let r = 1; r <= radiusSteps; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only ring edges
                    const nc = c0 + dx;
                    const nr = r0 + dy;
                    if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                        const nIdx = nr * cols + nc;
                        const cost = costs[nIdx];
                        if (cost < COSTS.OBSTACLE) {
                            if (cost < minCost) {
                                minCost = cost;
                                bestIdx = nIdx;
                            }
                        }
                    }
                }
            }
            if (bestIdx !== -1 && minCost < COSTS.OBSTACLE) return bestIdx;
        }
        return -1;
    };
    let validStartIdx = startIdx;
    let validEndIdx = endIdx;
    if (startIdx === -1 || costs[startIdx] >= COSTS.OBSTACLE) {
        validStartIdx = findNearestWalkable(startIdx, startX, startY, 5);
    }
    if (endIdx === -1 || costs[endIdx] >= COSTS.OBSTACLE) {
        validEndIdx = findNearestWalkable(endIdx, endX, endY, 5);
    }
    if (validStartIdx === -1 || validEndIdx === -1) {
        logPathfindingWalkableEndpointFailure({
            start,
            end,
            minX,
            minY,
            maxX,
            maxY,
            startIdx,
            endIdx,
            validStartIdx,
            validEndIdx,
            obstacleCount: obstacleList.length,
            cols,
            rows,
        });
        if (returnNullOnFail) return null;
        return [start, { x: end.x, y: start.y }, end];
    }
    const actualStartIdx = validStartIdx;
    const actualEndIdx = validEndIdx;
    const fScores = new Float32Array(maxIndex).fill(Infinity);
    const gScores = new Float32Array(maxIndex).fill(Infinity);
    const cameFrom = new Int32Array(maxIndex).fill(-1);
    const directionTo = new Uint8Array(maxIndex).fill(0);
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dy) >= Math.abs(dx)) {
        directionTo[actualStartIdx] = dy >= 0 ? 3 : 1;
    } else {
        directionTo[actualStartIdx] = dx >= 0 ? 2 : 4;
    }
    gScores[actualStartIdx] = 0;
    fScores[actualStartIdx] = Math.abs(startX - endX) + Math.abs(startY - endY);
    const openSet = new MinHeap(fScores);
    openSet.push(actualStartIdx);
    const neighborOffsets = [-cols, 1, cols, -1]; // Up, Right, Down, Left
    const neighborDirs = [1, 2, 3, 4];
    const MAX_ITERATIONS = 100000;
    let iterations = 0;
    while (openSet.size() > 0) {
        if (++iterations > MAX_ITERATIONS) {
            logPathfindingIterationLimit(MAX_ITERATIONS);
            break;
        }
        const currentIdx = openSet.pop();
        if (currentIdx === undefined) break;
        if (debugOut) {
            if (!debugOut.visited) debugOut.visited = [];
            debugOut.visited.push(getCoords(currentIdx));
        }
        if (currentIdx === actualEndIdx) {
            const path: Point[] = [];
            let curr = endIdx;
            while (curr !== -1) {
                path.unshift(getCoords(curr));
                curr = cameFrom[curr];
            }
            const result: Point[] = [];
            if (path.length > 0 && (path[0].x !== start.x || path[0].y !== start.y)) {
                const p1 = start;
                const p2 = path[0];
                const dx = Math.abs(p1.x - p2.x);
                const dy = Math.abs(p1.y - p2.y);
                if (dx < 1 || dy < 1) {
                    result.push(start);
                } else {
                    result.push(start);
                    const cornerH = { x: p2.x, y: p1.y };
                    const cornerV = { x: p1.x, y: p2.y };
                    let hBlocked = false;
                    let vBlocked = false;
                    for (const obs of obstacleList) {
                        if (isPointInRectangle(cornerH.x, cornerH.y, obs, 10)) {
                            hBlocked = true;
                        }
                        if (isPointInRectangle(cornerV.x, cornerV.y, obs, 10)) {
                            vBlocked = true;
                        }
                    }
                    if (!hBlocked) {
                        result.push(cornerH);
                    } else if (!vBlocked) {
                        result.push(cornerV);
                    } else {
                        result.push(cornerH);
                    }
                }
            } else {
                result.push(start);
            }
            result.push(...path);
            const last = path[path.length - 1];
            if (last.x !== end.x || last.y !== end.y) {
                const dx = Math.abs(last.x - end.x);
                const dy = Math.abs(last.y - end.y);
                if (dx < 1 || dy < 1) {
                    result.push(end);
                } else {
                    const cornerV = { x: last.x, y: end.y };
                    const cornerH = { x: end.x, y: last.y };
                    let hBlocked = false;
                    let vBlocked = false;
                    if (spatialIndex) {
                        const pad = 10;
                        const candsH = spatialIndex.query({ x: cornerH.x - pad, y: cornerH.y - pad, width: pad * 2, height: pad * 2 });
                        hBlocked = candsH.some(obs => isPointInRectangle(cornerH.x, cornerH.y, obs, 10));
                        const candsV = spatialIndex.query({ x: cornerV.x - pad, y: cornerV.y - pad, width: pad * 2, height: pad * 2 });
                        vBlocked = candsV.some(obs => isPointInRectangle(cornerV.x, cornerV.y, obs, 10));
                    } else {
                        for (const obs of obstacleList) {
                            if (isPointInRectangle(cornerH.x, cornerH.y, obs, 10)) {
                                hBlocked = true;
                            }
                            if (isPointInRectangle(cornerV.x, cornerV.y, obs, 10)) {
                                vBlocked = true;
                            }
                        }
                    }
                    if (!vBlocked) {
                        result.push(cornerV);
                    } else if (!hBlocked) {
                        result.push(cornerH);
                    } else {
                        result.push(cornerV);
                    }
                    result.push(end);
                }
            }
            restoreSavedCells();
            const optimized = optimizePath(result, obstacles, [], lineObstacles);
            const DETOUR_RATIO = 1.8;
            const directDist = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
            let detourLen = 0;
            for (let di = 0; di < optimized.length - 1; di++) {
                detourLen += Math.abs(optimized[di + 1].x - optimized[di].x) + Math.abs(optimized[di + 1].y - optimized[di].y);
            }
            if (detourLen > directDist * DETOUR_RATIO && directDist > 100) {
                const relaxedPath = generateSimplePath(start, end, [], lineObstacles, {
                    enableBuffer: false,
                    maxSegments: 4,
                    sourcePos: generateOpts?.sourcePos,
                    targetPos: generateOpts?.targetPos
                });
                if (relaxedPath) {
                    return simplifyPath(relaxedPath);
                }
                const sPos = generateOpts?.sourcePos;
                const tPos = generateOpts?.targetPos;
                const isSourceHoriz = sPos === 'left' || sPos === 'right';
                const isTargetHoriz = tPos === 'left' || tPos === 'right';
                let fallbackPath: Point[];
                if (isSourceHoriz && !isTargetHoriz) {
                    const midX = (start.x + end.x) / 2;
                    fallbackPath = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
                } else if (!isSourceHoriz && isTargetHoriz) {
                    const midY = (start.y + end.y) / 2;
                    fallbackPath = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
                } else if (isSourceHoriz) {
                    const midX = (start.x + end.x) / 2;
                    fallbackPath = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
                } else {
                    const midY = (start.y + end.y) / 2;
                    fallbackPath = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
                }
                return simplifyPath(fallbackPath);
            }
            return optimized;
        }
        for (let i = 0; i < 4; i++) {
            const neighborIdx = currentIdx + neighborOffsets[i];
            const direction = neighborDirs[i];
            if (neighborIdx < 0 || neighborIdx >= maxIndex) continue;
            const currentCol = currentIdx % cols;
            const neighborCol = neighborIdx % cols;
            if (Math.abs(currentCol - neighborCol) > 1) continue;
            const cost = costs[neighborIdx];
            if (cost >= COSTS.OBSTACLE) continue;
            let moveCost = cost + (congestionCosts?.[neighborIdx] ?? 0);
            if (directionTo[currentIdx] !== 0 && directionTo[currentIdx] !== direction) {
                moveCost += COSTS.DIRECTION_CHANGE;
            }
            const tentativeGScore = gScores[currentIdx] + moveCost;
            const parentIdx = cameFrom[currentIdx];
            let processedGScore = tentativeGScore;
            let processedParent = currentIdx;
            if (config.enableSmartStrategy && config.enableThetaStar && parentIdx !== -1) {
                const parentCoords = getCoords(parentIdx);
                const neighborCoords = getCoords(neighborIdx);
                if (!isPathBlocked([parentCoords, neighborCoords], obstacles, 10)) {
                    let orthogonalSafe = true;
                    if (Math.abs(parentCoords.x - neighborCoords.x) > 1 && Math.abs(parentCoords.y - neighborCoords.y) > 1) {
                        const cornerA = { x: neighborCoords.x, y: parentCoords.y };
                        const cornerB = { x: parentCoords.x, y: neighborCoords.y };
                        const blockedA = isPathBlocked([parentCoords, cornerA, neighborCoords], obstacles, 10);
                        const blockedB = isPathBlocked([parentCoords, cornerB, neighborCoords], obstacles, 10);
                        if (blockedA && blockedB) {
                            orthogonalSafe = false;
                        }
                    }
                    if (orthogonalSafe) {
                        const dist = Math.sqrt(Math.pow(parentCoords.x - neighborCoords.x, 2) + Math.pow(parentCoords.y - neighborCoords.y, 2));
                        const costPerPx = COSTS.NORMAL / size; // 10 / 20 = 0.5
                        const shortcutG = gScores[parentIdx] + dist * costPerPx;
                        if (shortcutG < tentativeGScore) {
                            processedGScore = shortcutG;
                            processedParent = parentIdx;
                        }
                    }
                }
            }
            if (processedGScore < gScores[neighborIdx]) {
                cameFrom[neighborIdx] = processedParent;
                directionTo[neighborIdx] = direction;
                gScores[neighborIdx] = processedGScore;
                const coords = getCoords(neighborIdx);
                const h = Math.abs(coords.x - endX) + Math.abs(coords.y - endY);
                fScores[neighborIdx] = processedGScore + h;
                openSet.push(neighborIdx);
            }
        }
    }
    if (returnNullOnFail) {
        logPathfindingOpenSetExhausted({
            iterations,
            start,
            end,
            cols,
            rows,
            obstacleCount: obstacleList.length,
        });
        restoreSavedCells();
        return null;
    }
    logPathfindingFallbackLShape({
        iterations,
        start,
        end,
        cols,
        rows,
    });
    restoreSavedCells();
    return [start, { x: end.x, y: start.y }, end];
}
