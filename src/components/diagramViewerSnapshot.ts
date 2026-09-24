import {
    getFlowDataBridgeEdges,
    getFlowDataBridgeNodes,
} from '@vizly/core/diagram-data';
import { coerceClipboardData } from '@vizly/core/diagram-import';

export const readDiagramViewerBridgeSnapshot = (diagramId: string) => coerceClipboardData({
    nodes: getFlowDataBridgeNodes(diagramId),
    edges: getFlowDataBridgeEdges(diagramId),
}) ?? { nodes: [], edges: [] };
