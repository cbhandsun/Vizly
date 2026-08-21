// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { MindElixirInstance } from 'mind-elixir';
import type { DragEvent, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MINDMAP_TEXT_IMPORT_MAX_BYTES } from '../../../utils/fileImportGuards';
import { useMindElixirFileDrop, type MindMapFileDropStatus } from '../useMindElixirFileDrop';

const importTransaction = vi.hoisted(() => vi.fn());

vi.mock('../mindmapImportTransaction', () => ({
    applyMindMapImportTransaction: importTransaction,
}));

vi.mock('../mindmapWrapperLogging', () => ({
    logMindmapWrapperDragImportFailure: vi.fn(),
    logMindmapWrapperDragImportRejected: vi.fn(),
}));

class ControlledFileReader {
    static readonly EMPTY = 0;
    static readonly LOADING = 1;
    static readonly DONE = 2;
    static instances: ControlledFileReader[] = [];
    static throwOnRead = false;

    readonly EMPTY = 0;
    readonly LOADING = 1;
    readonly DONE = 2;
    error: DOMException | null = null;
    onabort: FileReader['onabort'] = null;
    onerror: FileReader['onerror'] = null;
    onload: FileReader['onload'] = null;
    onloadend: FileReader['onloadend'] = null;
    onloadstart: FileReader['onloadstart'] = null;
    onprogress: FileReader['onprogress'] = null;
    readyState = ControlledFileReader.EMPTY;
    result: FileReader['result'] = null;

    constructor() {
        ControlledFileReader.instances.push(this);
    }

    abort(): void {
        this.readyState = ControlledFileReader.DONE;
        this.onabort?.call(this.asFileReader(), this.event('abort'));
    }

    readAsArrayBuffer(): void {}
    readAsBinaryString(): void {}
    readAsDataURL(): void {}

    readAsText(): void {
        if (ControlledFileReader.throwOnRead) throw new DOMException('blocked', 'NotReadableError');
        this.readyState = ControlledFileReader.LOADING;
    }

    succeed(text: string): void {
        this.result = text;
        this.readyState = ControlledFileReader.DONE;
        this.onload?.call(this.asFileReader(), this.event('load'));
    }

    fail(): void {
        this.error = new DOMException('read failed', 'NotReadableError');
        this.readyState = ControlledFileReader.DONE;
        this.onerror?.call(this.asFileReader(), this.event('error'));
    }

    private asFileReader(): FileReader {
        return this as unknown as FileReader;
    }

    private event(type: string): ProgressEvent<FileReader> {
        return { target: this.asFileReader(), type } as ProgressEvent<FileReader>;
    }
}

const createMind = (): MindElixirInstance => ({
    getData: vi.fn(),
} as unknown as MindElixirInstance);

const createFile = (name: string, type: string, body = '# Root'): File =>
    new File([body], name, { type });

const createDragEvent = (files: File[], items: DataTransferItem[] = []) => {
    const preventDefault = vi.fn();
    const dataTransfer = {
        dropEffect: 'none',
        files: files as unknown as FileList,
        items: items as unknown as DataTransferItemList,
    };
    return {
        event: { dataTransfer, preventDefault } as unknown as DragEvent,
        preventDefault,
    };
};

describe('useMindElixirFileDrop', () => {
    beforeEach(() => {
        ControlledFileReader.instances = [];
        ControlledFileReader.throwOnRead = false;
        importTransaction.mockReset();
        vi.stubGlobal('FileReader', ControlledFileReader);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('does not claim internal text drags but accepts supported files', () => {
        const mindRef = { current: createMind() } satisfies RefObject<MindElixirInstance | null>;
        const { result } = renderHook(() => useMindElixirFileDrop(mindRef));
        const stringItem = {
            getAsFile: () => null,
            getAsString: () => undefined,
            kind: 'string',
            type: 'text/plain',
            webkitGetAsEntry: () => null,
        } as DataTransferItem;
        const internal = createDragEvent([], [stringItem]);
        const supported = createDragEvent([createFile('ideas.md', 'text/markdown')]);

        expect(result.current.handleDragOver(internal.event)).toBe(false);
        expect(internal.preventDefault).not.toHaveBeenCalled();
        expect(result.current.handleDragOver(supported.event)).toBe(true);
        expect(supported.preventDefault).toHaveBeenCalledOnce();
        expect(supported.event.dataTransfer.dropEffect).toBe('copy');

        act(() => result.current.handleDrop(internal.event));
        expect(internal.preventDefault).not.toHaveBeenCalled();
        expect(ControlledFileReader.instances).toHaveLength(0);
    });

    it('reports unsupported, empty, and oversized files without starting a reader', () => {
        const onStatus = vi.fn<(status: MindMapFileDropStatus) => void>();
        const mindRef = { current: createMind() } satisfies RefObject<MindElixirInstance | null>;
        const { result } = renderHook(() => useMindElixirFileDrop(mindRef, { onStatus }));
        const oversized = createFile('large.md', 'text/markdown');
        Object.defineProperty(oversized, 'size', { value: MINDMAP_TEXT_IMPORT_MAX_BYTES + 1 });

        act(() => result.current.handleDrop(createDragEvent([
            createFile('archive.zip', 'application/zip'),
        ]).event));
        act(() => result.current.handleDrop(createDragEvent([
            createFile('empty.md', 'text/markdown', ''),
        ]).event));
        act(() => result.current.handleDrop(createDragEvent([oversized]).event));

        expect(onStatus.mock.calls.map(([status]) => (
            status.kind === 'error' ? status.reason : status.kind
        ))).toEqual([
            'invalid',
            'invalid',
            'too-large',
        ]);
        expect(ControlledFileReader.instances).toHaveLength(0);
    });

    it('imports validated text once and rejects a concurrent drop', () => {
        const onStatus = vi.fn<(status: MindMapFileDropStatus) => void>();
        const mind = createMind();
        const mindRef = { current: mind } satisfies RefObject<MindElixirInstance | null>;
        const { result } = renderHook(() => useMindElixirFileDrop(mindRef, { onStatus }));

        act(() => result.current.handleDrop(createDragEvent([
            createFile('ideas.md', 'text/markdown'),
        ]).event));
        act(() => result.current.handleDrop(createDragEvent([
            createFile('other.opml', 'application/xml'),
        ]).event));
        expect(onStatus).toHaveBeenLastCalledWith({
            format: 'OPML',
            kind: 'error',
            reason: 'in-progress',
        });

        act(() => ControlledFileReader.instances[0]?.succeed('# Imported\n## Child'));

        expect(importTransaction).toHaveBeenCalledWith(mind, {
            nodeData: expect.objectContaining({ topic: 'Imported' }),
        });
        expect(onStatus).toHaveBeenLastCalledWith({ format: 'Markdown', kind: 'success' });
    });

    it('does not apply a stale read after the active mind map changes', () => {
        const onStatus = vi.fn<(status: MindMapFileDropStatus) => void>();
        const mindRef = { current: createMind() } satisfies RefObject<MindElixirInstance | null>;
        const { result } = renderHook(() => useMindElixirFileDrop(mindRef, { onStatus }));

        act(() => result.current.handleDrop(createDragEvent([
            createFile('ideas.md', 'text/markdown'),
        ]).event));
        mindRef.current = createMind();
        act(() => ControlledFileReader.instances[0]?.succeed('# Stale'));

        expect(importTransaction).not.toHaveBeenCalled();
        expect(onStatus).toHaveBeenLastCalledWith({
            format: 'Markdown',
            kind: 'error',
            reason: 'scope-changed',
        });
    });

    it('reports asynchronous and synchronous reader failures', () => {
        const onStatus = vi.fn<(status: MindMapFileDropStatus) => void>();
        const mindRef = { current: createMind() } satisfies RefObject<MindElixirInstance | null>;
        const { result } = renderHook(() => useMindElixirFileDrop(mindRef, { onStatus }));

        act(() => result.current.handleDrop(createDragEvent([
            createFile('ideas.md', 'text/markdown'),
        ]).event));
        act(() => ControlledFileReader.instances[0]?.fail());
        expect(onStatus).toHaveBeenLastCalledWith({
            format: 'Markdown',
            kind: 'error',
            reason: 'read',
        });

        ControlledFileReader.throwOnRead = true;
        act(() => result.current.handleDrop(createDragEvent([
            createFile('other.md', 'text/markdown'),
        ]).event));
        expect(onStatus).toHaveBeenLastCalledWith({
            format: 'Markdown',
            kind: 'error',
            reason: 'read',
        });
    });

    it('aborts an active reader on disposal without notifying an unmounted surface', () => {
        const onStatus = vi.fn<(status: MindMapFileDropStatus) => void>();
        const mindRef = { current: createMind() } satisfies RefObject<MindElixirInstance | null>;
        const hook = renderHook(() => useMindElixirFileDrop(mindRef, { onStatus }));

        act(() => hook.result.current.handleDrop(createDragEvent([
            createFile('ideas.md', 'text/markdown'),
        ]).event));
        hook.unmount();

        expect(ControlledFileReader.instances[0]?.readyState).toBe(ControlledFileReader.DONE);
        expect(onStatus).not.toHaveBeenCalled();
    });
});
