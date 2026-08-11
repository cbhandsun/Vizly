import type { Edge, Node } from '@xyflow/react';

import {
    focusAddedFlowchartNodeById,
    focusFlowchartEdgeById,
} from './flowchartTabNavigation';

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

const resolveNearestSurvivorNodeId = (
    currentNodes: readonly Node[],
    nodeIdsToDelete: ReadonlySet<string>,
    anchorNodeIds: ReadonlySet<string>,
): string | null => {
    const anchors = currentNodes.filter(node => (
        anchorNodeIds.has(node.id) && isValidFocusNodeId(node.id)
    ));
    const survivors = currentNodes.filter(node => (
        !nodeIdsToDelete.has(node.id) && isValidFocusNodeId(node.id)
    ));
    if (anchors.length === 0 || survivors.length === 0) return null;

    const positionedAnchors = anchors.filter(hasFinitePosition);
    if (positionedAnchors.length === 0) return survivors[0]?.id ?? null;

    let nearest = survivors[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of survivors) {
        if (!hasFinitePosition(candidate)) continue;
        for (const anchor of positionedAnchors) {
            const dx = candidate.position.x - anchor.position.x;
            const dy = candidate.position.y - anchor.position.y;
            const distance = (dx * dx) + (dy * dy);
            if (distance < nearestDistance) {
                nearest = candidate;
                nearestDistance = distance;
            }
        }
    }
    return nearest?.id ?? null;
};

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

    return resolveNearestSurvivorNodeId(
        currentNodes,
        nodeIdsToDelete,
        new Set([focusedNodeId]),
    );
};

/**
 * A cut can be triggered from a transient menu whose focus has already left
 * the canvas. Use the current cut selection as the spatial anchor so the
 * nearest surviving node can take over both selection and keyboard context.
 */
export const resolveFlowchartCutFocusNodeId = (
    currentNodes: readonly Node[],
    nodeIdsToCut: ReadonlySet<string>,
): string | null => resolveNearestSurvivorNodeId(
    currentNodes,
    nodeIdsToCut,
    nodeIdsToCut,
);

export type FlowchartEdgeDeletionFocusTarget = {
    kind: 'edge' | 'node';
    id: string;
};

const getAdjacentEdgeRank = (anchor: Edge, candidate: Edge): number => {
    if (candidate.source === anchor.target) return 0;
    if (candidate.target === anchor.source) return 1;
    if (
        candidate.source === anchor.source
        || candidate.source === anchor.target
        || candidate.target === anchor.source
        || candidate.target === anchor.target
    ) return 2;
    return Number.POSITIVE_INFINITY;
};

/**
 * Preserve relationship-editing context after an edge disappears. Continue
 * along an adjacent surviving edge when possible; otherwise hand focus to the
 * deleted edge's target node, then its source node.
 */
export const resolveFlowchartEdgeDeletionFocusTarget = (
    currentNodes: readonly Node[],
    currentEdges: readonly Edge[],
    edgeIdsToDelete: ReadonlySet<string>,
    activeElement: Element | null,
    preferredEdgeId?: string,
): FlowchartEdgeDeletionFocusTarget | null => {
    const focusedEdgeId = activeElement
        ?.closest<Element>('.react-flow__edge[data-id]')
        ?.getAttribute('data-id');
    const anchorEdgeId = isValidFocusNodeId(focusedEdgeId) && edgeIdsToDelete.has(focusedEdgeId)
        ? focusedEdgeId
        : isValidFocusNodeId(preferredEdgeId) && edgeIdsToDelete.has(preferredEdgeId)
            ? preferredEdgeId
            : null;
    if (!anchorEdgeId) return null;

    const anchor = currentEdges.find(edge => edge.id === anchorEdgeId);
    if (!anchor || !isValidFocusNodeId(anchor.source) || !isValidFocusNodeId(anchor.target)) {
        return null;
    }

    let adjacentEdge: Edge | null = null;
    let adjacentRank = Number.POSITIVE_INFINITY;
    for (const candidate of currentEdges) {
        if (edgeIdsToDelete.has(candidate.id) || !isValidFocusNodeId(candidate.id)) continue;
        const rank = getAdjacentEdgeRank(anchor, candidate);
        if (rank < adjacentRank) {
            adjacentEdge = candidate;
            adjacentRank = rank;
        }
    }
    if (adjacentEdge) return { kind: 'edge', id: adjacentEdge.id };

    const survivingNodeIds = new Set(
        currentNodes.filter(node => isValidFocusNodeId(node.id)).map(node => node.id),
    );
    if (survivingNodeIds.has(anchor.target)) return { kind: 'node', id: anchor.target };
    if (survivingNodeIds.has(anchor.source)) return { kind: 'node', id: anchor.source };
    return null;
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

export const scheduleFlowchartDeletionEdgeFocus = (
    edgeId: string,
    root?: ParentNode,
): { cancel: () => void } | null => {
    if (
        !isValidFocusNodeId(edgeId)
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
        if (focusFlowchartEdgeById(resolvedRoot, edgeId)) {
            active = false;
            return;
        }
        frameId = window.requestAnimationFrame(() => {
            if (!active) return;
            focusFlowchartEdgeById(resolvedRoot, edgeId);
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
