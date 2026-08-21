import { useCallback, useEffect, useRef, useState } from 'react';
import type { MindElixirInstance } from 'mind-elixir';

import { downloadBlob, sanitizeDownloadFileName } from '../../utils/downloadUtils';
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
const MIND_MAP_EXPORT_BASE_MAX_LENGTH = 96;

export const buildMindMapExportFileName = (topic: unknown, suffix: string): string => {
    const safeBaseName = sanitizeDownloadFileName(topic, 'mindmap', MIND_MAP_EXPORT_BASE_MAX_LENGTH)
        .replace(/\.(?:json|markdown|md|opml|png|svg|vizly|xmind|xml)$/i, '');
    return `${safeBaseName || 'mindmap'}${suffix}`;
};

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

export type MindMapExportStatus =
    | { format: MindMapExportFormat; kind: 'error' | 'started' | 'success' }
    | { activeFormat: MindMapExportFormat; format: MindMapExportFormat; kind: 'busy' }
    | { format: 'PDF'; kind: 'print-opened' };

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
    const [activeFormat, setActiveFormat] = useState<MindMapExportFormat | null>(null);
    const activeFormatRef = useRef<MindMapExportFormat | null>(null);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);
    const emitStatus = useCallback((status: MindMapExportStatus) => {
        if (mountedRef.current) onStatus?.(status);
    }, [onStatus]);
    const reportSuccess = useCallback((format: MindMapExportFormat) => {
        emitStatus({ format, kind: 'success' });
    }, [emitStatus]);
    const reportFailure = useCallback((format: MindMapExportFormat, error: unknown) => {
        logMindmapToolbarExportFailure(format, error);
        emitStatus({ format, kind: 'error' });
    }, [emitStatus]);
    const beginAsyncExport = useCallback((format: MindMapExportFormat): boolean => {
        const currentFormat = activeFormatRef.current;
        if (currentFormat) {
            emitStatus({ activeFormat: currentFormat, format, kind: 'busy' });
            return false;
        }
        activeFormatRef.current = format;
        if (mountedRef.current) setActiveFormat(format);
        emitStatus({ format, kind: 'started' });
        return true;
    }, [emitStatus]);
    const finishAsyncExport = useCallback((format: MindMapExportFormat) => {
        if (activeFormatRef.current !== format) return;
        activeFormatRef.current = null;
        if (mountedRef.current) setActiveFormat(null);
    }, []);
    const runAsyncExport = useCallback(async (
        format: MindMapExportFormat,
        operation: () => Promise<void>,
    ) => {
        if (!beginAsyncExport(format)) return;
        try {
            await operation();
            finishAsyncExport(format);
            reportSuccess(format);
        } catch (error) {
            finishAsyncExport(format);
            reportFailure(format, error);
        }
    }, [beginAsyncExport, finishAsyncExport, reportFailure, reportSuccess]);

    const handleExportSvg = useCallback(() => {
        if (!mind) return;
        try {
            const fileName = buildMindMapExportFileName(mind.getData().nodeData.topic, '.svg');
            downloadBlob(mind.exportSvg(), fileName, 'mindmap.svg');
            reportSuccess('SVG');
        } catch (error) {
            reportFailure('SVG', error);
        }
    }, [mind, reportFailure, reportSuccess]);

    const handleExportPng = useCallback(async () => {
        if (!mind) return;
        await runAsyncExport('PNG', async () => {
            const fileName = buildMindMapExportFileName(mind.getData().nodeData.topic, '.png');
            const blob = await mind.exportPng();
            if (!blob) throw new Error('PNG export returned no data.');
            downloadBlob(blob, fileName, 'mindmap.png');
        });
    }, [mind, runAsyncExport]);

    const exportText = useCallback((
        format: MindMapExportFormat,
        suffix: string,
        mimeType: string,
        content: (instance: MindElixirInstance) => string,
    ) => {
        if (!mind) return;
        try {
            const fileName = buildMindMapExportFileName(mind.getData().nodeData.topic, suffix);
            downloadText(fileName, content(mind), mimeType);
            reportSuccess(format);
        } catch (error) {
            reportFailure(format, error);
        }
    }, [mind, reportFailure, reportSuccess]);

    const handleExportMarkdown = useCallback(() => exportText(
        'Markdown', '.md', 'text/markdown', instance => nodeObjToMarkdown(instance.getData().nodeData),
    ), [exportText]);
    const handleExportOpml = useCallback(() => exportText(
        'OPML', '.opml', 'application/xml', instance => nodeObjToOpml(instance.getData().nodeData),
    ), [exportText]);
    const handleExportJson = useCallback(() => exportText(
        'JSON', '.json', 'application/json', instance => JSON.stringify(instance.getData(), null, 2),
    ), [exportText]);
    const handleExportFlowchart = useCallback(() => exportText(
        'Flowchart', '_flowchart.vizly', 'application/json',
        instance => nodeObjToFlowchartJson(instance.getData().nodeData),
    ), [exportText]);
    const handleExportPitchMarkdown = useCallback(() => exportText(
        'Pitch markdown', '_pitch.md', 'text/markdown;charset=utf-8',
        instance => nodeObjToPitchMarkdown(instance.getData().nodeData),
    ), [exportText]);

    const handleExportXmind = useCallback(async () => {
        if (!mind) return;
        await runAsyncExport('XMind', async () => {
            const nodeData = mind.getData().nodeData;
            const fileName = buildMindMapExportFileName(nodeData.topic, '');
            await exportXmind(nodeData, fileName);
        });
    }, [mind, runAsyncExport]);

    const handleExportPdf = useCallback(() => {
        if (!mind) return;
        try {
            printMindMap();
            emitStatus({ format: 'PDF', kind: 'print-opened' });
        } catch (error) {
            reportFailure('PDF', error);
        }
    }, [emitStatus, mind, reportFailure]);

    return {
        activeFormat,
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
