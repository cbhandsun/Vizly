// @vitest-environment jsdom
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedFormState } from '../useUnsavedFormState';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const canLeave = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }));

describe('unsaved form unload boundary', () => {
    it('allows leaving as soon as a successful save clears dirty state, before React commits', () => {
        const { result } = renderHook(useUnsavedFormState);
        expect(canLeave()).toBe(true);
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        expect(canLeave()).toBe(false);
        act(() => {
            result.current[1](false);
            expect(canLeave()).toBe(true);
            // React has not committed this state change yet.
            expect(result.current[0]).toBe(true);
        });
        expect(result.current[0]).toBe(false);
        expect(canLeave()).toBe(true);
    });

    it('keeps protection when another edit supersedes a save before React commits', () => {
        const { result } = renderHook(useUnsavedFormState);
        act(() => result.current[1](true));
        expect(canLeave()).toBe(false);
        act(() => {
            result.current[1](false);
            expect(canLeave()).toBe(true);
            result.current[1](true);
            expect(canLeave()).toBe(false);
        });
        expect(result.current[0]).toBe(true);
    });

    it('does not retain a clean listener and cleans up dirty listeners on unmount in StrictMode', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        const { result, unmount } = renderHook(useUnsavedFormState, {
            wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
        });
        expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0);
        act(() => result.current[1](true));
        act(() => result.current[1](false));
        expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
        expect(remove.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
        act(() => result.current[1](true));
        unmount();
        expect(canLeave()).toBe(true);
        expect(remove.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(2);
    });
});
