import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { emitVizlyMindMapOperation, refreshVizlyMindMapData } from './mindmapOperationBridge';
import { cleanAndValidateTree } from './mindmapTreeSanitizer';

type Side = 0 | 1;

function cloneNode(node: NodeObj): NodeObj {
    return {
        ...node,
        children: node.children?.map(cloneNode),
    };
}

function subtreeWeight(node: NodeObj): number {
    return 1 + (node.children ?? []).reduce((sum, child) => sum + subtreeWeight(child), 0);
}

function balanceRootChildren(root: NodeObj): NodeObj {
    const children = root.children ?? [];
    if (children.length === 0) return root;

    const weighted = children.map((child, index) => ({
        child,
        index,
        weight: subtreeWeight(child),
    }));

    const sideWeight: Record<Side, number> = { 0: 0, 1: 0 };
    const assigned = new Map<number, Side>();

    weighted
        .slice()
        .sort((a, b) => b.weight - a.weight || a.index - b.index)
        .forEach(item => {
            const side: Side = sideWeight[0] <= sideWeight[1] ? 0 : 1;
            assigned.set(item.index, side);
            sideWeight[side] += item.weight;
        });

    root.children = children.map((child, index) => ({
        ...child,
        direction: assigned.get(index) ?? (index % 2 === 0 ? 1 : 0),
    }));

    return root;
}

export function arrangeMindMapTree(root: NodeObj): NodeObj {
    const next = cloneNode(root);
    return balanceRootChildren(next);
}

export function hasMindMapAutoArrangeChange(current: NodeObj, arranged: NodeObj): boolean {
    const currentChildren = current.children ?? [];
    const arrangedChildren = arranged.children ?? [];
    if (currentChildren.length !== arrangedChildren.length) return true;
    return arrangedChildren.some((child, index) => (
        child.id !== currentChildren[index]?.id
        || child.direction !== currentChildren[index]?.direction
    ));
}

/**
 * Balance the root branches as one recoverable Mind Elixir transaction.
 * The operation event is intentionally omitted for a deterministic no-op so
 * repeated clicks do not consume undo history or create duplicate versions.
 */
export function applyMindMapAutoArrangeTransaction(mind: MindElixirInstance): boolean {
    const previousData = mind.getData();
    const currentRoot = cleanAndValidateTree(previousData.nodeData, true);
    const nodeData = arrangeMindMapTree(currentRoot);
    if (!hasMindMapAutoArrangeChange(currentRoot, nodeData)) return false;

    const nextData = { ...previousData, nodeData };
    refreshVizlyMindMapData(mind, nextData);
    try {
        mind.layout();
        emitVizlyMindMapOperation(mind, {
            name: 'autoArrangeMindmap',
            obj: nodeData,
        });
    } catch (operationError) {
        try {
            refreshVizlyMindMapData(mind, previousData);
        } catch (rollbackError) {
            throw new AggregateError(
                [operationError, rollbackError],
                'Mind map auto arrange failed and could not restore the previous map.',
                { cause: rollbackError },
            );
        }
        throw operationError;
    }
    return true;
}

export function getRootSideWeights(root: NodeObj): { left: number; right: number } {
    return (root.children ?? []).reduce(
        (acc, child) => {
            if (child.direction === 0) acc.left += subtreeWeight(child);
            else acc.right += subtreeWeight(child);
            return acc;
        },
        { left: 0, right: 0 }
    );
}
