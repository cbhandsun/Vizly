export type SmartEdgePoint = { x: number; y: number };

export type SmartEdgeNodeData = Record<string, unknown> & {
    domain?: unknown;
    subDomain?: unknown;
};

export type SmartEdgeNode = {
    id?: string;
    type?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    dragging?: boolean;
    parentId?: string;
    parentNode?: string;
    position?: SmartEdgePoint;
    positionAbsolute?: SmartEdgePoint;
    computed?: { positionAbsolute?: SmartEdgePoint };
    internals?: { positionAbsolute?: SmartEdgePoint };
    measured?: { width?: number; height?: number };
    data?: SmartEdgeNodeData;
};

const finiteCoordinate = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const readFinitePoint = (value: SmartEdgePoint | undefined): SmartEdgePoint | undefined => {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined;
    return { x: value.x, y: value.y };
};

const readCoercedPoint = (value: SmartEdgePoint | undefined): SmartEdgePoint | undefined => (
    value ? { x: finiteCoordinate(value.x), y: finiteCoordinate(value.y) } : undefined
);

export const createSmartEdgeAbsolutePositionResolver = <
    TLiveNode extends SmartEdgeNode,
    TSimpleNode extends SmartEdgeNode,
>(
    liveNodeLookup: ReadonlyMap<string, TLiveNode> | undefined,
    simpleNodeMap: ReadonlyMap<string, TSimpleNode>,
): ((id: string) => SmartEdgePoint) => {
    const findNode = (id: string): SmartEdgeNode | undefined => (
        liveNodeLookup?.get(id) ?? simpleNodeMap.get(id)
    );

    const resolve = (nodeKey: string, node: SmartEdgeNode, visited: Set<string>): SmartEdgePoint => {
        const absolute = readFinitePoint(node.internals?.positionAbsolute)
            ?? readFinitePoint(node.computed?.positionAbsolute)
            ?? readFinitePoint(node.positionAbsolute);
        if (absolute) return absolute;

        const positioned = readCoercedPoint(node.position);
        const base = positioned ?? {
            x: finiteCoordinate(node.x),
            y: finiteCoordinate(node.y),
        };
        const parentId = node.parentId || node.parentNode;
        if (!parentId) return base;

        if (visited.has(nodeKey)) return base;
        visited.add(nodeKey);

        const parentKey = String(parentId);
        const parent = findNode(parentKey);
        if (!parent) return base;
        const parentAbsolute = resolve(parentKey, parent, visited);
        return {
            x: parentAbsolute.x + base.x,
            y: parentAbsolute.y + base.y,
        };
    };

    return (id: string): SmartEdgePoint => {
        const node = findNode(String(id));
        return node ? resolve(String(id), node, new Set<string>()) : { x: 0, y: 0 };
    };
};
