import type { InternalNode, Node, Viewport, XYPosition } from '@xyflow/react';

type ToolbarNode = Node | InternalNode;

export interface ToolbarSize {
    width: number;
    height: number;
}

export type ToolbarBounds = ToolbarSize;

export interface ClampedToolbarPosition extends XYPosition {
    placement: 'above' | 'below';
}

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

const clamp = (value: number, minimum: number, maximum: number) => (
    Math.min(Math.max(value, minimum), maximum)
);

export const getClampedEdgeToolbarPosition = (
    anchor: XYPosition,
    bounds: ToolbarBounds,
    toolbar: ToolbarSize,
    margin = 16,
    clearance = 16,
): ClampedToolbarPosition | null => {
    const values = [
        anchor.x,
        anchor.y,
        bounds.width,
        bounds.height,
        toolbar.width,
        toolbar.height,
        margin,
        clearance,
    ];
    if (!values.every(isFiniteNumber)) return null;
    if (
        bounds.width <= 0
        || bounds.height <= 0
        || toolbar.width <= 0
        || toolbar.height <= 0
        || margin < 0
        || clearance < 0
    ) {
        return null;
    }

    const maximumX = Math.max(margin, bounds.width - toolbar.width - margin);
    const maximumY = Math.max(margin, bounds.height - toolbar.height - margin);
    const x = clamp(anchor.x - toolbar.width / 2, margin, maximumX);
    const aboveY = anchor.y - toolbar.height - clearance;
    const belowY = anchor.y + clearance;
    const canFitAbove = aboveY >= margin;
    const canFitBelow = belowY <= maximumY;
    const placement = canFitAbove || !canFitBelow ? 'above' : 'below';
    const preferredY = placement === 'above' ? aboveY : belowY;

    return {
        x,
        y: clamp(preferredY, margin, maximumY),
        placement,
    };
};
