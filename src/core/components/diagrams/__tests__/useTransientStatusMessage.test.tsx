// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    TRANSIENT_ACTION_STATUS_DURATION_MS,
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

    it('exposes and clears a contextual recovery action with the status', () => {
        vi.useFakeTimers();
        const undo = vi.fn();
        const { result } = renderHook(() => useTransientStatusMessage());

        act(() => result.current.setStatusMessage('已新建页面', { label: '撤销此操作', onActivate: undo }));
        expect(result.current.statusAction?.label).toBe('撤销此操作');
        act(() => result.current.statusAction?.onActivate());
        expect(undo).toHaveBeenCalledTimes(1);

        act(() => vi.advanceTimersByTime(TRANSIENT_ACTION_STATUS_DURATION_MS));
        expect(result.current.statusMessage).toBe('');
        expect(result.current.statusAction).toBeNull();
    });

    it('keeps recovery actions available longer and pauses dismissal while the user interacts', () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const { result } = renderHook(() => useTransientStatusMessage());

        act(() => result.current.setStatusMessage('已移动页面', {
            label: '撤销此操作',
            onActivate: vi.fn(),
        }));
        act(() => vi.advanceTimersByTime(4_000));
        act(() => result.current.pauseStatusDismissal());
        act(() => vi.advanceTimersByTime(TRANSIENT_ACTION_STATUS_DURATION_MS));

        expect(result.current.statusMessage).toBe('已移动页面');
        expect(result.current.statusAction?.label).toBe('撤销此操作');

        act(() => result.current.resumeStatusDismissal());
        act(() => vi.advanceTimersByTime(7_999));
        expect(result.current.statusMessage).toBe('已移动页面');
        act(() => vi.advanceTimersByTime(1));
        expect(result.current.statusMessage).toBe('');
    });
});
