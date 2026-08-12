// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    TRANSIENT_STATUS_DURATION_MS,
    useTransientStatusMessage,
} from '../useTransientStatusMessage';

afterEach(() => {
    vi.useRealTimers();
});

describe('useTransientStatusMessage', () => {
    it('dismisses transient feedback after the readable interval', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useTransientStatusMessage());

        act(() => result.current.setStatusMessage('已完成操作'));
        expect(result.current.statusMessage).toBe('已完成操作');

        act(() => vi.advanceTimersByTime(TRANSIENT_STATUS_DURATION_MS - 1));
        expect(result.current.statusMessage).toBe('已完成操作');

        act(() => vi.advanceTimersByTime(1));
        expect(result.current.statusMessage).toBe('');
    });

    it('restarts dismissal and remounts live feedback for repeated messages', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useTransientStatusMessage());

        act(() => result.current.setStatusMessage('已撤销上一步'));
        const firstVersion = result.current.statusMessageVersion;
        act(() => vi.advanceTimersByTime(3_000));
        act(() => result.current.setStatusMessage('已撤销上一步'));

        expect(result.current.statusMessageVersion).toBe(firstVersion + 1);
        act(() => vi.advanceTimersByTime(1_000));
        expect(result.current.statusMessage).toBe('已撤销上一步');
        act(() => vi.advanceTimersByTime(3_000));
        expect(result.current.statusMessage).toBe('');
    });

    it('clears immediately and cancels pending work for empty feedback', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useTransientStatusMessage());

        act(() => result.current.setStatusMessage('操作失败'));
        expect(vi.getTimerCount()).toBe(1);
        act(() => result.current.setStatusMessage(''));

        expect(result.current.statusMessage).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels dismissal when the owner unmounts', () => {
        vi.useFakeTimers();
        const { result, unmount } = renderHook(() => useTransientStatusMessage());

        act(() => result.current.setStatusMessage('已恢复历史状态'));
        expect(vi.getTimerCount()).toBe(1);
        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
