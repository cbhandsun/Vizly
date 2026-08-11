import type { Node } from '@xyflow/react';

import { focusAddedFlowchartNodeById } from './flowchartTabNavigation';

const EMPTY_STATE_ACTION_SELECTOR = '.flowchart-empty-action';
const MAX_FOCUS_NODE_ID_LENGTH = 1_024;

const isValidFocusNodeId = (nodeId: unknown): nodeId is string => (
    typeof nodeId === 'string'
    && nodeId.trim().length > 0
    && nodeId.length <= MAX_FOCUS_NODE_ID_LENGTH
);

const hasFinitePosition = (node: Node): boolean => (
    Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
);

export const resolveFlowchartDeletionFocusNodeId = (
    currentNodes: readonly Node[],
    nodeIdsToDelete: ReadonlySet<string>,
    activeElement: Element | null,
): string | null => {
    const focusedWrapper = activeElement?.closest<HTMLElement>('.react-flow__node[data-id]');
    const focusedNodeId = focusedWrapper?.dataset.id;
    if (!isValidFocusNodeId(focusedNodeId) || !nodeIdsToDelete.has(focusedNodeId)) {
        return null;
    }

    const anchor = currentNodes.find(node => node.id === focusedNodeId);
    const survivors = currentNodes.filter(node => (
        !nodeIdsToDelete.has(node.id) && isValidFocusNodeId(node.id)
    ));
    if (!anchor || survivors.length === 0) return null;
    if (!hasFinitePosition(anchor)) return survivors[0]?.id ?? null;

    let nearest = survivors[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of survivors) {
        if (!hasFinitePosition(candidate)) continue;
        const dx = candidate.position.x - anchor.position.x;
        const dy = candidate.position.y - anchor.position.y;
        const distance = (dx * dx) + (dy * dy);
        if (distance < nearestDistance) {
            nearest = candidate;
            nearestDistance = distance;
        }
    }
    return nearest?.id ?? null;
};

export const focusFlowchartEmptyStateAction = (
    root: ParentNode,
): boolean => {
    const action = root.querySelector<HTMLButtonElement>(EMPTY_STATE_ACTION_SELECTOR);
    if (!action || action.disabled || action.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    action.focus({ preventScroll: true });
    return action.ownerDocument.activeElement === action;
};

/**
 * React renders the empty-state action after the final node is removed. Try on
 * the next paint, then once more if the first frame preceded that commit.
 */
export const scheduleFlowchartEmptyStateFocus = (
    root?: ParentNode,
): { cancel: () => void } | null => {
    if (typeof window === 'undefined' || (!root && typeof document === 'undefined')) {
        return null;
    }
    const resolvedRoot = root ?? document;
    let active = true;
    let frameId = 0;
    const focus = () => {
        if (!active) return;
        if (focusFlowchartEmptyStateAction(resolvedRoot)) {
            active = false;
            return;
        }
        frameId = window.requestAnimationFrame(() => {
            if (!active) return;
            focusFlowchartEmptyStateAction(resolvedRoot);
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

export const scheduleFlowchartDeletionNodeFocus = (
    nodeId: string,
    root?: ParentNode,
): { cancel: () => void } | null => {
    if (
        !isValidFocusNodeId(nodeId)
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
