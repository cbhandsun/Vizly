import { describe, expect, it } from 'vitest';
import {
  coerceThemePreviewColors,
  renderSafeThemePreviewGradient,
  toSafeThemePreviewColor,
} from '../themePreviewSecurity';

describe('themePreviewSecurity', () => {
  it('keeps safe preview color formats', () => {
    expect(toSafeThemePreviewColor('#6366f1')).toBe('#6366f1');
    expect(toSafeThemePreviewColor('rgba(99, 102, 241, 0.8)')).toBe('rgba(99, 102, 241, 0.8)');
    expect(toSafeThemePreviewColor('hsl(240, 80%, 60%)')).toBe('hsl(240, 80%, 60%)');
  });

  it('drops colors that could escape a gradient declaration', () => {
    const gradient = renderSafeThemePreviewGradient([
      '#fff); background: url(javascript:alert(1))',
      'red;\nbackground: black',
      '#1677ff',
    ]);

    expect(gradient).toBe('linear-gradient(135deg, #1677ff, #1677ff)');
    expect(gradient).not.toContain('javascript:');
    expect(gradient).not.toContain('url(');
    expect(gradient).not.toContain('\n');
  });

  it('uses bounded safe fallbacks when no provided color is valid', () => {
    expect(coerceThemePreviewColors(['url(https://example.com/x)'], ['#111111', '#eeeeee'])).toEqual([
      '#111111',
      '#eeeeee',
    ]);
  });

  it('limits preview gradients to four color stops', () => {
    expect(coerceThemePreviewColors(['#111', '#222', '#333', '#444', '#555'])).toEqual([
      '#111',
      '#222',
      '#333',
      '#444',
    ]);
  });
});
