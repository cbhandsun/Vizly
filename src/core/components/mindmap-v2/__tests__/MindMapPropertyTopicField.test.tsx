// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    normalizeMindMapPropertyTopic,
    useRecoverableMindMapPropertyTopic,
} from '../useRecoverableMindMapPropertyTopic';
import { MINDMAP_MAX_TOPIC_LENGTH } from '../mindmapTreeSanitizer';

const options = (onCommit: (topic: string) => Promise<boolean>) => ({
    failureMessage: 'Save failed',
    initialValue: 'Confirmed topic',
    onCommit,
    requiredMessage: 'Topic is required',
    sourceKey: 'node-1',
});

describe('normalizeMindMapPropertyTopic', () => {
    it('normalizes empty, typed, numeric, and oversized inputs at the boundary', () => {
        expect(normalizeMindMapPropertyTopic(undefined)).toBe('');
        expect(normalizeMindMapPropertyTopic(null)).toBe('');
        expect(normalizeMindMapPropertyTopic('  Topic  ')).toBe('Topic');
        expect(normalizeMindMapPropertyTopic(42)).toBe('42');
        expect(normalizeMindMapPropertyTopic({ topic: 'unsafe' })).toBe('');
        expect(normalizeMindMapPropertyTopic('x'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20)))
            .toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
    });
});

describe('useRecoverableMindMapPropertyTopic', () => {
    it('keeps edits local until commit and confirms a successful save', async () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(onCommit)));

        act(() => hook.result.current.setDraft('  Updated topic  '));
        expect(hook.result.current.draft).toBe('  Updated topic  ');
        expect(onCommit).not.toHaveBeenCalled();

        act(() => hook.result.current.commit());
        expect(hook.result.current.saving).toBe(true);
        expect(onCommit).toHaveBeenCalledWith('Updated topic');
        await act(async () => undefined);

        expect(hook.result.current.draft).toBe('Updated topic');
        expect(hook.result.current.saving).toBe(false);
        expect(hook.result.current.error).toBe('');
    });

    it('shows required validation and does not mutate an empty topic', () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(onCommit)));

        act(() => hook.result.current.setDraft('   '));
        act(() => hook.result.current.commit());

        expect(hook.result.current.draft).toBe('   ');
        expect(hook.result.current.error).toBe('Topic is required');
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('bounds drafts before they reach the commit boundary', () => {
        const onCommit = vi.fn(async () => true);
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(onCommit)));

        act(() => hook.result.current.setDraft('x'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20)));

        expect(hook.result.current.draft).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
    });

    it('preserves the unsaved draft and exposes an error when save returns false', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(async () => false)));

        act(() => hook.result.current.setDraft('Unsaved draft'));
        act(() => hook.result.current.commit());
        await act(async () => undefined);

        expect(hook.result.current.draft).toBe('Unsaved draft');
        expect(hook.result.current.saving).toBe(false);
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('treats a rejected save as recoverable without losing input', async () => {
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(
            async () => { throw new Error('offline'); },
        )));

        act(() => hook.result.current.setDraft('Retry me'));
        act(() => hook.result.current.commit());
        await act(async () => undefined);

        expect(hook.result.current.draft).toBe('Retry me');
        expect(hook.result.current.error).toBe('Save failed');
    });

    it('deduplicates Enter and blur commits while save is pending', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(onCommit)));

        act(() => hook.result.current.setDraft('One save'));
        act(() => {
            hook.result.current.commit();
            hook.result.current.commit();
        });

        expect(onCommit).toHaveBeenCalledTimes(1);
        await act(async () => { finish?.(true); });
        expect(hook.result.current.draft).toBe('One save');
    });

    it('allows retrying the preserved draft after a failed save', async () => {
        const onCommit = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const hook = renderHook(() => useRecoverableMindMapPropertyTopic(options(onCommit)));

        act(() => hook.result.current.setDraft('Retry topic'));
        act(() => hook.result.current.commit());
        await act(async () => undefined);
        expect(hook.result.current.error).toBe('Save failed');

        act(() => hook.result.current.commit());
        await act(async () => undefined);

        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(hook.result.current.error).toBe('');
        expect(hook.result.current.draft).toBe('Retry topic');
    });

    it('ignores stale completion after the selected node changes', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const hook = renderHook(
            ({ sourceKey, initialValue }) => useRecoverableMindMapPropertyTopic({
                ...options(onCommit), initialValue, sourceKey,
            }),
            { initialProps: { sourceKey: 'node-1', initialValue: 'First node' } },
        );

        act(() => hook.result.current.setDraft('First node edit'));
        act(() => hook.result.current.commit());
        hook.rerender({ sourceKey: 'node-2', initialValue: 'Second node' });
        await act(async () => { finish?.(false); });

        expect(hook.result.current.draft).toBe('Second node');
        expect(hook.result.current.saving).toBe(false);
        expect(hook.result.current.error).toBe('');
    });
});
