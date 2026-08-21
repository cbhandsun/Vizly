// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    coerceMindMapPropertyFontSize,
    useRecoverableMindMapPropertyFontSize,
} from '../useRecoverableMindMapPropertyFontSize';

describe('coerceMindMapPropertyFontSize', () => {
    it('normalizes valid, empty, invalid, fractional, and extreme inputs', () => {
        expect(coerceMindMapPropertyFontSize('18px')).toBe(18);
        expect(coerceMindMapPropertyFontSize('18pt')).toBe(18);
        expect(coerceMindMapPropertyFontSize(12.9)).toBe(12);
        expect(coerceMindMapPropertyFontSize(undefined)).toBe(14);
        expect(coerceMindMapPropertyFontSize(null)).toBe(14);
        expect(coerceMindMapPropertyFontSize('')).toBe(14);
        expect(coerceMindMapPropertyFontSize('18pxjunk')).toBe(14);
        expect(coerceMindMapPropertyFontSize(Number.NaN)).toBe(14);
        expect(coerceMindMapPropertyFontSize(Number.POSITIVE_INFINITY)).toBe(14);
        expect(coerceMindMapPropertyFontSize(10)).toBe(10);
        expect(coerceMindMapPropertyFontSize(48)).toBe(48);
        expect(coerceMindMapPropertyFontSize(-100)).toBe(10);
        expect(coerceMindMapPropertyFontSize(999)).toBe(48);
    });
});

describe('useRecoverableMindMapPropertyFontSize', () => {
    it('keeps edits local until commit and publishes the normalized value once', async () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyFontSize({
            failureMessage: 'Save failed', initialValue: '14px', onCommit, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.setValue(24));
        expect(hook.result.current.value).toBe(24);
        expect(onCommit).not.toHaveBeenCalled();

        act(() => hook.result.current.commit());
        expect(hook.result.current.pending).toBe(true);
        expect(onCommit).toHaveBeenCalledWith(24);
        await act(async () => undefined);

        expect(hook.result.current.value).toBe(24);
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('');
    });

    it('restores an empty draft without issuing a mutation', () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyFontSize({
            failureMessage: 'Save failed', initialValue: '16px', onCommit, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.setValue(null));
        expect(hook.result.current.value).toBeNull();
        act(() => hook.result.current.commit());

        expect(hook.result.current.value).toBe(16);
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('clamps underflow and overflow drafts before committing', async () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyFontSize({
            failureMessage: 'Save failed', initialValue: '14px', onCommit, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.setValue(999));
        act(() => hook.result.current.commit());
        await act(async () => undefined);
        expect(onCommit).toHaveBeenLastCalledWith(48);

        act(() => hook.result.current.setValue(-100));
        act(() => hook.result.current.commit());
        await act(async () => undefined);
        expect(onCommit).toHaveBeenLastCalledWith(10);
    });

    it('rolls back and exposes an error when the mutation returns false', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyFontSize({
            failureMessage: 'Save failed', initialValue: '14px', onCommit: async () => false, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.setValue(20));
        act(() => hook.result.current.commit());
        await act(async () => undefined);

        expect(hook.result.current.value).toBe(14);
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('treats thrown mutations as recoverable failures', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyFontSize({
            failureMessage: 'Save failed', initialValue: '14px',
            onCommit: async () => { throw new Error('offline'); }, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.setValue(22));
        act(() => hook.result.current.commit());
        await act(async () => undefined);

        expect(hook.result.current.value).toBe(14);
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('deduplicates Enter and blur commits while the mutation is pending', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(() => useRecoverableMindMapPropertyFontSize({
            failureMessage: 'Save failed', initialValue: '14px', onCommit, sourceKey: 'node-1',
        }));

        act(() => hook.result.current.setValue(28));
        act(() => {
            hook.result.current.commit();
            hook.result.current.commit();
        });

        expect(onCommit).toHaveBeenCalledTimes(1);
        await act(async () => { finish?.(true); });
        expect(hook.result.current.value).toBe(28);
    });

    it('ignores a stale completion after the selected node changes', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(
            ({ sourceKey, initialValue }) => useRecoverableMindMapPropertyFontSize({
                failureMessage: 'Save failed', initialValue, onCommit, sourceKey,
            }),
            { initialProps: { sourceKey: 'node-1', initialValue: '14px' } },
        );

        act(() => hook.result.current.setValue(30));
        act(() => hook.result.current.commit());
        hook.rerender({ sourceKey: 'node-2', initialValue: '18px' });
        await act(async () => { finish?.(false); });

        expect(hook.result.current.value).toBe(18);
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBe('');
    });
});
