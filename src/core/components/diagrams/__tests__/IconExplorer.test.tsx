// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../../../types/plugin';

const { searchIconifyIconsMock } = vi.hoisted(() => ({
    searchIconifyIconsMock: vi.fn(),
}));

vi.mock('@/core/utils/iconifySecurity', () => ({
    isSafeIconifyIconName: () => true,
    searchIconifyIcons: searchIconifyIconsMock,
}));

import { IconExplorer } from '../IconExplorer';

afterEach(() => {
    vi.useRealTimers();
    searchIconifyIconsMock.mockReset();
});

describe('IconExplorer', () => {
    it('names search and preset controls and lets keyboard users add a result', async () => {
        vi.useFakeTimers();
        searchIconifyIconsMock.mockResolvedValue({ icons: ['mdi:database'] });
        const addCalls: Array<{ type: string; data: unknown }> = [];
        const ctx: PluginContext = {
            getNodes: () => [],
            getEdges: () => [],
            updateNodesBatch: () => undefined,
            updateEdgesBatch: () => undefined,
            takeSnapshot: () => undefined,
            nodes: [],
            edges: [],
            setNodes: () => undefined,
            setEdges: () => undefined,
            addNode: (type, data) => {
                addCalls.push({ type, data });
                return 'icon-node-1';
            },
        };

        render(<IconExplorer ctx={ctx} />);

        expect(screen.getByRole('button', { name: '搜索图标库 Material Design' })).toBeTruthy();
        const search = screen.getByRole('textbox', { name: '搜索云端图标' });
        fireEvent.change(search, { target: { value: 'database' } });
        expect(screen.getByRole('button', { name: '清除图标搜索' })).toBeTruthy();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
            await Promise.resolve();
        });

        const result = screen.getByRole('button', { name: '添加图标 mdi:database' });
        fireEvent.click(result);

        expect(addCalls).toEqual([{
            type: 'iconNode',
            data: { label: 'database', icon: 'mdi:database', width: 64, height: 64 },
        }]);
    });
});
