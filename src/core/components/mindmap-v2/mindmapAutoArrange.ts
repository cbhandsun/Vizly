import type { NodeObj } from 'mind-elixir';

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
