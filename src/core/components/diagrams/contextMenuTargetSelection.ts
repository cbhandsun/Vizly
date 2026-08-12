import type { Edge, Node } from '@xyflow/react';

export interface ContextMenuTargetSelection {
    nodeIds: string[];
    edgeIds: string[];
}

interface ResolveContextMenuTargetSelectionInput {
    targetId: string;
    targetType: 'node' | 'edge';
    selectedNodeIds: readonly string[];
}

export const resolveContextMenuTargetSelection = ({
    targetId,
    targetType,
    selectedNodeIds,
}: ResolveContextMenuTargetSelectionInput): ContextMenuTargetSelection => {
    if (targetType === 'edge') {
        return { nodeIds: [], edgeIds: [targetId] };
    }

    const preserveMultiNodeSelection = selectedNodeIds.length > 1
        && selectedNodeIds.includes(targetId);

    return {
        nodeIds: preserveMultiNodeSelection ? [...selectedNodeIds] : [targetId],
        edgeIds: [],
    };
};

export const applyContextMenuVisualSelection = <T extends Node | Edge>(
    items: readonly T[],
    selectedIds: ReadonlySet<string>,
): T[] => items.map(item => {
    const selected = selectedIds.has(item.id);
    return item.selected === selected ? item : { ...item, selected };
});
