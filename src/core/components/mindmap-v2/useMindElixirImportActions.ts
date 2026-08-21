import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { getFileSizeLimitError, MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../utils/fileImportGuards';
import { parseDiagramJson } from '../../utils/diagramJsonImport';
import { markdownToNodeObj, opmlToNodeObj } from './migrate';
import { coerceMindElixirDirection } from './mindElixirDirection';
import { applyMindMapImportTransaction } from './mindmapImportTransaction';
import { cleanAndValidateTree, cleanMindMapData } from './mindmapTreeSanitizer';
import {
    logMindmapToolbarImportFailure,
    logMindmapToolbarImportRejected,
} from './mindmapToolbarLogging';

export type MindMapImportKind = 'JSON' | 'Markdown' | 'OPML';

export type MindMapImportFailureReason =
    | 'aborted'
    | 'invalid'
    | 'read'
    | 'scope-changed'
    | 'too-large';

export type MindMapImportStatus =
    | { format: MindMapImportKind; kind: 'started' }
    | { format: MindMapImportKind; kind: 'success' }
    | { activeFormat: MindMapImportKind; format: MindMapImportKind; kind: 'busy' }
    | { format: MindMapImportKind; kind: 'error'; reason: MindMapImportFailureReason };

export interface MindMapImportActionOptions {
    onStatus?: (status: MindMapImportStatus) => void;
}

const IMPORT_IDENTITIES: Record<MindMapImportKind, { fileName: RegExp; mimeTypes: ReadonlySet<string> }> = {
    JSON: { fileName: /\.json$/i, mimeTypes: new Set(['application/json', 'text/json']) },
    Markdown: { fileName: /\.(?:md|markdown|txt)$/i, mimeTypes: new Set(['text/markdown', 'text/plain']) },
    OPML: { fileName: /\.(?:opml|xml)$/i, mimeTypes: new Set(['application/xml', 'text/xml']) },
};

type ParsedMindMapImport =
    | { kind: 'diagram'; data: ReturnType<typeof cleanMindMapData> }
    | { kind: 'tree'; nodeData: NodeObj };

export const isSupportedMindMapToolbarImport = (
    kind: MindMapImportKind,
    file: Pick<File, 'name' | 'type'>,
): boolean => {
    const identity = IMPORT_IDENTITIES[kind];
    return identity.fileName.test(file.name) || identity.mimeTypes.has(file.type.toLowerCase());
};

export const parseMindMapToolbarImport = (
    kind: MindMapImportKind,
    value: unknown,
): ParsedMindMapImport => {
    if (typeof value !== 'string') throw new Error(`${kind} import did not contain text.`);
    if (kind === 'JSON') {
        return { kind: 'diagram', data: cleanMindMapData(parseDiagramJson(value)) };
    }
    const parsed = kind === 'OPML' ? opmlToNodeObj(value) : markdownToNodeObj(value);
    return { kind: 'tree', nodeData: cleanAndValidateTree(parsed, true) };
};

export const useMindElixirImportActions = (
    mind: MindElixirInstance | null,
    options: MindMapImportActionOptions = {},
) => {
    const { onStatus } = options;
    const [activeFormat, setActiveFormat] = useState<MindMapImportKind | null>(null);
    const activeFormatRef = useRef<MindMapImportKind | null>(null);
    const activeReaderRef = useRef<FileReader | null>(null);
    const currentMindRef = useRef(mind);
    const mountedRef = useRef(true);
    const markdownInputRef = useRef<HTMLInputElement>(null);
    const opmlInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        currentMindRef.current = mind;
    }, [mind]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            const reader = activeReaderRef.current;
            activeReaderRef.current = null;
            activeFormatRef.current = null;
            reader?.abort();
        };
    }, []);

    const emitStatus = useCallback((status: MindMapImportStatus) => {
        if (mountedRef.current) onStatus?.(status);
    }, [onStatus]);

    const openMarkdownImport = useCallback(() => markdownInputRef.current?.click(), []);
    const openOpmlImport = useCallback(() => opmlInputRef.current?.click(), []);
    const openJsonImport = useCallback(() => jsonInputRef.current?.click(), []);

    const createFileChangeHandler = useCallback((kind: MindMapImportKind) => (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        const targetMind = currentMindRef.current;
        if (!file || !targetMind) return;
        const fail = (reason: MindMapImportFailureReason, error: unknown, rejected = false) => {
            (rejected ? logMindmapToolbarImportRejected : logMindmapToolbarImportFailure)(kind, error);
            emitStatus({ format: kind, kind: 'error', reason });
        };
        if (!isSupportedMindMapToolbarImport(kind, file) || !Number.isFinite(file.size) || file.size <= 0) {
            fail('invalid', new Error('Import file rejected.'), true);
            return;
        }
        const sizeError = getFileSizeLimitError(file, MINDMAP_TEXT_IMPORT_MAX_BYTES, kind);
        if (sizeError) {
            fail('too-large', sizeError, true);
            return;
        }

        const currentFormat = activeFormatRef.current;
        if (currentFormat) {
            emitStatus({ activeFormat: currentFormat, format: kind, kind: 'busy' });
            return;
        }

        const reader = new FileReader();
        activeReaderRef.current = reader;
        activeFormatRef.current = kind;
        if (mountedRef.current) setActiveFormat(kind);
        emitStatus({ format: kind, kind: 'started' });
        const finishRead = () => {
            if (activeReaderRef.current !== reader) return;
            activeReaderRef.current = null;
            activeFormatRef.current = null;
            if (mountedRef.current) setActiveFormat(null);
        };
        reader.onload = loadEvent => {
            if (activeReaderRef.current !== reader) return;
            try {
                if (currentMindRef.current !== targetMind) {
                    finishRead();
                    emitStatus({ format: kind, kind: 'error', reason: 'scope-changed' });
                    return;
                }
                const parsed = parseMindMapToolbarImport(kind, loadEvent.target?.result);
                if (parsed.kind === 'diagram') {
                    applyMindMapImportTransaction(targetMind, {
                        ...parsed.data,
                        direction: coerceMindElixirDirection(parsed.data.direction),
                    });
                } else {
                    applyMindMapImportTransaction(targetMind, { nodeData: parsed.nodeData });
                }
                finishRead();
                emitStatus({ format: kind, kind: 'success' });
            } catch (error) {
                finishRead();
                fail('invalid', error);
            }
        };
        reader.onerror = () => {
            if (activeReaderRef.current !== reader) return;
            finishRead();
            fail('read', reader.error ?? new Error('Import read failed.'));
        };
        reader.onabort = () => {
            if (activeReaderRef.current !== reader) return;
            finishRead();
            if (!mountedRef.current) return;
            fail('aborted', new Error('Import read aborted.'));
        };
        try {
            reader.readAsText(file);
        } catch (error) {
            finishRead();
            fail('read', error);
        }
    }, [emitStatus]);

    return {
        activeFormat,
        markdownInputRef,
        opmlInputRef,
        jsonInputRef,
        openMarkdownImport,
        openOpmlImport,
        openJsonImport,
        handleMarkdownFileChange: createFileChangeHandler('Markdown'),
        handleOpmlFileChange: createFileChangeHandler('OPML'),
        handleJsonFileChange: createFileChangeHandler('JSON'),
    };
};
