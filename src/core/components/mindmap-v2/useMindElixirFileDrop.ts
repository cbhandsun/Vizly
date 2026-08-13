import { useCallback, type DragEvent, type RefObject } from 'react';
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

export const isSupportedMindMapImportFile = (file: ImportFileIdentity): boolean =>
    SUPPORTED_MIME_TYPES.has(file.type.toLowerCase()) || SUPPORTED_FILE_NAME.test(file.name);

export const parseMindMapImportText = (fileName: string, text: unknown): NodeObj => {
    if (typeof text !== 'string') throw new Error('Mind map import did not contain text.');
    const parsed = XML_FILE_NAME.test(fileName)
        ? opmlToNodeObj(text)
        : markdownToNodeObj(text);
    return cleanAndValidateTree(parsed, true);
};

export const useMindElixirFileDrop = (
    mindRef: RefObject<MindElixirInstance | null>,
) => {
    const handleDragOver = useCallback((event: DragEvent) => {
        const hasCompatibleFile = Array.from(event.dataTransfer.items || []).some(item => {
            if (item.kind !== 'file') return false;
            const file = item.getAsFile();
            return file ? isSupportedMindMapImportFile(file) : SUPPORTED_MIME_TYPES.has(item.type.toLowerCase());
        });
        if (!hasCompatibleFile) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDrop = useCallback((event: DragEvent) => {
        event.preventDefault();
        const mind = mindRef.current;
        const file = event.dataTransfer.files[0];
        if (!mind || !file) return;
        if (!isSupportedMindMapImportFile(file)) {
            logMindmapWrapperDragImportRejected(new Error('Unsupported mind map import file type.'));
            return;
        }
        const sizeError = getFileSizeLimitError(file, MINDMAP_TEXT_IMPORT_MAX_BYTES, 'mind map');
        if (sizeError) {
            logMindmapWrapperDragImportRejected(sizeError);
            return;
        }

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const nodeData = parseMindMapImportText(file.name, event.target?.result);
                applyMindMapImportTransaction(mind, { nodeData });
            } catch (error) {
                logMindmapWrapperDragImportFailure(error);
            }
        };
        reader.readAsText(file);
    }, [mindRef]);

    return { handleDragOver, handleDrop };
};
