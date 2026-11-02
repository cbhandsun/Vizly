import { loadWithLocalPreloadRecovery } from './localPreloadRecovery';

const themeAsset = /^\/assets\/(?:theme-runtime|LightTheme|DarkTheme|HighContrastTheme|SunsetTheme|MonoTheme|OriginalTheme|ForestTheme|OceanTheme|BlueprintTheme|SketchTheme|CorporateTheme|EnterpriseTheme|MidnightTheme|EmeraldTheme|NordicTheme|TremorTheme|CatppuccinTheme)-[A-Za-z0-9_-]+\.js$/u;

/** Claim only this optional theme download, preserving other chunks' recovery. */
export const isCanvasThemePreloadFailure = (payload: unknown, origin: string): boolean => {
    if (!(payload instanceof Error)) return false;
    let message: unknown;
    try { message = payload.message; } catch { return false; }
    if (typeof message !== 'string' || message.length > 4096) return false;
    const match = /^(?:Failed to fetch dynamically imported module: |error loading dynamically imported module: )(.+)$/u.exec(message);
    if (!match || match[1].length > 2048) return false;
    try {
        const resource = new URL(match[1], origin);
        return resource.origin === new URL(origin).origin && !resource.username && !resource.password
            && !resource.search && !resource.hash && themeAsset.test(resource.pathname);
    } catch { return false; }
};

export const prewarmCanvasTheme = (): Promise<boolean> => loadWithLocalPreloadRecovery(
    () => import('@vizly/core/theme-runtime').then(({ preloadConfiguredTheme }) => preloadConfiguredTheme()),
    payload => isCanvasThemePreloadFailure(payload, window.location.origin),
);
