// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { MindElixirInstance } from 'mind-elixir';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMindElixirExportActions } from '../useMindElixirExportActions';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('mind map export result feedback', () => {
    it('reports the exported format after a successful text export', () => {
        const onStatus = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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
        expect(onStatus).toHaveBeenCalledWith({ format: 'JSON', kind: 'success' });
        vi.unstubAllGlobals();
    });

    it('reports a safe failure when an asynchronous export returns no data', async () => {
        const onStatus = vi.fn();
        const mind = { exportPng: vi.fn().mockResolvedValue(null) } as unknown as MindElixirInstance;
        const { result } = renderHook(() => useMindElixirExportActions(mind, { onStatus }));

        await act(async () => result.current.handleExportPng());

        expect(onStatus).toHaveBeenCalledWith({ format: 'PNG', kind: 'error' });
    });
});
