// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    PAGE_TABS_STATUS_DURATION_MS,
    usePageTabsStatusMessage,
} from '../usePageTabsStatusMessage';

afterEach(() => {
    vi.useRealTimers();
});

describe('usePageTabsStatusMessage', () => {
    it('dismisses transient feedback after the readable interval', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => usePageTabsStatusMessage());

        act(() => result.current.setStatusMessage('已新建页面'));
        expect(result.current.statusMessage).toBe('已新建页面');

        act(() => vi.advanceTimersByTime(PAGE_TABS_STATUS_DURATION_MS - 1));
        expect(result.current.statusMessage).toBe('已新建页面');

        act(() => vi.advanceTimersByTime(1));
        expect(result.current.statusMessage).toBe('');
    });

    it('restarts dismissal and remounts live feedback for repeated messages', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => usePageTabsStatusMessage());

        act(() => result.current.setStatusMessage('已新建页面'));
        const firstVersion = result.current.statusMessageVersion;
        act(() => vi.advanceTimersByTime(3_000));
        act(() => result.current.setStatusMessage('已新建页面'));

        expect(result.current.statusMessageVersion).toBe(firstVersion + 1);
        act(() => vi.advanceTimersByTime(1_000));
        expect(result.current.statusMessage).toBe('已新建页面');
        act(() => vi.advanceTimersByTime(3_000));
        expect(result.current.statusMessage).toBe('');
    });

    it('clears immediately and cancels pending work for empty feedback', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => usePageTabsStatusMessage());

        act(() => result.current.setStatusMessage('无法新建页面'));
        expect(vi.getTimerCount()).toBe(1);
        act(() => result.current.setStatusMessage(''));

        expect(result.current.statusMessage).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels dismissal when the owner unmounts', () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => usePageTabsStatusMessage());

        act(() => result.current.setStatusMessage('页面已重命名'));
        expect(vi.getTimerCount()).toBe(1);
        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
