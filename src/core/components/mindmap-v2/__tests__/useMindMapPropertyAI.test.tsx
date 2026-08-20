// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    expand: vi.fn(),
    logRequestFailure: vi.fn(),
    logAddChildFailure: vi.fn(),
    summarize: vi.fn(),
}));

vi.mock('../mindmapAIService', () => ({
    expandNodeWithAI: harness.expand,
    getAncestorPath: () => [],
    summarizeNodeWithAI: harness.summarize,
}));

vi.mock('../mindmapPanelLogging', () => ({
    logMindmapPropertyAiAddChildFailure: harness.logAddChildFailure,
    logMindmapPropertyAiRequestFailure: harness.logRequestFailure,
}));

import {
    normalizeMindMapPropertyAISuggestions,
    useMindMapPropertyAI,
} from '../useMindMapPropertyAI';

const translate = (key: string, values?: { count?: number; topic?: string }) => (
    `${key}${values?.count === undefined ? '' : `:${values.count}`}${values?.topic === undefined ? '' : `:${values.topic}`}`
);

const createMind = (nodeData: NodeObj) => {
    const addChild = vi.fn().mockResolvedValue(undefined);
    const findEle = vi.fn(() => ({ nodeObj: nodeData }));
    const selectNode = vi.fn();
    const setNodeTopic = vi.fn();
    const mind = {
        addChild,
        findEle,
        generateNewObj: () => ({ id: 'generated-child' }),
        getData: () => ({ nodeData }),
        selectNode,
        setNodeTopic,
    } as unknown as MindElixirInstance;
    return { addChild, findEle, mind, selectNode, setNodeTopic };
};

beforeEach(() => {
    harness.expand.mockReset();
    harness.summarize.mockReset();
    harness.logRequestFailure.mockReset();
    harness.logAddChildFailure.mockReset();
});

describe('normalizeMindMapPropertyAISuggestions', () => {
    it('parses, bounds, sanitizes, and deduplicates external suggestion arrays', () => {
        const longTopic = '超'.repeat(260);
        expect(normalizeMindMapPropertyAISuggestions([
            null,
            '  风险识别  ',
            '风险识别',
            42,
            longTopic,
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
        ])).toEqual([
            '风险识别',
            '42',
            '超'.repeat(200),
            'A', 'B', 'C', 'D',
        ]);
        expect(normalizeMindMapPropertyAISuggestions({ topics: ['invalid container'] })).toEqual([]);
    });
});

describe('useMindMapPropertyAI request lifecycle', () => {
    it('drops late expansion results after the selected node changes', async () => {
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const next: NodeObj = { id: 'next', topic: 'Next', children: [] };
        const { mind } = createMind(root);
        let resolveExpansion: ((value: { topics: string[] }) => void) | undefined;
        harness.expand.mockImplementationOnce(() => new Promise(resolve => {
            resolveExpansion = resolve;
        }));
        const hook = renderHook(
            ({ node }) => useMindMapPropertyAI({ mind, node, translate }),
            { initialProps: { node: root } },
        );

        act(() => { void hook.result.current.expand(); });
        await waitFor(() => expect(harness.expand).toHaveBeenCalledTimes(1));
        hook.rerender({ node: next });
        await act(async () => {
            resolveExpansion?.({ topics: ['stale suggestion'] });
            await Promise.resolve();
        });

        expect(hook.result.current.suggestions).toEqual([]);
        expect(hook.result.current.status).toBe('');
        expect(hook.result.current.expanding).toBe(false);
    });

    it('does not rename the old node when a late summary resolves after selection changes', async () => {
        const child: NodeObj = { id: 'child', topic: 'Child', children: [] };
        const root: NodeObj = { id: 'root', topic: 'Root', children: [child] };
        const next: NodeObj = { id: 'next', topic: 'Next', children: [] };
        const { mind, setNodeTopic } = createMind(root);
        let resolveSummary: ((value: { topic: string }) => void) | undefined;
        harness.summarize.mockImplementationOnce(() => new Promise(resolve => {
            resolveSummary = resolve;
        }));
        const hook = renderHook(
            ({ node }) => useMindMapPropertyAI({ mind, node, translate }),
            { initialProps: { node: root } },
        );

        act(() => { void hook.result.current.summarize(); });
        await waitFor(() => expect(harness.summarize).toHaveBeenCalledTimes(1));
        hook.rerender({ node: next });
        await act(async () => {
            resolveSummary?.({ topic: 'Late summary' });
            await Promise.resolve();
        });

        expect(setNodeTopic).not.toHaveBeenCalled();
        expect(hook.result.current.status).toBe('');
    });

    it('allows only one AI operation until the current request settles', async () => {
        const child: NodeObj = { id: 'child', topic: 'Child', children: [] };
        const root: NodeObj = { id: 'root', topic: 'Root', children: [child] };
        const { mind } = createMind(root);
        let resolveExpansion: ((value: { topics: string[] }) => void) | undefined;
        harness.expand.mockImplementationOnce(() => new Promise(resolve => {
            resolveExpansion = resolve;
        }));
        const hook = renderHook(() => useMindMapPropertyAI({ mind, node: root, translate }));

        act(() => {
            void hook.result.current.expand();
            void hook.result.current.summarize();
        });
        expect(harness.expand).toHaveBeenCalledTimes(1);
        expect(harness.summarize).not.toHaveBeenCalled();
        expect(hook.result.current.expanding).toBe(true);

        await act(async () => {
            resolveExpansion?.({ topics: ['Risk'] });
            await Promise.resolve();
        });
        expect(hook.result.current.suggestions).toEqual(['Risk']);
        expect(hook.result.current.expanding).toBe(false);
    });

    it('replaces thrown provider details with contextual feedback and logs only through the safe boundary', async () => {
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const { mind } = createMind(root);
        const failure = new Error('Authorization: Bearer provider-secret');
        harness.expand.mockRejectedValueOnce(failure);
        const hook = renderHook(() => useMindMapPropertyAI({ mind, node: root, translate }));

        await act(async () => { await hook.result.current.expand(); });

        expect(hook.result.current.error).toBe('plugins.mindmap.propertyAI.expandFailed');
        expect(hook.result.current.error).not.toContain('provider-secret');
        expect(harness.logRequestFailure).toHaveBeenCalledWith('expand', failure);
        expect(hook.result.current.expanding).toBe(false);
    });

    it('clears suggestions and configuration recovery when the node context changes', async () => {
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const next: NodeObj = { id: 'next', topic: 'Next', children: [] };
        const { mind } = createMind(root);
        harness.expand.mockResolvedValueOnce({
            topics: [],
            error: '请先在 AI 设置中配置有效的 Provider 和 API Key',
        });
        const hook = renderHook(
            ({ node }) => useMindMapPropertyAI({ mind, node, translate }),
            { initialProps: { node: root } },
        );

        await act(async () => { await hook.result.current.expand(); });
        expect(hook.result.current.needsConfiguration).toBe(true);
        expect(hook.result.current.error).toBe('plugins.mindmap.propertyAI.configurationRequired');

        hook.rerender({ node: next });
        expect(hook.result.current.needsConfiguration).toBe(false);
        expect(hook.result.current.error).toBe('');
        expect(hook.result.current.suggestions).toEqual([]);
    });
});
