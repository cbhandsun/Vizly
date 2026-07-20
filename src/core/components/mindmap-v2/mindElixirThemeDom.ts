const MAX_PALETTE_COLORS = 10;
const SAFE_HEX_COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]{1}|[0-9a-f]{3}|[0-9a-f]{5})?$/i;
const PALETTE_VARIABLE_PREFIX = '--vizly-mindmap-branch-';

type ThemeStyleTarget = Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>;

export const coerceMindElixirPalette = (theme: unknown): string[] => {
    if (typeof theme !== 'object' || theme === null || Array.isArray(theme)) return [];
    const palette = (theme as { palette?: unknown }).palette;
    if (!Array.isArray(palette)) return [];

    return palette
        .slice(0, MAX_PALETTE_COLORS)
        .map(color => typeof color === 'string' ? color.trim() : '')
        .filter(color => SAFE_HEX_COLOR.test(color));
};

export const clearMindElixirPalette = (style: ThemeStyleTarget): void => {
    for (let index = 1; index <= MAX_PALETTE_COLORS; index += 1) {
        style.removeProperty(`${PALETTE_VARIABLE_PREFIX}${index}`);
    }
};

export const applyMindElixirPalette = (style: ThemeStyleTarget, theme: unknown): void => {
    clearMindElixirPalette(style);
    coerceMindElixirPalette(theme).forEach((color, index) => {
        style.setProperty(`${PALETTE_VARIABLE_PREFIX}${index + 1}`, color);
    });
};
