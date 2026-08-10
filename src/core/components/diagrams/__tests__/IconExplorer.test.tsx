// @vitest-environment jsdom

import React from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../../../types/plugin';
import en from '../../../../locales/en.json';
import i18n from '../../../../i18n';

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
    beforeEach(async () => {
        await i18n.changeLanguage('zh');
    });

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
        expect(search.parentElement?.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
        fireEvent.change(search, { target: { value: 'database' } });
        const clearSearch = screen.getByRole('button', { name: '清除图标搜索' });
        expect((clearSearch.firstElementChild as HTMLElement | null)?.style.width)
            .toBe('var(--commercial-touch-target, 44px)');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
            await Promise.resolve();
        });

        const result = screen.getByRole('button', { name: '添加图标 mdi:database' });
        expect(screen.getByRole('status').textContent).toContain('找到 1 个匹配图标');
        fireEvent.click(result);

        expect(addCalls).toEqual([{
            type: 'iconNode',
            data: { label: 'database', icon: 'mdi:database', width: 64, height: 64 },
        }]);
    });

    it('localizes the complete icon discovery surface in English', async () => {
        const englishI18n = createInstance();
        await englishI18n.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { translation: en } },
        });
        const ctx = {
            addNode: vi.fn(),
        } as unknown as PluginContext;

        render(
            <I18nextProvider i18n={englishI18n}>
                <IconExplorer ctx={ctx} />
            </I18nextProvider>,
        );

        expect(screen.getByRole('textbox', { name: 'Search cloud icons' }).getAttribute('placeholder'))
            .toBe('Search 100,000+ icons...');
        expect(screen.getByText('Popular icon libraries')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Search Brand logos icons' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Search AWS cloud services icons' })).toBeTruthy();
        expect(screen.getByText('Click to add, or drag to place it on the canvas')).toBeTruthy();
    });

    it('distinguishes request failures from empty results and retries without stale icons', async () => {
        vi.useFakeTimers();
        searchIconifyIconsMock
            .mockResolvedValueOnce({ icons: ['mdi:database'] })
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ icons: ['mdi:cloud'] });
        const ctx = { addNode: vi.fn() } as unknown as PluginContext;

        render(<IconExplorer ctx={ctx} />);
        const search = screen.getByRole('textbox', { name: '搜索云端图标' });

        fireEvent.change(search, { target: { value: 'database' } });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
            await Promise.resolve();
        });
        expect(screen.getByRole('button', { name: '添加图标 mdi:database' })).toBeTruthy();

        fireEvent.change(search, { target: { value: 'cloud' } });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
            await Promise.resolve();
        });

        expect(screen.queryByRole('button', { name: '添加图标 mdi:database' })).toBeNull();
        expect(screen.getByRole('alert').textContent).toContain('搜索图标失败，请检查网络连接后重试');
        const retry = screen.getByRole('button', { name: '重试' });
        expect(retry.style.minHeight).toBe('var(--commercial-touch-target, 44px)');

        fireEvent.click(retry);
        await act(async () => {
            await Promise.resolve();
        });

        expect(searchIconifyIconsMock).toHaveBeenCalledTimes(3);
        expect(screen.getByRole('button', { name: '添加图标 mdi:cloud' })).toBeTruthy();
    });

    it('announces a true empty result as status rather than an error', async () => {
        vi.useFakeTimers();
        searchIconifyIconsMock.mockResolvedValue({ icons: [] });
        const ctx = { addNode: vi.fn() } as unknown as PluginContext;

        render(<IconExplorer ctx={ctx} />);
        fireEvent.change(screen.getByRole('textbox', { name: '搜索云端图标' }), {
            target: { value: 'no-match' },
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
            await Promise.resolve();
        });

        expect(screen.getByRole('status').textContent).toContain('未找到匹配图标');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
