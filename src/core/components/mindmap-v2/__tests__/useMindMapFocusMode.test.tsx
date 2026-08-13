// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMindMapFocusMode, type MindMapFocusInstance } from '../useMindMapFocusMode';

const createMind = (selectedNode: Element | null = null) => {
    const rootNode = document.createElement('div');
    const focusNode = vi.fn();
    const cancelFocus = vi.fn();
    const mind: MindMapFocusInstance = {
        cancelFocus,
        currentNode: selectedNode,
        findEle: vi.fn(() => rootNode),
        focusNode,
        getData: () => ({ nodeData: { id: 'root' } }),
    };
    return { cancelFocus, focusNode, mind, rootNode };
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
        act(() => result.current.toggleFocusMode());
        expect(first.focusNode).toHaveBeenCalledWith(first.rootNode);
        expect(result.current.isFocused).toBe(true);

        rerender({ mind: second.mind });
        expect(first.cancelFocus).toHaveBeenCalledTimes(1);
        expect(result.current.isFocused).toBe(false);
        act(() => result.current.toggleFocusMode());
        expect(second.focusNode).toHaveBeenCalledWith(second.rootNode);
        expect(result.current.isFocused).toBe(true);
        expect(reportError).not.toHaveBeenCalled();
    });

    it('cancels focus and does not claim an unavailable focus capability', () => {
        const available = createMind(document.createElement('button'));
        const reportError = vi.fn();
        const { result, unmount } = renderHook(() => useMindMapFocusMode(available.mind, reportError));

        act(() => result.current.toggleFocusMode());
        act(() => result.current.toggleFocusMode());
        expect(available.cancelFocus).toHaveBeenCalledTimes(1);
        expect(result.current.isFocused).toBe(false);
        unmount();
        expect(available.cancelFocus).toHaveBeenCalledTimes(1);

        const unavailable: MindMapFocusInstance = {
            currentNode: null,
            findEle: () => null,
            getData: () => ({ nodeData: { id: 'root' } }),
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

        act(() => unavailableHook.result.current.toggleFocusMode());
        unavailableHook.rerender({ mind: null });
        expect(unavailable.cancelFocus).toHaveBeenCalledTimes(1);
        expect(unavailableHook.result.current.isFocused).toBe(false);

        const unmountedHook = renderHook(() => useMindMapFocusMode(unmounted.mind, reportError));
        act(() => unmountedHook.result.current.toggleFocusMode());
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

        act(() => result.current.toggleFocusMode());
        act(() => result.current.toggleFocusMode());
        expect(reportError).toHaveBeenCalledWith(failure);
        expect(result.current.isFocused).toBe(false);

        unmount();
        expect(failing.cancelFocus).toHaveBeenCalledTimes(1);
    });
});
