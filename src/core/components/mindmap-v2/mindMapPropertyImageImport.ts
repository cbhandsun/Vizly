import {
    getImageFileImportError,
    IMAGE_DATA_URL_IMPORT_MAX_BYTES,
} from '../../utils/fileImportGuards';
import { toSafeImageUrl } from '../../utils/sanitizeHtml';

export type MindMapPropertyImageImportError =
    | 'aborted'
    | 'empty-file'
    | 'invalid-file'
    | 'read-failed'
    | 'unsafe-content';

export type MindMapPropertyImageImportResult =
    | { ok: true; url: string }
    | { ok: false; error: MindMapPropertyImageImportError };

type BrowserDataUrlReader = {
    abort?: FileReader['abort'];
    readAsDataURL: FileReader['readAsDataURL'];
    onabort?: FileReader['onabort'];
    onload: FileReader['onload'];
    onerror: FileReader['onerror'];
};

export const readMindMapPropertyImageFile = (
    file: File,
    createFileReader: () => BrowserDataUrlReader = () => new FileReader(),
    timeoutMs = 10_000,
    signal?: AbortSignal,
): Promise<MindMapPropertyImageImportResult> => {
    if (file.size === 0) {
        return Promise.resolve({ ok: false, error: 'empty-file' });
    }
    if (!Number.isFinite(file.size) || file.size < 0) {
        return Promise.resolve({ ok: false, error: 'invalid-file' });
    }
    if (getImageFileImportError(file, IMAGE_DATA_URL_IMPORT_MAX_BYTES)) {
        return Promise.resolve({ ok: false, error: 'invalid-file' });
    }
    if (signal?.aborted) {
        return Promise.resolve({ ok: false, error: 'aborted' });
    }

    return new Promise(resolve => {
        let reader: BrowserDataUrlReader;
        try {
            reader = createFileReader();
        } catch {
            resolve({ ok: false, error: 'read-failed' });
            return;
        }
        let settled = false;
        const finish = (result: MindMapPropertyImageImportResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', abortRead);
            resolve(result);
        };
        const abortRead = () => {
            try {
                reader.abort?.();
            } finally {
                finish({ ok: false, error: 'aborted' });
            }
        };
        const timeoutId = setTimeout(
            () => {
                try {
                    reader.abort?.();
                } finally {
                    finish({ ok: false, error: 'read-failed' });
                }
            },
            timeoutMs,
        );

        signal?.addEventListener('abort', abortRead, { once: true });
        reader.onabort = () => finish({
            ok: false,
            error: signal?.aborted ? 'aborted' : 'read-failed',
        });
        reader.onload = event => {
            const value = event.target?.result;
            if (typeof value !== 'string') {
                finish({ ok: false, error: 'read-failed' });
                return;
            }
            const safeUrl = toSafeImageUrl(value);
            finish(safeUrl
                ? { ok: true, url: safeUrl }
                : { ok: false, error: 'unsafe-content' });
        };
        reader.onerror = () => finish({ ok: false, error: 'read-failed' });
        try {
            reader.readAsDataURL(file);
        } catch {
            finish({ ok: false, error: 'read-failed' });
        }
    });
};
