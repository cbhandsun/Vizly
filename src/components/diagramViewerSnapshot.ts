import { getFlowDataBridge } from '@vizly/core/diagram-data';
import { coerceClipboardData } from '@vizly/core/diagram-import';

export const readDiagramViewerBridgeSnapshot = (diagramId: string) => {
    const bridge = getFlowDataBridge(diagramId);
    // Bridge nodes are the exported document model; commands and AI context
    // need the live canvas nodes, including positions and current node data.
    const snapshot = typeof bridge?.getCanvasSnapshot === 'function'
        ? bridge.getCanvasSnapshot()
        : { nodes: bridge?.nodes, edges: bridge?.edges };
    return coerceClipboardData(snapshot) ?? { nodes: [], edges: [] };
};

// Non-React-Flow plugins expose semantic nodes without canvas positions.
// Supply positions only for validation of AI context, never for export.
export const readDiagramViewerAIContext = (diagramId: string) => {
    const snapshot = readDiagramViewerBridgeSnapshot(diagramId);
    if (snapshot.nodes.length > 0) return snapshot;
    const bridge = getFlowDataBridge(diagramId);
    const nodes = bridge?.nodes?.map(node => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
        const record = node as Record<string, unknown>;
        return { ...record, position: record.position ?? { x: 0, y: 0 } };
    });
    return coerceClipboardData({ nodes, edges: bridge?.edges }) ?? { nodes: [], edges: [] };
};
