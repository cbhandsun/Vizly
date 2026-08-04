// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';

import { useFlowchartToolModeShortcuts } from '../useFlowchartToolModeShortcuts';

const useHarness = (editingEnabled = true) => {
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [isMarqueeActive, setIsMarqueeActive] = useState(false);
    const actions = useFlowchartToolModeShortcuts({
        editingEnabled,
        isDrawingMode,
        isMarqueeActive,
        setIsDrawingMode,
        setIsMarqueeActive,
    });
    return { isDrawingMode, isMarqueeActive, ...actions };
};

describe('useFlowchartToolModeShortcuts', () => {
    it('toggles drawing with P and exits the active tool with Escape', () => {
        const { result } = renderHook(() => useHarness());

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(true);

        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(false);
    });

    it('keeps drawing and marquee mutually exclusive and lets active toolbar buttons exit', () => {
        const { result } = renderHook(() => useHarness());

        act(() => result.current.toggleMarqueeMode());
        expect(result.current.isMarqueeActive).toBe(true);
        act(() => result.current.toggleDrawingMode());
        expect(result.current.isDrawingMode).toBe(true);
        expect(result.current.isMarqueeActive).toBe(false);
        act(() => result.current.toggleDrawingMode());
        expect(result.current.isDrawingMode).toBe(false);
    });

    it('does not steal typing focus or enable tools in readonly mode', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const { result, rerender } = renderHook(({ enabled }) => useHarness(enabled), {
            initialProps: { enabled: true },
        });

        act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(false);
        rerender({ enabled: false });
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })));
        expect(result.current.isDrawingMode).toBe(false);
        input.remove();
    });
});
