import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { normalizeHandle } from '../routing/utils/handleUtils';

type DisplayPoint = { x: number; y: number };

type EdgePortInfo = {
    edge: Edge;
    otherPosition: DisplayPoint;
};

type EdgePortGroup = {
    nodeId: string;
    handle: 'l' | 'r' | 't' | 'b';
    entries: EdgePortInfo[];
};

type NodeGeometryData = ReactFlowNode & {
    positionAbsolute?: DisplayPoint;
    measured?: { width?: number; height?: number };
};

const finiteDimension = (values: unknown[], fallback: number): number => {
    for (const value of values) {
        const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    return fallback;
};

const getNodeGeometry = (node: ReactFlowNode) => {
    const geometryNode = node as NodeGeometryData;
    return {
        position: geometryNode.positionAbsolute ?? node.position,
        width: finiteDimension([geometryNode.measured?.width, node.style?.width, node.width], 200),
        height: finiteDimension([geometryNode.measured?.height, node.style?.height, node.height], 80),
    };
};

const getComputedPath = (edge: Edge): DisplayPoint[] | null => {
    const data = edge.data as Record<string, unknown> | undefined;
    const path = data?.computedPath;
    if (!Array.isArray(path) || path.length < 2) return null;
    return path.every(point => (
        typeof point === 'object'
        && point !== null
        && Number.isFinite(Number((point as DisplayPoint).x))
        && Number.isFinite(Number((point as DisplayPoint).y))
    )) ? path as DisplayPoint[] : null;
};

const appendPortGroupEntry = (
    groups: Map<string, EdgePortGroup>,
    key: string,
    nodeId: string,
    handle: EdgePortGroup['handle'],
    edge: Edge,
    otherPosition: DisplayPoint,
) => {
    const group = groups.get(key) ?? { nodeId, handle, entries: [] };
    group.entries.push({ edge, otherPosition });
    groups.set(key, group);
};

const reorderPortAnchors = (
    groups: Map<string, EdgePortGroup>,
    role: 'source' | 'target',
    nodeById: Map<string, ReactFlowNode>,
) => {
    for (const group of groups.values()) {
        if (group.entries.length < 2) continue;
        const node = nodeById.get(group.nodeId);
        if (!node) continue;

        const { position, width, height } = getNodeGeometry(node);
        const isVerticalPort = group.handle === 't' || group.handle === 'b';
        group.entries.sort((first, second) => (
            isVerticalPort
                ? first.otherPosition.x - second.otherPosition.x
                : first.otherPosition.y - second.otherPosition.y
        ));

        const count = group.entries.length;
        for (let index = 0; index < count; index += 1) {
            const fraction = (index + 1) / (count + 1);
            const path = getComputedPath(group.entries[index].edge);
            if (!path) continue;

            const endpointIndex = role === 'source' ? 0 : path.length - 1;
            const adjacentIndex = role === 'source' ? 1 : path.length - 2;
            const oldAdjacent = { ...path[adjacentIndex] };
            const stubLength = 32;
            if (isVerticalPort) {
                const nextX = position.x + width * fraction;
                path[endpointIndex] = { ...path[endpointIndex], x: nextX };
                const isSidewaysFirstSegment = Math.abs(oldAdjacent.y - path[endpointIndex].y) < 0.5;
                path[adjacentIndex] = isSidewaysFirstSegment
                    ? {
                        x: nextX,
                        y: path[endpointIndex].y + (group.handle === 't' ? -1 : 1) * stubLength,
                    }
                    : { ...path[adjacentIndex], x: nextX };
            } else {
                const nextY = position.y + height * fraction;
                path[endpointIndex] = { ...path[endpointIndex], y: nextY };
                const isSidewaysFirstSegment = Math.abs(oldAdjacent.x - path[endpointIndex].x) < 0.5;
                path[adjacentIndex] = isSidewaysFirstSegment
                    ? {
                        x: path[endpointIndex].x + (group.handle === 'l' ? -1 : 1) * stubLength,
                        y: nextY,
                    }
                    : { ...path[adjacentIndex], y: nextY };
            }

            if (
                Math.abs(path[endpointIndex].x - path[adjacentIndex].x) < 0.5
                && Math.abs(path[endpointIndex].y - path[adjacentIndex].y) < 0.5
            ) {
                path.splice(adjacentIndex, 1);
            }
        }
    }
};

export const reorderDomainDagrePortAnchors = (
    edges: Edge[],
    nodeById: Map<string, ReactFlowNode>,
): void => {
    const sourceGroups = new Map<string, EdgePortGroup>();
    const targetGroups = new Map<string, EdgePortGroup>();

    edges.forEach((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return;

        const sourceHandle = normalizeHandle(edge.sourceHandle || 'bottom') ?? 'b';
        const targetHandle = normalizeHandle(edge.targetHandle || 'top') ?? 't';
        const sourceGeometry = getNodeGeometry(source);
        const targetGeometry = getNodeGeometry(target);
        appendPortGroupEntry(
            sourceGroups,
            `${edge.source}\u0000${sourceHandle}`,
            edge.source,
            sourceHandle,
            edge,
            {
                x: targetGeometry.position.x + targetGeometry.width / 2,
                y: targetGeometry.position.y + targetGeometry.height / 2,
            },
        );
        appendPortGroupEntry(
            targetGroups,
            `${edge.target}\u0000${targetHandle}`,
            edge.target,
            targetHandle,
            edge,
            {
                x: sourceGeometry.position.x + sourceGeometry.width / 2,
                y: sourceGeometry.position.y + sourceGeometry.height / 2,
            },
        );
    });

    reorderPortAnchors(sourceGroups, 'source', nodeById);
    reorderPortAnchors(targetGroups, 'target', nodeById);
};
