import { useCallback, useRef, type ChangeEvent } from 'react';
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
    | 'too-large';

export type MindMapImportStatus =
    | { format: MindMapImportKind; kind: 'success' }
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
    const markdownInputRef = useRef<HTMLInputElement>(null);
    const opmlInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);

    const openMarkdownImport = useCallback(() => markdownInputRef.current?.click(), []);
    const openOpmlImport = useCallback(() => opmlInputRef.current?.click(), []);
    const openJsonImport = useCallback(() => jsonInputRef.current?.click(), []);

    const createFileChangeHandler = useCallback((kind: MindMapImportKind) => (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file || !mind) return;
        const fail = (reason: MindMapImportFailureReason, error: unknown, rejected = false) => {
            (rejected ? logMindmapToolbarImportRejected : logMindmapToolbarImportFailure)(kind, error);
            onStatus?.({ format: kind, kind: 'error', reason });
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

        const reader = new FileReader();
        reader.onload = loadEvent => {
            try {
                const parsed = parseMindMapToolbarImport(kind, loadEvent.target?.result);
                if (parsed.kind === 'diagram') {
                    applyMindMapImportTransaction(mind, {
                        ...parsed.data,
                        direction: coerceMindElixirDirection(parsed.data.direction),
                    });
                } else {
                    applyMindMapImportTransaction(mind, { nodeData: parsed.nodeData });
                }
                onStatus?.({ format: kind, kind: 'success' });
            } catch (error) {
                fail('invalid', error);
            }
        };
        reader.onerror = () => {
            fail('read', reader.error ?? new Error('Import read failed.'));
        };
        reader.onabort = () => {
            fail('aborted', new Error('Import read aborted.'));
        };
        reader.readAsText(file);
    }, [mind, onStatus]);

    return {
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
