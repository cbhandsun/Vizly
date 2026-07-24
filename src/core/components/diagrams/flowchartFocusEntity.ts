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

const FLOWCHART_ENTITY_ID_MAX_CHARS = 256;
const FLOWCHART_FOCUS_MIN_ZOOM = 0.1;
const FLOWCHART_FOCUS_MAX_ZOOM = 4;

const containsControlCharacter = (value: string): boolean => (
    Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1F || codePoint === 0x7F;
    })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const coerceEntityId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (
        !normalized
        || normalized.length > FLOWCHART_ENTITY_ID_MAX_CHARS
        || containsControlCharacter(normalized)
    ) {
        return undefined;
    }
    return normalized;
};

export const coerceFlowchartFocusEntityDetail = (value: unknown): FlowchartFocusEntityDetail | null => {
    if (!isRecord(value)) return null;

    const nodeId = coerceEntityId(value.nodeId);
    const edgeId = coerceEntityId(value.edgeId);
    if ((nodeId ? 1 : 0) + (edgeId ? 1 : 0) !== 1) return null;

    if (value.preserveZoom !== undefined && typeof value.preserveZoom !== 'boolean') return null;

    let zoom: number | undefined;
    if (value.zoom !== undefined) {
        if (
            typeof value.zoom !== 'number'
            || !Number.isFinite(value.zoom)
            || value.zoom < FLOWCHART_FOCUS_MIN_ZOOM
            || value.zoom > FLOWCHART_FOCUS_MAX_ZOOM
        ) {
            return null;
        }
        zoom = value.zoom;
    }

    return {
        ...(nodeId ? { nodeId } : {}),
        ...(edgeId ? { edgeId } : {}),
        ...(typeof value.preserveZoom === 'boolean' ? { preserveZoom: value.preserveZoom } : {}),
        ...(zoom !== undefined ? { zoom } : {}),
    };
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
    detail: unknown;
    setSelectedNodes: (nodes: Node[]) => void;
    setSelectedEdges: (edges: Edge[]) => void;
}): boolean => {
    const safeDetail = coerceFlowchartFocusEntityDetail(detail);
    if (!safeDetail) return false;

    if (safeDetail.nodeId) {
        return focusFlowchartNode({
            reactFlowInstance,
            nodes,
            nodeId: safeDetail.nodeId,
            setSelectedNodes,
            setSelectedEdges,
            duration: 600,
            zoom: getTargetZoom(reactFlowInstance, safeDetail),
            preserveZoom: safeDetail.preserveZoom,
        });
    }

    if (safeDetail.edgeId) {
        return focusFlowchartEdge({
            reactFlowInstance,
            nodes,
            edges,
            edgeId: safeDetail.edgeId,
            setSelectedNodes,
            setSelectedEdges,
            duration: 600,
            zoom: getTargetZoom(reactFlowInstance, safeDetail),
            preserveZoom: safeDetail.preserveZoom,
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
    event: { detail?: unknown }
): boolean => handleFlowchartFocusEntity({
    reactFlowInstance,
    nodes,
    edges,
    detail: event.detail,
    setSelectedNodes,
    setSelectedEdges,
});
