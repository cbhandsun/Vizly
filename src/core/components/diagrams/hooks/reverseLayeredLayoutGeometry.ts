import type { Edge, Node } from '@xyflow/react';

import type { ILayoutStrategy } from '../../../types/layout-strategy';
import type { LayoutOptions } from '../../../types/layout';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';

type Point = Readonly<{ x: number; y: number }>;
type ReverseDirection = Extract<FlowchartLayoutDirection, 'BT' | 'RL'>;
type LayeredLayoutOptions = LayoutOptions & {
    domainSubGroupDirection?: FlowchartLayoutDirection;
    subDomainNodeDirection?: FlowchartLayoutDirection;
};

const asRecord = (value: unknown): Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const finiteDimension = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
);

const nodeSize = (node: Node): { width: number; height: number } => ({
    width: finiteDimension(node.measured?.width ?? node.style?.width ?? node.width, 150),
    height: finiteDimension(node.measured?.height ?? node.style?.height ?? node.height, 80),
});

const finitePointArray = (value: unknown): Point[] | null => {
    if (!Array.isArray(value)) return null;
    const result: Point[] = [];
    for (const item of value) {
        const point = asRecord(item);
        if (
            typeof point.x !== 'number'
            || !Number.isFinite(point.x)
            || typeof point.y !== 'number'
            || !Number.isFinite(point.y)
        ) return null;
        result.push({ x: point.x, y: point.y });
    }
    return result;
};

const mirrorPoint = (
    point: Point,
    direction: ReverseDirection,
    minimum: number,
    maximum: number,
): Point => direction === 'BT'
    ? { x: point.x, y: minimum + maximum - point.y }
    : { x: minimum + maximum - point.x, y: point.y };

const mirrorPath = (
    value: unknown,
    direction: ReverseDirection,
    minimum: number,
    maximum: number,
): Point[] | unknown => {
    const path = finitePointArray(value);
    return path
        ? path.map(point => mirrorPoint(point, direction, minimum, maximum))
        : value;
};

/**
 * Reverses a known-good layered layout without asking the ranking engine to
 * rediscover feedback lanes in the opposite direction. Node coordinates are
 * mirrored in their own parent coordinate space; absolute route candidates
 * are mirrored once across the complete graph envelope.
 */
export const reverseLayeredLayoutGeometry = <T extends { nodes: Node[]; edges: Edge[] }>(
    result: T,
    direction: ReverseDirection,
): T => {
    const sourceNodeById = new Map(result.nodes.map(node => [node.id, node] as const));
    const absolutePositionById = new Map<string, Point>();
    const absolutePosition = (node: Node, visiting = new Set<string>()): Point => {
        const cached = absolutePositionById.get(node.id);
        if (cached) return cached;
        if (visiting.has(node.id)) return node.position;
        visiting.add(node.id);
        const parent = node.parentId ? sourceNodeById.get(node.parentId) : undefined;
        const parentPosition = parent ? absolutePosition(parent, visiting) : { x: 0, y: 0 };
        const position = {
            x: parentPosition.x + node.position.x,
            y: parentPosition.y + node.position.y,
        };
        visiting.delete(node.id);
        absolutePositionById.set(node.id, position);
        return position;
    };
    const graphBounds = result.nodes.reduce((bounds, node) => {
        const position = absolutePosition(node);
        const size = nodeSize(node);
        return {
            minimum: Math.min(
                bounds.minimum,
                direction === 'BT' ? position.y : position.x,
            ),
            maximum: Math.max(
                bounds.maximum,
                direction === 'BT'
                    ? position.y + size.height
                    : position.x + size.width,
            ),
        };
    }, { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY });
    if (!Number.isFinite(graphBounds.minimum) || !Number.isFinite(graphBounds.maximum)) return result;

    const siblingBounds = new Map<string, { minimum: number; maximum: number }>();
    for (const node of result.nodes) {
        const key = node.parentId ?? '';
        const position = direction === 'BT' ? node.position.y : node.position.x;
        const size = nodeSize(node);
        const extent = direction === 'BT' ? size.height : size.width;
        const current = siblingBounds.get(key) ?? {
            minimum: Number.POSITIVE_INFINITY,
            maximum: Number.NEGATIVE_INFINITY,
        };
        current.minimum = Math.min(current.minimum, position);
        current.maximum = Math.max(current.maximum, position + extent);
        siblingBounds.set(key, current);
    }

    const nodes = result.nodes.map((node) => {
        const bounds = siblingBounds.get(node.parentId ?? '');
        if (!bounds) return node;
        const size = nodeSize(node);
        return {
            ...node,
            position: direction === 'BT'
                ? {
                    x: node.position.x,
                    y: bounds.minimum + bounds.maximum - node.position.y - size.height,
                }
                : {
                    x: bounds.minimum + bounds.maximum - node.position.x - size.width,
                    y: node.position.y,
                },
        };
    });
    const edges = result.edges.map((edge) => {
        const data = asRecord(edge.data);
        const treeRouting = asRecord(data.treeRouting);
        return {
            ...edge,
            data: {
                ...data,
                ...(typeof data.computedPath !== 'undefined' ? {
                    computedPath: mirrorPath(
                        data.computedPath,
                        direction,
                        graphBounds.minimum,
                        graphBounds.maximum,
                    ),
                } : {}),
                ...(typeof data.elkPath !== 'undefined' ? {
                    elkPath: mirrorPath(
                        data.elkPath,
                        direction,
                        graphBounds.minimum,
                        graphBounds.maximum,
                    ),
                } : {}),
                ...(typeof data.treeRouting !== 'undefined' ? {
                    treeRouting: {
                        ...treeRouting,
                        ...(typeof treeRouting.points !== 'undefined' ? {
                            points: mirrorPath(
                                treeRouting.points,
                                direction,
                                graphBounds.minimum,
                                graphBounds.maximum,
                            ),
                        } : {}),
                    },
                } : {}),
            },
        };
    });
    return { ...result, nodes, edges };
};

export const calculateLayeredLayoutWithReverse = async (
    strategy: Pick<ILayoutStrategy, 'calculateLayout'>,
    nodes: Node[],
    edges: Edge[],
    options: LayeredLayoutOptions,
    requestedDirection: FlowchartLayoutDirection,
    reverseRanking: boolean,
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
    const reverseDirection = reverseRanking
        && (requestedDirection === 'BT' || requestedDirection === 'RL')
        ? requestedDirection
        : null;
    const calculationDirection = reverseDirection === 'BT'
        ? 'TB'
        : reverseDirection === 'RL'
            ? 'LR'
            : requestedDirection;
    const calculationOptions: LayeredLayoutOptions = {
        ...options,
        direction: calculationDirection,
        domainSubGroupDirection: calculationDirection,
        subDomainNodeDirection: calculationDirection,
        directionOverrides: reverseDirection ? undefined : options.directionOverrides,
    };
    const calculated = await strategy.calculateLayout(nodes, edges, calculationOptions);
    return reverseDirection
        ? reverseLayeredLayoutGeometry(calculated, reverseDirection)
        : calculated;
};
