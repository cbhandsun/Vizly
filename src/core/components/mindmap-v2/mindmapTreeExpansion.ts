import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { emitVizlyMindMapOperation, refreshVizlyMindMapData } from './mindmapOperationBridge';
import { cleanAndValidateTree } from './mindmapTreeSanitizer';

const setNodeExpanded = (node: NodeObj, expanded: boolean, isRoot: boolean): NodeObj => {
    const children = node.children ?? [];
    return {
        ...node,
        expanded: isRoot ? true : (children.length > 0 ? expanded : node.expanded),
        children: children.map(child => setNodeExpanded(child, expanded, false)),
    };
};

export const setMindMapTreeExpanded = (node: NodeObj, expanded: boolean): NodeObj => (
    setNodeExpanded(node, expanded, true)
);

export const hasMindMapTreeExpansionChange = (node: NodeObj, expanded: boolean): boolean => (
    (node.children ?? []).some(child => (
        ((child.children?.length ?? 0) > 0 && child.expanded !== expanded)
        || hasMindMapTreeExpansionChange(child, expanded)
    ))
);

/**
 * Apply the visible branch state as one native Mind Elixir history operation.
 * Refreshing before publishing preserves the previous snapshot for undo while
 * the operation event also drives persistence and Vizly version history.
 */
export const applyMindMapTreeExpansionTransaction = (
    mind: MindElixirInstance,
    expanded: boolean,
): boolean => {
    const previousData = mind.getData();
    const currentRoot = cleanAndValidateTree(previousData.nodeData, true);
    if (!hasMindMapTreeExpansionChange(currentRoot, expanded)) return false;

    const nodeData = setMindMapTreeExpanded(currentRoot, expanded);
    const nextData = { ...previousData, nodeData };
    refreshVizlyMindMapData(mind, nextData);
    try {
        emitVizlyMindMapOperation(mind, {
            name: expanded ? 'expandAllBranches' : 'collapseAllBranches',
            obj: nodeData,
        });
    } catch (operationError) {
        try {
            refreshVizlyMindMapData(mind, previousData);
        } catch (rollbackError) {
            throw new AggregateError(
                [operationError, rollbackError],
                'Mind map branch update failed and could not restore the previous map.',
                { cause: rollbackError },
            );
        }
        throw operationError;
    }
    return true;
};
