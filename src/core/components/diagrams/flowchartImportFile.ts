import {
    FLOWCHART_JSON_IMPORT_MAX_BYTES,
    FLOWCHART_TEXT_IMPORT_MAX_BYTES,
    getFileSizeLimitError,
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

export const validateFlowchartImportFile = (
    file: File,
    invalidFormatMessage: string
): FlowchartImportFileValidation => {
    const importKind = getDiagramImportKind(file.name);
    if (!importKind) {
        return {
            ok: false,
            error: invalidFormatMessage,
        };
    }

    const isJsonImport = importKind === 'json';
    const sizeError = getFileSizeLimitError(
        file,
        isJsonImport ? FLOWCHART_JSON_IMPORT_MAX_BYTES : FLOWCHART_TEXT_IMPORT_MAX_BYTES,
        isJsonImport ? 'JSON' : 'text'
    );

    if (sizeError) {
        return {
            ok: false,
            error: sizeError,
        };
    }

    return {
        ok: true,
        importKind,
    };
};

type BrowserFileReader = Pick<FileReader, 'readAsText'> & {
    onload: ((event: Pick<ProgressEvent<FileReader>, 'target'>) => void) | null;
    onerror: (() => void) | null;
    result?: string | ArrayBuffer | null;
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
