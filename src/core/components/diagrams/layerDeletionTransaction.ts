import type { Edge, Node } from '@xyflow/react';

export interface LayerDeletionContentSnapshot {
    sourceLayerId: string;
    fallbackLayerId: string;
    nodeIds: ReadonlySet<string>;
    edgeIds: ReadonlySet<string>;
}

const hasLayer = (item: Node | Edge, layerId: string): boolean => (
    item.data?.layer === layerId
);

const moveItemToLayer = <T extends Node | Edge>(item: T, layerId: string): T => ({
    ...item,
    data: {
        ...item.data,
        layer: layerId,
    },
});

export const createLayerDeletionContentSnapshot = (
    nodes: readonly Node[],
    edges: readonly Edge[],
    sourceLayerId: string,
    fallbackLayerId: string,
): LayerDeletionContentSnapshot => ({
    sourceLayerId,
    fallbackLayerId,
    nodeIds: new Set(nodes.filter(node => hasLayer(node, sourceLayerId)).map(node => node.id)),
    edgeIds: new Set(edges.filter(edge => hasLayer(edge, sourceLayerId)).map(edge => edge.id)),
});

const moveMatchingItems = <T extends Node | Edge>(
    items: readonly T[],
    sourceLayerId: string,
    fallbackLayerId: string,
): T[] => {
    let changed = false;
    const nextItems = items.map(item => {
        if (!hasLayer(item, sourceLayerId)) return item;
        changed = true;
        return moveItemToLayer(item, fallbackLayerId);
    });
    return changed ? nextItems : items.slice();
};

export const moveDeletedLayerNodes = (
    nodes: readonly Node[],
    sourceLayerId: string,
    fallbackLayerId: string,
): Node[] => moveMatchingItems(nodes, sourceLayerId, fallbackLayerId);

export const moveDeletedLayerEdges = (
    edges: readonly Edge[],
    sourceLayerId: string,
    fallbackLayerId: string,
): Edge[] => moveMatchingItems(edges, sourceLayerId, fallbackLayerId);

const restoreMatchingItems = <T extends Node | Edge>(
    items: readonly T[],
    ids: ReadonlySet<string>,
    fallbackLayerId: string,
    sourceLayerId: string,
): T[] => {
    let changed = false;
    const nextItems = items.map(item => {
        if (!ids.has(item.id) || !hasLayer(item, fallbackLayerId)) return item;
        changed = true;
        return moveItemToLayer(item, sourceLayerId);
    });
    return changed ? nextItems : items.slice();
};

export const restoreDeletedLayerNodes = (
    nodes: readonly Node[],
    snapshot: LayerDeletionContentSnapshot,
): Node[] => restoreMatchingItems(
    nodes,
    snapshot.nodeIds,
    snapshot.fallbackLayerId,
    snapshot.sourceLayerId,
);

export const restoreDeletedLayerEdges = (
    edges: readonly Edge[],
    snapshot: LayerDeletionContentSnapshot,
): Edge[] => restoreMatchingItems(
    edges,
    snapshot.edgeIds,
    snapshot.fallbackLayerId,
    snapshot.sourceLayerId,
);
