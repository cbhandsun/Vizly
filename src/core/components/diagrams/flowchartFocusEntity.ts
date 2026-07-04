import type { Edge, Node } from '@xyflow/react';

type SetCenterOptions = {
    duration?: number;
    zoom?: number;
};

type ReactFlowFocusApi = {
    getZoom: () => number;
    setCenter: (x: number, y: number, options?: SetCenterOptions) => void;
};

export type FlowchartFocusEntityDetail = {
    nodeId?: string;
    edgeId?: string;
    preserveZoom?: boolean;
    zoom?: number;
};

const getTargetZoom = (
    reactFlowInstance: ReactFlowFocusApi | null | undefined,
    detail: FlowchartFocusEntityDetail
): number => {
    if (!reactFlowInstance) {
        return detail.zoom || 1.2;
    }

    return detail.preserveZoom ? reactFlowInstance.getZoom() : (detail.zoom || 1.2);
};

export const focusFlowchartNode = ({
    reactFlowInstance,
    nodes,
    nodeId,
    setSelectedNodes,
    setSelectedEdges,
    duration = 600,
    zoom = 1.2,
    preserveZoom = false,
}: {
    reactFlowInstance: ReactFlowFocusApi | null | undefined;
    nodes: Node[];
    nodeId: string;
    setSelectedNodes: (nodes: Node[]) => void;
    setSelectedEdges?: (edges: Edge[]) => void;
    duration?: number;
    zoom?: number;
    preserveZoom?: boolean;
}): boolean => {
    if (!reactFlowInstance) return false;

    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return false;

    const targetZoom = preserveZoom ? reactFlowInstance.getZoom() : zoom;
    reactFlowInstance.setCenter(
        node.position.x + (node.measured?.width || 100) / 2,
        node.position.y + (node.measured?.height || 50) / 2,
        { duration, zoom: targetZoom }
    );
    setSelectedNodes(nodes.filter((item) => item.id === nodeId));
    setSelectedEdges?.([]);
    return true;
};

export const focusFlowchartEdge = ({
    reactFlowInstance,
    nodes,
    edges,
    edgeId,
    setSelectedNodes,
    setSelectedEdges,
    duration = 600,
    zoom = 1.2,
    preserveZoom = false,
}: {
    reactFlowInstance: ReactFlowFocusApi | null | undefined;
    nodes: Node[];
    edges: Edge[];
    edgeId: string;
    setSelectedNodes: (nodes: Node[]) => void;
    setSelectedEdges: (edges: Edge[]) => void;
    duration?: number;
    zoom?: number;
    preserveZoom?: boolean;
}): boolean => {
    if (!reactFlowInstance) return false;

    const edge = edges.find((item) => item.id === edgeId);
    if (!edge) return false;

    const sourceNode = nodes.find((item) => item.id === edge.source);
    const targetNode = nodes.find((item) => item.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    const targetZoom = preserveZoom ? reactFlowInstance.getZoom() : zoom;
    reactFlowInstance.setCenter(
        (sourceNode.position.x + targetNode.position.x) / 2,
        (sourceNode.position.y + targetNode.position.y) / 2,
        { duration, zoom: targetZoom }
    );
    setSelectedEdges(edges.filter((item) => item.id === edgeId));
    setSelectedNodes([]);
    return true;
};

export const handleFlowchartFocusEntity = ({
    reactFlowInstance,
    nodes,
    edges,
    detail,
    setSelectedNodes,
    setSelectedEdges,
}: {
    reactFlowInstance: ReactFlowFocusApi | null | undefined;
    nodes: Node[];
    edges: Edge[];
    detail: FlowchartFocusEntityDetail;
    setSelectedNodes: (nodes: Node[]) => void;
    setSelectedEdges: (edges: Edge[]) => void;
}): boolean => {
    if (detail.nodeId) {
        return focusFlowchartNode({
            reactFlowInstance,
            nodes,
            nodeId: detail.nodeId,
            setSelectedNodes,
            setSelectedEdges,
            duration: 600,
            zoom: getTargetZoom(reactFlowInstance, detail),
            preserveZoom: detail.preserveZoom,
        });
    }

    if (detail.edgeId) {
        return focusFlowchartEdge({
            reactFlowInstance,
            nodes,
            edges,
            edgeId: detail.edgeId,
            setSelectedNodes,
            setSelectedEdges,
            duration: 600,
            zoom: getTargetZoom(reactFlowInstance, detail),
            preserveZoom: detail.preserveZoom,
        });
    }

    return false;
};

export const createFlowchartFocusEntityEventHandler = ({
    reactFlowInstance,
    nodes,
    edges,
    setSelectedNodes,
    setSelectedEdges,
}: {
    reactFlowInstance: ReactFlowFocusApi | null | undefined;
    nodes: Node[];
    edges: Edge[];
    setSelectedNodes: (nodes: Node[]) => void;
    setSelectedEdges: (edges: Edge[]) => void;
}) => (
    event: Pick<CustomEvent<FlowchartFocusEntityDetail>, 'detail'>
): boolean => handleFlowchartFocusEntity({
    reactFlowInstance,
    nodes,
    edges,
    detail: event.detail,
    setSelectedNodes,
    setSelectedEdges,
});
