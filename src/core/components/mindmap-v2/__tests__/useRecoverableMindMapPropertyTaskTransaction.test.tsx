// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { NodeObj } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { useRecoverableMindMapPropertyTaskTransaction } from '../useRecoverableMindMapPropertyTaskTransaction';

const createNode = (id = 'node-1'): NodeObj => ({
    id,
    topic: 'Ship release',
    tags: [{ text: 'Customer' }],
});

describe('useRecoverableMindMapPropertyTaskTransaction', () => {
    it('keeps rapid task and tag intentions when the newer complete snapshot succeeds', async () => {
        const finishes: Array<(value: boolean) => void> = [];
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => finishes.push(resolve)));
        const hook = renderHook(() => useRecoverableMindMapPropertyTaskTransaction({
            failureMessage: 'Save failed', node: createNode(), onCommit,
        }));

        act(() => {
            hook.result.current.updateTask({ status: 'doing' });
            hook.result.current.updateTags([{ text: 'Customer' }, { text: 'Risk' }]);
        });
        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(hook.result.current.pending).toBe(true);
        expect(hook.result.current.meta.status).toBe('doing');
        expect(hook.result.current.tags.map(tag => tag.text)).toContain('Risk');

        await act(async () => {
            finishes[1]?.(true);
            finishes[0]?.(false);
        });

        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.meta.status).toBe('doing');
        expect(hook.result.current.tags.map(tag => tag.text)).toContain('Risk');
        expect(hook.result.current.error).toBe('');
    });

    it('waits for every mutation before rolling the whole draft back', async () => {
        const finishes: Array<(value: boolean) => void> = [];
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => finishes.push(resolve)));
        const hook = renderHook(() => useRecoverableMindMapPropertyTaskTransaction({
            failureMessage: 'Save failed', node: createNode(), onCommit,
        }));

        act(() => {
            hook.result.current.updateTask({ status: 'done' });
            hook.result.current.updateTask({ priority: '高' });
        });
        await act(async () => { finishes[0]?.(false); });
        expect(hook.result.current.pending).toBe(true);
        expect(hook.result.current.meta).toMatchObject({ priority: '高', status: 'done' });
        expect(hook.result.current.error).toBe('');

        await act(async () => { finishes[1]?.(false); });
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.meta).toMatchObject({ priority: '无', status: 'todo' });
        expect(hook.result.current.tags).toEqual([{ text: 'Customer' }]);
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('treats thrown mutations as recoverable failures', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyTaskTransaction({
            failureMessage: 'Save failed',
            node: createNode(),
            onCommit: async () => { throw new Error('offline'); },
        }));

        act(() => hook.result.current.updateTask({ progress: 70 }));
        await act(async () => undefined);

        expect(hook.result.current.meta.progress).toBe(0);
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('ignores stale completion after the selected node changes', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(
            ({ node }) => useRecoverableMindMapPropertyTaskTransaction({
                failureMessage: 'Save failed', node, onCommit,
            }),
            { initialProps: { node: createNode('node-1') } },
        );

        act(() => hook.result.current.updateTask({ status: 'doing' }));
        hook.rerender({ node: createNode('node-2') });
        await act(async () => { finish?.(false); });

        expect(hook.result.current.meta.status).toBe('todo');
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('');
    });
});
