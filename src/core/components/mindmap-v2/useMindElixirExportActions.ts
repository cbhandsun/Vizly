import { useCallback } from 'react';
import type { MindElixirInstance } from 'mind-elixir';

import { downloadBlob } from '../../utils/downloadUtils';
import { exportXmind } from './exportXmind';
import {
    downloadText,
    nodeObjToFlowchartJson,
    nodeObjToMarkdown,
    nodeObjToOpml,
} from './migrate';
import { nodeObjToPitchMarkdown } from './mindmapPitchExport';
import { logMindmapToolbarExportFailure } from './mindmapToolbarLogging';

const PRINT_BODY_CLASS = 'vizly-mindmap-print';

export type MindMapExportFormat =
    | 'SVG'
    | 'PNG'
    | 'XMind'
    | 'Markdown'
    | 'OPML'
    | 'JSON'
    | 'Pitch markdown'
    | 'Flowchart'
    | 'PDF';

export interface MindMapExportStatus {
    format: MindMapExportFormat;
    kind: 'error' | 'success';
}

export interface MindMapExportActionOptions {
    onStatus?: (status: MindMapExportStatus) => void;
}

export interface MindMapPrintDependencies {
    documentRef: Pick<Document, 'body'>;
    windowRef: Pick<Window, 'addEventListener' | 'print' | 'removeEventListener'>;
    schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
    clearSchedule: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaultPrintDependencies = (): MindMapPrintDependencies => ({
    documentRef: document,
    windowRef: window,
    schedule: (callback, delay) => setTimeout(callback, delay),
    clearSchedule: handle => clearTimeout(handle),
});

export const printMindMap = (
    overrides: Partial<MindMapPrintDependencies> = {},
): (() => void) => {
    const dependencies = { ...defaultPrintDependencies(), ...overrides };
    let cleaned = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        dependencies.documentRef.body.classList.remove(PRINT_BODY_CLASS);
        dependencies.windowRef.removeEventListener('afterprint', cleanup);
        if (fallbackTimer !== null) dependencies.clearSchedule(fallbackTimer);
    };

    dependencies.documentRef.body.classList.add(PRINT_BODY_CLASS);
    dependencies.windowRef.addEventListener('afterprint', cleanup, { once: true });
    fallbackTimer = dependencies.schedule(cleanup, 1000);
    try {
        dependencies.windowRef.print();
    } catch (error) {
        cleanup();
        throw error;
    }
    return cleanup;
};

export const useMindElixirExportActions = (
    mind: MindElixirInstance | null,
    options: MindMapExportActionOptions = {},
) => {
    const { onStatus } = options;
    const reportSuccess = useCallback((format: MindMapExportFormat) => {
        onStatus?.({ format, kind: 'success' });
    }, [onStatus]);
    const reportFailure = useCallback((format: MindMapExportFormat, error: unknown) => {
        logMindmapToolbarExportFailure(format, error);
        onStatus?.({ format, kind: 'error' });
    }, [onStatus]);

    const handleExportSvg = useCallback(() => {
        if (!mind) return;
        try {
            downloadBlob(mind.exportSvg(), 'mindmap.svg', 'mindmap.svg');
            reportSuccess('SVG');
        } catch (error) {
            reportFailure('SVG', error);
        }
    }, [mind, reportFailure, reportSuccess]);

    const handleExportPng = useCallback(async () => {
        if (!mind) return;
        try {
            const blob = await mind.exportPng();
            if (!blob) throw new Error('PNG export returned no data.');
            downloadBlob(blob, 'mindmap.png', 'mindmap.png');
            reportSuccess('PNG');
        } catch (error) {
            reportFailure('PNG', error);
        }
    }, [mind, reportFailure, reportSuccess]);

    const exportText = useCallback((
        format: MindMapExportFormat,
        fileName: string,
        mimeType: string,
        content: (instance: MindElixirInstance) => string,
    ) => {
        if (!mind) return;
        try {
            downloadText(fileName, content(mind), mimeType);
            reportSuccess(format);
        } catch (error) {
            reportFailure(format, error);
        }
    }, [mind, reportFailure, reportSuccess]);

    const handleExportMarkdown = useCallback(() => exportText(
        'Markdown', 'mindmap.md', 'text/markdown', instance => nodeObjToMarkdown(instance.getData().nodeData),
    ), [exportText]);
    const handleExportOpml = useCallback(() => exportText(
        'OPML', 'mindmap.opml', 'application/xml', instance => nodeObjToOpml(instance.getData().nodeData),
    ), [exportText]);
    const handleExportJson = useCallback(() => exportText(
        'JSON', 'mindmap.json', 'application/json', instance => JSON.stringify(instance.getData(), null, 2),
    ), [exportText]);
    const handleExportFlowchart = useCallback(() => exportText(
        'Flowchart', 'mindmap_to_flowchart.vizly', 'application/json',
        instance => nodeObjToFlowchartJson(instance.getData().nodeData),
    ), [exportText]);
    const handleExportPitchMarkdown = useCallback(() => exportText(
        'Pitch markdown', 'mindmap_pitch.md', 'text/markdown;charset=utf-8',
        instance => nodeObjToPitchMarkdown(instance.getData().nodeData),
    ), [exportText]);

    const handleExportXmind = useCallback(async () => {
        if (!mind) return;
        try {
            const nodeData = mind.getData().nodeData;
            await exportXmind(nodeData, nodeData.topic ?? 'mindmap');
            reportSuccess('XMind');
        } catch (error) {
            reportFailure('XMind', error);
        }
    }, [mind, reportFailure, reportSuccess]);

    const handleExportPdf = useCallback(() => {
        if (!mind) return;
        try {
            printMindMap();
            reportSuccess('PDF');
        } catch (error) {
            reportFailure('PDF', error);
        }
    }, [mind, reportFailure, reportSuccess]);

    return {
        handleExportSvg,
        handleExportPng,
        handleExportMarkdown,
        handleExportOpml,
        handleExportJson,
        handleExportFlowchart,
        handleExportPitchMarkdown,
        handleExportXmind,
        handleExportPdf,
    };
};
