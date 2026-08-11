import type { Node } from '@xyflow/react';

import { focusAddedFlowchartNodeById } from './flowchartTabNavigation';

const EMPTY_STATE_ACTION_SELECTOR = '.flowchart-empty-action';

export const resolveUndoRestoredNodeFocusId = (
    currentNodes: readonly Node[],
    restoredNodes: readonly Node[],
    activeElement: Element | null,
): string | null => {
    if (
        currentNodes.length !== 0
        || restoredNodes.length === 0
        || !activeElement?.matches(EMPTY_STATE_ACTION_SELECTOR)
    ) {
        return null;
    }

    const restoredNode = restoredNodes.find(node => node.selected) ?? restoredNodes[0];
    return restoredNode.id.trim() ? restoredNode.id : null;
};

export const shouldFocusEmptyStateAfterRedo = (
    currentNodes: readonly Node[],
    redoneNodes: readonly Node[],
    activeElement: Element | null,
): boolean => (
    currentNodes.length > 0
    && redoneNodes.length === 0
    && Boolean(activeElement?.closest('.react-flow__node'))
);

export const scheduleUndoRestoredNodeFocus = (
    nodeId: string,
    root?: ParentNode,
): { cancel: () => void } | null => {
    if (
        !nodeId
        || nodeId.length > 1_024
        || typeof window === 'undefined'
        || (!root && typeof document === 'undefined')
    ) {
        return null;
    }

    const resolvedRoot = root ?? document;
    let active = true;
    let frameId = 0;
    const focus = () => {
        if (!active) return;
        if (focusAddedFlowchartNodeById(resolvedRoot, nodeId)) {
            active = false;
            return;
        }
        frameId = window.requestAnimationFrame(() => {
            if (!active) return;
            focusAddedFlowchartNodeById(resolvedRoot, nodeId);
            active = false;
        });
    };
    frameId = window.requestAnimationFrame(focus);

    return {
        cancel: () => {
            if (!active) return;
            active = false;
            window.cancelAnimationFrame(frameId);
        },
    };
};
