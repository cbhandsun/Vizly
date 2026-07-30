// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFlowchartChromeCoordination } from '../useFlowchartChromeCoordination';

describe('useFlowchartChromeCoordination', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('closes desktop drawers and the minimap when entering mobile layout', () => {
        vi.useFakeTimers();
        const setMobileRequestedPanel = vi.fn();
        const setShowMinimap = vi.fn();
        const options = {
            isMobile: false,
            setCommandPaletteVisible: vi.fn(),
            setLeftDrawerOpen: vi.fn(),
            setMobileRequestedPanel,
            setShowMinimap,
        };
        const { rerender } = renderHook(
            (props: typeof options) => useFlowchartChromeCoordination(props),
            { initialProps: options },
        );

        rerender({ ...options, isMobile: true });
        act(() => vi.runAllTimers());

        expect(setShowMinimap).toHaveBeenCalledWith(false);
        expect(setMobileRequestedPanel).toHaveBeenCalledWith('close');
    });
});
