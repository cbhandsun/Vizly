import type { Edge, Node } from '@xyflow/react';

import type { StandardDiagramData } from '@/core/models/DiagramModels';

import { runFlowchartImportPipeline } from './flowchartImportPipeline';
import {
    readFlowchartImportFileText,
    validateFlowchartImportFile,
} from './flowchartImportFile';
import type { FlowchartImportPlugin } from './flowchartImportPlan';

export type FlowchartImportEvent = {
    target: {
        files?: FileList | File[] | null;
        value: string;
    };
};

type MessageApiLike = {
    success: (message: string) => void;
    info: (message: string) => void;
    error: (message: string) => void;
};

export interface CreateFlowchartImportHandlerOptions {
    t: (key: string, params?: Record<string, unknown>) => string;
    messageApi: MessageApiLike;
    activePlugin?: FlowchartImportPlugin | null;
    businessDataId?: string;
    diagramId?: string;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    onBeforeCanvasReplace: () => void;
    editingEnabled?: boolean;
    fitView: () => void;
    scheduleDelay?: (callback: () => void, delayMs: number) => void;
    registerStandardReload: (payload: {
        normalized: StandardDiagramData;
        currentId: string;
        title: string;
    }) => Promise<void>;
    importInFlightRef?: { current: boolean };
    onImportStarted?: () => void;
    onImportFinished?: (result: { ok: boolean }) => void;
}

const DEFAULT_DELAY_SCHEDULER = (callback: () => void, delayMs: number): void => {
    setTimeout(callback, delayMs);
};

export const createFlowchartImportHandler = ({
    t,
    messageApi,
    activePlugin,
    businessDataId,
    diagramId,
    setNodes,
    setEdges,
    onBeforeCanvasReplace,
    editingEnabled = true,
    fitView,
    scheduleDelay = DEFAULT_DELAY_SCHEDULER,
    registerStandardReload,
    importInFlightRef,
    onImportStarted,
    onImportFinished,
}: CreateFlowchartImportHandlerOptions) => async (event: FlowchartImportEvent): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (importInFlightRef?.current) {
        messageApi.info(t('designer.flowchart.import.inProgress'));
        event.target.value = '';
        return;
    }

    if (!editingEnabled) {
        messageApi.info(t('designer.flowchart.import.editingRequired'));
        event.target.value = '';
        return;
    }

    const invalidFormatMessage = t('designer.flowchart.import.invalidFormat');
    const validation = validateFlowchartImportFile(file, invalidFormatMessage);
    if (!validation.ok) {
        messageApi.error(validation.error);
        onImportFinished?.({ ok: false });
        event.target.value = '';
        return;
    }

    if (importInFlightRef) importInFlightRef.current = true;
    let imported = false;
    try {
        onImportStarted?.();
        const content = await readFlowchartImportFileText(file);
        imported = await runFlowchartImportPipeline({
            content,
            importKind: validation.importKind,
            invalidFormatMessage,
            activePlugin,
            businessDataId,
            diagramId,
            fallbackTitle: 'Imported Diagram',
            openedAt: new Date().toISOString(),
            setNodes,
            setEdges,
            onBeforeCanvasReplace,
            onStandardPluginSuccess: (count) => {
                messageApi.success(t('designer.flowchart.import.standardSuccess', { count }));
                scheduleDelay(() => fitView(), 500);
            },
            registerStandardReload,
            onStandardReloadQueued: (reloadId) => {
                messageApi.success(t('designer.flowchart.import.reloading'));
                scheduleDelay(() => {
                    window.location.href = `/?diagram=${encodeURIComponent(reloadId)}`;
                }, 500);
            },
            onReactFlowSuccess: ({ nodes: importedNodes, edges: importedEdges }) => {
                messageApi.info(t('designer.flowchart.import.rfSuccess', {
                    nodes: importedNodes.length,
                    edges: importedEdges.length,
                }));
                scheduleDelay(() => fitView(), 500);
            },
            onJsonImportFailure: () => {
                messageApi.error(t('designer.flowchart.import.jsonFailed'));
            },
            onMermaidSuccess: () => {
                messageApi.info(t('designer.flowchart.import.mermaidSuccess'));
            },
            onMermaidLayoutHint: (delayMs) => {
                scheduleDelay(() => {
                    messageApi.info(t('designer.flowchart.import.mermaidLayout'));
                }, delayMs);
            },
            onMermaidImportFailure: () => {
                messageApi.error(t('designer.flowchart.import.mermaidFailed'));
            },
        });
    } catch {
        messageApi.error(t('designer.flowchart.import.readFailed'));
    } finally {
        if (importInFlightRef) importInFlightRef.current = false;
        onImportFinished?.({ ok: imported });
        event.target.value = '';
    }
};
