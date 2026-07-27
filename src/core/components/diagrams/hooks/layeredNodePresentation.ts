import type { Node } from '@xyflow/react';
import type { LayerConfig } from './useLayerManagement';

type LayeredNodePresentationValues = {
    hidden: boolean;
    draggable: boolean;
    selectable: boolean;
    zIndex: number;
};

export type LayeredNodePresentationCacheEntry = LayeredNodePresentationValues & {
    source: Node;
    rendered: Node;
};

export type LayeredNodePresentationCache = Map<string, LayeredNodePresentationCacheEntry>;

const resolveNodeDepth = (
    nodeId: string,
    nodeMap: Map<string, Node>,
    visited = new Set<string>(),
): number => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node?.parentId) return 0;
    return 1 + resolveNodeDepth(node.parentId, nodeMap, visited);
};

const resolveSelectionElevation = (
    nodeId: string,
    nodeMap: Map<string, Node>,
    visited = new Set<string>(),
): number => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node?.parentId) return 0;
    const parent = nodeMap.get(node.parentId);
    if (parent?.selected || parent?.dragging) return 2000;
    return resolveSelectionElevation(node.parentId, nodeMap, visited);
};

const presentationValuesMatch = (
    entry: LayeredNodePresentationCacheEntry,
    values: LayeredNodePresentationValues,
): boolean => (
    entry.hidden === values.hidden
    && entry.draggable === values.draggable
    && entry.selectable === values.selectable
    && entry.zIndex === values.zIndex
);

/**
 * Reconciles layer-derived display properties while preserving object identity
 * for unaffected nodes. React Flow uses node identity as a render boundary, so
 * cloning every descendant during a single-node drag forces a full DOM update.
 */
export const reconcileLayeredNodePresentation = ({
    nodes,
    getLayer,
    previous,
}: {
    nodes: Node[];
    getLayer: (id: string) => LayerConfig | undefined;
    previous: LayeredNodePresentationCache;
}): Node[] => {
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const depths = new Map(nodes.map(node => [node.id, resolveNodeDepth(node.id, nodeMap)]));
    const nextCache: LayeredNodePresentationCache = new Map();

    const renderedNodes = nodes.map((node) => {
        const layerId = String(node.data?.layer || 'layer-0');
        const layer = getLayer(layerId);
        const depth = depths.get(node.id) || 0;
        const values: LayeredNodePresentationValues = {
            hidden: !(layer?.visible ?? true) || Boolean(node.hidden),
            draggable: !(layer?.locked ?? false) && node.draggable !== false,
            selectable: !(layer?.locked ?? false) && node.selectable !== false,
            zIndex: (layer?.zIndex ?? 0) * 100
                + (Number(node.style?.zIndex) || 0)
                + depth * 10
                + resolveSelectionElevation(node.id, nodeMap),
        };

        const cached = previous.get(node.id);
        if (cached?.source === node && presentationValuesMatch(cached, values)) {
            nextCache.set(node.id, cached);
            return cached.rendered;
        }

        const matchesSource = values.hidden === Boolean(node.hidden)
            && values.draggable === (node.draggable !== false)
            && values.selectable === (node.selectable !== false)
            && values.zIndex === (Number(node.style?.zIndex) || 0);
        const rendered = matchesSource
            ? node
            : {
                ...node,
                hidden: values.hidden,
                draggable: values.draggable,
                selectable: values.selectable,
                style: {
                    ...node.style,
                    zIndex: values.zIndex,
                },
            };

        nextCache.set(node.id, {
            source: node,
            rendered,
            ...values,
        });
        return rendered;
    });

    previous.clear();
    nextCache.forEach((entry, id) => previous.set(id, entry));
    return renderedNodes;
};
