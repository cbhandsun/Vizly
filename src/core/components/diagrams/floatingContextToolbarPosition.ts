import type { Node } from '@xyflow/react';

const DEFAULT_TOOLBAR_OFFSET = 20;
const GROUP_HEADER_CLEARANCE_OFFSET = 56;
const GROUP_HEADER_PROXIMITY = 160;

export const resolveFloatingContextToolbarOffset = (
    selectedNodes: readonly Node[],
): number => {
    const isCloseToParentHeader = selectedNodes.some((node) => (
        Boolean(node.parentId)
        && Number.isFinite(node.position.y)
        && node.position.y < GROUP_HEADER_PROXIMITY
    ));

    return isCloseToParentHeader
        ? GROUP_HEADER_CLEARANCE_OFFSET
        : DEFAULT_TOOLBAR_OFFSET;
};

