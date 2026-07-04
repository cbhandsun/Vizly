export type EdgeRoutingNodePositionSnapshot = Map<string, { x: number; y: number }>;

export type EdgeRoutingSnapshotNode = {
    id: string;
    position?: { x?: number; y?: number };
    positionAbsolute?: { x?: number; y?: number };
    computed?: { positionAbsolute?: { x?: number; y?: number } };
};

export const EDGE_ROUTING_NODE_MOVE_THRESHOLD = 2;

function resolveNodeAbsolutePosition(node: EdgeRoutingSnapshotNode): { x: number; y: number } | null {
    const position = node.positionAbsolute ?? node.computed?.positionAbsolute ?? node.position;
    if (!position) return null;
    return {
        x: Number(position.x ?? 0),
        y: Number(position.y ?? 0),
    };
}

export function detectChangedEdgeRoutingNodes(
    allNodes: EdgeRoutingSnapshotNode[],
    snapshot: EdgeRoutingNodePositionSnapshot
): string[] {
    const changedIds: string[] = [];

    for (const node of allNodes) {
        const posAbs = resolveNodeAbsolutePosition(node);
        if (!posAbs) continue;

        const prev = snapshot.get(node.id);
        if (
            !prev
            || Math.abs(posAbs.x - prev.x) > EDGE_ROUTING_NODE_MOVE_THRESHOLD
            || Math.abs(posAbs.y - prev.y) > EDGE_ROUTING_NODE_MOVE_THRESHOLD
        ) {
            changedIds.push(node.id);
            snapshot.set(node.id, posAbs);
        }
    }

    if (snapshot.size > allNodes.length + 50) {
        const aliveIds = new Set(allNodes.map(node => node.id));
        for (const id of snapshot.keys()) {
            if (!aliveIds.has(id)) {
                snapshot.delete(id);
            }
        }
    }

    return changedIds;
}
