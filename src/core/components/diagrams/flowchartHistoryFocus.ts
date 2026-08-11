import type { Node } from '@xyflow/react';

import { focusAddedFlowchartNodeById } from './flowchartTabNavigation';

const EMPTY_STATE_ACTION_SELECTOR = '.flowchart-empty-action';
const MAX_FOCUS_NODE_ID_LENGTH = 1_024;

const isFocusableNodeId = (nodeId: unknown): nodeId is string => (
    typeof nodeId === 'string'
    && nodeId.trim().length > 0
    && nodeId.length <= MAX_FOCUS_NODE_ID_LENGTH
);

/**
 * Keeps semantic selection and keyboard focus aligned after history changes.
 * If the focused node disappears, fall back to a valid survivor. History
 * actions triggered from a toolbar or the canvas keep their existing focus.
 */
export const resolveHistoryNodeFocusAfterChange = (
    currentNodes: readonly Node[],
    nextNodes: readonly Node[],
    activeElement: Element | null,
): string | null => {
    const focusedWrapper = activeElement?.closest<HTMLElement>('.react-flow__node[data-id]');
    const focusedNodeId = focusedWrapper?.dataset.id;
    if (
        !isFocusableNodeId(focusedNodeId)
        || !currentNodes.some(node => node.id === focusedNodeId)
    ) {
        return null;
    }

    const selectedTarget = nextNodes.find(node => node.selected && isFocusableNodeId(node.id));
    if (selectedTarget && selectedTarget.id !== focusedNodeId) return selectedTarget.id;
    if (nextNodes.some(node => node.id === focusedNodeId)) return null;

    const fallback = nextNodes.find(node => isFocusableNodeId(node.id));
    return fallback && isFocusableNodeId(fallback.id) ? fallback.id : null;
};

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
        || nodeId.length > MAX_FOCUS_NODE_ID_LENGTH
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
