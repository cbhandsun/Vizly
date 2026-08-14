// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMindMapFocusMode, type MindMapFocusInstance } from '../useMindMapFocusMode';

const createMind = () => {
    const targetNode = document.createElement('div');
    const focusNode = vi.fn();
    const cancelFocus = vi.fn();
    const mind: MindMapFocusInstance = {
        cancelFocus,
        currentNode: null,
        findEle: vi.fn((nodeId: string) => nodeId === 'child' ? targetNode : null),
        focusNode,
    };
    return { cancelFocus, focusNode, mind, targetNode };
};

describe('useMindMapFocusMode', () => {
    it('keeps focus state reactive and scoped to the current mind instance', () => {
        const first = createMind();
        const second = createMind();
        const reportError = vi.fn();
        const { result, rerender } = renderHook(
            ({ mind }: { mind: MindMapFocusInstance | null }) => useMindMapFocusMode(mind, reportError),
            { initialProps: { mind: first.mind } },
        );

        expect(result.current.isFocused).toBe(false);
        act(() => result.current.toggleFocusMode('child'));
        expect(first.focusNode).toHaveBeenCalledWith(first.targetNode);
        expect(result.current.isFocused).toBe(true);

        rerender({ mind: second.mind });
        expect(first.cancelFocus).toHaveBeenCalledTimes(1);
        expect(result.current.isFocused).toBe(false);
        act(() => result.current.toggleFocusMode('child'));
        expect(second.focusNode).toHaveBeenCalledWith(second.targetNode);
        expect(result.current.isFocused).toBe(true);
        expect(reportError).not.toHaveBeenCalled();
    });

    it('cancels focus and does not claim an unavailable focus capability', () => {
        const available = createMind();
        const reportError = vi.fn();
        const { result, unmount } = renderHook(() => useMindMapFocusMode(available.mind, reportError));

        act(() => result.current.toggleFocusMode('child'));
        act(() => result.current.toggleFocusMode());
        expect(available.cancelFocus).toHaveBeenCalledTimes(1);
        expect(result.current.isFocused).toBe(false);
        unmount();
        expect(available.cancelFocus).toHaveBeenCalledTimes(1);

        const unavailable: MindMapFocusInstance = {
            currentNode: null,
            findEle: () => null,
        };
        const missing = renderHook(() => useMindMapFocusMode(unavailable, reportError));
        act(() => missing.result.current.toggleFocusMode());
        expect(missing.result.current.isFocused).toBe(false);
    });

    it('cancels an active focus when the instance becomes unavailable or unmounts', () => {
        const unavailable = createMind();
        const unmounted = createMind();
        const reportError = vi.fn();
        const initialProps: { mind: MindMapFocusInstance | null } = { mind: unavailable.mind };
        const unavailableHook = renderHook(
            ({ mind }: { mind: MindMapFocusInstance | null }) => useMindMapFocusMode(mind, reportError),
            { initialProps },
        );

        act(() => unavailableHook.result.current.toggleFocusMode('child'));
        unavailableHook.rerender({ mind: null });
        expect(unavailable.cancelFocus).toHaveBeenCalledTimes(1);
        expect(unavailableHook.result.current.isFocused).toBe(false);

        const unmountedHook = renderHook(() => useMindMapFocusMode(unmounted.mind, reportError));
        act(() => unmountedHook.result.current.toggleFocusMode('child'));
        unmountedHook.unmount();
        expect(unmounted.cancelFocus).toHaveBeenCalledTimes(1);
        expect(reportError).not.toHaveBeenCalled();
    });

    it('reports cancellation failures while still clearing the focused instance', () => {
        const failing = createMind();
        const reportError = vi.fn();
        const failure = new Error('focus cancellation failed');
        failing.cancelFocus.mockImplementation(() => {
            throw failure;
        });
        const { result, unmount } = renderHook(() => useMindMapFocusMode(failing.mind, reportError));

        act(() => result.current.toggleFocusMode('child'));
        act(() => result.current.toggleFocusMode());
        expect(reportError).toHaveBeenCalledWith(failure);
        expect(result.current.isFocused).toBe(false);

        unmount();
        expect(failing.cancelFocus).toHaveBeenCalledTimes(1);
    });

    it('does not fall back to the root when the selected node is missing or stale', () => {
        const available = createMind();
        const reportError = vi.fn();
        const { result } = renderHook(() => useMindMapFocusMode(available.mind, reportError));

        act(() => result.current.toggleFocusMode());
        act(() => result.current.toggleFocusMode('   '));
        act(() => result.current.toggleFocusMode('missing'));

        expect(available.mind.findEle).toHaveBeenCalledTimes(1);
        expect(available.mind.findEle).toHaveBeenCalledWith('missing');
        expect(available.focusNode).not.toHaveBeenCalled();
        expect(result.current.isFocused).toBe(false);
        expect(reportError).not.toHaveBeenCalled();
    });
});
