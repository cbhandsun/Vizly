import { useState, useEffect, useCallback } from 'react';
import { getThemeManager } from './index';
import { logUseCoreThemeSetFailure } from './themeLogging';
import type { Theme } from './types/ThemeTypes';

const FALLBACK_THEME_ID = 'light';

const resolveCoreThemeId = (themeId: string): string => {
    const tm = getThemeManager();
    const availableThemeIds = new Set(tm.getAvailableThemeIds?.() || []);
    if (availableThemeIds.has(themeId)) {
        return themeId;
    }

    const currentThemeId = tm.getCurrentThemeId?.();
    if (currentThemeId && availableThemeIds.has(currentThemeId)) {
        return currentThemeId;
    }

    return FALLBACK_THEME_ID;
};

/**
 * Core React Hook for accessing and modifying the global theme safely from within the agnostic core package.
 * Returns a tuple identical to the application layer's `useTheme` hook to avoid destructuring crashes.
 */
export function useTheme(_options: Record<string, unknown> = {}): [Theme | null, (themeId: string) => Promise<void>] {
    const [theme, setTheme] = useState<Theme | null>(() => {
        try {
            return getThemeManager().getCurrentTheme() || null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        try {
            const tm = getThemeManager();
            const unsubscribe = tm.addThemeChangeListener((newTheme) => {
                setTheme(newTheme || null);
            });
            return () => unsubscribe && unsubscribe();
        } catch {
            return () => {};
        }
    }, []);

    const setThemeAction = useCallback(async (themeId: string) => {
        try {
            await getThemeManager().setTheme(resolveCoreThemeId(themeId));
        } catch (e) {
            logUseCoreThemeSetFailure(e);
        }
    }, []);

    return [theme, setThemeAction];
}
