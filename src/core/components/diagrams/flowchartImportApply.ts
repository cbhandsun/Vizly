import type { Edge, Node } from '@xyflow/react';

import type { StandardDiagramData } from '@/core/models/DiagramModels';

import type { FlowchartJsonImportPlan } from './flowchartImportPlan';
import type { FlowchartMermaidImportPlan } from './flowchartMermaidImport';

export const createFlowchartImportFallbackId = ({
    businessDataId,
    diagramId,
    createId = () => `imported_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
}: {
    businessDataId?: string;
    diagramId?: string;
    createId?: () => string;
}): string => businessDataId || diagramId || createId();

export const applyFlowchartJsonImportPlan = async ({
    importPlan,
    setNodes,
    setEdges,
    onStandardPluginSuccess,
    registerStandardReload,
    onStandardReloadQueued,
    onReactFlowSuccess,
}: {
    importPlan: FlowchartJsonImportPlan;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    onStandardPluginSuccess: (count: number) => void;
    registerStandardReload: (payload: {
        normalized: StandardDiagramData;
        currentId: string;
        title: string;
    }) => Promise<void>;
    onStandardReloadQueued: (currentId: string) => void;
    onReactFlowSuccess: (payload: { nodes: Node[]; edges: Edge[] }) => void;
}): Promise<void> => {
    if (importPlan.kind === 'standard-plugin') {
        setNodes(importPlan.nodes);
        setEdges(importPlan.edges);
        onStandardPluginSuccess(importPlan.nodes.length);
        return;
    }

    if (importPlan.kind === 'standard-reload') {
        await registerStandardReload({
            normalized: importPlan.normalized,
            currentId: importPlan.currentId,
            title: importPlan.title,
        });
        onStandardReloadQueued(importPlan.currentId);
        return;
    }

    setNodes(importPlan.nodes);
    setEdges(importPlan.edges);
    onReactFlowSuccess({
        nodes: importPlan.nodes,
        edges: importPlan.edges,
    });
};

export const applyFlowchartMermaidImportPlan = ({
    importPlan,
    setNodes,
    setEdges,
    onMermaidSuccess,
    onMermaidLayoutHint,
}: {
    importPlan: FlowchartMermaidImportPlan;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    onMermaidSuccess: () => void;
    onMermaidLayoutHint: (delayMs: number) => void;
}): void => {
    setNodes(importPlan.nodes);
    setEdges(importPlan.edges);
    onMermaidSuccess();
    onMermaidLayoutHint(importPlan.layoutHintDelayMs);
};
