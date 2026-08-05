import type { Node } from '@xyflow/react';

export type NodeLayerDirection = 'front' | 'back';

type ParentScope = string | null;

const getParentScope = (node: Node): ParentScope => node.parentId ?? null;

const nodeOrderMatches = (left: readonly Node[], right: readonly Node[]): boolean => (
    left.length === right.length
    && left.every((node, index) => node.id === right[index]?.id)
);

/**
 * React Flow requires every parent node to appear before its children. Layer
 * operations must preserve that invariant even when legacy or imported data is
 * not already ordered correctly.
 */
export const ensureParentsPrecedeChildren = (nodes: readonly Node[]): Node[] => {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: Node[] = [];

    const visit = (node: Node) => {
        if (visited.has(node.id)) return;
        if (visiting.has(node.id)) return;

        visiting.add(node.id);
        if (node.parentId) {
            const parent = nodeById.get(node.parentId);
            if (parent) visit(parent);
        }
        visiting.delete(node.id);

        if (visited.has(node.id)) return;
        visited.add(node.id);
        ordered.push(node);
    };

    nodes.forEach(visit);
    return nodeOrderMatches(nodes, ordered) ? [...nodes] : ordered;
};

/**
 * Moves every target to the front/back of its own parent scope while keeping
 * the targets' relative order. Scoping prevents a child from being treated as
 * a root node, and the final parent-first pass protects React Flow subflows.
 */
export const reorderNodesWithinParentScopes = (
    nodes: readonly Node[],
    targetIds: ReadonlySet<string>,
    direction: NodeLayerDirection,
): { nodes: Node[]; changed: boolean } => {
    if (nodes.length < 2 || targetIds.size === 0) {
        return { nodes: [...nodes], changed: false };
    }

    const scopes = new Map<ParentScope, { indexes: number[]; nodes: Node[] }>();
    nodes.forEach((node, index) => {
        const key = getParentScope(node);
        const scope = scopes.get(key) ?? { indexes: [], nodes: [] };
        scope.indexes.push(index);
        scope.nodes.push(node);
        scopes.set(key, scope);
    });

    const reordered = [...nodes];
    let changed = false;

    scopes.forEach((scope) => {
        const targets = scope.nodes.filter(node => targetIds.has(node.id));
        if (targets.length === 0 || targets.length === scope.nodes.length) return;

        const untouched = scope.nodes.filter(node => !targetIds.has(node.id));
        const nextScope = direction === 'front'
            ? [...untouched, ...targets]
            : [...targets, ...untouched];

        if (nodeOrderMatches(scope.nodes, nextScope)) return;
        changed = true;
        scope.indexes.forEach((index, scopeIndex) => {
            reordered[index] = nextScope[scopeIndex];
        });
    });

    if (!changed) return { nodes: [...nodes], changed: false };

    const safeOrder = ensureParentsPrecedeChildren(reordered);
    return {
        nodes: safeOrder,
        changed: !nodeOrderMatches(nodes, safeOrder),
    };
};
