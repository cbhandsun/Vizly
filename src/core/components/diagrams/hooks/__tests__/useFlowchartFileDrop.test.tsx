// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { FlowchartImportRequestOptions } from '../useFlowchartImportRequest';
import { useFlowchartFileDrop } from '../useFlowchartFileDrop';

const makeDragEvent = (file?: File, types: string[] = file ? ['Files'] : []) => {
    const event = {
        preventDefault: vi.fn(),
        dataTransfer: {
            files: file ? [file] : [],
            types,
            dropEffect: 'none',
        },
    };
    return event as unknown as DragEvent;
};

describe('useFlowchartFileDrop', () => {
    it('shows a copy affordance while a file is over the canvas', () => {
        const { result } = renderHook(() => useFlowchartFileDrop({
            importFile: vi.fn(),
            requestImport: vi.fn(),
            onCanvasDragOver: vi.fn(),
            onCanvasDrop: vi.fn(),
            confirmOkText: 'Continue import',
            enabled: true,
        }));
        const event = makeDragEvent(new File(['x'], 'diagram.mmd'));

        act(() => result.current.handleDragEnter(event));
        expect(result.current.isFileDragActive).toBe(true);

        act(() => result.current.handleDragOver(event));
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.dataTransfer.dropEffect).toBe('copy');
    });

    it('routes dropped text files through confirmation and the existing import handler', async () => {
        const importFile = vi.fn();
        const requestImport = vi.fn();
        const onCanvasDrop = vi.fn();
        const { result } = renderHook(() => useFlowchartFileDrop({
            importFile,
            requestImport,
            onCanvasDragOver: vi.fn(),
            onCanvasDrop,
            confirmOkText: 'Continue import',
            enabled: true,
        }));
        const file = new File(['flowchart TD\nA-->B'], 'diagram.mmd', { type: 'text/plain' });
        const event = makeDragEvent(file);

        act(() => result.current.handleDrop(event));

        expect(event.preventDefault).toHaveBeenCalled();
        expect(onCanvasDrop).not.toHaveBeenCalled();
        expect(requestImport).toHaveBeenCalledWith(expect.objectContaining({
            okText: 'Continue import',
            startImport: expect.any(Function),
        }));

        const options = requestImport.mock.calls[0]?.[0] as FlowchartImportRequestOptions | undefined;
        await act(async () => options?.startImport?.());
        expect(importFile).toHaveBeenCalledWith({
            target: { files: [file], value: '' },
        });
    });

    it('keeps image reverse-import and component drags on the existing canvas path', () => {
        const requestImport = vi.fn();
        const onCanvasDrop = vi.fn();
        const { result } = renderHook(() => useFlowchartFileDrop({
            importFile: vi.fn(),
            requestImport,
            onCanvasDragOver: vi.fn(),
            onCanvasDrop,
            confirmOkText: 'Continue import',
            enabled: true,
        }));

        act(() => result.current.handleDrop(makeDragEvent(
            new File(['image'], 'diagram.png', { type: 'image/png' }),
        )));
        act(() => result.current.handleDrop(makeDragEvent()));

        expect(onCanvasDrop).toHaveBeenCalledTimes(2);
        expect(requestImport).not.toHaveBeenCalled();
    });

    it('blocks every file drop through the existing editing guard when editing is disabled', () => {
        const requestImport = vi.fn();
        const onCanvasDrop = vi.fn();
        const { result } = renderHook(() => useFlowchartFileDrop({
            importFile: vi.fn(),
            requestImport,
            onCanvasDragOver: vi.fn(),
            onCanvasDrop,
            confirmOkText: 'Continue import',
            enabled: false,
        }));
        const event = makeDragEvent(new File(['image'], 'diagram.png', { type: 'image/png' }));

        act(() => result.current.handleDragEnter(event));
        expect(result.current.isFileDragActive).toBe(false);

        act(() => result.current.handleDrop(event));
        expect(event.preventDefault).toHaveBeenCalled();
        expect(requestImport).toHaveBeenCalledWith();
        expect(onCanvasDrop).not.toHaveBeenCalled();
    });
});
