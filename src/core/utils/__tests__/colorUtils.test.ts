import { describe, expect, it } from 'vitest';
import {
  adjustSaturationAndLightness,
  clamp,
  ensureReadableText,
  getContrastRatio,
  getRelativeLuminance,
  hslToRgb,
  isLightColor,
  makeSoftTintGradient,
  parseColorToRgb,
  pickReadableTextColor,
  rgbToHsl,
  toRgba,
} from '../colorUtils';

describe('colorUtils', () => {
  it('clamps values to the provided range', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
    expect(clamp(2)).toBe(1);
    expect(clamp(12, 10, 20)).toBe(12);
  });

  it('parses supported color formats and falls back to a neutral color', () => {
    expect(parseColorToRgb('#0f8')).toEqual({ r: 0, g: 255, b: 136 });
    expect(parseColorToRgb('#336699')).toEqual({ r: 51, g: 102, b: 153 });
    expect(parseColorToRgb('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56 });
    expect(parseColorToRgb('rgba(12, 34, 56, 0.4)')).toEqual({ r: 12, g: 34, b: 56 });
    expect(parseColorToRgb('not-a-color')).toEqual({ r: 144, g: 164, b: 174 });
    expect(parseColorToRgb('')).toEqual({ r: 144, g: 164, b: 174 });
  });

  it('round-trips primary colors between rgb and hsl', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hslToRgb({ h: 120, s: 1, l: 0.5 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb(rgbToHsl({ r: 51, g: 102, b: 153 }))).toEqual({ r: 51, g: 102, b: 153 });
  });

  it('adjusts saturation and lightness within valid bounds', () => {
    const adjusted = adjustSaturationAndLightness({ r: 100, g: 150, b: 200 }, 1, -1);

    expect(adjusted.r).toBeGreaterThanOrEqual(0);
    expect(adjusted.g).toBeGreaterThanOrEqual(0);
    expect(adjusted.b).toBeGreaterThanOrEqual(0);
    expect(adjusted.r).toBeLessThanOrEqual(255);
    expect(adjusted.g).toBeLessThanOrEqual(255);
    expect(adjusted.b).toBeLessThanOrEqual(255);
  });

  it('formats rgba strings and soft tint gradients', () => {
    expect(toRgba({ r: 1, g: 2, b: 3 }, 0.25)).toBe('rgba(1, 2, 3, 0.25)');
    expect(makeSoftTintGradient('#336699', { topAlpha: 0.3, bottomAlpha: 0.1 }))
      .toMatch(/^linear-gradient\(180deg, rgba\(\d+, \d+, \d+, 0\.3\) 0%, rgba\(\d+, \d+, \d+, 0\.1\) 100%\)$/);
  });

  it('calculates luminance and contrast for accessible text decisions', () => {
    expect(getRelativeLuminance('#000000')).toBeCloseTo(0);
    expect(getRelativeLuminance('#ffffff')).toBeCloseTo(1);
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
    expect(pickReadableTextColor('#ffffff')).toBe('#111111');
    expect(pickReadableTextColor('#000000')).toBe('#FFFFFF');
  });

  it('keeps readable foreground colors and replaces insufficient ones', () => {
    expect(ensureReadableText('#000000', '#ffffff')).toBe('#000000');
    expect(ensureReadableText('#eeeeee', '#ffffff')).toBe('#111111');
    expect(ensureReadableText(undefined, '#000000')).toBe('#FFFFFF');
  });
});
