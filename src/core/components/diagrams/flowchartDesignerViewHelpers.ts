import { useEffect } from 'react';
import type { Edge, Node } from '@xyflow/react';

import {
    CONTAINER_COLLAPSE_REQUEST_EVENT,
    readContainerCollapseRequest,
} from './containerCollapseRequest';
import { persistFlowchartOnboardingDismissed } from './flowchartOnboardingStorage';

export interface NodePositionUpdate {
    id: string;
    position: { x: number; y: number };
}

export const resolveFlowchartLayoutPresentation = ({
    nodes,
    displayEdges,
    editingEnabled,
    previewNodes,
}: Readonly<{
    nodes: Node[];
    displayEdges: Edge[];
    editingEnabled: boolean;
    previewNodes: Node[] | null;
}>): Readonly<{
    nodes: Node[];
    displayEdges: Edge[];
    editingEnabled: boolean;
}> => previewNodes
    ? { nodes: previewNodes, displayEdges: [], editingEnabled: false }
    : { nodes, displayEdges, editingEnabled };

export const applyFlowchartNodePositionUpdates = (
    nodes: Node[],
    updates: NodePositionUpdate[],
): Node[] => {
    const updatesById = new Map(updates.map(update => [update.id, update]));
    return nodes.map(node => {
        const update = updatesById.get(node.id);
        return update ? { ...node, position: update.position } : node;
    });
};

export const useContainerCollapseRequests = (toggleGroupCollapse: (nodeId: string) => void): void => {
    useEffect(() => {
        const handleCollapseRequest = (event: Event) => {
            const nodeId = readContainerCollapseRequest(event);
            if (nodeId) toggleGroupCollapse(nodeId);
        };
        window.addEventListener(CONTAINER_COLLAPSE_REQUEST_EVENT, handleCollapseRequest);
        return () => window.removeEventListener(CONTAINER_COLLAPSE_REQUEST_EVENT, handleCollapseRequest);
    }, [toggleGroupCollapse]);
};

export const dismissFlowchartOnboarding = (
    setOnboardingDismissed: (dismissed: boolean) => void,
): void => {
    setOnboardingDismissed(true);
    persistFlowchartOnboardingDismissed();
};
