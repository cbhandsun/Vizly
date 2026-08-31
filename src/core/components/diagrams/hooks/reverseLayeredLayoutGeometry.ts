import type { Edge, Node } from '@xyflow/react';

import type { ILayoutStrategy } from '../../../types/layout-strategy';
import type { LayoutCalculationContext } from '../../../types/layout-strategy';
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
 * rediscover feedback lanes in the opposite direction. Nodes and route points
 * share one absolute reflection; node positions are then converted back to
 * their mirrored parent's coordinate space. Per-sibling reflection would move
 * cross-domain endpoints by different amounts and invalidate the route seed.
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

    const mirroredAbsolutePositions = new Map(result.nodes.map(node => {
        const point = mirrorPoint(absolutePosition(node), direction, graphBounds.minimum, graphBounds.maximum);
        const size = nodeSize(node);
        return [node.id, direction === 'BT'
            ? { x: point.x, y: point.y - size.height }
            : { x: point.x - size.width, y: point.y }] as const;
    }));

    const nodes = result.nodes.map((node) => {
        const absolute = mirroredAbsolutePositions.get(node.id);
        if (!absolute) return node;
        const parent = node.parentId ? mirroredAbsolutePositions.get(node.parentId) : undefined;
        return {
            ...node,
            position: { x: absolute.x - (parent?.x ?? 0), y: absolute.y - (parent?.y ?? 0) },
            ...('positionAbsolute' in node ? { positionAbsolute: { ...absolute } } : {}),
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
    context?: LayoutCalculationContext,
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
    // Semantic lanes already reverse their global business ranks while keeping
    // container headers upright. Mirroring that layout would swap header and
    // bottom padding and place terminal nodes inside the title strip.
    const nativeSemanticReverse = options.domainPlacement === 'ordered-lanes'
        && (options.nodeLayout === 'dagre' || options.nodeLayout === 'flow');
    const reverseDirection = reverseRanking
        && !nativeSemanticReverse
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
    const calculated = await strategy.calculateLayout(nodes, edges, calculationOptions, context);
    return reverseDirection
        ? reverseLayeredLayoutGeometry(calculated, reverseDirection)
        : calculated;
};
