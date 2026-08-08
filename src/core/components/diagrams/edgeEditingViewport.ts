import type { InternalNode, XYPosition } from '@xyflow/react';
import { resolveToolbarNodeCenter } from './edgeToolbarPosition';

export const EDITABLE_EDGE_MINIMUM_ZOOM = 0.65;
export const EDITABLE_EDGE_TARGET_ZOOM = 0.8;

export const shouldFocusEditableEdge = (zoom: unknown): boolean => (
    typeof zoom !== 'number'
    || !Number.isFinite(zoom)
    || zoom < EDITABLE_EDGE_MINIMUM_ZOOM
);

export const getEditableEdgeFocusCenter = (
    sourceNode: InternalNode | undefined,
    targetNode: InternalNode | undefined,
): XYPosition | null => {
    const sourceCenter = resolveToolbarNodeCenter(sourceNode);
    const targetCenter = resolveToolbarNodeCenter(targetNode);
    if (!sourceCenter || !targetCenter) return null;

    return {
        x: (sourceCenter.x + targetCenter.x) / 2,
        y: (sourceCenter.y + targetCenter.y) / 2,
    };
};
