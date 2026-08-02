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
        const { result, rerender } = renderHook(
            ({ mind }: { mind: MindMapFocusInstance | null }) => useMindMapFocusMode(mind),
            { initialProps: { mind: first.mind } },
        );

        expect(result.current.isFocused).toBe(false);
        act(() => result.current.toggleFocusMode());
        expect(first.focusNode).toHaveBeenCalledWith(first.rootNode);
        expect(result.current.isFocused).toBe(true);

        rerender({ mind: second.mind });
        expect(result.current.isFocused).toBe(false);
        act(() => result.current.toggleFocusMode());
        expect(second.focusNode).toHaveBeenCalledWith(second.rootNode);
        expect(result.current.isFocused).toBe(true);
    });

    it('cancels focus and does not claim an unavailable focus capability', () => {
        const available = createMind(document.createElement('button'));
        const { result } = renderHook(() => useMindMapFocusMode(available.mind));

        act(() => result.current.toggleFocusMode());
        act(() => result.current.toggleFocusMode());
        expect(available.cancelFocus).toHaveBeenCalledTimes(1);
        expect(result.current.isFocused).toBe(false);

        const unavailable: MindMapFocusInstance = {
            currentNode: null,
            findEle: () => null,
            getData: () => ({ nodeData: { id: 'root' } }),
        };
        const missing = renderHook(() => useMindMapFocusMode(unavailable));
        act(() => missing.result.current.toggleFocusMode());
        expect(missing.result.current.isFocused).toBe(false);
    });
});
