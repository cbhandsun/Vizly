import { useCallback, useEffect, useRef, type DragEvent, type RefObject } from 'react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { getFileSizeLimitError, MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../utils/fileImportGuards';
import { markdownToNodeObj, opmlToNodeObj } from './migrate';
import { applyMindMapImportTransaction } from './mindmapImportTransaction';
import { cleanAndValidateTree } from './mindmapTreeSanitizer';
import {
    logMindmapWrapperDragImportFailure,
    logMindmapWrapperDragImportRejected,
} from './mindmapWrapperLogging';

const SUPPORTED_MIME_TYPES = new Set([
    'application/xml',
    'text/markdown',
    'text/plain',
    'text/xml',
]);
const SUPPORTED_FILE_NAME = /\.(?:md|markdown|opml|xml|txt)$/i;
const XML_FILE_NAME = /\.(?:opml|xml)$/i;

type ImportFileIdentity = Pick<File, 'name' | 'type'>;

export type MindMapFileDropFormat = 'Markdown' | 'OPML';
export type MindMapFileDropFailureReason =
    | 'aborted'
    | 'in-progress'
    | 'invalid'
    | 'read'
    | 'scope-changed'
    | 'too-large';
export type MindMapFileDropStatus =
    | { format: MindMapFileDropFormat; kind: 'success' }
    | { format?: MindMapFileDropFormat; kind: 'error'; reason: MindMapFileDropFailureReason };

export interface MindMapFileDropOptions {
    onStatus?: (status: MindMapFileDropStatus) => void;
}

export const isSupportedMindMapImportFile = (file: ImportFileIdentity): boolean =>
    SUPPORTED_MIME_TYPES.has(file.type.toLowerCase()) || SUPPORTED_FILE_NAME.test(file.name);

export const getMindMapFileDropFormat = (file: ImportFileIdentity): MindMapFileDropFormat => (
    XML_FILE_NAME.test(file.name) || ['application/xml', 'text/xml'].includes(file.type.toLowerCase())
        ? 'OPML'
        : 'Markdown'
);

export const hasSupportedMindMapImportTransfer = (
    dataTransfer: Pick<DataTransfer, 'files' | 'items'>,
): boolean => {
    const files = Array.from(dataTransfer.files ?? []);
    if (files.some(isSupportedMindMapImportFile)) return true;
    return Array.from(dataTransfer.items ?? []).some(item => {
        if (item.kind !== 'file') return false;
        try {
            const file = item.getAsFile();
            return file
                ? isSupportedMindMapImportFile(file)
                : SUPPORTED_MIME_TYPES.has(item.type.toLowerCase());
        } catch {
            return false;
        }
    });
};

export const isMindMapFileDropLeavingContainer = (
    container: EventTarget & Node,
    relatedTarget: EventTarget | null,
): boolean => !(relatedTarget instanceof Node && container.contains(relatedTarget));

export const parseMindMapImportText = (
    fileName: string,
    text: unknown,
    fileType = '',
): NodeObj => {
    if (typeof text !== 'string') throw new Error('Mind map import did not contain text.');
    const parsed = getMindMapFileDropFormat({ name: fileName, type: fileType }) === 'OPML'
        ? opmlToNodeObj(text)
        : markdownToNodeObj(text);
    return cleanAndValidateTree(parsed, true);
};

export const useMindElixirFileDrop = (
    mindRef: RefObject<MindElixirInstance | null>,
    options: MindMapFileDropOptions = {},
) => {
    const { onStatus } = options;
    const activeReaderRef = useRef<FileReader | null>(null);
    const mountedRef = useRef(true);
    const emitStatus = useCallback((status: MindMapFileDropStatus) => {
        if (mountedRef.current) onStatus?.(status);
    }, [onStatus]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            const reader = activeReaderRef.current;
            activeReaderRef.current = null;
            if (reader?.readyState === FileReader.LOADING) reader.abort();
        };
    }, []);

    const handleDragOver = useCallback((event: DragEvent) => {
        const hasCompatibleFile = hasSupportedMindMapImportTransfer(event.dataTransfer);
        if (!hasCompatibleFile) return false;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        return true;
    }, []);

    const handleDrop = useCallback((event: DragEvent) => {
        const hasFilePayload = event.dataTransfer.files.length > 0
            || Array.from(event.dataTransfer.items ?? []).some(item => item.kind === 'file');
        if (!hasFilePayload) return;
        event.preventDefault();
        const mind = mindRef.current;
        const file = event.dataTransfer.files[0];
        if (!mind || !file) return;
        if (!isSupportedMindMapImportFile(file)) {
            logMindmapWrapperDragImportRejected(new Error('Unsupported mind map import file type.'));
            emitStatus({ kind: 'error', reason: 'invalid' });
            return;
        }
        const format = getMindMapFileDropFormat(file);
        if (activeReaderRef.current?.readyState === FileReader.LOADING) {
            emitStatus({ format, kind: 'error', reason: 'in-progress' });
            return;
        }
        if (!Number.isFinite(file.size) || file.size <= 0) {
            logMindmapWrapperDragImportRejected(new Error('Empty mind map import file.'));
            emitStatus({ format, kind: 'error', reason: 'invalid' });
            return;
        }
        const sizeError = getFileSizeLimitError(file, MINDMAP_TEXT_IMPORT_MAX_BYTES, 'mind map');
        if (sizeError) {
            logMindmapWrapperDragImportRejected(sizeError);
            emitStatus({ format, kind: 'error', reason: 'too-large' });
            return;
        }

        const reader = new FileReader();
        activeReaderRef.current = reader;
        const finishRead = () => {
            if (activeReaderRef.current === reader) activeReaderRef.current = null;
        };
        reader.onload = event => {
            finishRead();
            try {
                if (mindRef.current !== mind) {
                    emitStatus({ format, kind: 'error', reason: 'scope-changed' });
                    return;
                }
                const nodeData = parseMindMapImportText(file.name, event.target?.result, file.type);
                applyMindMapImportTransaction(mind, { nodeData });
                emitStatus({ format, kind: 'success' });
            } catch (error) {
                logMindmapWrapperDragImportFailure(error);
                emitStatus({ format, kind: 'error', reason: 'invalid' });
            }
        };
        reader.onerror = () => {
            finishRead();
            const error = reader.error ?? new Error('Mind map import read failed.');
            logMindmapWrapperDragImportFailure(error);
            emitStatus({ format, kind: 'error', reason: 'read' });
        };
        reader.onabort = () => {
            finishRead();
            if (!mountedRef.current) return;
            logMindmapWrapperDragImportFailure(new Error('Mind map import read aborted.'));
            emitStatus({ format, kind: 'error', reason: 'aborted' });
        };
        try {
            reader.readAsText(file);
        } catch (error) {
            finishRead();
            logMindmapWrapperDragImportFailure(error);
            emitStatus({ format, kind: 'error', reason: 'read' });
        }
    }, [emitStatus, mindRef]);

    return { handleDragOver, handleDrop };
};
