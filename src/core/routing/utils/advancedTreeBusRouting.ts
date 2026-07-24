import { postProcessTreeBusRouting } from './advancedTreeBusPostProcessing';

type UnknownRecord = Record<string, unknown>;
type Point = { x: number; y: number };

interface TreeBusNode {
    id: string;
    position: Point;
    positionAbsolute?: Point;
    width: number;
    height: number;
}

interface TreeRoutingInfo {
    type: 'tree-in' | 'tree-out';
    points: Point[];
    trunkId: string;
    effectiveSourceHandle?: string | null;
    effectiveTargetHandle?: string | null;
}

export interface TreeBusRoutingOptions {
    enabled?: boolean;
    minBusSize?: number;
    trunkLength?: number;
    branchSpacing?: number;
    layoutDirection?: string;
}

const asRecord = (value: unknown): UnknownRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as UnknownRecord
        : {};

const finiteNumber = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const boundedNumber = (
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
): number => Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));

const pointFrom = (value: unknown): Point | undefined => {
    const record = asRecord(value);
    if (
        typeof record.x !== 'number'
        || typeof record.y !== 'number'
        || !Number.isFinite(record.x)
        || !Number.isFinite(record.y)
    ) return undefined;
    return { x: record.x, y: record.y };
};

const parseNode = (value: unknown): TreeBusNode | undefined => {
    const node = asRecord(value);
    if (typeof node.id !== 'string' || !node.id || node.id.length > 10_000) return undefined;

    const measured = asRecord(node.measured);
    return {
        id: node.id,
        position: pointFrom(node.position) ?? { x: 0, y: 0 },
        positionAbsolute: pointFrom(node.positionAbsolute),
        width: boundedNumber(measured.width, 100, 0, 1_000_000),
        height: boundedNumber(measured.height, 50, 0, 1_000_000),
    };
};

const normalizeLayoutDirection = (value: unknown): 'TB' | 'BT' | 'LR' | 'RL' => {
    if (typeof value !== 'string') return 'TB';
    const direction = value.toUpperCase();
    if (direction.includes('BT')) return 'BT';
    if (direction.includes('LR')) return 'LR';
    if (direction.includes('RL')) return 'RL';
    return 'TB';
};

export function optimizeTreeBusRouting<T extends {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    data?: unknown
}>(
    edges: T[],
    nodes: unknown,
    options: TreeBusRoutingOptions = {}
): T[] {
    const safeOptions = asRecord(options);
    const enabled = typeof safeOptions.enabled === 'boolean' ? safeOptions.enabled : true;
    const minBusSize = Math.trunc(boundedNumber(safeOptions.minBusSize, 2, 2, 1_000));
    const trunkLength = boundedNumber(safeOptions.trunkLength, 40, 0, 10_000);
    const layoutDir = normalizeLayoutDirection(safeOptions.layoutDirection);
    if (!enabled || edges.length === 0) return edges;

    const parsedNodes = Array.isArray(nodes)
        ? nodes.map(parseNode).filter((node): node is TreeBusNode => node !== undefined)
        : [];
    const idMap = new Map(parsedNodes.map(node => [node.id, node] as const));

    const getAnchorLocal = (nodeId: string, handle: string | null | undefined): { x: number; y: number } | null => {
        const node = idMap.get(nodeId);
        if (!node) return null;
        const pos = node.positionAbsolute ?? node.position;
        const w = node.width;
        const h = node.height;
        if (!handle) return { x: pos.x + w / 2, y: pos.y + h / 2 };
        switch (handle) {
            case 'l': case 'left': return { x: pos.x, y: pos.y + h / 2 };
            case 'r': case 'right': return { x: pos.x + w, y: pos.y + h / 2 };
            case 't': case 'top': return { x: pos.x + w / 2, y: pos.y };
            case 'b': case 'bottom': return { x: pos.x + w / 2, y: pos.y + h };
            default: return { x: pos.x + w / 2, y: pos.y + h / 2 };
        }
    };

    const outGroups = new Map<string, T[]>();
    const inGroups = new Map<string, T[]>();

    edges.forEach(edge => {
        if (!outGroups.has(edge.source)) outGroups.set(edge.source, []);
        outGroups.get(edge.source)?.push(edge);
        if (!inGroups.has(edge.target)) inGroups.set(edge.target, []);
        inGroups.get(edge.target)?.push(edge);
    });

    const treeRoutingMap = new Map<string, TreeRoutingInfo>();

    // 1-to-N
    outGroups.forEach((groupEdges, sourceId) => {
        if (groupEdges.length < minBusSize) return;
        const sourceNode = idMap.get(sourceId);
        if (!sourceNode) return;

        const sourceCenter = getAnchorLocal(sourceId, null);
        if (!sourceCenter) return;

        // Calculate average offset to determine dominant flow direction dynamically
        let sumX = 0;
        let sumY = 0;
        let validOffsetsCount = 0;
        const targetOffsets = groupEdges.map(edge => {
            const targetCenter = getAnchorLocal(edge.target, null);
            if (!targetCenter) return null;
            sumX += targetCenter.x - sourceCenter.x;
            sumY += targetCenter.y - sourceCenter.y;
            validOffsetsCount++;
            return {
                edge,
                deltaX: targetCenter.x - sourceCenter.x,
                deltaY: targetCenter.y - sourceCenter.y
            };
        }).filter((offset): offset is { edge: T; deltaX: number; deltaY: number } => offset !== null);

        if (targetOffsets.length < minBusSize) return;

        const avgX = validOffsetsCount > 0 ? sumX / validOffsetsCount : 0;
        const avgY = validOffsetsCount > 0 ? sumY / validOffsetsCount : 0;

        // Default fallback to configured layout direction if average offset is tiny/ambiguous
        let dynamicDir: 'TB' | 'BT' | 'LR' | 'RL' = 'TB';
        if (layoutDir.includes('BT')) dynamicDir = 'BT';
        else if (layoutDir.includes('LR')) dynamicDir = 'LR';
        else if (layoutDir.includes('RL')) dynamicDir = 'RL';

        if (Math.abs(avgX) >= 10 || Math.abs(avgY) >= 10) {
            if (Math.abs(avgY) >= Math.abs(avgX)) {
                dynamicDir = avgY >= 0 ? 'TB' : 'BT';
            } else {
                dynamicDir = avgX >= 0 ? 'LR' : 'RL';
            }
        }

        const isGroupHorizontal = dynamicDir === 'LR' || dynamicDir === 'RL';

        const alignedEdges: typeof groupEdges = [];
        targetOffsets.forEach(o => {
            let isAligned = false;
            if (dynamicDir === 'TB') isAligned = o.deltaY > -5;
            else if (dynamicDir === 'BT') isAligned = o.deltaY < 5;
            else if (dynamicDir === 'LR') isAligned = o.deltaX > -5;
            else if (dynamicDir === 'RL') isAligned = o.deltaX < 5;

            if (isAligned) alignedEdges.push(o.edge);
        });

        if (alignedEdges.length < minBusSize) return;

        // Treat all aligned edges as a single tree bus trunk group instead of partitioning by subdomain domainKey
        const domainEdges = alignedEdges;
        const domainKey = 'all';

        const firstEdge = domainEdges[0];
        let effectiveSourceHandle = firstEdge.sourceHandle;
        if (!effectiveSourceHandle) {
            if (dynamicDir === 'TB') effectiveSourceHandle = 'b';
            else if (dynamicDir === 'BT') effectiveSourceHandle = 't';
            else if (dynamicDir === 'LR') effectiveSourceHandle = 'r';
            else if (dynamicDir === 'RL') effectiveSourceHandle = 'l';
            else effectiveSourceHandle = 'b';
        } else {
            if (dynamicDir === 'TB' || dynamicDir === 'BT') {
                if (effectiveSourceHandle === 'l' || effectiveSourceHandle === 'r' || effectiveSourceHandle === 'left' || effectiveSourceHandle === 'right') {
                    effectiveSourceHandle = dynamicDir === 'TB' ? 'b' : 't';
                }
            } else {
                if (effectiveSourceHandle === 't' || effectiveSourceHandle === 'b' || effectiveSourceHandle === 'top' || effectiveSourceHandle === 'bottom') {
                    effectiveSourceHandle = dynamicDir === 'LR' ? 'r' : 'l';
                }
            }
        }

        const srcAnchor = getAnchorLocal(sourceId, effectiveSourceHandle);
        if (!srcAnchor) return;

        let dirX = 0, dirY = 0;
        if (effectiveSourceHandle === 'r' || effectiveSourceHandle === 'right') dirX = 1;
        else if (effectiveSourceHandle === 'l' || effectiveSourceHandle === 'left') dirX = -1;
        else if (effectiveSourceHandle === 'b' || effectiveSourceHandle === 'bottom') dirY = 1;
        else if (effectiveSourceHandle === 't' || effectiveSourceHandle === 'top') dirY = -1;

        const branchPoint = { x: srcAnchor.x + dirX * trunkLength, y: srcAnchor.y + dirY * trunkLength };

        domainEdges.forEach(edge => {
            let effectiveTargetHandle = edge.targetHandle;
            if (!effectiveTargetHandle) {
                if (dynamicDir === 'TB') effectiveTargetHandle = 't';
                else if (dynamicDir === 'BT') effectiveTargetHandle = 'b';
                else if (dynamicDir === 'LR') effectiveTargetHandle = 'l';
                else if (dynamicDir === 'RL') effectiveTargetHandle = 'r';
                else effectiveTargetHandle = 't';
            } else {
                if (dynamicDir === 'TB' || dynamicDir === 'BT') {
                    if (effectiveTargetHandle === 'l' || effectiveTargetHandle === 'r' || effectiveTargetHandle === 'left' || effectiveTargetHandle === 'right') {
                        effectiveTargetHandle = dynamicDir === 'TB' ? 't' : 'b';
                    }
                } else {
                    if (effectiveTargetHandle === 't' || effectiveTargetHandle === 'b' || effectiveTargetHandle === 'top' || effectiveTargetHandle === 'bottom') {
                        effectiveTargetHandle = dynamicDir === 'LR' ? 'l' : 'r';
                    }
                }
            }

            const tgtAnchor = getAnchorLocal(edge.target, effectiveTargetHandle);
            if (!tgtAnchor) return;

            const points: Array<{ x: number, y: number }> = [];
            points.push({ x: Math.round(srcAnchor.x), y: Math.round(srcAnchor.y) });
            points.push({ x: Math.round(branchPoint.x), y: Math.round(branchPoint.y) });

            if (!isGroupHorizontal) {
                points.push({ x: Math.round(tgtAnchor.x), y: Math.round(branchPoint.y) });
                points.push({ x: Math.round(tgtAnchor.x), y: Math.round(tgtAnchor.y) });
            } else {
                points.push({ x: Math.round(branchPoint.x), y: Math.round(tgtAnchor.y) });
                points.push({ x: Math.round(tgtAnchor.x), y: Math.round(tgtAnchor.y) });
            }

            treeRoutingMap.set(edge.id, {
                type: 'tree-out', points, trunkId: `trunk-out-${sourceId}-${domainKey}`,
                effectiveSourceHandle, effectiveTargetHandle
            });
        });
    });

    // N-to-1
    inGroups.forEach((groupEdges, targetId) => {
        if (groupEdges.length < minBusSize) return;
        const validEdges = groupEdges.filter(e => !treeRoutingMap.has(e.id));
        if (validEdges.length < minBusSize) return;

        const targetCenter = getAnchorLocal(targetId, null);
        if (!targetCenter) return;

        // Calculate average offset to determine dominant flow direction dynamically
        let sumX = 0;
        let sumY = 0;
        let validOffsetsCount = 0;
        const sourceOffsets = validEdges.map(edge => {
            const sourceCenter = getAnchorLocal(edge.source, null);
            if (!sourceCenter) return null;
            sumX += sourceCenter.x - targetCenter.x;
            sumY += sourceCenter.y - targetCenter.y;
            validOffsetsCount++;
            return {
                edge,
                deltaX: sourceCenter.x - targetCenter.x,
                deltaY: sourceCenter.y - targetCenter.y
            };
        }).filter((offset): offset is { edge: T; deltaX: number; deltaY: number } => offset !== null);

        if (sourceOffsets.length < minBusSize) return;

        const avgX = validOffsetsCount > 0 ? sumX / validOffsetsCount : 0;
        const avgY = validOffsetsCount > 0 ? sumY / validOffsetsCount : 0;

        // Default fallback to configured layout direction if average offset is tiny/ambiguous
        let dynamicDir: 'TB' | 'BT' | 'LR' | 'RL' = 'TB';
        if (layoutDir.includes('BT')) dynamicDir = 'BT';
        else if (layoutDir.includes('LR')) dynamicDir = 'LR';
        else if (layoutDir.includes('RL')) dynamicDir = 'RL';

        if (Math.abs(avgX) >= 10 || Math.abs(avgY) >= 10) {
            // Note: For incoming edges, target is at the center, so delta = source - target.
            // If deltaY > 0, source is below target, meaning the flow is BT (source -> target).
            // If deltaY < 0, source is above target, meaning the flow is TB (source -> target).
            if (Math.abs(avgY) >= Math.abs(avgX)) {
                dynamicDir = avgY >= 0 ? 'BT' : 'TB';
            } else {
                dynamicDir = avgX >= 0 ? 'RL' : 'LR';
            }
        }

        const isGroupHorizontal = dynamicDir === 'LR' || dynamicDir === 'RL';

        const alignedEdges: typeof validEdges = [];
        sourceOffsets.forEach(o => {
            let isAligned = false;
            if (dynamicDir === 'TB') isAligned = o.deltaY < 5;
            else if (dynamicDir === 'BT') isAligned = o.deltaY > -5;
            else if (dynamicDir === 'LR') isAligned = o.deltaX < 5;
            else if (dynamicDir === 'RL') isAligned = o.deltaX > -5;

            if (isAligned) alignedEdges.push(o.edge);
        });

        if (alignedEdges.length < minBusSize) return;

        // Treat all aligned edges as a single tree bus trunk group instead of partitioning by subdomain domainKey
        const domainEdges = alignedEdges;
        const domainKey = 'all';

        const firstEdge = domainEdges[0];
        let effectiveTargetHandle = firstEdge.targetHandle;
        if (!effectiveTargetHandle) {
            if (dynamicDir === 'TB') effectiveTargetHandle = 't';
            else if (dynamicDir === 'BT') effectiveTargetHandle = 'b';
            else if (dynamicDir === 'LR') effectiveTargetHandle = 'l';
            else if (dynamicDir === 'RL') effectiveTargetHandle = 'r';
            else effectiveTargetHandle = 't';
        } else {
            if (dynamicDir === 'TB' || dynamicDir === 'BT') {
                if (effectiveTargetHandle === 'l' || effectiveTargetHandle === 'r' || effectiveTargetHandle === 'left' || effectiveTargetHandle === 'right') {
                    effectiveTargetHandle = dynamicDir === 'TB' ? 't' : 'b';
                }
            } else {
                if (effectiveTargetHandle === 't' || effectiveTargetHandle === 'b' || effectiveTargetHandle === 'top' || effectiveTargetHandle === 'bottom') {
                    effectiveTargetHandle = dynamicDir === 'LR' ? 'l' : 'r';
                }
            }
        }

        const tgtAnchor = getAnchorLocal(targetId, effectiveTargetHandle);
        if (!tgtAnchor) return;

        let dirX = 0, dirY = 0;
        if (effectiveTargetHandle === 'l' || effectiveTargetHandle === 'left') dirX = -1;
        else if (effectiveTargetHandle === 'r' || effectiveTargetHandle === 'right') dirX = 1;
        else if (effectiveTargetHandle === 't' || effectiveTargetHandle === 'top') dirY = -1;
        else if (effectiveTargetHandle === 'b' || effectiveTargetHandle === 'bottom') dirY = 1;

        const mergePoint = { x: tgtAnchor.x + dirX * trunkLength, y: tgtAnchor.y + dirY * trunkLength };

        domainEdges.forEach(edge => {
            let effectiveSourceHandle = edge.sourceHandle;
            if (!effectiveSourceHandle) {
                if (dynamicDir === 'TB') effectiveSourceHandle = 'b';
                else if (dynamicDir === 'BT') effectiveSourceHandle = 't';
                else if (dynamicDir === 'LR') effectiveSourceHandle = 'r';
                else if (dynamicDir === 'RL') effectiveSourceHandle = 'l';
                else effectiveSourceHandle = 'b';
            } else {
                if (dynamicDir === 'TB' || dynamicDir === 'BT') {
                    if (effectiveSourceHandle === 'l' || effectiveSourceHandle === 'r' || effectiveSourceHandle === 'left' || effectiveSourceHandle === 'right') {
                        effectiveSourceHandle = dynamicDir === 'TB' ? 'b' : 't';
                    }
                } else {
                    if (effectiveSourceHandle === 't' || effectiveSourceHandle === 'b' || effectiveSourceHandle === 'top' || effectiveSourceHandle === 'bottom') {
                        effectiveSourceHandle = dynamicDir === 'LR' ? 'r' : 'l';
                    }
                }
            }

            const srcAnchor = getAnchorLocal(edge.source, effectiveSourceHandle);
            if (!srcAnchor) return;

            const points: Array<{ x: number, y: number }> = [];
            points.push({ x: Math.round(srcAnchor.x), y: Math.round(srcAnchor.y) });

            if (!isGroupHorizontal) points.push({ x: Math.round(srcAnchor.x), y: Math.round(mergePoint.y) });
            else points.push({ x: Math.round(mergePoint.x), y: Math.round(srcAnchor.y) });

            points.push({ x: Math.round(mergePoint.x), y: Math.round(mergePoint.y) });
            points.push({ x: Math.round(tgtAnchor.x), y: Math.round(tgtAnchor.y) });

            treeRoutingMap.set(edge.id, {
                type: 'tree-in', points, trunkId: `trunk-in-${targetId}-${domainKey}`,
                effectiveSourceHandle, effectiveTargetHandle
            });
        });
    });

    const routedEdges = edges.map(edge => {
        const info = treeRoutingMap.get(edge.id);
        if (!info) return edge;
        return {
            ...edge,
            sourceHandle: info.effectiveSourceHandle || edge.sourceHandle,
            targetHandle: info.effectiveTargetHandle || edge.targetHandle,
            data: { ...asRecord(edge.data), treeRouting: info, isTreeBus: true, computedPath: info.points }
        };
    });

    return postProcessTreeBusRouting(routedEdges);
}
