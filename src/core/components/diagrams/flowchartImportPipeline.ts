import { parseDiagramJson } from '@/core/utils/diagramJsonImport';

import { logFlowchartDesignerMermaidImportFailure } from './flowchartDesignerLogging';
import { applyFlowchartJsonImportPlan, applyFlowchartMermaidImportPlan, createFlowchartImportFallbackId } from './flowchartImportApply';
import { buildFlowchartJsonImportPlan, type FlowchartImportPlugin } from './flowchartImportPlan';
import { buildFlowchartMermaidImportPlan } from './flowchartMermaidImport';

type ImportKind = 'json' | 'mermaid';

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
    setNodes: (nodes: any[]) => void;
    setEdges: (edges: any[]) => void;
    onStandardPluginSuccess: (count: number) => void;
    registerStandardReload: (payload: {
        normalized: any;
        currentId: string;
        title: string;
    }) => Promise<void>;
    onStandardReloadQueued: (currentId: string) => void;
    onReactFlowSuccess: (payload: { nodes: any[]; edges: any[] }) => void;
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
                fallbackTitle: typeof (data as any)?.name === 'string' ? (data as any).name : fallbackTitle,
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
        } catch (error: any) {
            onJsonImportFailure(error.message);
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
