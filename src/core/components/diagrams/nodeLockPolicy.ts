import type { Node } from '@xyflow/react';

type LockableNode = Pick<Node, 'data' | 'draggable'>;

/**
 * A node is protected when it is explicitly locked or made non-draggable by a
 * layer/presentation policy. Keeping this rule in one place prevents mutation
 * entry points from disagreeing about what "locked" means.
 */
export const isNodeMutationLocked = (node: LockableNode): boolean =>
    node.data?.locked === true || node.draggable === false;

export const hasMutationLockedNode = (nodes: readonly LockableNode[]): boolean =>
    nodes.some(isNodeMutationLocked);

export const resolveTargetNodes = (
    nodes: readonly Node[],
    targetIds: ReadonlySet<string>,
): Node[] => nodes.filter(node => targetIds.has(node.id));
