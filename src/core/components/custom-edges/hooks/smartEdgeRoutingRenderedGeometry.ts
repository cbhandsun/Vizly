import { createFilletedPath } from '../../../algorithms/smartEdgeUtils';
import {
    recommendedEndpointEntryStub,
    type RoutingNodeRect,
} from '../../../algorithms/containerHeaderSkimRepair';
import {
    getRenderedPathCache as _getRenderedPathCache,
    setRenderedPathCacheValue as _setRenderedPathCacheValue,
} from '../../../routing/renderedPathCache';
import type { PathPoint } from './smartEdgeRoutingGeometry';
import { getEdgeLabelAutoOffset, type EdgeLabelRect } from '../edgeLabelAvoidance';

const RENDERED_BUSINESS_NODE_CLEARANCE = 18;
const RENDERED_CONTAINER_TYPES = new Set(['group', 'subGroup', 'titleGroup', 'domain', 'subDomain', 'swimlane']);

const LOCAL_DOGLEG_MAX_DEPTH = 40;

const getRenderedBusinessObstacles = (
    nodes: RoutingNodeRect[],
    sourceId: string,
    targetId: string,
): RoutingNodeRect[] => nodes.filter(node =>
    node.id !== sourceId
    && node.id !== targetId
    && !RENDERED_CONTAINER_TYPES.has(String(node.type ?? ''))
);

const pointTouchesRectBoundary = (
    point: PathPoint | undefined,
    rect: { x: number; y: number; width: number; height: number } | undefined,
): boolean => {
    if (!point || !rect) return false;
    const inVerticalBand = point.y >= rect.y - 3 && point.y <= rect.y + rect.height + 3;
    const inHorizontalBand = point.x >= rect.x - 3 && point.x <= rect.x + rect.width + 3;
    const touchesVerticalSide = inVerticalBand
        && (Math.abs(point.x - rect.x) <= 3 || Math.abs(point.x - (rect.x + rect.width)) <= 3);
    const touchesHorizontalSide = inHorizontalBand
        && (Math.abs(point.y - rect.y) <= 3 || Math.abs(point.y - (rect.y + rect.height)) <= 3);
    return touchesVerticalSide || touchesHorizontalSide;
};

const pathEndpointsTouchCurrentNodes = (
    points: PathPoint[],
    sourceId: string,
    targetId: string,
    nodes: RoutingNodeRect[],
): boolean => {
    if (points.length < 2) return false;
    const sourceNode = nodes.find(node => node.id === sourceId);
    const targetNode = nodes.find(node => node.id === targetId);
    return pointTouchesRectBoundary(points[0], sourceNode)
        && pointTouchesRectBoundary(points[points.length - 1], targetNode);
};

const getEndpointSide = (
    point: PathPoint | undefined,
    rect: { x: number; y: number; width: number; height: number } | undefined,
): 'top' | 'right' | 'bottom' | 'left' | null => {
    if (!point || !rect) return null;
    const candidates: Array<{ side: 'top' | 'right' | 'bottom' | 'left'; distance: number }> = [
        { side: 'top', distance: Math.abs(point.y - rect.y) },
        { side: 'right', distance: Math.abs(point.x - (rect.x + rect.width)) },
        { side: 'bottom', distance: Math.abs(point.y - (rect.y + rect.height)) },
        { side: 'left', distance: Math.abs(point.x - rect.x) },
    ];
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= 3 ? candidates[0].side : null;
};

const pathHasShortEndpointStub = (
    points: PathPoint[],
    sourceId: string,
    targetId: string,
    nodes: RoutingNodeRect[],
): boolean => {
    if (points.length < 2) return false;
    const endpoints = [
        { node: nodes.find(item => item.id === sourceId), point: points[0], adjacent: points[1], role: 'source' as const },
        { node: nodes.find(item => item.id === targetId), point: points[points.length - 1], adjacent: points[points.length - 2], role: 'target' as const },
    ];

    return endpoints.some(({ node, point, adjacent, role }) => {
        const side = getEndpointSide(point, node);
        if (!node || !side || !adjacent) return false;
        const minStub = recommendedEndpointEntryStub(node);
        const segmentLength = Math.abs(point.x - adjacent.x) + Math.abs(point.y - adjacent.y);
        const axisAligned = side === 'top' || side === 'bottom'
            ? Math.abs(point.x - adjacent.x) < 1
            : Math.abs(point.y - adjacent.y) < 1;
        if (!axisAligned) return true;

        const outward = side === 'top'
            ? adjacent.y < point.y
            : side === 'bottom'
                ? adjacent.y > point.y
                : side === 'left'
                    ? adjacent.x < point.x
                    : adjacent.x > point.x;
        if (!outward) return true;
        return segmentLength < minStub && role === 'target';
    });
};

const parseRenderedPathPoints = (path: string): PathPoint[] => {
    const tokens = [...path.matchAll(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map(match => match[0]);
    const points: PathPoint[] = [];
    let index = 0;
    let command = '';
    let current: PathPoint = { x: 0, y: 0 };
    const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
    const nextNumber = () => Number(tokens[index++]);
    const push = (x: number, y: number, relative: boolean) => {
        current = { x: relative ? current.x + x : x, y: relative ? current.y + y : y };
        points.push({ ...current });
    };

    while (index < tokens.length) {
        if (isCommand(tokens[index])) command = tokens[index++];
        if (!command) break;
        const upper = command.toUpperCase();
        const relative = command !== upper;
        if (upper === 'M' || upper === 'L') {
            while (index + 1 < tokens.length && !isCommand(tokens[index])) {
                push(nextNumber(), nextNumber(), relative);
            }
            if (upper === 'M') command = relative ? 'l' : 'L';
        } else if (upper === 'H') {
            while (index < tokens.length && !isCommand(tokens[index])) {
                const x = nextNumber();
                push(relative ? x : x, relative ? 0 : current.y, relative);
            }
        } else if (upper === 'V') {
            while (index < tokens.length && !isCommand(tokens[index])) {
                const y = nextNumber();
                push(relative ? 0 : current.x, relative ? y : y, relative);
            }
        } else if (upper === 'A') {
            while (index + 6 < tokens.length && !isCommand(tokens[index])) {
                nextNumber(); nextNumber(); nextNumber(); nextNumber(); nextNumber();
                push(nextNumber(), nextNumber(), relative);
            }
        } else if (upper === 'C') {
            while (index + 5 < tokens.length && !isCommand(tokens[index])) {
                nextNumber(); nextNumber(); nextNumber(); nextNumber();
                push(nextNumber(), nextNumber(), relative);
            }
        } else if (upper === 'Q') {
            while (index + 3 < tokens.length && !isCommand(tokens[index])) {
                nextNumber(); nextNumber();
                push(nextNumber(), nextNumber(), relative);
            }
        } else {
            while (index < tokens.length && !isCommand(tokens[index])) index++;
        }
    }

    return points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
};

const isTwoPointOrthogonalPath = (points: PathPoint[]): boolean => {
    if (points.length !== 2) return false;
    const [a, b] = points;
    return Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1;
};

const axisAlignedEndpointPath = (start: PathPoint, end: PathPoint): PathPoint[] => {
    if (Math.abs(start.x - end.x) <= 1) {
        return [{ ...start }, { x: start.x, y: end.y }];
    }
    if (Math.abs(start.y - end.y) <= 1) {
        return [{ ...start }, { x: end.x, y: start.y }];
    }
    return [{ ...start }, { ...end }];
};

const manhattanLength = (points: PathPoint[]): number => {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        length += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    }
    return length;
};

const bendCount = (points: PathPoint[]): number => {
    let bends = 0;
    let previousAxis: 'h' | 'v' | null = null;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const axis = Math.abs(a.x - b.x) <= 1
            ? 'v'
            : Math.abs(a.y - b.y) <= 1
                ? 'h'
                : null;
        if (!axis) continue;
        if (previousAxis && previousAxis !== axis) bends++;
        previousAxis = axis;
    }
    return bends;
};

const isOrthogonalSegment = (a: PathPoint, b: PathPoint): boolean =>
    Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1;

const segmentStrictlyCrosses = (a: PathPoint, b: PathPoint, c: PathPoint, d: PathPoint): boolean => {
    const aH = Math.abs(a.y - b.y) < 1;
    const aV = Math.abs(a.x - b.x) < 1;
    const cH = Math.abs(c.y - d.y) < 1;
    const cV = Math.abs(c.x - d.x) < 1;
    if ((!aH && !aV) || (!cH && !cV) || aH === cH) return false;
    const hA = aH ? a : c;
    const hB = aH ? b : d;
    const vA = aV ? a : c;
    const vB = aV ? b : d;
    const x = vA.x;
    const y = hA.y;
    return x > Math.min(hA.x, hB.x) + 2
        && x < Math.max(hA.x, hB.x) - 2
        && y > Math.min(vA.y, vB.y) + 2
        && y < Math.max(vA.y, vB.y) - 2;
};

const getLabelAutoOffset = (
    path: string,
    labelPoint: PathPoint,
    labelText: string,
    peerPaths: PathPoint[][] = [],
    obstacles: EdgeLabelRect[] = [],
): PathPoint => {
    if (!path || !labelText || /C/i.test(path)) return { x: 0, y: 0 };
    const points = parseRenderedPathPoints(path);
    if (points.length < 2) return { x: 0, y: 0 };
    return getEdgeLabelAutoOffset(points, labelPoint, labelText, peerPaths, obstacles);
};

const segmentHitsRect = (
    a: PathPoint,
    b: PathPoint,
    rect: { x: number; y: number; width: number; height: number },
    padding = 2,
): boolean => {
    const left = rect.x + padding;
    const right = rect.x + rect.width - padding;
    const top = rect.y + padding;
    const bottom = rect.y + rect.height - padding;
    if (right <= left || bottom <= top) return false;
    if (Math.abs(a.x - b.x) < 1) {
        const x = a.x;
        if (x <= left || x >= right) return false;
        return Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
    }
    if (Math.abs(a.y - b.y) < 1) {
        const y = a.y;
        if (y <= top || y >= bottom) return false;
        return Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
    }
    return false;
};

const segmentDistanceToRect = (
    a: PathPoint,
    b: PathPoint,
    rect: { x: number; y: number; width: number; height: number },
): number => {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;

    if (Math.abs(a.x - b.x) < 1) {
        const x = a.x;
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const overlapsY = Math.max(minY, top) <= Math.min(maxY, bottom);
        if (overlapsY && x >= left && x <= right) return 0;
        if (overlapsY) return Math.min(Math.abs(x - left), Math.abs(x - right));
        const dx = x < left ? left - x : x > right ? x - right : 0;
        const dy = maxY < top ? top - maxY : minY > bottom ? minY - bottom : 0;
        return Math.hypot(dx, dy);
    }

    if (Math.abs(a.y - b.y) < 1) {
        const y = a.y;
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const overlapsX = Math.max(minX, left) <= Math.min(maxX, right);
        if (overlapsX && y >= top && y <= bottom) return 0;
        if (overlapsX) return Math.min(Math.abs(y - top), Math.abs(y - bottom));
        const dx = maxX < left ? left - maxX : minX > right ? minX - right : 0;
        const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
        return Math.hypot(dx, dy);
    }

    return Infinity;
};

const pathHasObstacleHit = (
    points: PathPoint[],
    obstacles: Array<{ x: number; y: number; width: number; height: number }>,
    minClearance = 0,
): boolean => {
    for (let i = 0; i < points.length - 1; i++) {
        for (const obstacle of obstacles) {
            if (segmentHitsRect(points[i], points[i + 1], obstacle)) return true;
            if (minClearance > 0 && segmentDistanceToRect(points[i], points[i + 1], obstacle) < minClearance) return true;
        }
    }
    return false;
};

const pathHasStrictCrossing = (
    candidate: PathPoint[],
    otherPaths: Map<string, PathPoint[]>,
    edgeId: string,
): boolean => {
    return countStrictCrossings(candidate, otherPaths, edgeId) > 0;
};

const countStrictCrossings = (
    candidate: PathPoint[],
    otherPaths: Map<string, PathPoint[]>,
    edgeId: string,
): number => {
    let count = 0;
    for (let i = 0; i < candidate.length - 1; i++) {
        const a = candidate[i];
        const b = candidate[i + 1];
        if (!isOrthogonalSegment(a, b)) return count + 1;
        for (const [otherId, points] of otherPaths) {
            if (otherId === edgeId) continue;
            for (let j = 0; j < points.length - 1; j++) {
                if (segmentStrictlyCrosses(a, b, points[j], points[j + 1])) count++;
            }
        }
    }
    return count;
};

const findCompactTwoPointDetour = (
    edgeId: string,
    points: PathPoint[],
    otherPaths: Map<string, PathPoint[]>,
    obstacles: Array<{ x: number; y: number; width: number; height: number }>,
    spacing: number,
): PathPoint[] | null => {
    if (!isTwoPointOrthogonalPath(points)) return null;
    const [start, end] = points;
    const vertical = Math.abs(start.x - end.x) < 1;
    const candidates: PathPoint[][] = [];

    const addCandidate = (candidate: PathPoint[]) => {
        if (candidate.length < 4) return;
        if (candidate.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return;
        if (pathHasObstacleHit(candidate, obstacles)) return;
        if (pathHasStrictCrossing(candidate, otherPaths, edgeId)) return;
        candidates.push(RoutingLikeSimplify(candidate));
    };

    for (const [otherId, other] of otherPaths) {
        if (otherId === edgeId) continue;
        for (let i = 0; i < other.length - 1; i++) {
            const a = other[i];
            const b = other[i + 1];
            if (vertical && Math.abs(a.y - b.y) < 1) {
                const crossY = a.y;
                if (crossY <= Math.min(start.y, end.y) + 2 || crossY >= Math.max(start.y, end.y) - 2) continue;
                const dir = Math.sign(end.y - start.y) || 1;
                const minX = Math.min(a.x, b.x);
                const maxX = Math.max(a.x, b.x);
                const allMinX = Math.min(...other.map(point => point.x));
                const allMaxX = Math.max(...other.map(point => point.x));
                const beforeYs = [...new Set([
                    crossY - dir * spacing,
                    ...other.flatMap(point => [Math.round(point.y - spacing), Math.round(point.y + spacing)]),
                ])].sort((y1, y2) => Math.abs(y1 - start.y) - Math.abs(y2 - start.y));
                const localXs = [minX - spacing, maxX + spacing, allMinX - spacing, allMaxX + spacing, start.x - spacing * 8, start.x + spacing * 8];
                const sideXs = localXs
                    .sort((x1, x2) => Math.abs(x1 - start.x) - Math.abs(x2 - start.x))
                    .slice(0, 8);
                beforeYs.slice(0, 10).forEach(beforeY => {
                    if (Math.abs(beforeY - start.y) < 2 || Math.abs(beforeY - end.y) < 2) return;
                    sideXs.forEach(sideX => addCandidate([
                        { ...start },
                        { x: start.x, y: beforeY },
                        { x: sideX, y: beforeY },
                        { x: sideX, y: end.y },
                        { ...end },
                    ]));
                });
            } else if (!vertical && Math.abs(a.x - b.x) < 1) {
                const crossX = a.x;
                if (crossX <= Math.min(start.x, end.x) + 2 || crossX >= Math.max(start.x, end.x) - 2) continue;
                const dir = Math.sign(end.x - start.x) || 1;
                const minY = Math.min(a.y, b.y);
                const maxY = Math.max(a.y, b.y);
                const allMinY = Math.min(...other.map(point => point.y));
                const allMaxY = Math.max(...other.map(point => point.y));
                const beforeXs = [...new Set([
                    crossX - dir * spacing,
                    ...other.flatMap(point => [Math.round(point.x - spacing), Math.round(point.x + spacing)]),
                ])].sort((x1, x2) => Math.abs(x1 - start.x) - Math.abs(x2 - start.x));
                const localYs = [minY - spacing, maxY + spacing, allMinY - spacing, allMaxY + spacing, start.y - spacing * 8, start.y + spacing * 8];
                const sideYs = localYs
                    .sort((y1, y2) => Math.abs(y1 - start.y) - Math.abs(y2 - start.y))
                    .slice(0, 8);
                beforeXs.slice(0, 10).forEach(beforeX => {
                    if (Math.abs(beforeX - start.x) < 2 || Math.abs(beforeX - end.x) < 2) return;
                    sideYs.forEach(sideY => addCandidate([
                        { ...start },
                        { x: beforeX, y: start.y },
                        { x: beforeX, y: sideY },
                        { x: end.x, y: sideY },
                        { ...end },
                    ]));
                });
            }
        }
    }

    candidates.sort((a, b) => manhattanLength(a) - manhattanLength(b));
    return candidates[0] ?? null;
};

const RoutingLikeSimplify = (points: PathPoint[]): PathPoint[] => {
    const deduped: PathPoint[] = [];
    for (const point of points) {
        const prev = deduped[deduped.length - 1];
        if (!prev || Math.abs(prev.x - point.x) > 0.5 || Math.abs(prev.y - point.y) > 0.5) {
            deduped.push({ x: point.x, y: point.y });
        }
    }
    if (deduped.length <= 2) return deduped;
    const result: PathPoint[] = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
        const prev = result[result.length - 1];
        const cur = deduped[i];
        const next = deduped[i + 1];
        if ((Math.abs(prev.x - cur.x) < 0.5 && Math.abs(cur.x - next.x) < 0.5)
            || (Math.abs(prev.y - cur.y) < 0.5 && Math.abs(cur.y - next.y) < 0.5)) {
            continue;
        }
        result.push(cur);
    }
    result.push(deduped[deduped.length - 1]);
    return result;
};

const orthogonalizePointChain = (points: PathPoint[]): PathPoint[] => {
    const simplified = RoutingLikeSimplify(points);
    if (simplified.length <= 1) return simplified;

    const result: PathPoint[] = [simplified[0]];
    for (let i = 1; i < simplified.length; i++) {
        const prev = result[result.length - 1];
        const next = simplified[i];
        if (isOrthogonalSegment(prev, next)) {
            result.push(next);
            continue;
        }

        const following = simplified[i + 1];
        const bridge = following && Math.abs(following.x - next.x) < 1
            ? { x: next.x, y: prev.y }
            : { x: prev.x, y: next.y };
        if (manhattanLength([prev, bridge]) > 0.5) result.push(bridge);
        result.push(next);
    }

    return RoutingLikeSimplify(result);
};

const findSourceHairpinDetour = (points: PathPoint[]): PathPoint[] | null => {
    if (points.length < 8) return null;
    const start = points[0];
    const exit = points[1];
    const firstHorizontal = Math.abs(start.y - exit.y) < 1;
    const firstVertical = Math.abs(start.x - exit.x) < 1;
    if ((!firstHorizontal && !firstVertical) || manhattanLength([start, exit]) < 24) return null;

    const exitDirection = firstHorizontal
        ? Math.sign(exit.x - start.x)
        : Math.sign(exit.y - start.y);
    if (exitDirection === 0) return null;

    const searchLimit = Math.min(points.length - 2, 9);
    for (let i = 2; i <= searchLimit; i++) {
        const a = points[i];
        const b = points[i + 1];
        const isLongContinuation = firstHorizontal
            ? Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 120
            : Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 120;
        if (!isLongContinuation) continue;

        const laneDirection = firstHorizontal
            ? Math.sign(a.x - start.x)
            : Math.sign(a.y - start.y);
        if (laneDirection === 0 || laneDirection === exitDirection) continue;

        const prefix = points.slice(0, i + 1);
        const prefixXSpread = Math.max(...prefix.map(point => point.x)) - Math.min(...prefix.map(point => point.x));
        const prefixYSpread = Math.max(...prefix.map(point => point.y)) - Math.min(...prefix.map(point => point.y));
        const localSpread = firstHorizontal ? prefixYSpread : prefixXSpread;
        if (localSpread > 96) continue;

        const afterLimit = Math.min(points.length - 2, i + 5);
        for (let j = i + 1; j <= afterLimit; j++) {
            const c = points[j];
            const d = points[j + 1];
            const exitsLongLane = firstHorizontal
                ? Math.abs(c.y - d.y) < 1 && Math.abs(c.x - d.x) > 40
                : Math.abs(c.x - d.x) < 1 && Math.abs(c.y - d.y) > 40;
            if (!exitsLongLane) continue;

            const join = d;
            const candidate = firstHorizontal
                ? [
                    start,
                    exit,
                    { x: exit.x, y: join.y },
                    join,
                    ...points.slice(j + 2),
                ]
                : [
                    start,
                    exit,
                    { x: join.x, y: exit.y },
                    join,
                    ...points.slice(j + 2),
                ];
            return orthogonalizePointChain(candidate);
        }
    }

    return null;
};

const repairEndpointHairpin = (
    edgeId: string,
    path: string,
    radius: number,
    enabled: boolean,
    obstacles: Array<{ x: number; y: number; width: number; height: number }> = [],
): string => {
    if (!enabled || !path || /C/i.test(path)) return path;
    const points = parseRenderedPathPoints(path);
    if (points.length < 8) return path;

    const candidate = findSourceHairpinDetour(points);
    if (!candidate || candidate.length < 4) return path;

    const currentLength = manhattanLength(points);
    const candidateLength = manhattanLength(candidate);
    if (candidateLength >= currentLength * 0.96) return path;
    if (pathHasObstacleHit(candidate, obstacles)) return path;

    const cache = _getRenderedPathCache();
    const paths = new Map<string, PathPoint[]>();
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const cachedPoints = parseRenderedPathPoints(cachedPath);
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });
    if (pathHasStrictCrossing(candidate, paths, edgeId)) return path;

    const repairedPath = createFilletedPath(candidate, radius);
    _setRenderedPathCacheValue(edgeId, repairedPath);
    return repairedPath;
};

const getCachedOrthogonalPathMap = (edgeId: string): Map<string, PathPoint[]> => {
    const cache = _getRenderedPathCache();
    const paths = new Map<string, PathPoint[]>();
    cache.forEach((cachedPath, cachedEdgeId) => {
        if (cachedEdgeId === edgeId || !cachedPath || /[CQ]/i.test(cachedPath)) return;
        const cachedPoints = parseRenderedPathPoints(cachedPath);
        if (cachedPoints.length >= 2) paths.set(cachedEdgeId, cachedPoints);
    });
    return paths;
};

const candidateDoesNotRegress = (
    edgeId: string,
    current: PathPoint[],
    candidate: PathPoint[],
    obstacles: Array<{ x: number; y: number; width: number; height: number }>,
): boolean => {
    if (candidate.length < 2 || pathHasObstacleHit(candidate, obstacles)) return false;
    const paths = getCachedOrthogonalPathMap(edgeId);
    const currentCrossings = countStrictCrossings(current, paths, edgeId);
    const candidateCrossings = countStrictCrossings(candidate, paths, edgeId);
    return candidateCrossings <= currentCrossings;
};

export {
    LOCAL_DOGLEG_MAX_DEPTH,
    RENDERED_BUSINESS_NODE_CLEARANCE,
    axisAlignedEndpointPath,
    bendCount,
    candidateDoesNotRegress,
    countStrictCrossings,
    findCompactTwoPointDetour,
    getLabelAutoOffset,
    getRenderedBusinessObstacles,
    isTwoPointOrthogonalPath,
    manhattanLength,
    orthogonalizePointChain,
    parseRenderedPathPoints,
    pathEndpointsTouchCurrentNodes,
    pathHasObstacleHit,
    pathHasShortEndpointStub,
    pathHasStrictCrossing,
    repairEndpointHairpin,
};
