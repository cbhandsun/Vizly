import { describe, expect, it } from 'vitest';
import { isCanvasThemePreloadFailure } from '../prewarmCanvasTheme';

describe('optional canvas theme resource ownership', () => {
    const origin = 'https://www.vizly.fun';
    const failure = (url: string) => new Error(`Failed to fetch dynamically imported module: ${url}`);

    it('recognizes its emitted entry and preset chunks', () => {
        expect(isCanvasThemePreloadFailure(failure('/assets/theme-runtime-Ab_123.js'), origin)).toBe(true);
        expect(isCanvasThemePreloadFailure(failure(`${origin}/assets/DarkTheme-Ab_123-Cd.js`), origin)).toBe(true);
    });

    it.each([
        'https://other.invalid/assets/LightTheme-Ab.js',
        '/assets/LightTheme-Ab.js?secret=canary',
        '/assets/LightTheme-Ab.js#other',
        '/assets/DiagramViewerRoute-Ab.js',
        '/assets/canvas-runtime-Ab.js',
        '/assets/LightTheme-Ab.css',
    ])('does not suppress unrelated or noncanonical failures: %s', url => {
        expect(isCanvasThemePreloadFailure(failure(url), origin)).toBe(false);
    });

    it('rejects unknown payloads and hostile message accessors', () => {
        expect(isCanvasThemePreloadFailure({ message: 'unknown' }, origin)).toBe(false);
        const error = new Error();
        Object.defineProperty(error, 'message', { get() { throw new Error('unreadable'); } });
        expect(isCanvasThemePreloadFailure(error, origin)).toBe(false);
    });
});
