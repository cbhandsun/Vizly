import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const themeManagerMock = vi.hoisted(() => ({
    addThemeChangeListener: vi.fn(),
    getAvailableThemeIds: vi.fn(() => ['light', 'dark']),
    getCurrentTheme: vi.fn(),
    getCurrentThemeId: vi.fn(() => 'dark'),
    setTheme: vi.fn(),
}));

vi.mock('../index', () => ({
    getThemeManager: () => themeManagerMock,
}));

import { useTheme } from '../useCoreTheme';

describe('useCoreTheme', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('recovers the current theme when async initialization finished before subscription', async () => {
        const restoredTheme = { id: 'dark', mode: 'dark' };
        const unsubscribe = vi.fn();

        themeManagerMock.getCurrentTheme
            .mockReturnValueOnce(null)
            .mockReturnValue(restoredTheme);
        themeManagerMock.addThemeChangeListener.mockReturnValue(unsubscribe);

        const { result, unmount } = renderHook(() => useTheme());

        await waitFor(() => {
            expect(result.current[0]?.mode).toBe('dark');
        });
        expect(themeManagerMock.addThemeChangeListener).toHaveBeenCalledTimes(1);

        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
