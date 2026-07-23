import { describe, expect, it } from 'vitest';
import { parseEmbeddedDiagramTheme } from '../EnhancedThemeManagerRefactored';
import { lightThemePreset } from '../presets/LightTheme';
import { validateTheme } from '../ThemeUtils';

describe('theme manager boundaries', () => {
  it('accepts a structurally complete theme and rejects malformed palettes', () => {
    expect(validateTheme(lightThemePreset.theme)).toBe(true);
    expect(validateTheme(null)).toBe(false);
    expect(validateTheme({ ...lightThemePreset.theme, palette: null })).toBe(false);
    expect(validateTheme({ id: 'partial' })).toBe(false);
  });

  it('coerces bounded embedded theme metadata and drops unsafe colors', () => {
    const parsed = parseEmbeddedDiagramTheme({
      name: '  embedded  ',
      displayName: ' Embedded Theme ',
      domains: {
        safe: { main: '#123456', text: 'white' },
        unsafe: { main: 'url(javascript:alert(1))' },
        invalid: 'not-an-object',
      },
    });

    expect(parsed).toEqual({
      name: 'embedded',
      displayName: 'Embedded Theme',
      domains: {
        safe: { main: '#123456', text: 'white' },
      },
    });
  });

  it('rejects empty and type-invalid embedded theme metadata', () => {
    expect(parseEmbeddedDiagramTheme(null)).toBeNull();
    expect(parseEmbeddedDiagramTheme({ name: '   ' })).toBeNull();
    expect(parseEmbeddedDiagramTheme({ name: 42 })).toBeNull();
  });
});
