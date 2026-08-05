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

export type FlowchartImportStatus = 'success' | 'failure' | 'scope-changed';
export type FlowchartImportResult = {
    status: FlowchartImportStatus;
    detail?: string;
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
    onImportFinished?: (result: FlowchartImportResult) => void;
    getOperationScope?: () => string;
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
    getOperationScope,
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
    const validation = validateFlowchartImportFile(file, {
        invalidFormat: invalidFormatMessage,
        emptyFile: t('designer.flowchart.import.emptyFile'),
        invalidSize: t('designer.flowchart.import.invalidSize'),
        tooLarge: (params) => t('designer.flowchart.import.tooLarge', params),
    });
    if (!validation.ok) {
        messageApi.error(validation.error);
        onImportFinished?.({ status: 'failure', detail: validation.error });
        event.target.value = '';
        return;
    }

    if (importInFlightRef) importInFlightRef.current = true;
    const initialOperationScope = getOperationScope?.();
    const isOperationCurrent = () => (
        initialOperationScope === undefined || getOperationScope?.() === initialOperationScope
    );
    const scheduleIfCurrent = (callback: () => void, delayMs: number) => {
        scheduleDelay(() => {
            if (isOperationCurrent()) callback();
        }, delayMs);
    };
    let status: FlowchartImportStatus = 'failure';
    let failureDetail: string | undefined;
    try {
        onImportStarted?.();
        const content = await readFlowchartImportFileText(file);
        if (!isOperationCurrent()) {
            status = 'scope-changed';
            return;
        }
        if (!content.trim()) {
            failureDetail = t('designer.flowchart.import.emptyFile');
            messageApi.error(failureDetail);
            return;
        }
        const imported = await runFlowchartImportPipeline({
            content,
            importKind: validation.importKind,
            invalidFormatMessage,
            activePlugin,
            businessDataId,
            diagramId,
            fallbackTitle: 'Imported Diagram',
            openedAt: new Date().toISOString(),
            setNodes: (nextNodes) => {
                if (isOperationCurrent()) setNodes(nextNodes);
            },
            setEdges: (nextEdges) => {
                if (isOperationCurrent()) setEdges(nextEdges);
            },
            onBeforeCanvasReplace,
            onStandardPluginSuccess: (count) => {
                if (!isOperationCurrent()) return;
                messageApi.success(t('designer.flowchart.import.standardSuccess', { count }));
                scheduleIfCurrent(fitView, 500);
            },
            registerStandardReload: async (payload) => {
                if (!isOperationCurrent()) return;
                await registerStandardReload(payload);
            },
            onStandardReloadQueued: (reloadId) => {
                if (!isOperationCurrent()) return;
                messageApi.success(t('designer.flowchart.import.reloading'));
                scheduleIfCurrent(() => {
                    window.location.href = `/?diagram=${encodeURIComponent(reloadId)}`;
                }, 500);
            },
            onReactFlowSuccess: ({ nodes: importedNodes, edges: importedEdges }) => {
                if (!isOperationCurrent()) return;
                messageApi.info(t('designer.flowchart.import.rfSuccess', {
                    nodes: importedNodes.length,
                    edges: importedEdges.length,
                }));
                scheduleIfCurrent(fitView, 500);
            },
            onJsonImportFailure: () => {
                if (!isOperationCurrent()) return;
                failureDetail = t('designer.flowchart.import.jsonFailed');
                messageApi.error(failureDetail);
            },
            onMermaidSuccess: () => {
                if (!isOperationCurrent()) return;
                messageApi.info(t('designer.flowchart.import.mermaidSuccess'));
            },
            onMermaidLayoutHint: (delayMs) => {
                scheduleIfCurrent(() => {
                    messageApi.info(t('designer.flowchart.import.mermaidLayout'));
                }, delayMs);
            },
            onMermaidImportFailure: () => {
                if (!isOperationCurrent()) return;
                failureDetail = t('designer.flowchart.import.mermaidFailed');
                messageApi.error(failureDetail);
            },
        });
        status = isOperationCurrent()
            ? (imported ? 'success' : 'failure')
            : 'scope-changed';
    } catch {
        if (isOperationCurrent()) {
            failureDetail = t('designer.flowchart.import.readFailed');
            messageApi.error(failureDetail);
        } else {
            status = 'scope-changed';
        }
    } finally {
        if (importInFlightRef) importInFlightRef.current = false;
        onImportFinished?.(status === 'failure' && failureDetail
            ? { status, detail: failureDetail }
            : { status });
        event.target.value = '';
    }
};
