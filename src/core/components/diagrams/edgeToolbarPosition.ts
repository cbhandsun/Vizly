import type { InternalNode, Node, Viewport, XYPosition } from '@xyflow/react';

type ToolbarNode = Node | InternalNode;

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const isFinitePoint = (value: unknown): value is XYPosition => {
    if (!value || typeof value !== 'object') return false;
    const point = value as Record<string, unknown>;
    return isFiniteNumber(point.x) && isFiniteNumber(point.y);
};

const readDimension = (measured: number | undefined, declared: number | undefined, fallback: number) => {
    if (isFiniteNumber(measured) && measured >= 0) return measured;
    if (isFiniteNumber(declared) && declared >= 0) return declared;
    return fallback;
};

export const resolveToolbarNodeCenter = (node: ToolbarNode | undefined): XYPosition | null => {
    if (!node) return null;

    const internalPosition = 'internals' in node
        ? node.internals.positionAbsolute
        : undefined;
    const position = isFinitePoint(internalPosition)
        ? internalPosition
        : node.position;

    if (!isFinitePoint(position)) return null;

    const width = readDimension(node.measured?.width, node.width, 120);
    const height = readDimension(node.measured?.height, node.height, 60);

    return {
        x: position.x + width / 2,
        y: position.y + height / 2,
    };
};

export const getEdgeToolbarScreenPosition = (
    sourceNode: ToolbarNode | undefined,
    targetNode: ToolbarNode | undefined,
    viewport: Viewport,
): XYPosition | null => {
    const sourceCenter = resolveToolbarNodeCenter(sourceNode);
    const targetCenter = resolveToolbarNodeCenter(targetNode);
    if (!sourceCenter || !targetCenter) return null;

    if (
        !isFiniteNumber(viewport.x)
        || !isFiniteNumber(viewport.y)
        || !isFiniteNumber(viewport.zoom)
        || viewport.zoom <= 0
    ) {
        return null;
    }

    return {
        x: ((sourceCenter.x + targetCenter.x) / 2) * viewport.zoom + viewport.x,
        y: ((sourceCenter.y + targetCenter.y) / 2) * viewport.zoom + viewport.y,
    };
};
