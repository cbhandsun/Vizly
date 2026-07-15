import { createFilletedPath } from '../../../algorithms/smartEdgeUtils';
import { repairEdgeCrossingViolations } from '../../../algorithms/edgeCrossingRepair';
import {
    buildAlignedDirectPath,
    detectLocalDoglegRisks,
} from '../../../algorithms/localDoglegQuality';
import { repairHardObstacleViolations } from '../../../algorithms/hardObstaclePathRepair';
import {
    getRenderedPathCache as _getRenderedPathCache,
    setRenderedPathCacheValue as _setRenderedPathCacheValue,
} from '../../../routing/renderedPathCache';
import type { PathPoint } from './smartEdgeRoutingGeometry';
import {
    LOCAL_DOGLEG_MAX_DEPTH,
    RENDERED_BUSINESS_NODE_CLEARANCE,
    axisAlignedEndpointPath,
    bendCount,
    candidateDoesNotRegress,
    countStrictCrossings,
    findCompactTwoPointDetour,
    getLabelAutoOffset,
    isTwoPointOrthogonalPath,
    manhattanLength,
    orthogonalizePointChain,
    parseRenderedPathPoints,
    pathHasObstacleHit,
    pathHasStrictCrossing,
} from './smartEdgeRoutingRenderedGeometry';

const repairEarlySameSourceFanOut = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    isSameSourceFanOut: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !isSameSourceFanOut || !path || /[CQ]/i.test(path)) return path;
    const points = orthogonalizePointChain(parseRenderedPathPoints(path));
    if (points.length < 4) return path;

    const start = points[0];
    const first = points[1];
    const beforeEnd = points[points.length - 2];
    const end = points[points.length - 1];
    const firstVertical = Math.abs(start.x - first.x) < 1;
    const lastVertical = Math.abs(beforeEnd.x - end.x) < 1;
    const lastHorizontal = Math.abs(beforeEnd.y - end.y) < 1;
    if (!firstVertical || (!lastVertical && !lastHorizontal)) return path;

    const totalDy = end.y - start.y;
    const totalDx = end.x - start.x;
    if (Math.abs(totalDy) < 160 || Math.abs(totalDx) < 80) return path;

    const flowDir = Math.sign(totalDy);
    if (flowDir === 0) return path;
    const firstDir = Math.sign(first.y - start.y);
    const lastDir = lastVertical ? Math.sign(end.y - beforeEnd.y) : flowDir;
    if (firstDir !== flowDir || lastDir !== flowDir) return path;

    const bridge = points.find((point, index) => {
        if (index <= 0 || index >= points.length - 1) return false;
        const prev = points[index - 1];
        const next = points[index + 1];
        return Math.abs(prev.x - point.x) < 1
            && Math.abs(point.y - next.y) < 1
            && Math.abs(next.x - point.x) > 40;
    });
    if (!bridge) return path;

    const bridgeProgress = Math.abs(bridge.y - start.y) / Math.max(1, Math.abs(totalDy));
    if (bridgeProgress > 0.6) return path;

    const targetStub = lastVertical
        ? Math.min(72, Math.max(40, Math.abs(end.y - beforeEnd.y) >= 24 ? Math.abs(end.y - beforeEnd.y) * 0.35 : 40))
        : Math.min(96, Math.max(56, Math.abs(totalDy) * 0.18));
    const approachY = end.y - flowDir * targetStub;
    if (Math.abs(approachY - start.y) < 80) return path;

    const candidate = orthogonalizePointChain(lastVertical
        ? [
            start,
            { x: start.x, y: approachY },
            { x: end.x, y: approachY },
            end,
        ]
        : [
            start,
            { x: start.x, y: approachY },
            { x: beforeEnd.x, y: approachY },
            { ...beforeEnd },
            end,
        ]);
    const currentLength = manhattanLength(points);
    const candidateLength = manhattanLength(candidate);
    if (candidateLength > currentLength + 12) return path;
    if (!candidateDoesNotRegress(edgeId, points, candidate, obstacles)) return path;

    const repairedPath = createFilletedPath(candidate, radius);
    _setRenderedPathCacheValue(edgeId, repairedPath);
    return repairedPath;
};

const repairRedundantOuterLoop = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /[CQ]/i.test(path)) return path;
    const points = orthogonalizePointChain(parseRenderedPathPoints(path));
    if (points.length < 6) return path;

    const start = points[0];
    const first = points[1];
    const end = points[points.length - 1];
    const beforeEnd = points[points.length - 2];
    const firstHorizontal = Math.abs(start.y - first.y) < 1;
    const lastHorizontal = Math.abs(beforeEnd.y - end.y) < 1;
    if (!firstHorizontal || !lastHorizontal) return path;

    const overallDy = end.y - start.y;
    if (Math.abs(overallDy) < 240) return path;

    const laneX = beforeEnd.x;
    const candidate = orthogonalizePointChain([
        start,
        { x: laneX, y: start.y },
        { x: laneX, y: end.y },
        end,
    ]);
    const firstDir = Math.sign(first.x - start.x);
    const candidateFirstDir = Math.sign(candidate[1].x - start.x);
    const lastDir = Math.sign(end.x - beforeEnd.x);
    const candidateLastDir = Math.sign(end.x - candidate[candidate.length - 2].x);
    if (firstDir !== 0 && candidateFirstDir !== firstDir) {
        const firstSegmentWasBackingAway = Math.sign(end.x - start.x) !== firstDir;
        if (!firstSegmentWasBackingAway) return path;
    }
    if (lastDir !== 0 && candidateLastDir !== lastDir) return path;

    const currentLength = manhattanLength(points);
    const candidateLength = manhattanLength(candidate);
    if (candidateLength >= currentLength * 0.92) return path;
    if (!candidateDoesNotRegress(edgeId, points, candidate, obstacles)) return path;

    const repairedPath = createFilletedPath(candidate, radius);
    _setRenderedPathCacheValue(edgeId, repairedPath);
    return repairedPath;
};

const repairHardObstacleRenderedPath = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /[CQ]/i.test(path)) return path;
    const points = orthogonalizePointChain(parseRenderedPathPoints(path));
    const minClearance = RENDERED_BUSINESS_NODE_CLEARANCE;
    if (points.length < 2 || !pathHasObstacleHit(points, obstacles, minClearance)) return path;

    const repaired = repairHardObstacleViolations(new Map([[edgeId, points]]), {
        obstacles,
        spacing: 12,
        minClearance,
        maxIterationsPerEdge: 6,
    }).get(edgeId);
    if (!repaired || repaired.length < 2 || pathHasObstacleHit(repaired, obstacles, minClearance)) return path;

    const repairedPath = createFilletedPath(repaired, radius);
    _setRenderedPathCacheValue(edgeId, repairedPath);
    return repairedPath;
};

export const __smartEdgeRoutingTestUtils = {
    getLabelAutoOffset,
    repairEarlySameSourceFanOut,
    repairHardObstacleRenderedPath,
};

const repairNearlyAlignedMicroJog = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /C/i.test(path)) return path;
    const points = parseRenderedPathPoints(path);
    if (points.length < 3) return path;

    const start = points[0];
    const end = points[points.length - 1];
    const vertical = Math.abs(start.x - end.x) <= 1;
    const horizontal = Math.abs(start.y - end.y) <= 1;
    if (!vertical && !horizontal) return path;

    const directLength = Math.max(1, Math.abs(start.x - end.x) + Math.abs(start.y - end.y));
    const currentLength = manhattanLength(points);
    const lateralSpread = vertical
        ? Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
        : Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    if (lateralSpread > 16 || currentLength / directLength > 1.2) return path;

    const base = axisAlignedEndpointPath(start, end);
    if (pathHasObstacleHit(base, obstacles)) return path;

    const cache = _getRenderedPathCache();
    const paths = new Map<string, PathPoint[]>();
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const cachedPoints = parseRenderedPathPoints(cachedPath);
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });
    if (pathHasStrictCrossing(base, paths, edgeId)) return path;

    const directPath = createFilletedPath(base, radius);
    _setRenderedPathCacheValue(edgeId, directPath);
    return directPath;
};

const repairAlignedDetourIfDirectIsClean = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /[CQ]/i.test(path)) return path;
    const points = parseRenderedPathPoints(path);
    if (points.length < 4) return path;

    const start = points[0];
    const end = points[points.length - 1];
    const vertical = Math.abs(start.x - end.x) <= 1;
    const horizontal = Math.abs(start.y - end.y) <= 1;
    if (!vertical && !horizontal) return path;

    const directLength = Math.max(1, Math.abs(start.x - end.x) + Math.abs(start.y - end.y));
    const currentLength = manhattanLength(points);
    if (currentLength / directLength < 1.25) return path;

    const base = axisAlignedEndpointPath(start, end);
    if (pathHasObstacleHit(base, obstacles)) return path;

    const cache = _getRenderedPathCache();
    const paths = new Map<string, PathPoint[]>();
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const cachedPoints = parseRenderedPathPoints(cachedPath);
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });
    const baseCrossings = countStrictCrossings(base, paths, edgeId);
    const lateralSpread = vertical
        ? Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
        : Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    const isCompactAlignedChain = directLength <= 260
        && currentLength / directLength >= 2.2
        && lateralSpread >= 80
        && baseCrossings <= 1;
    if (baseCrossings > 0 && !isCompactAlignedChain) return path;

    const directPath = createFilletedPath(base, radius);
    _setRenderedPathCacheValue(edgeId, directPath);
    return directPath;
};

const repairAlignedLocalDoglegIfDirectIsClean = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /[CQ]/i.test(path)) return path;
    const points = orthogonalizePointChain(parseRenderedPathPoints(path));
    if (points.length < 4) return path;

    const risks = detectLocalDoglegRisks(points);
    if (!risks.some(risk => risk.rule === 'aligned-local-dogleg')) return path;

    const direct = buildAlignedDirectPath(points);
    if (!direct || pathHasObstacleHit(direct, obstacles)) return path;

    const cache = _getRenderedPathCache();
    const paths = new Map<string, PathPoint[]>();
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const cachedPoints = orthogonalizePointChain(parseRenderedPathPoints(cachedPath));
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });

    const currentCrossings = countStrictCrossings(points, paths, edgeId);
    const directCrossings = countStrictCrossings(direct, paths, edgeId);
    const currentLength = manhattanLength(points);
    const directLength = manhattanLength(direct);
    const vertical = Math.abs(points[0].x - points[points.length - 1].x) <= 1;
    const lateralSpread = vertical
        ? Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
        : Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    const isCompactAlignedChain = directLength <= 260
        && currentLength / Math.max(1, directLength) >= 1.8
        && currentLength - directLength >= 48
        && lateralSpread >= 24
        && directCrossings <= currentCrossings + 1;
    if (directCrossings > currentCrossings && !isCompactAlignedChain) return path;
    if (directLength >= currentLength - 12) return path;

    const directPath = createFilletedPath(direct, radius);
    _setRenderedPathCacheValue(edgeId, directPath);
    return directPath;
};

const repairLocalMicroDoglegs = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /C/i.test(path)) return path;
    const rawPoints = parseRenderedPathPoints(path);
    const points = orthogonalizePointChain(rawPoints);
    if (points.length < 4) return path;

    const cache = _getRenderedPathCache();
    const paths = new Map<string, PathPoint[]>();
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /C/i.test(cachedPath)) return;
        const cachedPoints = orthogonalizePointChain(parseRenderedPathPoints(cachedPath));
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });

    const currentLength = manhattanLength(points);
    const currentCrossings = countStrictCrossings(points, paths, edgeId);
    const currentBends = bendCount(points);
    let best: PathPoint[] | null = null;
    let bestLength = currentLength;
    let bestBends = currentBends;

    const tryCandidate = (candidate: PathPoint[]) => {
        const normalized = orthogonalizePointChain(candidate);
        const length = manhattanLength(normalized);
        const bends = bendCount(normalized);
        const isMeaningfullyShorter = length < bestLength - 6;
        const isBendSimpler = bends < bestBends && length <= bestLength + 8;
        if (!isMeaningfullyShorter && !isBendSimpler) return;
        if (pathHasObstacleHit(normalized, obstacles)) return;
        if (countStrictCrossings(normalized, paths, edgeId) > currentCrossings) return;
        best = normalized;
        bestLength = length;
        bestBends = bends;
    };

    for (let i = 0; i + 3 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        const c = points[i + 2];
        const d = points[i + 3];
        const firstVertical = Math.abs(a.x - b.x) < 1;
        const bridgeHorizontal = Math.abs(b.y - c.y) < 1;
        const secondVertical = Math.abs(c.x - d.x) < 1;
        if (firstVertical && bridgeHorizontal && secondVertical) {
            const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
            const lateral = Math.abs(b.x - c.x);
            if (sameDirection && lateral > 0.5 && lateral <= LOCAL_DOGLEG_MAX_DEPTH) {
                tryCandidate([
                    ...points.slice(0, i + 1),
                    { x: a.x, y: d.y },
                    ...points.slice(i + 4),
                ]);
            }
        }

        const firstHorizontal = Math.abs(a.y - b.y) < 1;
        const bridgeVertical = Math.abs(b.x - c.x) < 1;
        const secondHorizontal = Math.abs(c.y - d.y) < 1;
        if (firstHorizontal && bridgeVertical && secondHorizontal) {
            const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
            const lateral = Math.abs(b.y - c.y);
            if (sameDirection && lateral > 0.5 && lateral <= LOCAL_DOGLEG_MAX_DEPTH) {
                tryCandidate([
                    ...points.slice(0, i + 1),
                    { x: d.x, y: a.y },
                    ...points.slice(i + 4),
                ]);
            }
        }
    }

    for (let i = 0; i + 4 < rawPoints.length; i++) {
        const a = rawPoints[i];
        const b = rawPoints[i + 1];
        const c = rawPoints[i + 2];
        const d = rawPoints[i + 3];
        const e = rawPoints[i + 4];

        const verticalEntry = Math.abs(a.x - b.x) < 1;
        const verticalExit = Math.abs(d.x - e.x) < 1;
        const roundedStep =
            Math.abs(Math.abs(c.x - b.x) - Math.abs(c.y - b.y)) < 1 &&
            Math.abs(Math.abs(d.x - c.x) - Math.abs(d.y - c.y)) < 1 &&
            Math.abs(c.x - b.x) <= 10 &&
            Math.abs(d.x - c.x) <= 10;
        if (verticalEntry && verticalExit && roundedStep) {
            const sameDirection = Math.sign(b.y - a.y) === Math.sign(e.y - d.y);
            const lateral = Math.abs(e.x - a.x);
            if (sameDirection && lateral > 0.5 && lateral <= LOCAL_DOGLEG_MAX_DEPTH) {
                const side = Math.sign(e.x - a.x) || 1;
                const minY = Math.min(a.y, e.y);
                const maxY = Math.max(a.y, e.y);
                const minLaneX = Math.min(a.x, e.x) - 20;
                const maxLaneX = Math.max(a.x, e.x) + 20;
                const laneX = obstacles.reduce((x, obstacle) => {
                    const overlapsY = obstacle.y < maxY && obstacle.y + obstacle.height > minY;
                    const nearLane = obstacle.x <= maxLaneX && obstacle.x + obstacle.width >= minLaneX;
                    if (!overlapsY || !nearLane) return x;
                    return side > 0
                        ? Math.max(x, obstacle.x + obstacle.width + 12)
                        : Math.min(x, obstacle.x - 12);
                }, e.x);
                tryCandidate([
                    ...rawPoints.slice(0, i + 1),
                    { x: a.x, y: e.y },
                    ...rawPoints.slice(i + 5),
                ]);
                tryCandidate([
                    ...rawPoints.slice(0, i),
                    { x: laneX, y: a.y },
                    { x: laneX, y: e.y },
                    ...rawPoints.slice(i + 5),
                ]);
            }
        }

        const horizontalEntry = Math.abs(a.y - b.y) < 1;
        const horizontalExit = Math.abs(d.y - e.y) < 1;
        if (horizontalEntry && horizontalExit && roundedStep) {
            const sameDirection = Math.sign(b.x - a.x) === Math.sign(e.x - d.x);
            const lateral = Math.abs(e.y - a.y);
            if (sameDirection && lateral > 0.5 && lateral <= LOCAL_DOGLEG_MAX_DEPTH) {
                const side = Math.sign(e.y - a.y) || 1;
                const minX = Math.min(a.x, e.x);
                const maxX = Math.max(a.x, e.x);
                const minLaneY = Math.min(a.y, e.y) - 20;
                const maxLaneY = Math.max(a.y, e.y) + 20;
                const laneY = obstacles.reduce((y, obstacle) => {
                    const overlapsX = obstacle.x < maxX && obstacle.x + obstacle.width > minX;
                    const nearLane = obstacle.y <= maxLaneY && obstacle.y + obstacle.height >= minLaneY;
                    if (!overlapsX || !nearLane) return y;
                    return side > 0
                        ? Math.max(y, obstacle.y + obstacle.height + 12)
                        : Math.min(y, obstacle.y - 12);
                }, e.y);
                tryCandidate([
                    ...rawPoints.slice(0, i + 1),
                    { x: e.x, y: a.y },
                    ...rawPoints.slice(i + 5),
                ]);
                tryCandidate([
                    ...rawPoints.slice(0, i),
                    { x: a.x, y: laneY },
                    { x: e.x, y: laneY },
                    ...rawPoints.slice(i + 5),
                ]);
            }
        }
    }

    if (!best) return path;
    const repairedPath = createFilletedPath(best, radius);
    _setRenderedPathCacheValue(edgeId, repairedPath);
    return repairedPath;
};

const findMirroredAlignedDetour = (points: PathPoint[], spacing: number): PathPoint[] | null => {
    if (points.length < 4) return null;
    const start = points[0];
    const end = points[points.length - 1];
    const vertical = Math.abs(start.x - end.x) < 1;
    const horizontal = Math.abs(start.y - end.y) < 1;
    if (!vertical && !horizontal) return null;

    if (vertical) {
        const dir = Math.sign(end.y - start.y) || 1;
        const lateral = points
            .map(point => point.x - start.x)
            .filter(delta => Math.abs(delta) > 24)
            .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
        if (!Number.isFinite(lateral) || Math.abs(lateral) < 48) return null;
        const sideX = start.x - Math.sign(lateral) * Math.abs(lateral);
        const bendY = start.y + dir * spacing;
        if (Math.abs(bendY - end.y) < spacing * 2) return null;
        return orthogonalizePointChain([
            start,
            { x: start.x, y: bendY },
            { x: sideX, y: bendY },
            { x: sideX, y: end.y },
            end,
        ]);
    }

    const dir = Math.sign(end.x - start.x) || 1;
    const lateral = points
        .map(point => point.y - start.y)
        .filter(delta => Math.abs(delta) > 24)
        .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
    if (!Number.isFinite(lateral) || Math.abs(lateral) < 48) return null;
    const sideY = start.y - Math.sign(lateral) * Math.abs(lateral);
    const bendX = start.x + dir * spacing;
    if (Math.abs(bendX - end.x) < spacing * 2) return null;
    return orthogonalizePointChain([
        start,
        { x: bendX, y: start.y },
        { x: bendX, y: sideY },
        { x: end.x, y: sideY },
        end,
    ]);
};

const repairTwoPointRenderedCrossing = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /[CQ]/i.test(path)) return path;
    const currentPoints = parseRenderedPathPoints(path);
    if (!isTwoPointOrthogonalPath(currentPoints)) return path;

    const cache = _getRenderedPathCache();
    if (cache.size < 2) return path;

    const paths = new Map<string, PathPoint[]>();
    paths.set(edgeId, currentPoints);
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const points = parseRenderedPathPoints(cachedPath);
        if (points.length >= 2) paths.set(cachedEdgeId, points);
    });
    if (paths.size < 2) return path;

    const repaired = repairEdgeCrossingViolations(paths, {
        spacing: 12,
        maxIterations: 3,
        obstacles,
        mutableEdgeIds: new Set([edgeId]),
    }).get(edgeId);
    if (!repaired || repaired.length < 2) return path;
    const changed = repaired.length !== currentPoints.length
        || repaired.some((point, idx) => {
            const original = currentPoints[idx];
            return !original || Math.abs(point.x - original.x) > 0.5 || Math.abs(point.y - original.y) > 0.5;
        });
    if (!changed) return path;

    const compact = findCompactTwoPointDetour(edgeId, currentPoints, paths, obstacles, 12);
    const chosen = compact && manhattanLength(compact) < manhattanLength(repaired) * 0.8
        ? compact
        : repaired;
    const repairedPath = createFilletedPath(chosen, radius);
    _setRenderedPathCacheValue(edgeId, repairedPath);
    return repairedPath;
};

const repairExcessiveAlignedDetour = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /[CQ]/i.test(path)) return path;
    const points = parseRenderedPathPoints(path);
    if (points.length < 4) return path;

    const start = points[0];
    const end = points[points.length - 1];
    const vertical = Math.abs(start.x - end.x) < 1;
    const horizontal = Math.abs(start.y - end.y) < 1;
    const endpointsAligned = vertical || horizontal;
    if (!endpointsAligned) return path;

    const directLength = Math.max(1, Math.abs(start.x - end.x) + Math.abs(start.y - end.y));
    const currentLength = manhattanLength(points);
    if (currentLength / directLength < 2.4) return path;

    const cache = _getRenderedPathCache();

    const base = axisAlignedEndpointPath(start, end);
    const paths = new Map<string, PathPoint[]>();
    paths.set(edgeId, base);
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const cachedPoints = parseRenderedPathPoints(cachedPath);
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });

    const baseCrossings = countStrictCrossings(base, paths, edgeId);
    if (!pathHasObstacleHit(base, obstacles) && baseCrossings === 0) {
        const directPath = createFilletedPath(base, radius);
        _setRenderedPathCacheValue(edgeId, directPath);
        return directPath;
    }

    const lateralSpread = vertical
        ? Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
        : Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    const isCompactAlignedChain = directLength <= 260
        && currentLength / directLength >= 2.2
        && lateralSpread >= 80
        && baseCrossings <= 1;
    if (!pathHasObstacleHit(base, obstacles) && isCompactAlignedChain) {
        const directPath = createFilletedPath(base, radius);
        _setRenderedPathCacheValue(edgeId, directPath);
        return directPath;
    }

    const mirrored = findMirroredAlignedDetour(points, 12);
    if (
        mirrored
        && manhattanLength(mirrored) < currentLength * 0.85
        && !pathHasObstacleHit(mirrored, obstacles)
        && !pathHasStrictCrossing(mirrored, paths, edgeId)
    ) {
        const mirroredPath = createFilletedPath(mirrored, radius);
        _setRenderedPathCacheValue(edgeId, mirroredPath);
        return mirroredPath;
    }

    if (paths.size < 2) return path;

    const compact = findCompactTwoPointDetour(edgeId, base, paths, obstacles, 12);
    if (!compact || manhattanLength(compact) >= currentLength * 0.8) return path;

    const compactPath = createFilletedPath(compact, radius);
    _setRenderedPathCacheValue(edgeId, compactPath);
    return compactPath;
};

export {
    repairAlignedDetourIfDirectIsClean,
    repairAlignedLocalDoglegIfDirectIsClean,
    repairEarlySameSourceFanOut,
    repairExcessiveAlignedDetour,
    repairHardObstacleRenderedPath,
    repairLocalMicroDoglegs,
    repairNearlyAlignedMicroJog,
    repairRedundantOuterLoop,
    repairTwoPointRenderedCrossing,
};
