import type { Edge, Node } from '@xyflow/react';

const DEFAULT_NODE_WIDTH = 120;
const DEFAULT_NODE_HEIGHT = 40;
const DEFAULT_MEASURED_WIDTH = 160;
const DEFAULT_MEASURED_HEIGHT = 60;

const defaultCreateInsertedNodeId = (): string => (
    `inserted-${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
);

const defaultCreateInsertedEdgeId = (source: string, target: string): string => (
    `${source}-${target}-${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
);

const getNodeCenter = (node: Node): { x: number; y: number } => ({
    x: node.position.x + (node.measured?.width ?? DEFAULT_MEASURED_WIDTH) / 2,
    y: node.position.y + (node.measured?.height ?? DEFAULT_MEASURED_HEIGHT) / 2,
});

export interface FlowchartEdgeInsertionPlan {
    node: Node;
    replacementEdges: [Edge, Edge];
}

export const buildFlowchartEdgeInsertionPlan = ({
    edge,
    nodes,
    label,
    createNodeId = defaultCreateInsertedNodeId,
    createEdgeId = defaultCreateInsertedEdgeId,
}: {
    edge: Edge;
    nodes: Node[];
    label: string;
    createNodeId?: () => string;
    createEdgeId?: (source: string, target: string) => string;
}): FlowchartEdgeInsertionPlan | null => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) {
        return null;
    }

    const sourceCenter = getNodeCenter(sourceNode);
    const targetCenter = getNodeCenter(targetNode);
    const insertedNodeId = createNodeId();
    const middleX = (sourceCenter.x + targetCenter.x) / 2 - DEFAULT_NODE_WIDTH / 2;
    const middleY = (sourceCenter.y + targetCenter.y) / 2 - DEFAULT_NODE_HEIGHT / 2;

    const node: Node = {
        id: insertedNodeId,
        type: 'custom',
        position: { x: middleX, y: middleY },
        data: { label, shape: 'roundedRect' },
    };

    const sharedEdgeProps = {
        type: edge.type,
        style: edge.style,
        markerEnd: edge.markerEnd,
        markerStart: edge.markerStart,
        animated: edge.animated,
    };

    return {
        node,
        replacementEdges: [
            {
                ...sharedEdgeProps,
                id: createEdgeId(edge.source, insertedNodeId),
                source: edge.source,
                target: insertedNodeId,
            },
            {
                ...sharedEdgeProps,
                id: createEdgeId(insertedNodeId, edge.target),
                source: insertedNodeId,
                target: edge.target,
            },
        ],
    };
};

export const commitFlowchartEdgeInsertion = ({
    nodes,
    edges,
    replacedEdgeId,
    plan,
}: {
    nodes: Node[];
    edges: Edge[];
    replacedEdgeId: string;
    plan: FlowchartEdgeInsertionPlan;
}): { nodes: Node[]; edges: Edge[] } => ({
    nodes: [
        ...nodes.map(node => node.selected ? { ...node, selected: false } : node),
        { ...plan.node, selected: true },
    ],
    edges: [
        ...edges
            .filter(edge => edge.id !== replacedEdgeId)
            .map(edge => edge.selected ? { ...edge, selected: false } : edge),
        ...plan.replacementEdges.map(edge => ({ ...edge, selected: false })),
    ],
});
