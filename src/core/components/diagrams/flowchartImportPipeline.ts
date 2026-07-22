import type { Edge, Node } from '@xyflow/react';

import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { parseDiagramJson } from '@/core/utils/diagramJsonImport';

import { logFlowchartDesignerMermaidImportFailure } from './flowchartDesignerLogging';
import { applyFlowchartJsonImportPlan, applyFlowchartMermaidImportPlan, createFlowchartImportFallbackId } from './flowchartImportApply';
import { buildFlowchartJsonImportPlan, type FlowchartImportPlugin } from './flowchartImportPlan';
import { buildFlowchartMermaidImportPlan } from './flowchartMermaidImport';

type ImportKind = 'json' | 'mermaid';

const readImportedDiagramTitle = (data: unknown, fallbackTitle: string): string => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fallbackTitle;
    const name = (data as Record<string, unknown>).name;
    return typeof name === 'string' ? name : fallbackTitle;
};

const readImportErrorMessage = (error: unknown, fallbackMessage: string): string => (
    error instanceof Error ? error.message : fallbackMessage
);

export const runFlowchartImportPipeline = async ({
    content,
    importKind,
    invalidFormatMessage,
    activePlugin,
    businessDataId,
    diagramId,
    fallbackTitle,
    openedAt,
    setNodes,
    setEdges,
    onStandardPluginSuccess,
    registerStandardReload,
    onStandardReloadQueued,
    onReactFlowSuccess,
    onJsonImportFailure,
    onMermaidSuccess,
    onMermaidLayoutHint,
    onMermaidImportFailure,
}: {
    content: string;
    importKind: ImportKind;
    invalidFormatMessage: string;
    activePlugin?: FlowchartImportPlugin | null;
    businessDataId?: string;
    diagramId?: string;
    fallbackTitle: string;
    openedAt: string;
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
    onJsonImportFailure: (message: string) => void;
    onMermaidSuccess: () => void;
    onMermaidLayoutHint: (delayMs: number) => void;
    onMermaidImportFailure: () => void;
}): Promise<void> => {
    if (importKind === 'json') {
        try {
            const data = parseDiagramJson(content);
            const currentId = createFlowchartImportFallbackId({
                businessDataId,
                diagramId,
            });
            const importPlan = buildFlowchartJsonImportPlan({
                data,
                activePlugin,
                fallbackId: currentId,
                fallbackTitle: readImportedDiagramTitle(data, fallbackTitle),
                openedAt,
                invalidFormatMessage,
            });
            await applyFlowchartJsonImportPlan({
                importPlan,
                setNodes,
                setEdges,
                onStandardPluginSuccess,
                registerStandardReload,
                onStandardReloadQueued,
                onReactFlowSuccess,
            });
        } catch (error: unknown) {
            onJsonImportFailure(readImportErrorMessage(error, invalidFormatMessage));
        }
        return;
    }

    try {
        const importPlan = buildFlowchartMermaidImportPlan(content);
        applyFlowchartMermaidImportPlan({
            importPlan,
            setNodes,
            setEdges,
            onMermaidSuccess,
            onMermaidLayoutHint,
        });
    } catch (error) {
        logFlowchartDesignerMermaidImportFailure(error);
        onMermaidImportFailure();
    }
};
