// packages/core/src/components/custom-edges/hooks/useSmartEdgeRouting.ts
import { useMemo, useRef, useState, useEffect } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { Position, getSmoothStepPath } from '@xyflow/react';
import { useStore } from '@xyflow/react';
import { useSmartEdgeContext } from '../useSmartEdgeContext';
import { useSmartPathWorker } from './useSmartPathWorker';
import { useSharedObstacles, useObstaclesForEdge } from '../ObstacleContext';
import { useLayoutStability } from '../../../context/LayoutStabilityContext';
import { useChannelRouting } from './useChannelRouting';
import { useLineJumps } from './useLineJumps';
import { createFilletedPath, getSmartLabelPosition, getClosestDistanceToPath } from '../../../algorithms/smartEdgeUtils';
import { repairEdgeCrossingViolations } from '../../../algorithms/edgeCrossingRepair';
import {
    buildAlignedDirectPath,
    detectLocalDoglegRisks,
} from '../../../algorithms/localDoglegQuality';
import {
    repairContainerHeaderSkimPath,
    repairDirectionalSourceExitPath,
    repairEndpointPortConstraintPath,
    repairTangentialEndpointEntryPath,
    detectContainerHeaderSkimRisk,
    type RoutingNodeRect,
} from '../../../algorithms/containerHeaderSkimRepair';

const RENDERED_PATH_CACHE_VERSION = 'domain-dagre-computed-path-v2';

const _getRenderedPathCache = () => {
    if (typeof window === 'undefined') return new Map<string, string>();
    const w = window as any;
    if (
        w.__dv_rendered_path_cache_version__ !== RENDERED_PATH_CACHE_VERSION
        || !(w.__dv_rendered_path_cache__ instanceof Map)
    ) {
        w.__dv_rendered_path_cache__ = new Map<string, string>();
        w.__dv_rendered_path_cache_version__ = RENDERED_PATH_CACHE_VERSION;
    }
    return w.__dv_rendered_path_cache__ as Map<string, string>;
};

const _setRenderedPathCacheValue = (edgeId: string, path: string): void => {
    const cache = _getRenderedPathCache();
    if (cache.get(edgeId) === path) return;
    cache.set(edgeId, path);
};

const LOCAL_DOGLEG_MAX_DEPTH = 40;

const snapSimpleOrthogonalPath = (path: string): string => {
    if (!path || /[ACQSTZ]/i.test(path)) return path;
    const matches = [...path.matchAll(/[ML]\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi)];
    if (matches.length < 2) return path;

    const commands = matches.map(match => ({
        cmd: match[0].trim()[0].toUpperCase(),
        x: Number(match[1]),
        y: Number(match[2]),
    }));
    if (!commands.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return path;

    const microAxisSnap = 1;
    for (let i = 0; i < commands.length - 1; i++) {
        const a = commands[i];
        const b = commands[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx <= microAxisSnap && dy > microAxisSnap) {
            b.x = a.x;
        } else if (dy <= microAxisSnap && dx > microAxisSnap) {
            b.y = a.y;
        }
    }

    return commands.map(point => `${point.cmd} ${point.x} ${point.y}`).join(' ');
};

type PathPoint = { x: number; y: number };

const getNodeAbsPosition = (nodeLike: any, nodeMap: Map<string, any>, visited?: Set<string>): PathPoint => {
    const abs = nodeLike?.internals?.positionAbsolute || nodeLike?.computed?.positionAbsolute || nodeLike?.positionAbsolute;
    if (abs) return { x: abs.x ?? 0, y: abs.y ?? 0 };
    const base = nodeLike?.position || { x: nodeLike?.x ?? 0, y: nodeLike?.y ?? 0 };
    const parentId = nodeLike?.parentId || nodeLike?.parentNode;
    if (!parentId) return { x: base.x ?? 0, y: base.y ?? 0 };
    const v = visited || new Set<string>();
    const id = String(nodeLike?.id ?? '');
    if (id && v.has(id)) return { x: base.x ?? 0, y: base.y ?? 0 };
    if (id) v.add(id);
    const parent = nodeMap.get(String(parentId));
    if (!parent) return { x: base.x ?? 0, y: base.y ?? 0 };
    const parentAbs = getNodeAbsPosition(parent, nodeMap, v);
    return { x: parentAbs.x + (base.x ?? 0), y: parentAbs.y + (base.y ?? 0) };
};

const collectRoutingNodeRects = (nodeMap: Map<string, any>): RoutingNodeRect[] => {
    const rects: RoutingNodeRect[] = [];
    nodeMap.forEach((node: any) => {
        if (!node?.id) return;
        const pos = getNodeAbsPosition(node, nodeMap);
        const width = Number(node.width ?? node.measured?.width ?? node.style?.width ?? 0);
        const height = Number(node.height ?? node.measured?.height ?? node.style?.height ?? 0);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        rects.push({
            id: String(node.id),
            type: String(node.type ?? ''),
            x: pos.x,
            y: pos.y,
            width,
            height,
        });
    });
    return rects;
};

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

const distanceToOrthogonalSegment = (point: PathPoint, a: PathPoint, b: PathPoint): number => {
    if (Math.abs(a.x - b.x) < 1) {
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const clampedY = Math.max(minY, Math.min(maxY, point.y));
        return Math.hypot(point.x - a.x, point.y - clampedY);
    }
    if (Math.abs(a.y - b.y) < 1) {
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const clampedX = Math.max(minX, Math.min(maxX, point.x));
        return Math.hypot(point.x - clampedX, point.y - a.y);
    }
    return Number.POSITIVE_INFINITY;
};

const estimateLabelRect = (center: PathPoint, labelText: string): { x: number; y: number; width: number; height: number } => {
    const text = String(labelText).replace(/<[^>]+>/g, '').trim();
    const width = Math.max(42, Math.min(220, text.length * 8 + 22));
    const height = 26;
    return {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
    };
};

const distanceFromOrthogonalSegmentToRect = (
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
        const dx = x < left ? left - x : x > right ? x - right : 0;
        const dy = maxY < top ? top - maxY : minY > bottom ? minY - bottom : 0;
        return Math.hypot(dx, dy);
    }

    if (Math.abs(a.y - b.y) < 1) {
        const y = a.y;
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const dx = maxX < left ? left - maxX : minX > right ? minX - right : 0;
        const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
        return Math.hypot(dx, dy);
    }

    return Number.POSITIVE_INFINITY;
};

const labelPathClearance = (center: PathPoint, labelText: string, points: PathPoint[]): number => {
    const rect = estimateLabelRect(center, labelText);
    let clearance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!isOrthogonalSegment(a, b) || manhattanLength([a, b]) < 10) continue;
        clearance = Math.min(clearance, distanceFromOrthogonalSegmentToRect(a, b, rect));
    }
    return Number.isFinite(clearance) ? clearance : 0;
};

const getLabelAutoOffset = (path: string, labelPoint: PathPoint, labelText: string): PathPoint => {
    if (!path || !labelText || /C/i.test(path)) return { x: 0, y: 0 };
    const points = parseRenderedPathPoints(path);
    if (points.length < 2) return { x: 0, y: 0 };

    let best: { a: PathPoint; b: PathPoint; distance: number } | null = null;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!isOrthogonalSegment(a, b) || manhattanLength([a, b]) < 16) continue;
        const distance = distanceToOrthogonalSegment(labelPoint, a, b);
        if (!best || distance < best.distance) best = { a, b, distance };
    }
    if (!best) return { x: 0, y: 0 };

    const currentClearance = labelPathClearance(labelPoint, labelText, points);
    const desiredClearance = 8;
    if (best.distance > 12 && currentClearance >= desiredClearance) return { x: 0, y: 0 };

    const estimated = estimateLabelRect(labelPoint, labelText);
    const verticalSegment = Math.abs(best.a.x - best.b.x) < 1;
    const horizontalSegment = Math.abs(best.a.y - best.b.y) < 1;
    const perpendicularOffset = verticalSegment
        ? Math.max(16, estimated.width / 2 + desiredClearance)
        : Math.max(16, estimated.height / 2 + desiredClearance);
    const alongOffset = Math.max(14, Math.min(32, String(labelText).length * 1.5 + 8));
    const candidates: PathPoint[] = [{ x: 0, y: 0 }];

    if (verticalSegment) {
        const preferredSide = labelPoint.x >= best.a.x ? 1 : -1;
        candidates.push(
            { x: preferredSide * perpendicularOffset, y: 0 },
            { x: -preferredSide * perpendicularOffset, y: 0 },
            { x: preferredSide * perpendicularOffset, y: alongOffset },
            { x: preferredSide * perpendicularOffset, y: -alongOffset },
            { x: -preferredSide * perpendicularOffset, y: alongOffset },
            { x: -preferredSide * perpendicularOffset, y: -alongOffset },
        );
    } else if (horizontalSegment) {
        const preferredSide = labelPoint.y >= best.a.y ? 1 : -1;
        candidates.push(
            { x: 0, y: preferredSide * perpendicularOffset },
            { x: 0, y: -preferredSide * perpendicularOffset },
            { x: alongOffset, y: preferredSide * perpendicularOffset },
            { x: -alongOffset, y: preferredSide * perpendicularOffset },
            { x: alongOffset, y: -preferredSide * perpendicularOffset },
            { x: -alongOffset, y: -preferredSide * perpendicularOffset },
        );
    }

    let bestCandidate = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
        const candidateCenter = { x: labelPoint.x + candidate.x, y: labelPoint.y + candidate.y };
        const clearance = labelPathClearance(candidateCenter, labelText, points);
        const displacement = Math.hypot(candidate.x, candidate.y);
        const score = Math.min(clearance, desiredClearance * 2) - displacement * 0.03;
        if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    }

    return bestCandidate;
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

const pathHasObstacleHit = (
    points: PathPoint[],
    obstacles: Array<{ x: number; y: number; width: number; height: number }>,
): boolean => {
    for (let i = 0; i < points.length - 1; i++) {
        for (const obstacle of obstacles) {
            if (segmentHitsRect(points[i], points[i + 1], obstacle)) return true;
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

export const __smartEdgeRoutingTestUtils = {
    repairEarlySameSourceFanOut,
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

export interface UseSmartEdgeRoutingReturn {
  safeFinalPath: string;
  finalLabelX: number;
  finalLabelY: number;
  crossfadeOpacity: number;
  opacity: number;
  isLoading: boolean;
  nodesDragging: boolean;
  shouldRenderDebugVisuals: boolean;
  shouldRenderPortHeatmap: boolean;
  isStale: boolean;
  workerSmartPoints: { x: number; y: number }[] | null;
  obstacles: any[];
  isBusEdge: boolean;
  centeredCoords: any;
  workerSmartLabelPos: any;
}

export function useSmartEdgeRouting(props: EdgeProps): UseSmartEdgeRoutingReturn {
  const { id, source, target } = props;
  const context = useSmartEdgeContext(props);
  const { simpleNodeMap, storeEdges, layoutDirection, multiEdgeInfo, centeredCoords, fallbackPositions, edgeConfig, respectSourceHandle, respectTargetHandle, isReverseEdge, nodesDragging, sourceHandleId, targetHandleId } = context;

  useSharedObstacles();
  const obstacles = useObstaclesForEdge(source, target);
  const zoomLevel = useStore((s: any) => s.transform[2]);
  const isLayoutStable = useLayoutStability();

  const edgeData = props.data as Record<string, any> | undefined;
  const safeFallbackPositions = useMemo(() => ({
      sourcePos: fallbackPositions?.sourcePos || Position.Right,
      targetPos: fallbackPositions?.targetPos || Position.Left,
  }), [fallbackPositions?.sourcePos, fallbackPositions?.targetPos]);

  const safeObstacles = (Array.isArray(obstacles) ? obstacles : []) as any[];
  const safeSimpleNodeMap = simpleNodeMap as any;
  const routingNodeRects = useMemo(
      () => collectRoutingNodeRects(safeSimpleNodeMap),
      [safeSimpleNodeMap]
  );
  const hasSameSourceFanOut = useMemo(() => {
      return (storeEdges as any[]).some(edge => edge?.id !== id && edge?.source === source);
  }, [storeEdges, id, source]);

  // 1. Worker Calculation
  const { path: workerPath, smartLabelPos: workerSmartLabelPos, smartPoints: workerSmartPoints, isLoading, workerUsedPositions } = useSmartPathWorker({
      id, source, target, centeredCoords,
      fallbackPositions: safeFallbackPositions,
      obstacles: safeObstacles,
      simpleNodeMap: safeSimpleNodeMap,
      storeEdges,
      edgeConfig,
      layoutDirection,
      zoomLevel,
      respectSourceHandle,
      respectTargetHandle,
      isReverseEdge,
      nodesDragging,
      sourceHandleId, targetHandleId,
      edgeData: edgeData as any,
      multiEdgeInfo,
      isLayoutStable
  });

  // 2. Fallbacks
  const renderPositions = useMemo(() => {
      const sourcePos = fallbackPositions.sourcePos || props.sourcePosition || Position.Right;
      const targetPos = fallbackPositions.targetPos || props.targetPosition || Position.Left;
      return { sourcePos, targetPos };
  }, [fallbackPositions.sourcePos, fallbackPositions.targetPos, props.sourcePosition, props.targetPosition]);

  const visualCornerRadius = (() => {
      const raw = Number(edgeConfig.renderCornerRadius ?? edgeConfig.visualCornerRadius ?? edgeConfig.borderRadius ?? 8);
      if (!Number.isFinite(raw)) return 8;
      return Math.max(0, Math.min(24, raw));
  })();
  const structuralCornerRadius = edgeConfig.strictOrthogonal ? 0 : visualCornerRadius;

  const [_fallbackPath, _fallbackLabelX, _fallbackLabelY] = useMemo(() => {
      return getSmoothStepPath({
          sourceX: props.sourceX,
          sourceY: props.sourceY,
          sourcePosition: renderPositions.sourcePos,
          targetX: props.targetX,
          targetY: props.targetY,
          targetPosition: renderPositions.targetPos,
          borderRadius: structuralCornerRadius,
      });
  }, [props.sourceX, props.sourceY, props.targetX, props.targetY, renderPositions.sourcePos, renderPositions.targetPos, structuralCornerRadius]);

  const hasLoadedOnceRef = useRef(false);
  const hasCacheOnMount = useRef(_getRenderedPathCache().has(id));
  const [initialRevealReady, setInitialRevealReady] = useState(hasCacheOnMount.current);
  useEffect(() => {
      if (hasCacheOnMount.current || nodesDragging) {
          setInitialRevealReady(true);
          return;
      }
      setInitialRevealReady(false);
      const timer = setTimeout(() => setInitialRevealReady(true), 1800);
      return () => clearTimeout(timer);
  }, [id, nodesDragging]);
  const isSharedTrunkEdge = !!(
      (multiEdgeInfo as any)?.isOneToMany ||
      (multiEdgeInfo as any)?.isManyToOne ||
      edgeData?.isTreeBus
  );
  const isBusEdge = !!(
      isSharedTrunkEdge ||
      edgeData?.treeRouting
  );
  const isLayoutPathLocked = !!(
      edgeData?.layoutPathLocked ||
      (edgeData as any)?._layoutPathLocked
  );
  const renderCornerRadius = structuralCornerRadius;

  // 3. Channel Routing
  // [UPGRADE] Channel routing is now handled at the Coordinator level (applyGlobalNudge),
  // which writes results back to path data. Running it again here would cause double-shifting.
  const channelPoints = useChannelRouting({
      edgeId: id,
      points: workerSmartPoints,
      enabled: false,  // Disabled: Coordinator-level globalChannelRouting handles this
  });

  // 4. Stale Detection
  const isStale = useMemo(() => {
      if (!workerSmartPoints || workerSmartPoints.length < 2 || !workerPath) return false;
      if (!isLoading && !nodesDragging) return false;

      if ((workerUsedPositions as any)?.sourceCenter && (centeredCoords as any)?.sourceCenter) {
          const sxDiff = Math.abs((workerUsedPositions as any).sourceCenter.x - (centeredCoords as any).sourceCenter.x);
          const syDiff = Math.abs((workerUsedPositions as any).sourceCenter.y - (centeredCoords as any).sourceCenter.y);
          const txDiff = Math.abs((workerUsedPositions as any).targetCenter.x - (centeredCoords as any).targetCenter.x);
          const tyDiff = Math.abs((workerUsedPositions as any).targetCenter.y - (centeredCoords as any).targetCenter.y);
          return sxDiff > 100 || syDiff > 100 || txDiff > 100 || tyDiff > 100;
      }

      const firstPt = workerSmartPoints[0];
      const lastPt = workerSmartPoints[workerSmartPoints.length - 1];
      if (respectSourceHandle || respectTargetHandle) {
          const endpointTolerance = 45;
          const sourceStale = respectSourceHandle
              && (Math.abs(firstPt.x - centeredCoords.sourceX) > endpointTolerance || Math.abs(firstPt.y - centeredCoords.sourceY) > endpointTolerance);
          const targetStale = respectTargetHandle
              && (Math.abs(lastPt.x - centeredCoords.targetX) > endpointTolerance || Math.abs(lastPt.y - centeredCoords.targetY) > endpointTolerance);
          if (sourceStale || targetStale) return true;
      }
      return Math.abs(firstPt.x - props.sourceX) > 150 || 
             Math.abs(firstPt.y - props.sourceY) > 150 || 
             Math.abs(lastPt.x - props.targetX) > 150 || 
             Math.abs(lastPt.y - props.targetY) > 150;
  }, [workerSmartPoints, workerPath, props.sourceX, props.sourceY, props.targetX, props.targetY, isLoading, nodesDragging, workerUsedPositions, centeredCoords, respectSourceHandle, respectTargetHandle]);
  if (!isLoading && !isStale) {
      hasLoadedOnceRef.current = true;
  }

  const canUseFreshWorkerPath = !nodesDragging && !isLoading && !isStale;

  // 5. Final Path Resolution
  const finalPath = useMemo(() => {
      const cache = _getRenderedPathCache();
      const cachedPath = cache.get(id);

      if (!nodesDragging && cachedPath && (isLoading || isStale)) {
          return cachedPath;
      }

      if (canUseFreshWorkerPath && channelPoints && channelPoints.length > 1) {
          const p = createFilletedPath(channelPoints, renderCornerRadius);
          _setRenderedPathCacheValue(id, p);
          return p;
      }

      if (canUseFreshWorkerPath && edgeConfig.strictOrthogonal && workerSmartPoints && workerSmartPoints.length > 1) {
          const p = createFilletedPath(workerSmartPoints, 0);
          _setRenderedPathCacheValue(id, p);
          return p;
      }

      const useFallback = nodesDragging || isStale || (isLoading && !cachedPath);
      const result = useFallback ? _fallbackPath : (workerPath || cachedPath || _fallbackPath);
      
      if (result && result !== _fallbackPath) {
          _setRenderedPathCacheValue(id, result);
      }
      return result;
  }, [nodesDragging, channelPoints, renderCornerRadius, workerPath, _fallbackPath, isLoading, id, isStale, workerSmartPoints, props.sourceX, props.sourceY, props.targetX, props.targetY, edgeConfig.strictOrthogonal, canUseFreshWorkerPath]);

  // 6. Line Jumps
  // [FIX-FILLET] Pass cornerRadius so jumpPath retains rounded corners.
  // Prefer channelPoints (post-channel-adjusted) over raw workerSmartPoints
  // to ensure jump detection uses the same points as finalPath.
  const jumpInputPoints = (canUseFreshWorkerPath && channelPoints && channelPoints.length > 1)
      ? channelPoints 
      : (canUseFreshWorkerPath ? workerSmartPoints : null);
  const { jumpPath } = useLineJumps({
      edgeId: id,
      sourceId: source,
      targetId: target,
      points: jumpInputPoints,
      enabled: canUseFreshWorkerPath,
      // Preserve bus/tree trunk geometry exactly. Jump arcs visually bend the
      // shared trunk, which is worse than an ordinary crossing under the routing
      // goals (orthogonal > obstacle avoidance > shared trunk > fewer crossings).
      renderJumps: !isBusEdge && !edgeConfig.strictOrthogonal,
      cornerRadius: renderCornerRadius,
  });

  const busGeometryPath = useMemo(() => {
      if (!isBusEdge || !jumpInputPoints || jumpInputPoints.length < 2) return null;
      return createFilletedPath(jumpInputPoints, renderCornerRadius);
  }, [isBusEdge, jumpInputPoints, renderCornerRadius]);
  const canApplyRenderedSoftRepair = !isLayoutPathLocked
      && canUseFreshWorkerPath
      && !edgeData?.isTreeBus
      && !edgeData?.treeRouting;
  const canApplyLocalDoglegRepair = canUseFreshWorkerPath;
  const canApplySameSourceFanOutRepair = canUseFreshWorkerPath;

  const snappedFinalPath = snapSimpleOrthogonalPath(
      jumpPath || busGeometryPath || finalPath || `M ${props.sourceX} ${props.sourceY} L ${props.targetX} ${props.targetY}`
  );
  const snappedFinalPointsForQuality = orthogonalizePointChain(parseRenderedPathPoints(snappedFinalPath));
  const lockedPathNeedsContainerRepair = isLayoutPathLocked
      && snappedFinalPointsForQuality.length >= 2
      && (
          pathHasObstacleHit(snappedFinalPointsForQuality, safeObstacles)
          || !pathEndpointsTouchCurrentNodes(snappedFinalPointsForQuality, source, target, routingNodeRects)
          || detectContainerHeaderSkimRisk(snappedFinalPointsForQuality, {
              sourceId: source,
              targetId: target,
              nodes: routingNodeRects,
          })
      );
  const canApplyContainerHeaderSkimRepair = !nodesDragging
      && !isLoading
      && routingNodeRects.length > 0
      && (!isLayoutPathLocked || lockedPathNeedsContainerRepair);
  const microJogRepairedPath = repairNearlyAlignedMicroJog(
      id,
      snappedFinalPath,
      renderCornerRadius,
      canApplyRenderedSoftRepair,
      safeObstacles
  );
  const alignedDetourRepairedPath = repairAlignedDetourIfDirectIsClean(
      id,
      microJogRepairedPath,
      renderCornerRadius,
      canApplyRenderedSoftRepair,
      safeObstacles
  );
  const alignedLocalDoglegRepairedPath = repairAlignedLocalDoglegIfDirectIsClean(
      id,
      alignedDetourRepairedPath,
      renderCornerRadius,
      canApplyLocalDoglegRepair,
      safeObstacles
  );
  const localDoglegRepairedPath = repairLocalMicroDoglegs(
      id,
      alignedLocalDoglegRepairedPath,
      renderCornerRadius,
      canApplyLocalDoglegRepair,
      safeObstacles
  );
  const hairpinRepairedPath = repairEndpointHairpin(
      id,
      localDoglegRepairedPath,
      renderCornerRadius,
      canApplyRenderedSoftRepair,
      safeObstacles
  );
  const sameSourceFanOutRepairedPath = repairEarlySameSourceFanOut(
      id,
      hairpinRepairedPath,
      renderCornerRadius,
      canApplySameSourceFanOutRepair,
      hasSameSourceFanOut,
      safeObstacles
  );
  const outerLoopRepairedPath = repairRedundantOuterLoop(
      id,
      sameSourceFanOutRepairedPath,
      renderCornerRadius,
      canApplyRenderedSoftRepair,
      safeObstacles
  );
  const compactedFinalPath = repairExcessiveAlignedDetour(
      id,
      outerLoopRepairedPath,
      renderCornerRadius,
      canApplyRenderedSoftRepair,
      safeObstacles
  );
  const crossingInputPath = edgeConfig.strictOrthogonal && /[ACQST]/i.test(compactedFinalPath)
      ? (createFilletedPath(parseRenderedPathPoints(compactedFinalPath), 0) || compactedFinalPath)
      : compactedFinalPath;
  let structuralSafePath = repairTwoPointRenderedCrossing(
      id,
      crossingInputPath,
      renderCornerRadius,
      canApplyRenderedSoftRepair,
      safeObstacles
  );
  if (edgeConfig.strictOrthogonal && /[ACQST]/i.test(structuralSafePath)) {
      structuralSafePath = createFilletedPath(parseRenderedPathPoints(structuralSafePath), 0) || structuralSafePath;
  }
  if (canApplyContainerHeaderSkimRepair) {
      const headerSkimInputPath = /[ACQST]/i.test(structuralSafePath)
          ? (createFilletedPath(parseRenderedPathPoints(structuralSafePath), 0) || structuralSafePath)
          : structuralSafePath;
      const structuralPoints = orthogonalizePointChain(parseRenderedPathPoints(headerSkimInputPath));
      const endpointsTouchCurrentNodes = pathEndpointsTouchCurrentNodes(structuralPoints, source, target, routingNodeRects);
      if (!endpointsTouchCurrentNodes) {
          // Loading/stale paths can briefly contain old coordinates. Do not repair or cache them.
      } else {
      const otherPaths = new Map<string, PathPoint[]>();
      _getRenderedPathCache().forEach((cachedPath, cachedEdgeId) => {
          if (cachedEdgeId === id || !cachedPath) return;
          const cachedPoints = orthogonalizePointChain(parseRenderedPathPoints(cachedPath));
          if (cachedPoints.length >= 2) otherPaths.set(cachedEdgeId, cachedPoints);
      });
      const endpointPortRepaired = repairEndpointPortConstraintPath(structuralPoints, {
          edgeId: id,
          sourceId: source,
          targetId: target,
          nodes: routingNodeRects,
          obstacles: safeObstacles,
          otherPaths,
      });
      const sourceExitRepaired = repairDirectionalSourceExitPath(endpointPortRepaired ?? structuralPoints, {
          edgeId: id,
          sourceId: source,
          targetId: target,
          nodes: routingNodeRects,
          obstacles: safeObstacles,
          otherPaths,
      });
      const endpointEntryRepaired = repairTangentialEndpointEntryPath(sourceExitRepaired ?? endpointPortRepaired ?? structuralPoints, {
          edgeId: id,
          sourceId: source,
          targetId: target,
          nodes: routingNodeRects,
          obstacles: safeObstacles,
          otherPaths,
      });
      const headerSkimRepaired = repairContainerHeaderSkimPath(endpointEntryRepaired ?? sourceExitRepaired ?? endpointPortRepaired ?? structuralPoints, {
          edgeId: id,
          sourceId: source,
          targetId: target,
          nodes: routingNodeRects,
          obstacles: safeObstacles,
          otherPaths,
      });
      const repairedCandidate = headerSkimRepaired ?? endpointEntryRepaired ?? sourceExitRepaired ?? endpointPortRepaired;
      const finalEndpointPortRepaired = repairedCandidate
          ? repairEndpointPortConstraintPath(repairedCandidate, {
              edgeId: id,
              sourceId: source,
              targetId: target,
              nodes: routingNodeRects,
              obstacles: safeObstacles,
              otherPaths,
          })
          : null;
      const containerEntryRepaired = [
          finalEndpointPortRepaired,
          headerSkimRepaired,
          endpointEntryRepaired,
          sourceExitRepaired,
          endpointPortRepaired,
      ].find((candidate): candidate is PathPoint[] => {
          return !!candidate && pathEndpointsTouchCurrentNodes(candidate, source, target, routingNodeRects);
      }) ?? null;
      if (containerEntryRepaired) {
          structuralSafePath = createFilletedPath(containerEntryRepaired, edgeConfig.strictOrthogonal ? 0 : visualCornerRadius) || structuralSafePath;
          if (canUseFreshWorkerPath || !isLoading) {
              _setRenderedPathCacheValue(id, structuralSafePath);
          }
      }
      }
  }
  const finalAlignedDoglegPath = repairAlignedLocalDoglegIfDirectIsClean(
      id,
      structuralSafePath,
      renderCornerRadius,
      canApplyLocalDoglegRepair,
      safeObstacles
  );
  const finalLocalDoglegPath = repairLocalMicroDoglegs(
      id,
      finalAlignedDoglegPath,
      renderCornerRadius,
      canApplyLocalDoglegRepair,
      safeObstacles
  );
  if (finalLocalDoglegPath !== structuralSafePath && (canUseFreshWorkerPath || !isLoading)) {
      _setRenderedPathCacheValue(id, finalLocalDoglegPath);
  }
  const safeFinalPath = edgeConfig.strictOrthogonal && visualCornerRadius > 0
      ? (createFilletedPath(parseRenderedPathPoints(finalLocalDoglegPath), visualCornerRadius) || finalLocalDoglegPath)
      : finalLocalDoglegPath;
  const hasVisibleCandidate = (hasLoadedOnceRef.current || hasCacheOnMount.current) && initialRevealReady;
  const hasCachedVisiblePath = !!_getRenderedPathCache().get(id);
  const canKeepPreviousPathVisible = hasVisibleCandidate && hasCachedVisiblePath && (isLoading || isStale);
  const opacity = (nodesDragging || (hasVisibleCandidate && isLayoutStable && (canUseFreshWorkerPath || canKeepPreviousPathVisible))) ? 1 : 0;

  // 7. Crossfade Opacity
  const prevPathRef = useRef<string>(safeFinalPath);
  const [crossfadeOpacity, setCrossfadeOpacity] = useState(1);
  useEffect(() => {
      if (nodesDragging || !hasLoadedOnceRef.current) {
          prevPathRef.current = safeFinalPath;
          return;
      }
      if (prevPathRef.current !== safeFinalPath && prevPathRef.current.length > 10) {
          setCrossfadeOpacity(0.3);
          const timer = setTimeout(() => setCrossfadeOpacity(1), 50);
          prevPathRef.current = safeFinalPath;
          return () => clearTimeout(timer);
      }
      prevPathRef.current = safeFinalPath;
  }, [safeFinalPath, nodesDragging]);

  // 8. Final Label Position
  const finalLabelPos = (() => {
      if (nodesDragging || isLoading || isStale) {
          return { x: _fallbackLabelX, y: _fallbackLabelY };
      }

      let computedFromPoints: { x: number; y: number } | null = null;
      const candidatePoints = workerSmartPoints;
      if (candidatePoints && candidatePoints.length > 1) {
          computedFromPoints = getSmartLabelPosition(candidatePoints);
      }

      const getWorkerDerivedLabelPos = () => {
          const d = workerPath;
          if (!d || typeof d !== 'string') return null;

          const points: { x: number, y: number }[] = [];
          try {
              const commands = d.replace(/([a-zA-Z])/g, '|$1').split('|').filter(c => c.trim());
              for (const cmdStr of commands) {
                  const parts = cmdStr.trim().split(/[\s,]+/).filter(p => p !== '');
                  if (parts.length === 0) continue;
                  const type = parts[0].toUpperCase();
                  const nums = parts.slice(1).map(Number);
                  const pushPoint = (x: number, y: number) => {
                      if (!isNaN(x) && !isNaN(y)) points.push({ x, y });
                  };
                  if (type === 'M' && nums.length >= 2) pushPoint(nums[0], nums[1]);
                  else if (type === 'L' && nums.length >= 2) pushPoint(nums[0], nums[1]);
                  else if (type === 'Q' && nums.length >= 4) pushPoint(nums[2], nums[3]);
                  else if (type === 'C' && nums.length >= 6) pushPoint(nums[4], nums[5]);
              }
          } catch { return null; }

          if (points.length < 2) return null;
          return getSmartLabelPosition(points);
      };

      const workerDerivedPos = getWorkerDerivedLabelPos();

      const predictBusLabelPos = () => {
          if (!multiEdgeInfo) return null;
          const points = workerSmartPoints;
          if (!points || points.length < 2) return null;

          const info = multiEdgeInfo as any;
          let idx = info.incomingIndex ?? info.outgoingIndex ?? info.index ?? 0;
          let cnt = info.incomingCount ?? info.outgoingCount ?? info.count ?? 1;

          if (info.isManyToOne && typeof info.incomingCount === 'number') {
              idx = info.incomingIndex;
              cnt = info.incomingCount;
          } else if (info.isOneToMany && typeof info.outgoingCount === 'number') {
              idx = info.outgoingIndex;
              cnt = info.outgoingCount;
          }
          if (cnt <= 1) return null;

          const spacing = 25; 
          const spread = (idx - (cnt - 1) / 2) * spacing;
          const isVerticalLayout = ['TB', 'BT'].includes(layoutDirection || 'TB');

          const shiftedPoints = points.map((p: {x: number, y: number}) => ({
              x: isVerticalLayout ? p.x + spread : p.x,
              y: isVerticalLayout ? p.y : p.y + spread
          }));

          return getSmartLabelPosition(shiftedPoints) || null;
      };

      const predictedPos = predictBusLabelPos();
      const baseFromRouting = workerDerivedPos || predictedPos || computedFromPoints || workerSmartLabelPos || { x: _fallbackLabelX, y: _fallbackLabelY };

      const posFromData = edgeData?.labelPosition;
      let base = baseFromRouting;

      const isUsingWorker = !!(workerDerivedPos || computedFromPoints || workerSmartLabelPos);
      const isUsingPrediction = !workerDerivedPos && !!predictedPos;
      const hasWorkerPoints = !!workerSmartPoints;
      const canRunSanityCheck = (!isUsingWorker && !isUsingPrediction) || hasWorkerPoints;

      if (posFromData && typeof posFromData.x === 'number' && isFinite(posFromData.x) && typeof posFromData.y === 'number' && isFinite(posFromData.y)) {
          let isValid = true;
          if (canRunSanityCheck && candidatePoints && candidatePoints.length > 1) {
            // [FIX N-4] 阈值从 2px 放宽到 80px。
            // 2px 过于严苛：路径点 Math.round 精度误差、Nudge 偏移等都会超过 2px，
            // 导致用户手动调整的标签每次路由更新后跳回默认位置。
            // 80px 可过滤真正游离的位置，同时允许标签合理偏离路径中心。
            const dist = getClosestDistanceToPath({ x: posFromData.x, y: posFromData.y }, candidatePoints);
            if (dist > 80) isValid = false;
          } else if (isUsingWorker && !hasWorkerPoints) {
              isValid = false;
          }
          if (isValid) base = { x: posFromData.x, y: posFromData.y };
      }

      const offset = edgeData?.labelOffset;
      const ox = offset && typeof offset.x === 'number' && isFinite(offset.x) ? offset.x : 0;
      const oy = offset && typeof offset.y === 'number' && isFinite(offset.y) ? offset.y : 0;

      let x = base.x + ox;
      let y = base.y + oy;
      const hasManualLabelPosition = !!posFromData
          || !!offset
          || typeof edgeData?.absoluteLabelX === 'number'
          || typeof edgeData?.absoluteLabelY === 'number';
      const labelText = String(edgeData?.label ?? props.label ?? '');
      if (!hasManualLabelPosition && labelText) {
          const autoOffset = getLabelAutoOffset(safeFinalPath, { x, y }, labelText);
          x += autoOffset.x;
          y += autoOffset.y;
      }

      if (typeof edgeData?.absoluteLabelX === 'number' && isFinite(edgeData.absoluteLabelX)) {
          let validAbs = true;
          if (!isUsingPrediction && candidatePoints && candidatePoints.length > 1) {
              const checkY = (typeof edgeData?.absoluteLabelY === 'number' && isFinite(edgeData.absoluteLabelY))
                  ? edgeData.absoluteLabelY : y;
              const dist = getClosestDistanceToPath({ x: edgeData.absoluteLabelX, y: checkY }, candidatePoints);
              if (dist > 80) validAbs = false; // [FIX N-4]
          }
          if (validAbs || !candidatePoints) x = edgeData.absoluteLabelX;
      }

      if (typeof edgeData?.absoluteLabelY === 'number' && isFinite(edgeData.absoluteLabelY)) {
          let validAbs = true;
          if (!isUsingPrediction && candidatePoints && candidatePoints.length > 1) {
              const checkX = (typeof edgeData?.absoluteLabelX === 'number' && isFinite(edgeData.absoluteLabelX))
                  ? edgeData.absoluteLabelX : x;
              const dist = getClosestDistanceToPath({ x: checkX, y: edgeData.absoluteLabelY }, candidatePoints);
              if (dist > 80) validAbs = false;  // [FIX N-4] 同上：80px
          }
          if (validAbs || !candidatePoints) y = edgeData.absoluteLabelY;
      }

      return { x, y };
  })();

  const isGlobalDebugMode = typeof window !== 'undefined' && window.localStorage?.getItem('__diagram_debug_mode__') === 'true';
  const shouldRenderDebugVisuals = edgeConfig.debug && isGlobalDebugMode;
  const shouldRenderPortHeatmap = edgeConfig.debugPortHeatmap && isGlobalDebugMode;

  return {
    safeFinalPath,
    finalLabelX: finalLabelPos.x,
    finalLabelY: finalLabelPos.y,
    crossfadeOpacity,
    opacity,
    isLoading,
    nodesDragging: !!nodesDragging,
    shouldRenderDebugVisuals,
    shouldRenderPortHeatmap,
    isStale,
    workerSmartPoints,
    obstacles,
    isBusEdge,
    centeredCoords,
    workerSmartLabelPos
  };
}
