// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { MindElixirInstance } from 'mind-elixir';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    buildMindMapExportFileName,
    useMindElixirExportActions,
} from '../useMindElixirExportActions';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('mind map export result feedback', () => {
    it('builds recognizable bounded filenames without trusting topic text', () => {
        expect(buildMindMapExportFileName('../AUX:<plan>.json', '.json')).toBe('_AUX_plan_.json');
        expect(buildMindMapExportFileName('Plan.json', '.json')).toBe('Plan.json');
        expect(buildMindMapExportFileName('   ', '.md')).toBe('mindmap.md');
        expect(buildMindMapExportFileName('x'.repeat(200), '_pitch.md')).toHaveLength(105);
    });

    it('reports the exported format after a successful text export', () => {
        const onStatus = vi.fn();
        let downloadedName = '';
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function clickDownload(
            this: HTMLAnchorElement,
        ) {
            downloadedName = this.download;
        });
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:mindmap-json'),
            revokeObjectURL: vi.fn(),
        });
        const mind = {
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
        } as unknown as MindElixirInstance;
        const { result } = renderHook(() => useMindElixirExportActions(mind, { onStatus }));

        act(() => result.current.handleExportJson());

        expect(click).toHaveBeenCalledOnce();
        expect(downloadedName).toBe('Root.json');
        expect(onStatus).toHaveBeenCalledWith({ format: 'JSON', kind: 'success' });
    });

    it('reports a safe failure when an asynchronous export returns no data', async () => {
        const onStatus = vi.fn();
        const mind = {
            exportPng: vi.fn().mockResolvedValue(null),
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
        } as unknown as MindElixirInstance;
        const { result } = renderHook(() => useMindElixirExportActions(mind, { onStatus }));

        await act(async () => result.current.handleExportPng());

        expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
            { format: 'PNG', kind: 'started' },
            { format: 'PNG', kind: 'error' },
        ]);
    });

    it('prevents duplicate asynchronous exports and exposes the active format', async () => {
        let resolvePng: ((blob: Blob) => void) | undefined;
        const pendingPng = new Promise<Blob>(resolve => { resolvePng = resolve; });
        const onStatus = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:mindmap-png'),
            revokeObjectURL: vi.fn(),
        });
        const mind = {
            exportPng: vi.fn(() => pendingPng),
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
        } as unknown as MindElixirInstance;
        const { result } = renderHook(() => useMindElixirExportActions(mind, { onStatus }));

        let firstExport: Promise<void> | undefined;
        act(() => {
            firstExport = result.current.handleExportPng();
        });
        expect(result.current.activeFormat).toBe('PNG');

        await act(async () => result.current.handleExportPng());
        expect(mind.exportPng).toHaveBeenCalledOnce();
        expect(onStatus).toHaveBeenLastCalledWith({
            activeFormat: 'PNG',
            format: 'PNG',
            kind: 'busy',
        });

        resolvePng?.(new Blob(['png'], { type: 'image/png' }));
        await act(async () => firstExport);

        expect(click).toHaveBeenCalledOnce();
        expect(result.current.activeFormat).toBeNull();
        expect(onStatus).toHaveBeenLastCalledWith({ format: 'PNG', kind: 'success' });
    });

    it('reports that the print dialog opened without claiming a PDF was created', () => {
        vi.useFakeTimers();
        const onStatus = vi.fn();
        const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
        const mind = {} as MindElixirInstance;
        const { result } = renderHook(() => useMindElixirExportActions(mind, { onStatus }));

        act(() => result.current.handleExportPdf());

        expect(print).toHaveBeenCalledOnce();
        expect(onStatus).toHaveBeenCalledWith({ format: 'PDF', kind: 'print-opened' });
        expect(onStatus).not.toHaveBeenCalledWith({ format: 'PDF', kind: 'success' });
        act(() => vi.runAllTimers());
    });

    it('suppresses completion feedback after the toolbar unmounts', async () => {
        let resolvePng: ((blob: Blob) => void) | undefined;
        const pendingPng = new Promise<Blob>(resolve => { resolvePng = resolve; });
        const onStatus = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:mindmap-png'),
            revokeObjectURL: vi.fn(),
        });
        const mind = {
            exportPng: vi.fn(() => pendingPng),
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
        } as unknown as MindElixirInstance;
        const hook = renderHook(() => useMindElixirExportActions(mind, { onStatus }));

        let exportPromise: Promise<void> | undefined;
        act(() => {
            exportPromise = hook.result.current.handleExportPng();
        });
        hook.unmount();
        resolvePng?.(new Blob(['png'], { type: 'image/png' }));
        await exportPromise;

        expect(onStatus).toHaveBeenCalledTimes(1);
        expect(onStatus).toHaveBeenCalledWith({ format: 'PNG', kind: 'started' });
    });
});
