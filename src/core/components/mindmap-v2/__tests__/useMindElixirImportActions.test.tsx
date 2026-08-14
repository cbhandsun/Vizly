// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import type { MindElixirInstance } from 'mind-elixir';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../../utils/fileImportGuards';
import { useMindElixirImportActions } from '../useMindElixirImportActions';

const transactionState = vi.hoisted(() => ({
    apply: vi.fn(),
}));

vi.mock('../mindmapImportTransaction', () => ({
    applyMindMapImportTransaction: transactionState.apply,
}));

type ReaderMode = 'abort' | 'error' | 'load';

class ControlledFileReader {
    static mode: ReaderMode = 'load';
    static result: unknown = '';

    error: DOMException | null = null;
    onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

    readAsText(): void {
        queueMicrotask(() => {
            if (ControlledFileReader.mode === 'abort') {
                this.onabort?.({ target: this } as unknown as ProgressEvent<FileReader>);
                return;
            }
            if (ControlledFileReader.mode === 'error') {
                this.error = new DOMException('read failed');
                this.onerror?.({ target: this } as unknown as ProgressEvent<FileReader>);
                return;
            }
            this.onload?.({
                target: { result: ControlledFileReader.result },
            } as unknown as ProgressEvent<FileReader>);
        });
    }
}

const createMind = (): MindElixirInstance => ({} as MindElixirInstance);

const createFile = (
    name: string,
    size: number,
    type = 'application/json',
): File => ({ name, size, type } as File);

const createChangeEvent = (file?: File) => {
    const input = {
        files: file ? [file] : [],
        value: 'selected-file',
    };
    return {
        event: { currentTarget: input } as unknown as ChangeEvent<HTMLInputElement>,
        input,
    };
};

beforeEach(() => {
    vi.stubGlobal('FileReader', ControlledFileReader);
    ControlledFileReader.mode = 'load';
    ControlledFileReader.result = JSON.stringify({
        nodeData: { id: 'root', topic: 'Root', children: [] },
    });
    transactionState.apply.mockReset();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('mind map toolbar import result feedback', () => {
    it('reports a successful validated import and clears the native input', async () => {
        const onStatus = vi.fn();
        const { result } = renderHook(() => useMindElixirImportActions(createMind(), { onStatus }));
        const { event, input } = createChangeEvent(createFile('map.json', 256));

        act(() => result.current.handleJsonFileChange(event));

        await waitFor(() => expect(onStatus).toHaveBeenCalledWith({
            format: 'JSON',
            kind: 'success',
        }));
        expect(transactionState.apply).toHaveBeenCalledOnce();
        expect(input.value).toBe('');
    });

    it('rejects unsupported, invalid-size, empty, and oversized files before reading', () => {
        const onStatus = vi.fn();
        const { result } = renderHook(() => useMindElixirImportActions(createMind(), { onStatus }));

        act(() => result.current.handleJsonFileChange(
            createChangeEvent(createFile('map.png', 12, 'image/png')).event,
        ));
        act(() => result.current.handleJsonFileChange(
            createChangeEvent(createFile('map.json', Number.NaN)).event,
        ));
        act(() => result.current.handleJsonFileChange(
            createChangeEvent(createFile('map.json', 0)).event,
        ));
        act(() => result.current.handleJsonFileChange(
            createChangeEvent(createFile('map.json', MINDMAP_TEXT_IMPORT_MAX_BYTES + 1)).event,
        ));

        expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
            { format: 'JSON', kind: 'error', reason: 'invalid' },
            { format: 'JSON', kind: 'error', reason: 'invalid' },
            { format: 'JSON', kind: 'error', reason: 'invalid' },
            { format: 'JSON', kind: 'error', reason: 'too-large' },
        ]);
        expect(transactionState.apply).not.toHaveBeenCalled();
    });

    it('reports a safe failure for invalid content and transaction failure', async () => {
        const onStatus = vi.fn();
        const { result } = renderHook(() => useMindElixirImportActions(createMind(), { onStatus }));

        ControlledFileReader.result = '{"nodeData":';
        act(() => result.current.handleJsonFileChange(
            createChangeEvent(createFile('broken.json', 20)).event,
        ));
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith({
            format: 'JSON', kind: 'error', reason: 'invalid',
        }));

        ControlledFileReader.result = JSON.stringify({
            nodeData: { id: 'root', topic: 'Root', children: [] },
        });
        transactionState.apply.mockImplementationOnce(() => {
            throw new Error('transaction failed');
        });
        act(() => result.current.handleJsonFileChange(
            createChangeEvent(createFile('valid.json', 120)).event,
        ));
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith({
            format: 'JSON', kind: 'error', reason: 'invalid',
        }));
    });

    it.each<ReaderMode>(['error', 'abort'])(
        'reports a recoverable status when file reading ends with %s',
        async mode => {
            const onStatus = vi.fn();
            ControlledFileReader.mode = mode;
            const { result } = renderHook(() => useMindElixirImportActions(createMind(), { onStatus }));

            act(() => result.current.handleJsonFileChange(
                createChangeEvent(createFile('map.json', 120)).event,
            ));

            await waitFor(() => expect(onStatus).toHaveBeenCalledWith({
                format: 'JSON',
                kind: 'error',
                reason: mode === 'error' ? 'read' : 'aborted',
            }));
            expect(transactionState.apply).not.toHaveBeenCalled();
        },
    );

    it('does not start an import without a file or a mounted mind map instance', () => {
        const onStatus = vi.fn();
        const mounted = renderHook(() => useMindElixirImportActions(createMind(), { onStatus }));
        const empty = createChangeEvent();
        act(() => mounted.result.current.handleJsonFileChange(empty.event));

        const unmounted = renderHook(() => useMindElixirImportActions(null, { onStatus }));
        const file = createChangeEvent(createFile('map.json', 120));
        act(() => unmounted.result.current.handleJsonFileChange(file.event));

        expect(empty.input.value).toBe('');
        expect(file.input.value).toBe('');
        expect(onStatus).not.toHaveBeenCalled();
        expect(transactionState.apply).not.toHaveBeenCalled();
    });
});
