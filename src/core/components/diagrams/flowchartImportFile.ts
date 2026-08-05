import {
    FLOWCHART_JSON_IMPORT_MAX_BYTES,
    FLOWCHART_TEXT_IMPORT_MAX_BYTES,
    formatFileSize,
    sanitizeFileNameForDisplay,
} from '@/core/utils/fileImportGuards';
import { getDiagramImportKind, type DiagramImportKind } from '@/core/utils/diagramJsonImport';

export type FlowchartImportFileValidation =
    | {
        ok: true;
        importKind: DiagramImportKind;
    }
    | {
        ok: false;
        error: string;
    };

export type FlowchartImportFileMessages = {
    invalidFormat: string;
    emptyFile: string;
    invalidSize: string;
    tooLarge: (params: {
        filename: string;
        size: string;
        limit: string;
    }) => string;
};

export const validateFlowchartImportFile = (
    file: File,
    messages: FlowchartImportFileMessages
): FlowchartImportFileValidation => {
    const importKind = getDiagramImportKind(file.name);
    if (!importKind) {
        return {
            ok: false,
            error: messages.invalidFormat,
        };
    }

    const isJsonImport = importKind === 'json';
    const maxBytes = isJsonImport
        ? FLOWCHART_JSON_IMPORT_MAX_BYTES
        : FLOWCHART_TEXT_IMPORT_MAX_BYTES;
    if (!Number.isFinite(file.size) || file.size < 0) {
        return {
            ok: false,
            error: messages.invalidSize,
        };
    }

    if (file.size === 0) {
        return {
            ok: false,
            error: messages.emptyFile,
        };
    }

    if (file.size > maxBytes) {
        return {
            ok: false,
            error: messages.tooLarge({
                filename: sanitizeFileNameForDisplay(file.name, isJsonImport ? 'diagram.json' : 'diagram.txt'),
                size: formatFileSize(file.size),
                limit: formatFileSize(maxBytes),
            }),
        };
    }

    return {
        ok: true,
        importKind,
    };
};

type BrowserFileReader = {
    readAsText: FileReader['readAsText'];
    onload: FileReader['onload'];
    onerror: FileReader['onerror'];
};

export const readFlowchartImportFileText = (
    file: Blob,
    createFileReader: () => BrowserFileReader = () => new FileReader()
): Promise<string> => new Promise((resolve, reject) => {
    const reader = createFileReader();
    reader.onload = (event) => {
        resolve(String(event.target?.result || ''));
    };
    reader.onerror = () => {
        reject(new Error('Failed to read import file.'));
    };
    reader.readAsText(file);
});
