import type { NodeObj } from 'mind-elixir';

export type MindMapBranchSide = 'left' | 'right';

export interface MindMapBridgeNode {
    id: string;
    type: 'mindmap';
    data: {
        label: string;
        depth: number;
        side?: MindMapBranchSide;
        parentId?: string;
        note?: string;
        url?: string;
        tags?: string[];
        icons?: string[];
    };
}

export interface MindMapBridgeEdge {
    id: string;
    source: string;
    target: string;
}

export interface MindMapBridgeProjection {
    nodes: MindMapBridgeNode[];
    edges: MindMapBridgeEdge[];
}

type NodeWithSide = NodeObj & { side?: unknown };

const readBranchSide = (value: unknown, fallback: MindMapBranchSide): MindMapBranchSide => (
    value === 'left' || value === 'right' ? value : fallback
);

const projectTags = (tags: NodeObj['tags']): string[] | undefined => {
    if (!Array.isArray(tags)) return undefined;
    const projected = tags
        .map((tag) => typeof tag === 'string' ? tag : tag.text)
        .map((tag) => tag.trim())
        .filter(Boolean);
    return projected.length > 0 ? projected : undefined;
};

export const projectMindMapTreeToBridge = (
    root: NodeObj,
    parentId: string | null = null,
    depth = 0,
    inheritedSide: MindMapBranchSide = 'right',
): MindMapBridgeProjection => {
    const nodes: MindMapBridgeNode[] = [];
    const edges: MindMapBridgeEdge[] = [];
    const nodeSide = readBranchSide((root as NodeWithSide).side, inheritedSide);

    nodes.push({
        id: root.id,
        type: 'mindmap',
        data: {
            label: root.topic,
            depth,
            side: root.id === 'root' ? undefined : nodeSide,
            parentId: parentId ?? undefined,
            note: root.note,
            url: root.hyperLink,
            tags: projectTags(root.tags),
            icons: root.icons,
        },
    });

    if (parentId) {
        edges.push({
            id: `edge_${parentId}_${root.id}`,
            source: parentId,
            target: root.id,
        });
    }

    for (const child of root.children ?? []) {
        const childProjection = projectMindMapTreeToBridge(child, root.id, depth + 1, nodeSide);
        nodes.push(...childProjection.nodes);
        edges.push(...childProjection.edges);
    }

    return { nodes, edges };
};
