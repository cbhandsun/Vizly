import { afterEach, describe, expect, it, vi } from 'vitest';

import { readMindMapPropertyImageFile } from '../mindMapPropertyImageImport';

const imageFile = (
    overrides: Partial<Pick<File, 'name' | 'size' | 'type'>> = {},
): File => ({
    name: 'node-image.png',
    size: 4,
    type: 'image/png',
    ...overrides,
} as File);

afterEach(() => {
    vi.useRealTimers();
});

describe('readMindMapPropertyImageFile', () => {
    it('returns a sanitized data URL for a supported image', async () => {
        const readAsDataURL = vi.fn(function (this: {
            onload: ((event: ProgressEvent<FileReader>) => void) | null;
        }) {
            this.onload?.({ target: { result: 'data:image/png;base64,AAAA' } } as ProgressEvent<FileReader>);
        });

        await expect(readMindMapPropertyImageFile(
            imageFile(),
            () => ({ onload: null, onerror: null, readAsDataURL }),
        )).resolves.toEqual({ ok: true, url: 'data:image/png;base64,AAAA' });
        expect(readAsDataURL).toHaveBeenCalledTimes(1);
    });

    it('rejects empty, invalid-size, unsupported, and oversized files before reading', async () => {
        const createReader = vi.fn();

        await expect(readMindMapPropertyImageFile(
            imageFile({ size: 0 }),
            createReader,
        )).resolves.toEqual({ ok: false, error: 'empty-file' });
        await expect(readMindMapPropertyImageFile(
            imageFile({ size: Number.NaN }),
            createReader,
        )).resolves.toEqual({ ok: false, error: 'invalid-file' });
        await expect(readMindMapPropertyImageFile(
            imageFile({ size: -1 }),
            createReader,
        )).resolves.toEqual({ ok: false, error: 'invalid-file' });
        await expect(readMindMapPropertyImageFile(
            imageFile({ name: 'node-image.svg', type: 'image/svg+xml' }),
            createReader,
        )).resolves.toEqual({ ok: false, error: 'invalid-file' });
        await expect(readMindMapPropertyImageFile(
            imageFile({ size: (3 * 1024 * 1024) + 1 }),
            createReader,
        )).resolves.toEqual({ ok: false, error: 'invalid-file' });
        expect(createReader).not.toHaveBeenCalled();
    });

    it('returns a typed failure when FileReader construction is unavailable', async () => {
        await expect(readMindMapPropertyImageFile(
            imageFile(),
            () => {
                throw new Error('FileReader unavailable');
            },
        )).resolves.toEqual({ ok: false, error: 'read-failed' });
    });

    it('rejects reader errors, thrown reads, and non-string results', async () => {
        await expect(readMindMapPropertyImageFile(
            imageFile(),
            () => ({
                onload: null,
                onerror: null,
                readAsDataURL() {
                    this.onerror?.call(
                        this as unknown as FileReader,
                        { target: this } as unknown as ProgressEvent<FileReader>,
                    );
                },
            }),
        )).resolves.toEqual({ ok: false, error: 'read-failed' });

        await expect(readMindMapPropertyImageFile(
            imageFile(),
            () => ({
                onload: null,
                onerror: null,
                readAsDataURL() {
                    throw new Error('reader unavailable');
                },
            }),
        )).resolves.toEqual({ ok: false, error: 'read-failed' });

        await expect(readMindMapPropertyImageFile(
            imageFile(),
            () => ({
                onload: null,
                onerror: null,
                readAsDataURL() {
                    this.onload?.call(
                        this as unknown as FileReader,
                        { target: { result: new ArrayBuffer(4) } } as ProgressEvent<FileReader>,
                    );
                },
            }),
        )).resolves.toEqual({ ok: false, error: 'read-failed' });
    });

    it('rejects unsafe image content after reading', async () => {
        await expect(readMindMapPropertyImageFile(
            imageFile(),
            () => ({
                onload: null,
                onerror: null,
                readAsDataURL() {
                    this.onload?.call(
                        this as unknown as FileReader,
                        { target: { result: 'data:image/svg+xml;base64,PHN2Zz4=' } } as ProgressEvent<FileReader>,
                    );
                },
            }),
        )).resolves.toEqual({ ok: false, error: 'unsafe-content' });
    });

    it('times out a reader that never settles and ignores late completion', async () => {
        vi.useFakeTimers();
        let readerOnLoad = (_event: ProgressEvent<FileReader>) => undefined;
        const readPromise = readMindMapPropertyImageFile(
            imageFile(),
            () => ({
                get onload() {
                    return readerOnLoad;
                },
                set onload(value) {
                    readerOnLoad = event => value?.call({} as FileReader, event);
                },
                onerror: null,
                readAsDataURL: vi.fn(),
            }),
            25,
        );

        await vi.advanceTimersByTimeAsync(25);
        readerOnLoad({ target: { result: 'data:image/png;base64,AAAA' } } as ProgressEvent<FileReader>);

        await expect(readPromise).resolves.toEqual({ ok: false, error: 'read-failed' });
    });

    it('aborts the native reader and ignores late completion when the caller cancels', async () => {
        const controller = new AbortController();
        let readerOnLoad = (_event: ProgressEvent<FileReader>) => undefined;
        const abort = vi.fn();
        const readPromise = readMindMapPropertyImageFile(
            imageFile(),
            () => ({
                abort,
                get onload() {
                    return readerOnLoad;
                },
                set onload(value) {
                    readerOnLoad = event => value?.call({} as FileReader, event);
                },
                onerror: null,
                readAsDataURL: vi.fn(),
            }),
            10_000,
            controller.signal,
        );

        controller.abort();
        readerOnLoad({ target: { result: 'data:image/png;base64,AAAA' } } as ProgressEvent<FileReader>);

        expect(abort).toHaveBeenCalledOnce();
        await expect(readPromise).resolves.toEqual({ ok: false, error: 'aborted' });
    });
});
