import type { Rectangle } from '../types/routing';

type EdgeRoutingNodeData = Record<string, unknown> | undefined;

export type EdgeRoutingObstacleNode = {
    type?: string;
    data?: EdgeRoutingNodeData;
    position?: { x?: number; y?: number };
    positionAbsolute?: { x?: number; y?: number };
    computed?: { positionAbsolute?: { x?: number; y?: number } };
    measured?: { width?: number; height?: number };
    width?: number;
    height?: number;
};

export const EDGE_ROUTING_CONTAINER_NODE_TYPES = new Set([
    'group',
    'subGroup',
    'titleGroup',
    'domain',
    'subDomain',
    'swimlane',
]);

function getEdgeRoutingNodePosition(node: EdgeRoutingObstacleNode): { x: number; y: number } {
    const position = node.computed?.positionAbsolute ?? node.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    return {
        x: Number(position.x ?? 0),
        y: Number(position.y ?? 0),
    };
}

function getEdgeRoutingNodeSize(node: EdgeRoutingObstacleNode): { width: number; height: number } {
    return {
        width: Number(node.measured?.width ?? node.width ?? 0),
        height: Number(node.measured?.height ?? node.height ?? 0),
    };
}

function hasVisibleNodeTitle(node: EdgeRoutingObstacleNode): boolean {
    const type = node.type ?? '';
    return EDGE_ROUTING_CONTAINER_NODE_TYPES.has(type)
        || typeof node.data?.label === 'string'
        || typeof node.data?.title === 'string'
        || typeof node.data?.name === 'string';
}

export function collectSoftNodeObstacleRects(nodes: EdgeRoutingObstacleNode[]): Rectangle[] {
    const soft: Rectangle[] = [];

    nodes.forEach(node => {
        if (!hasVisibleNodeTitle(node)) return;

        const { x, y } = getEdgeRoutingNodePosition(node);
        const { width, height } = getEdgeRoutingNodeSize(node);
        if (width <= 0 || height <= 0) return;

        const titleHeight = Math.min(44, Math.max(24, height * 0.18));
        soft.push({
            x: x + 8,
            y: y + 6,
            width: Math.max(0, width - 16),
            height: titleHeight,
        });

        if (EDGE_ROUTING_CONTAINER_NODE_TYPES.has(node.type ?? '')) {
            const border = 8;
            soft.push({ x: x - border / 2, y, width: border, height });
            soft.push({ x: x + width - border / 2, y, width: border, height });
            soft.push({ x, y: y - border / 2, width, height: border });
            soft.push({ x, y: y + height - border / 2, width, height: border });
        }
    });

    return soft;
}

export function collectHardNodeObstacleRects(nodes: EdgeRoutingObstacleNode[]): Rectangle[] {
    const hard: Rectangle[] = [];

    nodes.forEach(node => {
        if (EDGE_ROUTING_CONTAINER_NODE_TYPES.has(String(node.type ?? ''))) return;

        const { x, y } = getEdgeRoutingNodePosition(node);
        const { width, height } = getEdgeRoutingNodeSize(node);
        hard.push({ x, y, width, height });
    });

    return hard;
}
