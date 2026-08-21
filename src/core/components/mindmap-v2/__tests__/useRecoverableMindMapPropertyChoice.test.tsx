// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useRecoverableMindMapPropertyChoice } from '../useRecoverableMindMapPropertyChoice';

describe('useRecoverableMindMapPropertyChoice', () => {
    it('publishes a choice only after the mutation succeeds', async () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyChoice({
            failureMessage: 'Save failed', initialValue: 'rect', onCommit, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.select('diamond'));
        expect(hook.result.current.value).toBe('diamond');
        expect(hook.result.current.pending).toBe(true);
        await act(async () => undefined);

        expect(onCommit).toHaveBeenCalledWith('diamond');
        expect(hook.result.current.value).toBe('diamond');
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('');
    });

    it('rolls back and exposes an error when the mutation fails', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyChoice({
            failureMessage: 'Save failed', initialValue: 2, onCommit: async () => false, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.select(6));
        await act(async () => undefined);

        expect(hook.result.current.value).toBe(2);
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('treats thrown mutations as recoverable failures', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyChoice({
            failureMessage: 'Save failed', initialValue: 'oval',
            onCommit: async () => { throw new Error('offline'); }, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.select('rect'));
        await act(async () => undefined);

        expect(hook.result.current.value).toBe('oval');
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('deduplicates choices while a mutation is pending', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(() => useRecoverableMindMapPropertyChoice({
            failureMessage: 'Save failed', initialValue: 1, onCommit, sourceKey: 'node-1',
        }));

        act(() => {
            hook.result.current.select(4);
            hook.result.current.select(6);
        });
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(4);
        await act(async () => { finish?.(true); });
        expect(hook.result.current.value).toBe(4);
    });

    it('ignores stale completion when a same-valued node replaces the source', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(
            ({ sourceKey }) => useRecoverableMindMapPropertyChoice({
                failureMessage: 'Save failed', initialValue: 'rect', onCommit, sourceKey,
            }),
            { initialProps: { sourceKey: 'node-1' } },
        );

        act(() => hook.result.current.select('diamond'));
        hook.rerender({ sourceKey: 'node-2' });
        await act(async () => { finish?.(false); });

        expect(hook.result.current.value).toBe('rect');
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('');
    });
});
