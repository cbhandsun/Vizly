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

export const useMindElixirExportActions = (mind: MindElixirInstance | null) => {
    const handleExportSvg = useCallback(() => {
        if (!mind) return;
        try {
            downloadBlob(mind.exportSvg(), 'mindmap.svg', 'mindmap.svg');
        } catch (error) {
            logMindmapToolbarExportFailure('SVG', error);
        }
    }, [mind]);

    const handleExportPng = useCallback(async () => {
        if (!mind) return;
        try {
            const blob = await mind.exportPng();
            if (blob) downloadBlob(blob, 'mindmap.png', 'mindmap.png');
        } catch (error) {
            logMindmapToolbarExportFailure('PNG', error);
        }
    }, [mind]);

    const exportText = useCallback((
        format: string,
        fileName: string,
        mimeType: string,
        content: (instance: MindElixirInstance) => string,
    ) => {
        if (!mind) return;
        try {
            downloadText(fileName, content(mind), mimeType);
        } catch (error) {
            logMindmapToolbarExportFailure(format, error);
        }
    }, [mind]);

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
        } catch (error) {
            logMindmapToolbarExportFailure('XMind', error);
        }
    }, [mind]);

    const handleExportPdf = useCallback(() => {
        if (!mind) return;
        try {
            printMindMap();
        } catch (error) {
            logMindmapToolbarExportFailure('PDF', error);
        }
    }, [mind]);

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
